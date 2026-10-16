// The UI half of the editor round-trip: each edit script (tests/fixtures/edit-scripts.json), played through
// the React UI by accessible name, saves exactly the body the pre-port UI sent for it — the golden file in
// tests/fixtures/saved/, as JSON.stringify writes it. tests/roundTrip.test.mjs pins the server half.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { at, fakeApi } from '@/test/fakeApi';

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures');
type Step = Record<string, string | number | boolean> & { op: string };
interface Script { start: { duplicate?: string; id?: string; edit?: string; new?: string }; saved: string; steps: Step[] }
const scripts: Record<string, Script> = JSON.parse(await fs.readFile(path.join(FIXTURES, 'edit-scripts.json'), 'utf8'));

afterEach(() => {
  vi.unstubAllGlobals();
  at('/');
});

const u = userEvent.setup();
const stage = (name: unknown) => screen.getByRole('region', { name: `Stage ${name}` });
const group = (within_: HTMLElement, name: string) => within(within_).getByRole('group', { name });
const tool = (s: Step) => group(stage(s.stage), `Tool ${s.tool}`);
const need = (s: Step) => group(stage(s.stage), `Need ${Number(s.index) + 1}`);
const pinRow = (s: Step) => group(tool(s), `Pin ${Number(s.index) + 1}`);
const transition = (i: unknown) => group(screen.getByRole('region', { name: 'Transitions' }), `Transition ${Number(i) + 1}`);
const select = (el: HTMLElement, label: string, value: unknown) => u.selectOptions(within(el).getByRole('combobox', { name: label }), String(value));
const click = (el: HTMLElement, name: string) => u.click(within(el).getByRole('button', { name }));
async function fill(el: HTMLElement, value: unknown) {
  await u.clear(el);
  if (value !== '') {
    await u.click(el);
    await u.paste(String(value));
  }
}
async function check(el: HTMLElement, on: unknown) {
  if ((el.getAttribute('aria-checked') === 'true') !== on) await u.click(el);
}

async function step(s: Step) {
  switch (s.op) {
    case 'field': return fill(within(screen.getByRole('region', { name: 'Playbook' })).getByRole('textbox', { name: { id: 'Id', name: 'Name', description: 'Description' }[String(s.field)] }), s.value);
    case 'renameStage': {
      const input = within(stage(s.stage)).getByRole('textbox', { name: 'Stage name' });
      await fill(input, s.to);
      return u.tab();
    }
    case 'entry': return check(within(stage(s.stage)).getByRole('checkbox', { name: 'Entry stage' }), s.on);
    case 'workers': return select(stage(s.stage), 'Workers', s.value);
    case 'stageDescription': return fill(within(stage(s.stage)).getByRole('textbox', { name: 'Description' }), s.value);
    case 'addNeed': return click(stage(s.stage), 'Add need');
    case 'needAnchor': return select(need(s), 'Anchor', s.value);
    case 'needPosition': return check(within(group(need(s), 'Position')).getByRole('checkbox', { name: s.member === '*' ? 'any stage (*)' : String(s.member) }), s.on);
    case 'needLiveness': return select(need(s), 'Liveness', s.value);
    case 'removeNeed': return click(need(s), 'Remove need');
    case 'policy': return select(tool(s), 'Policy', s.value);
    case 'addPin': return click(tool(s), 'Add pin');
    case 'pinArg': return select(pinRow(s), 'Pin argument', s.value);
    case 'pinJson': return fill(within(pinRow(s)).getByRole('textbox', { name: 'Pin value (JSON)' }), s.value);
    case 'removePin': return click(pinRow(s), 'Remove pin');
    case 'addTool': return select(stage(s.stage), 'Add tool', s.tool);
    case 'removeTool': return click(tool(s), `Remove tool ${s.tool}`);
    case 'addTransition': return u.click(screen.getByRole('button', { name: 'Add transition' }));
    case 'transition':
      if (s.field === 'description') return fill(within(transition(s.index)).getByRole('textbox', { name: 'Description' }), s.value);
      return select(transition(s.index), String(s.field).replace(/^./, (c) => c.toUpperCase()), s.value);
    case 'removeTransition': return click(transition(s.index), 'Remove transition');
    case 'addStage': return u.click(screen.getByRole('button', { name: 'Add stage' }));
    case 'removeStage': {
      await click(stage(s.stage), 'Remove stage');
      return click(await screen.findByRole('dialog'), 'Remove stage');
    }
    default: throw new Error(`unknown op ${s.op}`);
  }
}

async function start(script: Script) {
  const { duplicate, id, edit } = script.start;
  if (edit) {
    at(`?edit=${edit}`);
    render(<App />);
  } else {
    at(duplicate ? `?playbook=${duplicate}` : '/');
    render(<App />);
    await u.click(await screen.findByRole('button', { name: duplicate ? 'Duplicate' : 'New playbook' }));
    const dialog = await screen.findByRole('dialog');
    await fill(within(dialog).getByRole('textbox', { name: 'Id' }), duplicate ? id : script.start.new);
    await u.click(within(dialog).getByRole('button', { name: 'Continue' }));
  }
  await screen.findByRole('region', { name: 'Playbook' });
}

describe('each edit script saves the golden body', () => {
  for (const [name, script] of Object.entries(scripts)) {
    // Invariant: the PUT the React editor sends for this script is byte-identical to the pre-port UI's.
    test(name, async () => {
      const { calls } = fakeApi();
      await start(script);
      for (const s of script.steps) await step(s);
      const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
      await waitFor(() => expect(save.disabled).toBe(false), { timeout: 3000 });
      expect(screen.getByRole('status').textContent).toBe('Valid — ready to save');
      await u.click(save);
      await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
      const put = calls.find((c) => c.method === 'PUT')!;
      const golden = await fs.readFile(path.join(FIXTURES, 'saved', `${script.saved}.json`), 'utf8');
      const from = script.start.edit && script.start.edit !== script.saved ? `?from=${script.start.edit}` : '';
      expect(put.url).toBe(`api/playbooks/${script.saved}${from}`);
      expect(put.headers).toEqual({ 'content-type': 'application/json' });
      expect(put.body).toBe(JSON.stringify(JSON.parse(golden)));
    }, 60_000);
  }
});
