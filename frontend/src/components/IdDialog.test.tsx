// The id dialog: live takenIds notices, Continue gated on a usable id, the trimmed id or null resolved,
// focus returned to the opener, and the initial id selected for retyping.
import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdDialog } from './IdDialog';
import { fixtures } from '@/test/fakeApi';

function Host({ onDone, initial = 'relay-copy' }: { onDone: (id: string | null) => void; initial?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <IdDialog open={open} n={1} request={{ title: 'Duplicate relay', initial }} takenIds={fixtures.list.takenIds}
        onDone={(id) => { setOpen(false); onDone(id); }} />
    </>
  );
}
async function open(onDone = vi.fn(), initial?: string) {
  render(<Host onDone={onDone} initial={initial} />);
  await userEvent.click(screen.getByRole('button', { name: 'Open' }));
  const dialog = await screen.findByRole('dialog', { name: 'Duplicate relay' });
  return { dialog, input: within(dialog).getByRole('textbox', { name: 'Id' }) as HTMLInputElement, cont: within(dialog).getByRole('button', { name: 'Continue' }), onDone };
}

// Invariant: a reserved id is blocked and Continue disabled; built-in and user ids warn; an empty id disables.
test('notices and the Continue gate', async () => {
  const { dialog, input, cont } = await open();
  await userEvent.clear(input);
  expect(cont).toHaveProperty('disabled', true);
  await userEvent.type(input, 'custom');
  expect(within(dialog).getByText("'custom' is reserved: cc ignores an overlay file with this id.")).toBeTruthy();
  expect(cont).toHaveProperty('disabled', true);
  await userEvent.clear(input);
  await userEvent.type(input, 'solo');
  expect(within(dialog).getByText("'solo' overrides the shipped 'solo' playbook until this file is deleted.")).toBeTruthy();
  expect(cont).toHaveProperty('disabled', false);
  await userEvent.clear(input);
  await userEvent.type(input, 'mine');
  expect(within(dialog).getByText("'mine' overwrites the existing user playbook 'mine'.")).toBeTruthy();
  await userEvent.clear(input);
  await userEvent.type(input, 'my-relay');
  expect(within(dialog).queryAllByRole('alert')).toEqual([]);
});

// Invariant: Enter submits the trimmed id (through onSubmit, never a native submission).
test('Enter resolves the trimmed id', async () => {
  const { input, onDone } = await open();
  await userEvent.clear(input);
  await userEvent.type(input, '  my-relay  {Enter}');
  expect(onDone).toHaveBeenCalledWith('my-relay');
});

// Invariant: Escape and Cancel resolve null, and focus goes back to the control that opened the dialog.
test('Escape and Cancel resolve null and return focus to the opener', async () => {
  const first = await open();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(first.onDone).toHaveBeenCalledWith(null);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' })));

  await userEvent.click(screen.getByRole('button', { name: 'Open' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(first.onDone).toHaveBeenLastCalledWith(null);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' })));
});

// Invariant: the dialog opens on the id field with the suggested id selected, so typing replaces it.
test('the initial value is focused and selected', async () => {
  const { input } = await open();
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'relay-copy'.length]);
});
