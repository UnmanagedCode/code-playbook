import { svg } from './dom.js';
import { layoutGraph } from './graphLayout.js';

// SVG of a playbook's stage graph. Solid arrows are transitions, labelled with
// the tool that drives them; dashed arrows are `needs` (anchor → stage).
export function renderGraph(detail, { onNode } = {}) {
  const g = layoutGraph(detail);
  const marker = (id, cls) => svg('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
    svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: cls }));
  return svg('svg', { class: 'graph', viewBox: `0 0 ${g.width} ${g.height}`, width: g.width, height: g.height, role: 'img', 'aria-label': `stage graph of ${detail.id}` },
    svg('defs', {}, marker('arrow-t', 'arrow-transition'), marker('arrow-n', 'arrow-needs')),
    ...g.edges.map((e) => svg('g', { class: `edge edge-${e.kind}` },
      svg('path', { d: e.path, 'marker-end': `url(#${e.kind === 'needs' ? 'arrow-n' : 'arrow-t'})` },
        svg('title', { text: e.kind === 'needs' ? `${e.to} needs ${e.from}` : `${e.from} → ${e.to} via ${e.label}` })),
      e.label && svg('text', { x: e.labelX, y: e.labelY, 'text-anchor': e.anchor, 'dominant-baseline': 'middle', text: e.label }))),
    ...g.nodes.map((n) => svg('g', { class: `node${n.entry ? ' entry' : ''}${detail.stages[n.id].spawnable ? ' spawnable' : ''}`, on: onNode && { click: () => onNode(n.id) } },
      svg('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 10 }),
      svg('text', { x: n.x + n.w / 2, y: n.y + n.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', text: n.id }))),
  );
}
