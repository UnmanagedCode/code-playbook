import { useId } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { WORKER_POLICY_OPTIONS, WORKER_TOOLS_HINT } from '@/model/editorModel';
import { addWorkerTool, removeWorkerTool, setWorkerToolPattern, setWorkerToolPolicy } from '@/model/formEdits';
import { patternKind, workerToolNotes } from '@/model/workerTools';
import type { FormStage, WorkerToolPolicy } from '@/model/types';
import { Field } from './Field';
import type { EditorApi } from './types';

const KIND_LABEL = { exact: undefined, wildcard: 'wildcard pattern', fallback: 'fallback pattern (matches every tool not listed)' } as const;

/** The stage's worker tools: rows of pattern + policy. Notes are advisory; cc's validator gates Save. */
export function WorkerTools({ ed, stage }: { ed: EditorApi; stage: FormStage }) {
  const k = stage.key;
  return (
    <div className="grid gap-2">
      <h4 className="text-sm font-semibold">Worker tools</h4>
      <p className="text-xs text-muted-foreground">{WORKER_TOOLS_HINT}</p>
      {stage.workerTools.map((_, i) => <WorkerToolRow key={i} ed={ed} stage={stage} i={i} />)}
      <Button type="button" variant="outline" size="sm" className="justify-self-start" ref={ed.register(`addworkertool:${k}`)}
        onClick={() => { ed.change((f) => addWorkerTool(f, k)); ed.focusNext(`wtpattern:${k}:${stage.workerTools.length}`); }}>
        <PlusIcon />Add worker tool
      </Button>
    </div>
  );
}

function WorkerToolRow({ ed, stage, i }: { ed: EditorApi; stage: FormStage; i: number }) {
  const k = stage.key;
  const row = stage.workerTools[i];
  const baseId = useId();
  const kind = KIND_LABEL[patternKind(row.pattern)];
  const notes = workerToolNotes(stage.workerTools, i);
  const kindId = kind ? `${baseId}-kind` : undefined;
  const describedBy = [kindId, ...notes.map((n) => `${baseId}-${n.code}`)].filter(Boolean).join(' ') || undefined;
  return (
    <div role="group" aria-label={`Worker tool ${i + 1}`} className="grid gap-2 rounded-lg border bg-background/50 p-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <Field label="Pattern" className="min-w-40 flex-1">
          {({ id }) => (
            <Input id={id} className="h-8 font-mono" spellCheck={false} autoComplete="off" value={row.pattern}
              ref={ed.register(`wtpattern:${k}:${i}`)}
              aria-invalid={notes.length > 0 ? true : undefined} aria-describedby={describedBy}
              onChange={(e) => { const v = e.target.value; ed.change((f) => setWorkerToolPattern(f, k, i, v)); }} />
          )}
        </Field>
        <Field label="Policy">
          {({ id }) => (
            <NativeSelect id={id} size="sm" value={row.policy}
              onChange={(e) => { const v = e.target.value as WorkerToolPolicy; ed.change((f) => setWorkerToolPolicy(f, k, i, v)); }}>
              {WORKER_POLICY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          )}
        </Field>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove worker tool" title="remove worker tool"
          onClick={() => { ed.change((f) => removeWorkerTool(f, k, i)); ed.focusNext(`addworkertool:${k}`); }}>
          <XIcon />
        </Button>
      </div>
      {kind && <p id={kindId} className="text-xs text-muted-foreground">{kind}</p>}
      {notes.map((n) => <p key={n.code} id={`${baseId}-${n.code}`} className="text-xs text-warning">{n.message}</p>)}
    </div>
  );
}
