// The confirm dialog: cancelling it (Escape or Cancel) closes it without confirming and returns focus to the
// control that opened it; confirming runs the action.
import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog, type ConfirmRequest } from './ConfirmDialog';

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

// A host whose confirm action is pending until the test settles it.
function PendingHost({ onConfirm }: { onConfirm: ConfirmRequest['onConfirm'] }) {
  const [state, setState] = useState({ open: false, n: 0 });
  return (
    <>
      <button type="button" onClick={() => setState((s) => ({ open: true, n: s.n + 1 }))}>Delete</button>
      <ConfirmDialog open={state.open} n={state.n} request={{ title: 'Delete mine.json?', confirmLabel: 'Delete', onConfirm }}
        onCancel={() => setState((s) => ({ ...s, open: false }))} />
    </>
  );
}
// Radix's modal sets pointer-events: none outside the dialog; a real outside click still reaches its document listener.
const outside = userEvent.setup({ pointerEventsCheck: 0 });
const clickOutside = () => outside.click(document.querySelector('[data-slot="dialog-overlay"]')!);

// Invariant: while the action is in flight, Escape and an outside click leave the confirm open (an idle confirm
// closes on either), and the action's failure is then shown in it.
test('a pending confirm ignores Escape and outside clicks, then shows the failure', async () => {
  let reject!: (e: Error) => void;
  const onConfirm = vi.fn(() => new Promise<void>((_, r) => { reject = r; }));
  render(<PendingHost onConfirm={onConfirm} />);

  await userEvent.click(opener());
  await screen.findByRole('dialog', { name: 'Delete mine.json?' });
  await clickOutside();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  await userEvent.click(opener());
  const dialog = await screen.findByRole('dialog', { name: 'Delete mine.json?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await userEvent.keyboard('{Escape}');
  await clickOutside();
  expect(screen.getByRole('dialog', { name: 'Delete mine.json?' })).toBe(dialog);

  await act(async () => reject(new Error('Delete failed: disk full')));
  expect(await within(dialog).findByText('Delete failed: disk full')).toBeTruthy();
  expect(screen.getByRole('dialog', { name: 'Delete mine.json?' })).toBe(dialog);
});
