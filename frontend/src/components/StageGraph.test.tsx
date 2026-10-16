// The stage graph as rendered: one focusable node per stage, one edge per transition and need, keyboard
// activation, and no element id or attribute built from content.
import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StageGraph } from './StageGraph';
import { fixtures } from '@/test/fakeApi';

const relay = fixtures.details.relay;

// Invariant: every stage is a button named "Stage <name>"; every transition and need is an edge.
test('a node per stage, an edge per transition and per need', () => {
  const { container } = render(<StageGraph detail={relay} onNode={() => {}} />);
  const svg = screen.getByRole('group', { name: 'stage graph of relay' });
  expect(within(svg).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(Object.keys(relay.stages).map((s) => `Stage ${s}`));
  const needs = Object.values(relay.stages).reduce((n, s) => n + s.needs.length, 0);
  expect(container.querySelectorAll('[data-edge="transition"]').length).toBe(relay.transitions.length);
  expect(container.querySelectorAll('[data-edge="needs"]').length).toBe(needs);
});

// Invariant: click, Enter and Space on a node all call onNode with its stage.
test('click, Enter and Space activate a node', async () => {
  const onNode = vi.fn();
  render(<StageGraph detail={relay} onNode={onNode} />);
  const plan = screen.getByRole('button', { name: 'Stage plan' });
  await userEvent.click(plan);
  plan.focus();
  await userEvent.keyboard('{Enter}');
  await userEvent.keyboard(' ');
  expect(onNode.mock.calls).toEqual([['plan'], ['plan'], ['plan']]);
});

// Invariant: content reaches the SVG only as text and as data-stage / aria-label values; ids are React's.
test('no id or attribute derived from content beyond data-stage and aria-label', () => {
  const { container } = render(<StageGraph detail={relay} onNode={() => {}} />);
  const names = Object.keys(relay.stages);
  for (const el of container.querySelectorAll('*')) {
    for (const a of el.attributes) {
      if (a.name === 'data-stage' || a.name === 'aria-label') continue;
      for (const n of names) expect(a.value.includes(n) && a.name, `${el.tagName} ${a.name}="${a.value}"`).toBeFalsy();
    }
  }
});
