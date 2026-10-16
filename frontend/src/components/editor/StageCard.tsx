import { useId } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { addableTools, SPAWN_HINT, STAGE_DESC_HINT, toolLabel } from '@/model/editorModel';
import { SPAWN, toggleEntry } from '@/model/formModel';
import { addNeed, addTool, setStageDescription, setWorkers } from '@/model/formEdits';
import type { FormStage, LocatedError } from '@/model/types';
import { cn } from '@/lib/utils';
import { ErrorList } from './ErrorList';
import { Field } from './Field';
import { NeedsRow } from './NeedsRow';
import { ToolRow } from './ToolRow';
import type { EditorApi } from './types';

export function StageCard({ ed, stage, errors, renameDraft, renameError, onRenameDraft, onRenameCommit, onRemove }: {
  ed: EditorApi; stage: FormStage; errors: LocatedError[];
  renameDraft: string | undefined; renameError: string | undefined;
  onRenameDraft: (value: string) => void; onRenameCommit: () => void; onRemove: () => void;
}) {
  const entryId = useId();
  const k = stage.key;
  const addable = addableTools(ed.toolNames, stage);
  return (
    <section
      aria-label={`Stage ${stage.name}`}
      data-stage={stage.name}
      className={cn('grid min-w-0 gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-5', (errors.length > 0 || renameError) && 'border-destructive/50')}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Stage name" className="min-w-40 flex-1">
          {({ id }) => (
            <Input
              id={id}
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={renameError ? true : undefined}
              value={renameDraft ?? stage.name}
              onChange={(e) => onRenameDraft(e.target.value)}
              onBlur={onRenameCommit}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                onRenameCommit();
              }}
            />
          )}
        </Field>
        <div className="flex h-9 items-center gap-2">
          <Checkbox id={entryId} checked={ed.form.entryStages.includes(stage.name)}
            onCheckedChange={(v) => ed.change((f) => toggleEntry(f, stage.name, v === true))} />
          <Label htmlFor={entryId}>Entry stage</Label>
        </div>
        <Field label="Workers">
          {({ id }) => (
            <NativeSelect id={id} value={stage.workers} onChange={(e) => { const v = e.target.value; ed.change((f) => setWorkers(f, k, v)); }}>
              <option value="one">one</option>
              <option value="many">many</option>
            </NativeSelect>
          )}
        </Field>
        <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2Icon />Remove stage
        </Button>
      </div>
      {renameError && <p className="text-sm text-destructive">{renameError}</p>}
      <ErrorList errors={errors} />
      <Field label="Description" hint={STAGE_DESC_HINT}>
        {({ id, hintId }) => (
          <Textarea id={id} aria-describedby={hintId} rows={Math.min(12, Math.ceil(stage.description.length / 120) + 1)} value={stage.description}
            onChange={(e) => { const v = e.target.value; ed.change((f) => setStageDescription(f, k, v)); }} />
        )}
      </Field>
      <div className="grid gap-2">
        <h4 className="text-sm font-semibold">Needs</h4>
        {stage.needs.map((n, i) => <NeedsRow key={i} ed={ed} stage={stage} need={n} i={i} />)}
        <Button type="button" variant="outline" size="sm" className="justify-self-start" ref={ed.register(`need:${k}`)}
          onClick={() => ed.change((f) => addNeed(f, k))}>
          <PlusIcon />Add need
        </Button>
      </div>
      <div className="grid gap-2">
        <h4 className="text-sm font-semibold">Tools</h4>
        <ToolRow ed={ed} stage={stage} row={stage.tools.find((t) => t.tool === SPAWN)} />
        <p className="text-xs text-muted-foreground">{SPAWN_HINT}</p>
        {stage.tools.filter((t) => t.tool !== SPAWN).map((row) => <ToolRow key={row.tool} ed={ed} stage={stage} row={row} />)}
        {addable.length > 0 && (
          <NativeSelect aria-label="Add tool" size="sm" value="" ref={ed.register(`addtool:${k}`)}
            onChange={(e) => { const tool = e.target.value; if (tool) ed.change((f) => addTool(f, k, tool)); }}>
            <option value="">add tool…</option>
            {addable.map((t) => <option key={t} value={t}>{toolLabel(t)}</option>)}
          </NativeSelect>
        )}
      </div>
    </section>
  );
}
