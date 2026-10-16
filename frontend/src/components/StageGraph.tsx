import { useId } from 'react';
import { layoutGraph } from '@/model/graphLayout';
import type { PlaybookDetail } from '@/model/types';

// SVG of a playbook's stage graph. Solid arrows are transitions, labelled with
// the tool that drives them; dashed arrows are `needs` (anchor → stage).
// Paint order: edges, then labels, then nodes. Every colour is a theme-token
// utility, so the browser re-resolves it when the theme flips.
export function StageGraph({ detail, onNode }: { detail: PlaybookDetail; onNode: (name: string) => void }) {
  const g = layoutGraph(detail);
  // Marker ids from useId, never from content; stripped to characters url(#…) takes unescaped.
  const uid = `g${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const markerId = (kind: string) => `${uid}-${kind === 'needs' ? 'n' : 't'}`;
  const marker = (kind: string, cls: string) => (
    <marker id={markerId(kind)} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" className={cls} />
    </marker>
  );
  const activate = (name: string) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onNode(name);
  };

  return (
    <svg
      role="group"
      aria-label={`stage graph of ${detail.id}`}
      viewBox={`0 0 ${g.width} ${g.height}`}
      width={g.width}
      height={g.height}
      className="block h-auto max-w-full"
    >
      <defs>
        {marker('transition', 'fill-foreground')}
        {marker('needs', 'fill-muted-foreground')}
      </defs>
      {g.edges.map((e, i) => (
        <g key={i} aria-hidden data-edge={e.kind}>
          <path
            d={e.path}
            markerEnd={`url(#${markerId(e.kind)})`}
            className={e.kind === 'needs' ? 'fill-none stroke-muted-foreground stroke-[1.6] [stroke-dasharray:5_4]' : 'fill-none stroke-foreground stroke-[1.6]'}
          >
            <title>{e.kind === 'needs' ? `${e.to} needs ${e.from}` : `${e.from} → ${e.to} via ${e.label}`}</title>
          </path>
        </g>
      ))}
      {/* Labels after every path, each on an opaque backing sized from its labelBox, so no line — this edge's or another's — is drawn over the text. */}
      {g.edges.map((e, i) => e.labelBox && (
        <g key={i} aria-hidden data-edge-label>
          <rect className="fill-card" x={e.labelBox.x - 2} y={e.labelBox.y} width={e.labelBox.w + 4} height={e.labelBox.h} rx={3} />
          <text x={e.labelX} y={e.labelY} textAnchor={e.anchor} dominantBaseline="middle" className="fill-warning font-mono text-[11.5px]">{e.label}</text>
        </g>
      ))}
      {g.nodes.map((n) => (
        <g
          key={n.id}
          role="button"
          tabIndex={0}
          aria-label={`Stage ${n.id}`}
          data-stage={n.id}
          className="group cursor-pointer outline-none"
          onClick={() => onNode(n.id)}
          onKeyDown={activate(n.id)}
        >
          <rect
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            rx={10}
            className={`fill-muted group-focus-visible:stroke-ring group-focus-visible:stroke-[3] ${n.entry ? 'stroke-success stroke-[2.5]' : 'stroke-border stroke-[1.5]'}`}
          />
          <text
            x={n.x + n.w / 2}
            y={n.y + n.h / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`font-mono text-[13px] ${detail.stages[n.id].spawnable ? 'fill-info' : 'fill-foreground'}`}
          >
            {n.id}
          </text>
        </g>
      ))}
    </svg>
  );
}
