import { PlusIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { canAddPin, pinArgOptions, policyOptions, toolLabel } from '@/model/editorModel';
import { SPAWN } from '@/model/formModel';
import { addPin, declareSpawn, removePin, setPinArg, setPinJson, setToolPolicy } from '@/model/formEdits';
import type { FormStage, ToolRow as Row } from '@/model/types';
import { Field } from './Field';
import type { EditorApi } from './types';

/**
 * One declared tool and its policy (and pins). spawn_instance always has a row: undeclared it shows `not declared`,
 * and choosing a policy declares it. The same element serves both, so the policy select keeps focus across the switch.
 */
export function ToolRow({ ed, stage, row }: { ed: EditorApi; stage: FormStage; row: Row | undefined }) {
  const declared = row !== undefined;
  const r: Row = row ?? { tool: SPAWN, policy: 'none', pin: [] };
  const isSpawn = r.tool === SPAWN;
  const pinArgs = ed.pinArgsOf(r.tool);
  const k = stage.key;
  const setPolicy = (value: string) => {
    if (!declared) ed.change((f) => declareSpawn(f, k, value, ed.spawnPinArgs));
    else ed.change((f) => setToolPolicy(f, k, r.tool, value, pinArgs));
  };
  return (
    <div role="group" aria-label={`Tool ${r.tool}`} data-tool={r.tool} className="grid gap-3 rounded-lg border bg-background/50 p-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <code className="min-h-8 min-w-0 flex-1 basis-40 self-center font-mono text-sm break-all">{toolLabel(r.tool)}</code>
        <Field label="Policy">
          {({ id }) => (
            <NativeSelect id={id} size="sm" value={r.policy} onChange={(e) => setPolicy(e.target.value)}>
              {policyOptions(r, pinArgs).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          )}
        </Field>
        {!isSpawn && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove tool ${r.tool}`} title={`remove ${r.tool}`}
            onClick={() => { ed.change((f) => setToolPolicy(f, k, r.tool, 'none', pinArgs)); ed.focusNext(`addtool:${k}`); }}>
            <XIcon />
          </Button>
        )}
      </div>
      {r.policy === 'pin' && (
        <div className="grid gap-2 border-l-2 pl-3">
          {r.pin.map((p, i) => (
            <div key={i} role="group" aria-label={`Pin ${i + 1}`} className="flex flex-wrap items-end gap-x-2 gap-y-2">
              <Field label="Pin argument">
                {({ id }) => (
                  <NativeSelect id={id} size="sm" value={p.arg} onChange={(e) => { const v = e.target.value; ed.change((f) => setPinArg(f, k, r.tool, i, v)); }}>
                    {pinArgOptions(pinArgs, p.arg).map((a) => <option key={a} value={a}>{a}</option>)}
                  </NativeSelect>
                )}
              </Field>
              <span aria-hidden className="pb-1.5 text-muted-foreground">=</span>
              <Field label="Pin value (JSON)" className="min-w-32 flex-1">
                {({ id }) => (
                  <Input id={id} className="h-8 font-mono" placeholder="JSON value" spellCheck={false} autoComplete="off" value={p.json}
                    onChange={(e) => { const v = e.target.value; ed.change((f) => setPinJson(f, k, r.tool, i, v)); }} />
                )}
              </Field>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove pin"
                onClick={() => { ed.change((f) => removePin(f, k, r.tool, i)); ed.focusNext(`pin:${k}:${r.tool}`); }}>
                <XIcon />
              </Button>
            </div>
          ))}
          {canAddPin(r, pinArgs) && (
            <Button type="button" variant="outline" size="sm" className="justify-self-start" ref={ed.register(`pin:${k}:${r.tool}`)}
              onClick={() => ed.change((f) => addPin(f, k, r.tool, pinArgs))}>
              <PlusIcon />Add pin
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
