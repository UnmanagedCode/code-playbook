import { useState } from 'react';
import { CircleAlertIcon, LoaderCircleIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface ConfirmRequest {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  /** Throws to keep the dialog open with the error's message shown. */
  onConfirm: () => Promise<void> | void;
}

/**
 * A destructive confirm. Kept mounted and toggled by `open` so Radix returns focus to the opener on close;
 * `request` holds the last content through the close animation, and `n` resets busy/error per request.
 */
export function ConfirmDialog({ open, request, n, onCancel }: { open: boolean; request: ConfirmRequest | null; n: number; onCancel: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      {request && <ConfirmContent key={n} request={request} onCancel={onCancel} />}
    </Dialog>
  );
}

function ConfirmContent({ request, onCancel }: { request: ConfirmRequest; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await request.onConfirm();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <DialogContent showCloseButton={false} onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }} onInteractOutside={(e) => { if (busy) e.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
        {request.body ? <DialogDescription asChild><div className="grid gap-2">{request.body}</div></DialogDescription> : <DialogDescription className="sr-only">Confirm</DialogDescription>}
      </DialogHeader>
      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription><p>{error}</p></AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="button" variant="destructive" onClick={run} disabled={busy}>
          {busy && <LoaderCircleIcon className="animate-spin" />}
          {request.confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
