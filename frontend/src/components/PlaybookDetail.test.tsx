// The read-only detail from cc's fixtures: which stages are marked entry and spawnable, the read-only note,
// and the structure of the needs line, the tools table and the transitions table.
import { expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PlaybookDetail } from './PlaybookDetail';
import { fixtures } from '@/test/fakeApi';
import { readOnlyNote } from '@/model/listModel';
import type { PlaybookDetail as Detail } from '@/model/types';

const renderDetail = (detail: Detail) => render(
  <PlaybookDetail detail={detail} list={fixtures.list} flash={null} onBack={() => {}} onEdit={() => {}} onDuplicate={() => {}} onDelete={() => {}} />,
);
const panel = (container: HTMLElement, name: string) => container.querySelector(`section[data-stage="${CSS.escape(name)}"]`) as HTMLElement;

// Invariant: every entry stage and every spawnable stage is marked on its panel, and no other is.
test('entry and spawnable badges follow the detail', () => {
  for (const d of Object.values(fixtures.details)) {
    const { container, unmount } = renderDetail(d);
    for (const [name, s] of Object.entries(d.stages)) {
      const p = panel(container, name);
      expect(!!within(p).queryByText('entry', { exact: true }), `${d.id} ${name} entry`).toBe(d.entryStages.includes(name));
      expect(!!within(p).queryByText('spawnable', { exact: true }), `${d.id} ${name} spawnable`).toBe(s.spawnable);
    }
    unmount();
  }
});

// Invariant: a non-editable playbook explains why it is read-only and offers Duplicate only; a user one offers all three.
test('the read-only note and actions follow the source', () => {
  for (const id of ['relay', 'acme/release']) {
    const d = fixtures.details[id];
    const { unmount } = renderDetail(d);
    expect(screen.getByText(readOnlyNote(d.source))).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Actions' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Duplicate']);
    unmount();
  }
  renderDetail(fixtures.details.mine);
  expect(screen.queryByText(readOnlyNote('builtin'))).toBeNull();
  expect(within(screen.getByRole('group', { name: 'Actions' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit', 'Duplicate', 'Delete']);
});

// Invariant: needs list one item per need (or "none"), the tools table one row per tool (or a single full-width
// row when none are declared), and the transitions table one row per transition.
test('needs, tools and transitions structure', () => {
  const solo = fixtures.details.solo;
  const { container } = renderDetail(solo);
  for (const [name, s] of Object.entries(solo.stages)) {
    const p = panel(container, name);
    const items = p.querySelectorAll('ul > li');
    expect(items.length, `${name} needs`).toBe(s.needs.length);
    const rows = p.querySelectorAll('tbody > tr');
    const tools = Object.keys(s.tools);
    if (tools.length === 0) {
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('td')!.getAttribute('colspan')).toBe('3');
    } else {
      expect([...rows].map((r) => r.getAttribute('data-tool'))).toEqual(tools);
    }
  }
  expect(Object.values(solo.stages).some((s) => Object.keys(s.tools).length === 0), 'the fixture has a stage with no tools').toBe(true);
  const transitions = screen.getByRole('heading', { name: 'Transitions' }).closest('[data-slot="card"]') as HTMLElement;
  expect(transitions.querySelectorAll('tbody > tr').length).toBe(solo.transitions.length);
});
