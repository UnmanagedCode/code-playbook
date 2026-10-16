import { useId, useRef, useState } from 'react';
import { CircleAlertIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idNotices } from '@/model/formModel';
import type { TakenIds } from '@/model/types';

export interface IdRequest { title: string; initial: string }

/**
 * Asks for a new playbook id, showing the takenIds notices live as it is typed. `onDone` gets the trimmed id,
 * or null when cancelled. Kept mounted and toggled by `open` so focus returns to the opener; `n` resets the field.
 */
export function IdDialog({ open, request, n, takenIds, onDone }: { open: boolean; request: IdRequest | null; n: number; takenIds: TakenIds; onDone: (id: string | null) => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDone(null); }}>
      {request && <IdForm key={n} request={request} takenIds={takenIds} onDone={onDone} />}
    </Dialog>
  );
}

function IdForm({ request, takenIds, onDone }: { request: IdRequest; takenIds: TakenIds; onDone: (id: string | null) => void }) {
  const [value, setValue] = useState(request.initial);
  const selected = useRef(false);
  const inputId = useId();
  const id = value.trim();
  const n = idNotices(id, takenIds, null);
  const disabled = id === '' || !!n.block;
  return (
    <DialogContent>
      {/* Submitted only through onSubmit: the CSP's form-action 'none' forbids a native submission. */}
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) onDone(id);
        }}
      >
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          <DialogDescription>Choose the new playbook's id.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={inputId}>Id</Label>
          <Input
            id={inputId}
            autoFocus
            className="font-mono"
            placeholder="my-playbook"
            autoComplete="off"
            spellCheck={false}
            value={value}
            aria-describedby={`${inputId}-hint`}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => {
              if (selected.current) return;
              selected.current = true;
              e.currentTarget.select();
            }}
          />
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">cc validates the id when the playbook is checked and saved.</p>
        </div>
        {(n.block || n.warn.length > 0) && (
          <div className="grid gap-2">
            {n.block && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription><p>{n.block}</p></AlertDescription>
              </Alert>
            )}
            {n.warn.map((w, i) => (
              <Alert key={i} variant="warning">
                <TriangleAlertIcon />
                <AlertDescription><p>{w}</p></AlertDescription>
              </Alert>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onDone(null)}>Cancel</Button>
          <Button type="submit" disabled={disabled}>Continue</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
