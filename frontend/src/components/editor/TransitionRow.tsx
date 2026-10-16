import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { viaOptions } from '@/model/editorModel';
import { removeTransition, setTransitionField } from '@/model/formEdits';
import type { FormTransition, LocatedError } from '@/model/types';
import { cn } from '@/lib/utils';
import { ErrorList } from './ErrorList';
import { Field } from './Field';
import type { EditorApi } from './types';

export function TransitionRow({ ed, t, i, errors }: { ed: EditorApi; t: FormTransition; i: number; errors: LocatedError[] | undefined }) {
  const names = ed.form.stages.map((st) => st.name);
  const set = (field: keyof FormTransition) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    ed.change((f) => setTransitionField(f, i, field, v));
  };
  const stageSelect = (label: string, field: 'from' | 'to') => (
    <Field label={label}>
      {({ id }) => (
        <NativeSelect id={id} size="sm" value={t[field]} onChange={set(field)}>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </NativeSelect>
      )}
    </Field>
  );
  return (
    <div role="group" aria-label={`Transition ${i + 1}`} className={cn('grid gap-2 rounded-lg border bg-background/50 p-3', errors?.length && 'border-destructive/50')}>
      <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
        {stageSelect('From', 'from')}
        <span aria-hidden className="pb-1.5 text-muted-foreground">→</span>
        {stageSelect('To', 'to')}
        <Field label="Via">
          {({ id }) => (
            <NativeSelect id={id} size="sm" value={t.via} onChange={set('via')}>
              {viaOptions(ed.toolNames).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          )}
        </Field>
        <Field label="Description" className="min-w-40 flex-1">
          {({ id }) => <Input id={id} className="h-8" placeholder="optional" value={t.description} onChange={set('description')} />}
        </Field>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove transition"
          onClick={() => { ed.change((f) => removeTransition(f, i)); ed.focusNext('addtransition'); }}>
          <XIcon />
        </Button>
      </div>
      <ErrorList errors={errors} />
    </div>
  );
}
