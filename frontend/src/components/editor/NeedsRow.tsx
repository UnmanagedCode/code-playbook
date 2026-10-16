import { useId } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { positionMembers } from '@/model/editorModel';
import { removeNeed, setNeedAnchor, setNeedLiveness, toggleNeedPosition } from '@/model/formEdits';
import type { FormStage, Need } from '@/model/types';
import { Field } from './Field';
import type { EditorApi } from './types';

export function NeedsRow({ ed, stage, need, i }: { ed: EditorApi; stage: FormStage; need: Need; i: number }) {
  const names = ed.form.stages.map((st) => st.name);
  return (
    <div role="group" aria-label={`Need ${i + 1}`} className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border bg-background/50 p-3">
      <Field label="Anchor">
        {({ id }) => (
          <NativeSelect id={id} size="sm" value={need.stage} onChange={(e) => { const v = e.target.value; ed.change((f) => setNeedAnchor(f, stage.key, i, v)); }}>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </NativeSelect>
        )}
      </Field>
      <div role="group" aria-label="Position" className="grid min-w-0 gap-1.5">
        <span aria-hidden className="text-xs font-medium text-muted-foreground">Position</span>
        <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1.5">
          {positionMembers(names).map((m) => (
            <PositionCheck key={m.value} label={m.label} checked={need.position.includes(m.value)}
              onChange={(on) => ed.change((f) => toggleNeedPosition(f, stage.key, i, m.value, on))} />
          ))}
        </div>
      </div>
      <Field label="Liveness">
        {({ id }) => (
          <NativeSelect id={id} size="sm" value={need.liveness} onChange={(e) => { const v = e.target.value; ed.change((f) => setNeedLiveness(f, stage.key, i, v)); }}>
            {['live', 'retired', 'any'].map((v) => <option key={v} value={v}>{v}</option>)}
          </NativeSelect>
        )}
      </Field>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove need" title="remove this need" className="ml-auto"
        onClick={() => { ed.change((f) => removeNeed(f, stage.key, i)); ed.focusNext(`need:${stage.key}`); }}>
        <XIcon />
      </Button>
    </div>
  );
}

function PositionCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-1.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="font-mono text-xs font-normal">{label}</Label>
    </span>
  );
}
