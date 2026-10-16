// The app's screens and state transitions over a stubbed backend: list loading and failure, routes,
// delete with its confirm, and the stale-response guard.
import { afterEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { at, fakeApi, fixtures, json } from '@/test/fakeApi';

afterEach(() => {
  vi.unstubAllGlobals();
  at('/');
});
const nav = () => screen.getByRole('navigation', { name: 'Playbooks' });

// Invariant: a skeleton (with a status for screen readers) shows until the list arrives, then the groups in order.
test('list loading, then Built-in, User and plugin groups', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  fakeApi({ handle: async (m, url) => { if (url === 'api/playbooks') { await gate; } return undefined; } });
  render(<App />);
  expect(within(nav()).getByRole('status')).toHaveProperty('textContent', 'Loading playbooks');
  await act(async () => release());
  const regions = await within(nav()).findAllByRole('region');
  expect(regions.map((g) => g.getAttribute('data-source') ?? within(g).getByRole('heading').textContent)).toEqual(['builtin', 'user', 'plugin:acme', 'Load errors']);
  const groups = regions.slice(0, 3);
  expect(groups.map((g) => within(g).getByRole('heading').textContent)).toEqual(['Built-in', 'User', 'Plugin · acme']);
  expect(within(groups[0]).getAllByRole('button').map((b) => b.getAttribute('data-id'))).toEqual(['forge', 'freeform', 'relay', 'solo']);
  expect(within(groups[1]).getByRole('button', { name: 'New playbook' })).toBeTruthy();
});

// Invariant: a cc without /api/playbooks (404) is named as such, in the list and the main pane.
test('a list 404 says to restart cc, and the main pane is "Playbooks unavailable"', async () => {
  fakeApi({ handle: (_m, url) => (url === 'api/playbooks' ? json({ error: 'not found' }, 404) : undefined) });
  render(<App />);
  expect(await screen.findByText('Cannot load playbooks')).toBeTruthy();
  expect(screen.getAllByText('cc does not serve /api/playbooks yet — restart code-conductor.').length).toBe(2);
  expect(screen.getByRole('heading', { name: 'Playbooks unavailable' })).toBeTruthy();
});

// Invariant: selecting an entry pushes ?playbook=<id> and shows that detail, marked current in the list.
test('selecting an entry opens its detail', async () => {
  fakeApi();
  render(<App />);
  await userEvent.click(await within(nav()).findByRole('button', { name: /^relay/ }));
  expect(location.search).toBe('?playbook=relay');
  expect(await screen.findByRole('heading', { name: fixtures.details.relay.name })).toBeTruthy();
  expect(within(nav()).getByRole('button', { name: /^relay/ }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('button', { name: 'Duplicate' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
});

// Invariant: ?edit= on a built-in shows the read-only message instead of an editor.
test('?edit=relay is read-only', async () => {
  fakeApi();
  at('?edit=relay');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'relay is read-only' })).toBeTruthy();
  expect(screen.getByText('Only user playbooks are editable; this one is builtin.')).toBeTruthy();
});

// Invariant: a draft lives in memory only, so a reloaded ?draft=1 goes home.
test('?draft=1 with no draft in memory goes home', async () => {
  fakeApi();
  at('?draft=1');
  render(<App />);
  await waitFor(() => expect(location.search).toBe(''));
  expect(await screen.findByRole('heading', { name: 'Select a playbook' })).toBeTruthy();
});

// Invariant: Delete asks first with deleteConfirm's paragraphs; confirming DELETEs, reloads the list and goes home with the flash.
test('Delete: confirm dialog, DELETE, flash and home', async () => {
  const { calls } = fakeApi();
  at('?playbook=mine');
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('heading', { name: 'Delete mine.json?' })).toBeTruthy();
  expect(within(dialog).getByText("2 live workers bound to 'mine' will lose their playbook (PLAYBOOK_UNKNOWN).")).toBeTruthy();
  const listsBefore = calls.filter((c) => c.url === 'api/playbooks').length;
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(location.search).toBe(''));
  expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual(['api/playbooks/mine']);
  expect(calls.filter((c) => c.url === 'api/playbooks').length).toBe(listsBefore + 1);
  expect(await screen.findByRole('heading', { name: 'Deleted mine.json.' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

// Invariant: a failed delete keeps the dialog open with the reason, and stays on the detail.
test('a failed delete keeps the dialog open with "Delete failed: …"', async () => {
  fakeApi({ handle: (m) => (m === 'DELETE' ? json({ error: 'disk full', code: 'PLAYBOOK_DELETE_FAILED' }, 500) : undefined) });
  at('?playbook=mine');
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  expect(await within(dialog).findByText('Delete failed: disk full')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(location.search).toBe('?playbook=mine');
});

// Invariant: a user file cc could not load can be deleted from the load-errors panel, after its own confirm.
test('Delete file in load errors', async () => {
  const { calls } = fakeApi();
  render(<App />);
  await userEvent.click(await within(nav()).findByRole('button', { name: 'Delete file' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('heading', { name: 'Delete broken.json?' })).toBeTruthy();
  expect(within(dialog).getByText('cc could not load it, so there is nothing to open in the editor.')).toBeTruthy();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === 'api/playbooks/broken')).toBe(true));
  expect(await screen.findByRole('heading', { name: 'Deleted broken.json.' })).toBeTruthy();
});

// Invariant: a detail response for an earlier navigation never replaces the current one.
test('a stale detail response is ignored', async () => {
  let releaseRelay!: () => void;
  const relayGate = new Promise<void>((r) => { releaseRelay = r; });
  fakeApi({ handle: async (_m, url) => { if (url === 'api/playbooks/relay') await relayGate; return undefined; } });
  render(<App />);
  await userEvent.click(await within(nav()).findByRole('button', { name: /^relay/ }));
  await userEvent.click(within(nav()).getByRole('button', { name: /^solo/ }));
  expect(await screen.findByRole('heading', { name: fixtures.details.solo.name })).toBeTruthy();
  await act(async () => releaseRelay());
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole('heading', { name: fixtures.details.relay.name })).toBeNull();
  expect(screen.getByRole('heading', { name: fixtures.details.solo.name })).toBeTruthy();
});
