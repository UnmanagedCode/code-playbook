import type { Transition } from '@/model/types';

export function TransitionsTable({ transitions }: { transitions: Transition[] }) {
  if (transitions.length === 0) return <p className="text-sm text-muted-foreground">none</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-1.5 pr-4 font-medium">from → to</th>
            <th className="py-1.5 pr-4 font-medium">via</th>
            <th className="py-1.5 font-medium">description</th>
          </tr>
        </thead>
        <tbody>
          {transitions.map((t, i) => (
            <tr key={i} className="border-b last:border-0 align-top">
              <td className="py-1.5 pr-4 font-mono whitespace-nowrap">{`${t.from} → ${t.to}`}</td>
              <td className="py-1.5 pr-4 font-mono">{t.via}</td>
              <td className="py-1.5">{t.description ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
