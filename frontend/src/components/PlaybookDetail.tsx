import { useRef } from 'react';
import { CircleCheckIcon, Trash2Icon } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { liveText, readOnlyNote } from '@/model/listModel';
import type { PlaybookDetail as Detail, PlaybookList } from '@/model/types';
import { BackButton } from './BackButton';
import { ErrorBoundary } from './ErrorBoundary';
import { StageGraph } from './StageGraph';
import { StagePanel } from './StagePanel';
import { TransitionsTable } from './TransitionsTable';

const SOURCE_VARIANT = (source: string) => (source === 'builtin' ? 'secondary' : source === 'user' ? 'success' : 'info');

export function FlashNotice({ text }: { text: string }) {
  return (
    <Alert>
      {/* Important: alert.tsx paints its icon text-current. */}
      <CircleCheckIcon className="text-success!" />
      <AlertTitle>{text}</AlertTitle>
    </Alert>
  );
}

export function PlaybookDetail({ detail, list, flash, onBack, onEdit, onDuplicate, onDelete }: {
  detail: Detail; list: PlaybookList; flash: string | null;
  onBack: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const headings = useRef(new Map<string, HTMLHeadingElement>());
  const builtinOverride = detail.source === 'user' && list.takenIds.builtin.includes(detail.id);
  const goToStage = (name: string) => {
    const h = headings.current.get(name);
    if (!h) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    h.closest('section')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    h.focus({ preventScroll: true });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <BackButton onClick={onBack} />
      {flash && <FlashNotice text={flash} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-xl font-semibold break-words">{detail.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <code className="font-mono">{detail.id}</code>
            <Badge variant={SOURCE_VARIANT(detail.source)}>{detail.source}</Badge>
            {builtinOverride && <Badge variant="warning">overrides built-in</Badge>}
            <span className="text-muted-foreground">{`live workers: ${liveText(detail.liveWorkers)}`}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Actions">
          {detail.editable && <Button type="button" onClick={onEdit}>Edit</Button>}
          <Button type="button" variant={detail.editable ? 'outline' : 'default'} onClick={onDuplicate}>Duplicate</Button>
          {detail.editable && (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2Icon />Delete
            </Button>
          )}
        </div>
      </div>
      {!detail.editable && <p className="text-sm text-muted-foreground">{readOnlyNote(detail.source)}</p>}
      <p className="whitespace-pre-wrap">{detail.description}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">entry stages</span>
        {detail.entryStages.map((s) => <Badge key={s} variant="outline" className="font-mono">{s}</Badge>)}
      </div>
      <Card className="gap-2 py-4">
        <CardContent className="overflow-x-auto px-4">
          <ErrorBoundary resetKey={detail} fallback={(e) => <p className="text-sm text-destructive">{`The stage graph cannot be drawn: ${e.message}`}</p>}>
            <StageGraph detail={detail} onNode={goToStage} />
          </ErrorBoundary>
        </CardContent>
        <CardContent className="px-4">
          <p className="text-xs text-muted-foreground">solid: transition, labelled with its driving tool · dashed: needs (anchor → stage) · bold border: entry stage</p>
        </CardContent>
      </Card>
      {Object.entries(detail.stages).map(([name, stage]) => (
        <StagePanel
          key={name}
          name={name}
          stage={stage}
          entry={detail.entryStages.includes(name)}
          headingRef={(el) => { if (el) headings.current.set(name, el); else headings.current.delete(name); }}
        />
      ))}
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={3}>Transitions</CardTitle>
        </CardHeader>
        <CardContent>
          <TransitionsTable transitions={detail.transitions} />
        </CardContent>
      </Card>
    </div>
  );
}
