import { useId } from 'react';
import { CircleAlertIcon, PlusIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { groupPlaybooks, loadErrorGroups } from '@/model/listModel';
import type { PlaybookList as List } from '@/model/types';
import { cn } from '@/lib/utils';

export type ListState = { status: 'loading' } | { status: 'ok'; list: List } | { status: 'error'; message: string };

// The grouped list, with the New playbook action in the User group and cc's
// load errors grouped by id beneath it.
export function PlaybookList({ state, selectedId, onSelect, onNew, onDeleteFile }: {
  state: ListState; selectedId: string | null;
  onSelect: (id: string) => void; onNew: () => void; onDeleteFile: (id: string) => void;
}) {
  const uid = useId();
  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <span className="sr-only" role="status">Loading playbooks</span>
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Cannot load playbooks</AlertTitle>
        <AlertDescription><p>{state.message}</p></AlertDescription>
      </Alert>
    );
  }
  const { list } = state;
  const errors = loadErrorGroups(list);
  return (
    <div className="flex flex-col gap-5">
      {groupPlaybooks(list).map((g, gi) => (
        <section key={g.source} aria-labelledby={`${uid}-g${gi}`} data-source={g.source} className="flex flex-col gap-1">
          <div className="flex min-h-8 items-center justify-between gap-2 px-1">
            <h2 id={`${uid}-g${gi}`} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</h2>
            {g.source === 'user' && (
              <Button type="button" variant="outline" size="sm" onClick={onNew}><PlusIcon />New playbook</Button>
            )}
          </div>
          {g.entries.length === 0 && <p className="px-1 text-sm text-muted-foreground">No user playbooks yet.</p>}
          {g.entries.map((p) => {
            const selected = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                data-id={p.id}
                aria-current={selected ? 'page' : undefined}
                onClick={() => onSelect(p.id)}
                className={cn(
                  'flex min-w-0 flex-col items-start gap-0.5 rounded-md border border-transparent px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring',
                  selected && 'border-border bg-accent text-accent-foreground',
                )}
              >
                <span className="max-w-full truncate font-mono text-sm">{p.id}</span>
                <span className="max-w-full truncate text-xs text-muted-foreground">{p.name}</span>
              </button>
            );
          })}
        </section>
      ))}
      {errors.length > 0 && (
        <section aria-labelledby={`${uid}-errors`} className="flex flex-col gap-2">
          <h2 id={`${uid}-errors`} className="px-1 text-xs font-semibold tracking-wide text-destructive uppercase">Load errors</h2>
          {errors.map((e) => (
            <div key={e.id} data-id={e.id} className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="min-w-0 truncate font-mono text-sm">{e.id}</code>
                {e.deletable && (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDeleteFile(e.id)}>
                    Delete file
                  </Button>
                )}
              </div>
              {e.messages.map((m, i) => <p key={i} className="text-xs break-words text-muted-foreground">{m}</p>)}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
