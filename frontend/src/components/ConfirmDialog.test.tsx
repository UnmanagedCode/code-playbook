// The confirm dialog: cancelling it (Escape or Cancel) closes it without confirming and returns focus to the
// control that opened it; confirming runs the action.
import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

function Host({ onConfirm }: { onConfirm: () => void }) {
  const [state, setState] = useState({ open: false, n: 0 });
  return (
    <>
      <button type="button" onClick={() => setState((s) => ({ open: true, n: s.n + 1 }))}>Delete</button>
      <ConfirmDialog
        open={state.open}
        n={state.n}
        request={{ title: 'Delete mine.json?', confirmLabel: 'Delete', onConfirm: () => { onConfirm(); setState((s) => ({ ...s, open: false })); } }}
        onCancel={() => setState((s) => ({ ...s, open: false }))}
      />
    </>
  );
}
const opener = () => screen.getAllByRole('button', { name: 'Delete' }).find((b) => !b.closest('[role="dialog"]'))!;

// Invariant: Escape and Cancel close the confirm without confirming, and focus goes back to the control that opened it.
test('Escape and Cancel return focus to the opener', async () => {
  const onConfirm = vi.fn();
  render(<Host onConfirm={onConfirm} />);
  await userEvent.click(opener());
  await screen.findByRole('dialog', { name: 'Delete mine.json?' });
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(opener()));

  await userEvent.click(opener());
  const dialog = await screen.findByRole('dialog', { name: 'Delete mine.json?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(opener()));
  expect(onConfirm).not.toHaveBeenCalled();
});

// Invariant: the commit button runs the action.
test('confirming runs the action', async () => {
  const onConfirm = vi.fn();
  render(<Host onConfirm={onConfirm} />);
  await userEvent.click(opener());
  const dialog = await screen.findByRole('dialog', { name: 'Delete mine.json?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
