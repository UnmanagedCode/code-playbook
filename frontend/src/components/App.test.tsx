// The app's screens and state transitions over a stubbed backend: list loading and failure, routes,
// delete with its confirm, and the stale-response guard.
import { afterEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { at, fakeApi, fixtures, json } from '@/test/fakeApi';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

// Invariant: a detail the viewer cannot draw (here an entry stage cc never declared, which the layout cannot place)
// loses only its graph: the rest of the detail, the list and navigation keep working.
test('a graph that throws leaves the rest of the detail', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const broken = { ...fixtures.details.relay, entryStages: ['ghost'] };
  fakeApi({ details: { ...fixtures.details, relay: broken } });
  at('?playbook=relay');
  render(<App />);
  expect(await screen.findByText(/^The stage graph cannot be drawn: /)).toBeTruthy();
  expect(screen.getByRole('heading', { name: broken.name })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'plan' })).toBeTruthy();
  await userEvent.click(within(nav()).getByRole('button', { name: /^solo/ }));
  expect(await screen.findByRole('group', { name: 'stage graph of solo' })).toBeTruthy();
});

// Invariant: a detail that throws while rendering shows a message in the main pane; the list stays, and the next
// navigation renders normally again.
test('a detail that throws while rendering shows a message and keeps the list', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fakeApi({ details: { ...fixtures.details, relay: { id: 'relay' } as never } });
  at('?playbook=relay');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Cannot show relay' })).toBeTruthy();
  expect(within(nav()).getByRole('button', { name: /^solo/ })).toBeTruthy();
  await userEvent.click(within(nav()).getByRole('button', { name: /^solo/ }));
  expect(await screen.findByRole('heading', { name: fixtures.details.solo.name })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Cannot show relay' })).toBeNull();
});

// Invariant: the crash screen's Back returns home.
test('All playbooks on the crash screen goes home', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fakeApi({ details: { ...fixtures.details, relay: { id: 'relay' } as never } });
  at('?playbook=relay');
  render(<App />);
  await screen.findByRole('heading', { name: 'Cannot show relay' });
  await userEvent.click(screen.getByRole('button', { name: 'All playbooks' }));
  expect(location.search).toBe('');
  expect(await screen.findByRole('heading', { name: 'Select a playbook' })).toBeTruthy();
});

// Invariant: a malformed list leaves the page mounted and shows a message in the list pane.
test('a list that throws while rendering leaves the page up', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fakeApi({ list: { ...fixtures.list, playbooks: 'nope' as never } });
  render(<App />);
  expect(await within(nav()).findByText('Cannot show the playbook list')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Code Playbook' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Select a playbook' })).toBeTruthy();
});

// Invariant: a traversal id never produces a request outside api/playbooks/; the route says it cannot open it.
test('a traversal id is refused without a request', async () => {
  for (const id of ['../../api/health', '..', 'a/./b', 'acme//release']) {
    const { calls } = fakeApi();
    at(`?playbook=${encodeURIComponent(id)}`);
    const { unmount } = render(<App />);
    expect(await screen.findByRole('heading', { name: `Cannot open ${id}` })).toBeTruthy();
    expect(calls.map((c) => c.url)).toEqual(['api/playbooks']);
    unmount();
    vi.unstubAllGlobals();
  }
});

// Invariant: after a save the app opens the saved playbook when the reloaded list has it, with the flash on its detail.
test('a saved draft that cc lists opens its detail with the flash', async () => {
  const fresh = { ...fixtures.details.mine, id: 'fresh', name: 'Fresh', description: 'A fresh playbook.', liveWorkers: 0 };
  let saved = false;
  fakeApi({
    details: { ...fixtures.details, fresh },
    handle: (m, url) => {
      if (m === 'PUT') saved = true;
      if (url === 'api/playbooks' && saved) {
        const { id, name, description, source, editable, entryStages } = fresh;
        return json({ ...fixtures.list, playbooks: [...fixtures.list.playbooks, { id, name, description, source, editable, entryStages, spawnableStages: [] }] });
      }
      return undefined;
    },
  });
  render(<App />);
  await userEvent.click(await within(nav()).findByRole('button', { name: 'New playbook' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByRole('textbox', { name: 'Id' }), 'fresh{Enter}');
  const playbook = await screen.findByRole('region', { name: 'Playbook' });
  await userEvent.type(within(playbook).getByRole('textbox', { name: 'Name' }), 'Fresh');
  await userEvent.type(within(playbook).getByRole('textbox', { name: 'Description' }), 'A fresh playbook.');
  const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
  await waitFor(() => expect(save.disabled).toBe(false), { timeout: 3000 });
  await userEvent.click(save);
  await waitFor(() => expect(location.search).toBe('?playbook=fresh'));
  expect(await screen.findByRole('heading', { name: 'Fresh' })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('Saved fresh.json.');
});

// Invariant: a flash belongs to the screen its own navigation opened; the next navigation clears it.
test('the flash is cleared by the next navigation', async () => {
  fakeApi();
  at('?edit=mine');
  render(<App />);
  const save = await screen.findByRole('button', { name: 'Save' }) as HTMLButtonElement;
  await waitFor(() => expect(save.disabled).toBe(false), { timeout: 3000 });
  await userEvent.click(save);
  await waitFor(() => expect(location.search).toBe('?playbook=mine'));
  await screen.findByRole('heading', { name: fixtures.details.mine.name });
  expect(screen.getByText('Saved mine.json.')).toBeTruthy();
  await userEvent.click(within(nav()).getByRole('button', { name: /^relay/ }));
  await screen.findByRole('heading', { name: fixtures.details.relay.name });
  expect(screen.queryByText('Saved mine.json.')).toBeNull();
  await userEvent.click(within(nav()).getByRole('button', { name: /^mine/ }));
  await screen.findByRole('heading', { name: fixtures.details.mine.name });
  expect(screen.queryByText('Saved mine.json.')).toBeNull();
});

// Invariant: Duplicate suggests the last `/` segment of a plugin id plus `-copy`.
test('duplicating acme/release suggests release-copy', async () => {
  fakeApi();
  at('?playbook=acme%2Frelease');
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Duplicate' }));
  const dialog = await screen.findByRole('dialog', { name: 'Duplicate acme/release' });
  expect((within(dialog).getByRole('textbox', { name: 'Id' }) as HTMLInputElement).value).toBe('release-copy');
});

// Invariant: Delete file is offered only for a load error whose id is a user file.
test('a load error that is not a user file has no Delete file', async () => {
  fakeApi({ list: { ...fixtures.list, errors: [...fixtures.list.errors, { id: 'acme/broken', message: 'plugin body invalid' }] } });
  render(<App />);
  const ghost = (await within(nav()).findByText('plugin body invalid')).closest('[data-id]') as HTMLElement;
  expect(ghost.getAttribute('data-id')).toBe('acme/broken');
  expect(within(ghost).queryByRole('button')).toBeNull();
  const broken = within(nav()).getByText('broken').closest('[data-id]') as HTMLElement;
  expect(within(broken).getByRole('button', { name: 'Delete file' })).toBeTruthy();
});

// Invariant: a dialog that throws while rendering (here the id dialog over a list without takenIds.reserved, which
// only that dialog reads) is closed with a message in its place; the page stays usable, a different dialog (Delete's
// confirm) still opens and works, and once the data no longer throws, Duplicate opens normally again.
test('a throwing dialog closes alone; other dialogs and its own next opening still work', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let deleted = false;
  const { calls } = fakeApi({
    handle: (m, url) => {
      if (m === 'DELETE') deleted = true;
      if (url === 'api/playbooks' && !deleted) return json({ ...fixtures.list, takenIds: { ...fixtures.list.takenIds, reserved: undefined } });
      return undefined;
    },
  });
  at('?playbook=relay');
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Duplicate' }));
  expect(await screen.findByText('Cannot show this dialog')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();

  // A different dialog: Delete's confirm opens and deletes.
  await userEvent.click(within(nav()).getByRole('button', { name: /^mine/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const confirm = await screen.findByRole('dialog', { name: 'Delete mine.json?' });
  await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === 'api/playbooks/mine')).toBe(true));
  expect(await screen.findByRole('heading', { name: 'Deleted mine.json.' })).toBeTruthy();

  // The reloaded list has takenIds.reserved again: Duplicate opens, with its live notices working.
  await userEvent.click(within(nav()).getByRole('button', { name: /^relay/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Duplicate' }));
  const dialog = await screen.findByRole('dialog', { name: 'Duplicate relay' });
  expect(screen.queryByText('Cannot show this dialog')).toBeNull();
  const input = within(dialog).getByRole('textbox', { name: 'Id' });
  await userEvent.clear(input);
  await userEvent.type(input, 'custom');
  expect(within(dialog).getByText("'custom' is reserved: cc ignores an overlay file with this id.")).toBeTruthy();
});

// Invariant: after the list pane has errored, a later good list load renders the list again (the boundary resets
// per load).
test('the list pane recovers on the next good list load', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let saved = false;
  fakeApi({
    handle: (m, url) => {
      if (m === 'PUT') saved = true;
      return url === 'api/playbooks' && !saved ? json({ ...fixtures.list, playbooks: 'nope' }) : undefined;
    },
  });
  at('?edit=mine');
  render(<App />);
  expect(await within(nav()).findByText('Cannot show the playbook list')).toBeTruthy();
  const save = await screen.findByRole('button', { name: 'Save' }) as HTMLButtonElement;
  await waitFor(() => expect(save.disabled).toBe(false), { timeout: 3000 });
  await userEvent.click(save);
  await waitFor(() => expect(location.search).toBe('?playbook=mine'));
  expect(await within(nav()).findByRole('button', { name: /^relay/ })).toBeTruthy();
  expect(within(nav()).queryByText('Cannot show the playbook list')).toBeNull();
});
