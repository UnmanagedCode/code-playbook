// Pins the editor's status line, its notices and its option lists: the text the user acts on and the
// choices that decide what a gesture can produce.
import { describe, expect, test } from 'vitest';
import { loadFixtures } from '../../../tests/fixtures/fakeConductor.mjs';
import { formFromDetail } from './formModel';
import {
  addableTools, canAddPin, editorNotices, editorStatus, idHint, pinArgOptions, policyOptions, positionMembers, viaOptions,
} from './editorModel';

const { list, details } = await loadFixtures();
const toolNames = list.governableTools.map((t) => t.name);
const pinArgsOf = (tool: string) => list.governableTools.find((t) => t.name === tool)?.pinArgs ?? [];
const base = { saving: false, renameCount: 0, localErrorCount: 0, validation: { rev: 1, ok: true, errors: [] }, rev: 1 };

describe('editorStatus', () => {
  test('each text and tone, in precedence order', () => {
    expect(editorStatus({ ...base, saving: true, renameCount: 1 })).toEqual({ text: 'Saving…', tone: 'muted' });
    expect(editorStatus({ ...base, renameCount: 1, localErrorCount: 1 })).toEqual({ text: '1 stage rename refused', tone: 'bad' });
    expect(editorStatus({ ...base, renameCount: 2 })).toEqual({ text: '2 stage renames refused', tone: 'bad' });
    expect(editorStatus({ ...base, localErrorCount: 1, validation: null })).toEqual({ text: '1 local error', tone: 'bad' });
    expect(editorStatus({ ...base, localErrorCount: 3 })).toEqual({ text: '3 local errors', tone: 'bad' });
    expect(editorStatus({ ...base, validation: null })).toEqual({ text: 'Validating…', tone: 'muted' });
    expect(editorStatus({ ...base, rev: 2 })).toEqual({ text: 'Validating…', tone: 'muted' });
    expect(editorStatus(base)).toEqual({ text: 'Valid — ready to save', tone: 'good' });
    expect(editorStatus({ ...base, block: 'reserved' })).toEqual({ text: 'Valid, but the id is blocked', tone: 'bad' });
    expect(editorStatus({ ...base, validation: { rev: 1, ok: false, errors: [{}] } })).toEqual({ text: '1 error from cc', tone: 'bad' });
    expect(editorStatus({ ...base, validation: { rev: 1, ok: false, errors: [{}, {}] } })).toEqual({ text: '2 errors from cc', tone: 'bad' });
  });
});

describe('editorNotices', () => {
  const form = (id: string) => ({ ...formFromDetail(details.mine), id });
  const n = (over: Partial<Parameters<typeof editorNotices>[0]>) => editorNotices({
    form: form('mine'), takenIds: list.takenIds, mode: 'edit', originalId: 'mine', originalLive: 0, target: null, ...over,
  });

  test('a reserved id blocks; a built-in id warns override; another user id warns overwrite', () => {
    expect(n({ form: form('custom'), mode: 'draft', originalId: null }).block).toMatch(/'custom' is reserved/);
    expect(n({ form: form('relay'), mode: 'draft', originalId: null }).warn).toEqual(["'relay' overrides the shipped 'relay' playbook until this file is deleted."]);
    expect(n({ form: form('mine'), mode: 'draft', originalId: null }).warn).toEqual(["'mine' overwrites the existing user playbook 'mine'."]);
    expect(n({}).warn).toEqual([]);
  });

  test('drift: for a target with live workers (2, 1, unknown), none for 0', () => {
    expect(n({ target: { id: 'mine', live: 2 } }).warn).toEqual([expect.stringMatching(/^2 live workers are bound to 'mine'\./)]);
    expect(n({ target: { id: 'mine', live: 1 } }).warn).toEqual([expect.stringMatching(/^1 live worker is bound to 'mine'\./)]);
    expect(n({ target: { id: 'mine', live: null } }).warn).toEqual([expect.stringMatching(/^An unknown number/)]);
    expect(n({ target: { id: 'mine', live: 0 } }).warn).toEqual([]);
  });

  test('rename: only in edit mode, only once the id changed, last', () => {
    expect(n({ form: form('mine-2'), originalLive: 2 }).warn).toEqual([expect.stringMatching(/^Saving under 'mine-2' removes mine\.json\. 2 live workers/)]);
    expect(n({ form: form('mine-2'), mode: 'draft', originalId: null }).warn).toEqual([]);
    expect(n({ form: form('relay'), target: { id: 'relay', live: 1 } }).warn.map((w) => w.slice(0, 12))).toEqual(["'relay' over", '1 live worke', "Saving under"]);
  });
});

test('idHint names the overlay file, with a placeholder for an empty id', () => {
  expect(idHint('x')).toBe('saved as <projects root>/.code-conductor/playbooks/x.json');
  expect(idHint('')).toBe('saved as <projects root>/.code-conductor/playbooks/<id>.json');
});

describe('option lists', () => {
  const values = (o: { value: string }[]) => o.map((x) => x.value);
  test('policy: pin only with pin args or an existing pin, never for *; spawn has its own four', () => {
    expect(values(policyOptions({ tool: 'set_mode', policy: 'deny', pin: [] }, pinArgsOf('set_mode')))).toEqual(['allow', 'deny', 'pin']);
    expect(values(policyOptions({ tool: 'kill_instance', policy: 'deny', pin: [] }, []))).toEqual(['allow', 'deny']);
    expect(values(policyOptions({ tool: 'kill_instance', policy: 'pin', pin: [] }, []))).toEqual(['allow', 'deny', 'pin']);
    expect(values(policyOptions({ tool: '*', policy: 'allow', pin: [] }, ['x']))).toEqual(['allow', 'deny']);
    expect(policyOptions({ tool: 'spawn_instance', policy: 'allow', pin: [] }, [])).toEqual([
      { value: 'none', label: 'not declared' }, { value: 'deny', label: 'deny' }, { value: 'allow', label: 'allow' }, { value: 'pin', label: 'pin' },
    ]);
  });

  test('pin args: the tool\'s plus the row\'s own; add-pin only while an arg is unused', () => {
    expect(pinArgOptions(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(pinArgOptions(['a', 'b'], 'a')).toEqual(['a', 'b']);
    expect(canAddPin({ tool: 't', policy: 'pin', pin: [{ arg: 'a', json: '1' }] }, ['a', 'b'])).toBe(true);
    expect(canAddPin({ tool: 't', policy: 'pin', pin: [{ arg: 'a', json: '1' }, { arg: 'b', json: '1' }] }, ['a', 'b'])).toBe(false);
  });

  test('addable tools: governable minus spawn_instance and declared ones, then *', () => {
    const st = formFromDetail(details.mine).stages.find((s) => s.name === 'build')!;
    const addable = addableTools(toolNames, st);
    expect(addable).not.toContain('spawn_instance');
    expect(addable).not.toContain('send_prompt');
    expect(addable).not.toContain('set_mode');
    expect(addable.at(-1)).toBe('*');
    expect(addable.length).toBe(toolNames.length - 3 + 1);
    const draft = formFromDetail(details.mine).stages.find((s) => s.name === 'draft')!;
    expect(addableTools(toolNames, draft)).not.toContain('*');
  });

  test('via: send_prompt first as the default, then every other governable tool', () => {
    const v = viaOptions(toolNames);
    expect(v[0]).toEqual({ value: 'send_prompt', label: 'send_prompt (default — no on)' });
    expect(values(v).slice(1)).toEqual(toolNames.filter((t) => t !== 'send_prompt'));
  });

  test('position members: every stage, then * labelled any stage (*)', () => {
    expect(positionMembers(['a', 'b'])).toEqual([{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }, { value: '*', label: 'any stage (*)' }]);
  });
});
