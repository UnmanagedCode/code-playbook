// Hostile playbook content (an id, name, description, stage name, pin value, transition description and a
// load-error message carrying markup) renders as text everywhere: the detail, the list and the editor.
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '@/App';
import { at, fakeApi, fixtures } from '@/test/fakeApi';
import type { PlaybookDetail, PlaybookList } from '@/model/types';

const H = '<img src=x onerror=alert(1)><script>window.__xss=1</script>" style="color:red';
const id = `evil${H}`;
const stageName = `s${H}`;
const detail: PlaybookDetail = {
  id, name: `Name ${H}`, description: `Desc ${H}`, source: 'user', editable: true, entryStages: [stageName], liveWorkers: 0,
  stages: { [stageName]: { needs: [{ stage: stageName, position: [stageName], liveness: 'live' }], workers: 'one', spawnable: true, description: `Stage ${H}`, tools: { spawn_instance: { pin: { mode: H } } } } },
  transitions: [{ from: stageName, to: stageName, via: 'send_prompt', description: `T ${H}` }],
};
const list: PlaybookList = {
  ...fixtures.list,
  playbooks: [...fixtures.list.playbooks, { id, name: detail.name, description: detail.description, source: 'user', editable: true, entryStages: [stageName], spawnableStages: [stageName] }],
  errors: [{ id: `bad${H}`, message: `Load ${H}` }],
  takenIds: { ...fixtures.list.takenIds, user: [...fixtures.list.takenIds.user, id] },
};

afterEach(() => {
  vi.unstubAllGlobals();
  at('/');
});

const SVG_NS = 'http://www.w3.org/2000/svg';
// The only styled nodes the app renders: Radix's checkbox indicator, with Radix's own fixed style.
const RADIX_STYLED = { selector: '[data-slot="checkbox-indicator"]', style: 'pointer-events: none;' };

function assertInert(root: HTMLElement) {
  // No element that loads, runs, links, submits or styles anything was built from content.
  expect(root.querySelectorAll('script, img, style, a, link, base, iframe, object, embed, form').length).toBe(0);
  for (const el of root.querySelectorAll('*')) {
    for (const a of el.attributes) expect(a.name.startsWith('on'), `${el.tagName} ${a.name}`).toBe(false);
    // Every SVG node belongs to a lucide icon or to our stage graph.
    if (el.namespaceURI === SVG_NS) {
      const svg = el.closest('svg')!;
      expect(svg.classList.contains('lucide') || /^stage graph of /.test(svg.getAttribute('aria-label') ?? ''), `${el.tagName} outside an icon or the graph`).toBe(true);
    }
    // A style attribute only on a Radix-owned node, with Radix's value, never the payload.
    const style = el.getAttribute('style');
    if (style !== null) {
      expect(el.matches(RADIX_STYLED.selector), `${el.tagName} carries a style attribute`).toBe(true);
      expect(style).toBe(RADIX_STYLED.style);
    }
  }
  // window.__xss is not checked here: happy-dom never fires onerror. golden-path.mjs's hostile pass checks it in Chromium.
}

// Invariant: the detail and the list render every hostile field as its literal text, with no element or handler made from it.
test('the detail and the list render hostile content as text', async () => {
  fakeApi({ list, details: { ...fixtures.details, [id]: detail } });
  at(`?playbook=${encodeURIComponent(id)}`);
  const { container } = render(<App />);
  await screen.findByRole('heading', { name: detail.name });
  for (const text of [detail.name, detail.description, `Stage ${H}`, `T ${H}`, `Load ${H}`, `mode = ${JSON.stringify(H)}`]) {
    expect(container.textContent).toContain(text);
  }
  assertInert(container);
});

// Invariant: the editor puts hostile content only into control values and text.
test('the editor renders hostile content as values and text', async () => {
  fakeApi({ list, details: { ...fixtures.details, [id]: detail } });
  at(`?edit=${encodeURIComponent(id)}`);
  const { container } = render(<App />);
  await screen.findByRole('heading', { name: `Edit ${id}` });
  const values = [...container.querySelectorAll('input, textarea')].map((e) => (e as HTMLInputElement).value);
  for (const v of [id, detail.name, detail.description, stageName, `Stage ${H}`, JSON.stringify(H), `T ${H}`]) expect(values).toContain(v);
  assertInert(container);
});
