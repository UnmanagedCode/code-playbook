import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** A visible label over its control, with an optional hint the control is described by. */
export function Field({ label, hint, className, children }: {
  label: string; hint?: string; className?: string;
  children: (ids: { id: string; hintId?: string }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {children({ id, hintId })}
      {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
