import { useLayoutEffect, useRef, useState } from 'react';
import { CircleAlertIcon, LoaderCircleIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ConfirmDialog';
import { editorNotices, editorStatus, idHint, removeStageConfirm, type EditorMode } from '@/model/editorModel';
import { placeErrors, removeStage, SPAWN } from '@/model/formModel';
import { addStage, addTransition, setField } from '@/model/formEdits';
import { canSave } from '@/model/saveGate';
import type { Form, PlaybookList } from '@/model/types';
import { cn } from '@/lib/utils';
import { ErrorList } from './ErrorList';
import { Field } from './Field';
import { StageCard } from './StageCard';
import { TransitionRow } from './TransitionRow';
import type { EditorApi } from './types';
import { useEditor } from './useEditor';

const TONE = { muted: 'text-muted-foreground', good: 'text-success', bad: 'text-destructive' } as const;

// A structured form over formModel. Not a <form>: Enter never saves.
export function Editor({ mode, form, title, originalId, originalLive, list, onSaved, onCancel }: {
  mode: EditorMode; form: Form; title: string; originalId: string | null; originalLive: number | null;
  list: PlaybookList; onSaved: (id: string) => void; onCancel: () => void;
}) {
  const { state: s, change, save, setRenameDraft, commitRename } = useEditor({ mode, form, originalId, originalLive, list, onSaved });
  const targets = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; request: ConfirmRequest | null; n: number }>({ open: false, request: null, n: 0 });
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    targets.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  const ed: EditorApi = {
    form: s.form,
    change,
    toolNames: list.governableTools.map((t) => t.name),
    pinArgsOf: (tool) => list.governableTools.find((t) => t.name === tool)?.pinArgs || [],
    spawnPinArgs: list.governableTools.find((t) => t.name === SPAWN)?.pinArgs,
    register: (key) => (el) => {
      if (el) targets.current.set(key, el);
      else targets.current.delete(key);
    },
    focusNext: (key) => { pendingFocus.current = key; },
  };

  const f = s.form;
  const n = editorNotices({ form: f, takenIds: list.takenIds, mode, originalId, originalLive, target: s.target });
  const placed = placeErrors([...(s.validation?.rev === s.rev ? s.validation.errors : []), ...s.localErrors], f);
  const status = editorStatus({
    saving: s.saving,
    renameCount: f.stages.filter((st) => s.renameErrors[st.key]).length,
    localErrorCount: s.localErrors.length,
    validation: s.validation,
    rev: s.rev,
    block: n.block,
  });
  const names = f.stages.map((st) => st.name);
  const closeConfirm = () => setConfirm((c) => ({ ...c, open: false }));

  const askRemoveStage = (key: string, name: string) => {
    const { impact } = removeStage(s.form, key);
    setConfirm((c) => ({
      open: true,
      n: c.n + 1,
      request: {
        title: removeStageConfirm(name),
        confirmLabel: 'Remove stage',
        body: impact.length > 0 && (
          <>
            <p>This also removes:</p>
            <ul className="list-disc pl-5">{impact.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </>
        ),
        onConfirm: () => {
          change((cur) => removeStage(cur, key).form);
          closeConfirm();
          pendingFocus.current = 'addstage';
        },
      },
    }));
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold break-words">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" aria-live="polite" data-status className={cn('inline-flex items-center gap-1.5 text-sm', TONE[status.tone])}>
            {status.text === 'Validating…' && <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" />}
            {status.text}
          </span>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" disabled={!canSave(s, n)} onClick={save}>
            {s.saving && <LoaderCircleIcon className="animate-spin" />}
            Save
          </Button>
        </div>
      </div>
      {n.block && <Notice variant="destructive" text={n.block} />}
      {n.warn.map((w, i) => <Notice key={i} variant="warning" text={w} />)}
      {s.saveError && <Notice variant="destructive" text={s.saveError} />}

      <section aria-label="Playbook" className="grid gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-5">
        <Field label="Id" hint={idHint(f.id)}>
          {({ id, hintId }) => (
            <Input id={id} aria-describedby={hintId} className="font-mono" spellCheck={false} autoComplete="off" value={f.id}
              onChange={(e) => { const v = e.target.value; change((x) => setField(x, 'id', v)); }} />
          )}
        </Field>
        <Field label="Name">
          {({ id }) => <Input id={id} value={f.name} onChange={(e) => { const v = e.target.value; change((x) => setField(x, 'name', v)); }} />}
        </Field>
        <Field label="Description">
          {({ id }) => <Textarea id={id} rows={2} value={f.description} onChange={(e) => { const v = e.target.value; change((x) => setField(x, 'description', v)); }} />}
        </Field>
        {placed.playbook.length > 0 && (
          <div className="grid gap-1" data-playbook-errors>
            <h3 className="text-sm font-semibold text-destructive">Playbook errors</h3>
            <ErrorList errors={placed.playbook} />
          </div>
        )}
      </section>

      <h3 className="text-base font-semibold">Stages</h3>
      {f.stages.map((st) => (
        <StageCard
          key={st.key}
          ed={ed}
          stage={st}
          errors={placed.byStage[st.key] || []}
          renameDraft={s.renameDrafts[st.key]}
          renameError={s.renameErrors[st.key]}
          onRenameDraft={(v) => setRenameDraft(st.key, v)}
          onRenameCommit={() => commitRename(st.key)}
          onRemove={() => askRemoveStage(st.key, st.name)}
        />
      ))}
      <Button type="button" variant="outline" size="sm" className="self-start" ref={ed.register('addstage')} onClick={() => change((x) => addStage(x))}>
        <PlusIcon />Add stage
      </Button>

      <section aria-label="Transitions" className="grid gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-5">
        <h3 className="text-base font-semibold">Transitions</h3>
        {f.transitions.map((t, i) => <TransitionRow key={i} ed={ed} t={t} i={i} errors={placed.byTransition[i]} />)}
        {names.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="justify-self-start" ref={ed.register('addtransition')} onClick={() => change((x) => addTransition(x))}>
            <PlusIcon />Add transition
          </Button>
        )}
      </section>
      <ConfirmDialog open={confirm.open} request={confirm.request} n={confirm.n} onCancel={closeConfirm} />
    </div>
  );
}

function Notice({ variant, text }: { variant: 'destructive' | 'warning'; text: string }) {
  return (
    <Alert variant={variant}>
      {variant === 'destructive' ? <CircleAlertIcon /> : <TriangleAlertIcon />}
      <AlertDescription><p>{text}</p></AlertDescription>
    </Alert>
  );
}
