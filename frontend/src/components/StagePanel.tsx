import { Badge } from '@/components/ui/badge';
import { WILDCARD } from '@/model/formModel';
import { pinText, policyText } from '@/model/listModel';
import type { Policy, Stage } from '@/model/types';

const POLICY_VARIANT = { allow: 'success', deny: 'destructive', pin: 'warning' } as const;

/** One stage of a playbook detail. `headingRef` lets the graph scroll here and focus the heading. */
export function StagePanel({ name, stage, entry, headingRef }: { name: string; stage: Stage; entry: boolean; headingRef: (el: HTMLHeadingElement | null) => void }) {
  const tools = Object.entries(stage.tools);
  return (
    <section className="flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-xs" data-stage={name}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 ref={headingRef} tabIndex={-1} className="font-mono text-base font-semibold outline-none focus-visible:underline">{name}</h3>
        {entry && <Badge variant="success">entry</Badge>}
        {stage.spawnable && <Badge variant="info">spawnable</Badge>}
        <Badge variant="outline">{`workers: ${stage.workers}`}</Badge>
      </div>
      {stage.description && <p className="text-sm whitespace-pre-wrap">{stage.description}</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">needs</span>
        {stage.needs.length === 0 ? (
          <span className="text-muted-foreground">none</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {stage.needs.map((n, i) => (
              <li key={i}>
                <code className="font-mono">{n.stage}</code>{' · position '}<code className="font-mono">{n.position.join(', ')}</code>{` · ${n.liveness}`}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 pr-4 font-medium">tool</th>
              <th className="py-1.5 pr-4 font-medium">policy</th>
              <th className="py-1.5 font-medium">pinned</th>
            </tr>
          </thead>
          <tbody>
            {tools.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-1.5 text-muted-foreground">no tools declared: every tool allowed, spawn_instance denied</td>
              </tr>
            ) : (
              tools.map(([tool, p]) => <ToolLine key={tool} tool={tool} policy={p} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ToolLine({ tool, policy }: { tool: string; policy: Policy }) {
  const text = policyText(policy);
  return (
    <tr className="border-b last:border-0 align-top" data-tool={tool}>
      <td className="py-1.5 pr-4 font-mono whitespace-nowrap">
        {tool === WILDCARD ? <><code>*</code><span className="font-sans text-muted-foreground"> fallback</span></> : tool}
      </td>
      <td className="py-1.5 pr-4" data-policy={text}>
        <Badge variant={POLICY_VARIANT[text as keyof typeof POLICY_VARIANT] ?? 'outline'}>{text}</Badge>
      </td>
      <td className="py-1.5 font-mono break-all">{pinText(policy)}</td>
    </tr>
  );
}
