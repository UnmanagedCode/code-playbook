// Layered top-down layout of a playbook detail. Pure: returns geometry only;
// StageGraph.tsx turns it into SVG.
//
// Edges: one per transition (labelled with its `via`) and one per `needs`
// entry, drawn anchor → stage. Cycles are broken by a DFS from the entry
// stages; the edges it finds closing a cycle are `back` and ignored for
// layering. An entry stage sits in layer 0; any other stage sits one layer
// below its deepest forward predecessor. An edge to the next layer is drawn
// straight down; a same-layer edge bows above its row; every other edge (back,
// upward, or skipping a layer) runs through the gaps between rows to a lane
// right of every box.

import type { PlaybookDetail } from './types';

export interface GraphNode { id: string; layer: number; entry: boolean; x: number; y: number; w: number; h: number }
export interface Box { x: number; y: number; w: number; h: number }
export interface GraphEdge {
  kind: string; from: string; to: string; label?: string; self: boolean; back: boolean;
  path?: string; labelX?: number; labelY?: number; anchor?: string; labelBox?: Box;
}
export interface GraphLayout { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number }
interface Curve { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number }

const NODE_H = 44;
const V_GAP = 56;
const H_GAP = 36;
const PAD = 24;
const LOOP_REACH = 44; // a self-loop's control points, right of its box
const LABEL_GAP = 4; // between a line and the label beside it
const LANE_GAP = 12; // clear space right of a routed edge's label before the next lane
const CHAR_W = 7.2; // label glyph advance: StageGraph.tsx renders labels 11.5px monospace
const LABEL_H = 14;
const SAME_ROW_BOW = 40; // a same-row edge's control-point height above the row (its curve rises 3/4 of this)
const LANE_INSET = 16; // a routed edge's horizontal runs, this far into the gap beside its row

const nodeWidth = (label: string) => Math.min(220, Math.max(110, Math.round(label.length * 7.5) + 32));
const r1 = (n: number) => Math.round(n * 10) / 10;
const labelWidth = (text: string) => Math.ceil(text.length * CHAR_W);

// A next-layer edge: bottom of `a` to top of `b`, fanned out by its index
// among the edges joining the same pair.
function forwardCurve(a: GraphNode, b: GraphNode, index: number, count: number): Curve {
  const off = (index - (count - 1) / 2) * 26;
  const x1 = a.x + a.w / 2 + off; const y1 = a.y + a.h;
  const x2 = b.x + b.w / 2 + off; const y2 = b.y;
  return { x1, y1, x2, y2, cx: (x1 + x2) / 2 + off, cy: (y1 + y2) / 2 };
}

// The largest x the quadratic reaches within half a label's height of `y`.
function rightmostNear(c: Curve, y: number) {
  let max = -Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40; const u = 1 - t;
    const px = u * u * c.x1 + 2 * u * t * c.cx + t * t * c.x2;
    const py = u * u * c.y1 + 2 * u * t * c.cy + t * t * c.y2;
    if (Math.abs(py - y) <= LABEL_H / 2 + 1) max = Math.max(max, px);
  }
  return max;
}

// The box a label occupies, from its anchor point and text-anchor.
function labelBox(e: GraphEdge): Box {
  const w = labelWidth(e.label!);
  const x = e.anchor === 'middle' ? e.labelX! - w / 2 : e.labelX!;
  return { x: r1(x), y: e.labelY! - LABEL_H / 2, w, h: LABEL_H };
}

export function layoutGraph(detail: Pick<PlaybookDetail, 'stages' | 'entryStages' | 'transitions'>): GraphLayout {
  const names = Object.keys(detail.stages);
  const edges: GraphEdge[] = [
    ...detail.transitions.map((t) => ({ kind: 'transition', from: t.from, to: t.to, label: t.via })),
    ...names.flatMap((name) => detail.stages[name].needs.map((n) => ({ kind: 'needs', from: n.stage, to: name }))),
  ].map((e) => ({ ...e, self: e.from === e.to, back: false }));

  // DFS, entry stages first, then the rest in declaration order.
  const out = new Map(names.map((n): [string, GraphEdge[]] => [n, []]));
  for (const e of edges) if (!e.self) out.get(e.from)!.push(e);
  const state = new Map();
  const visit = (n: string) => {
    state.set(n, 'open');
    for (const e of out.get(n)!) {
      const s = state.get(e.to);
      if (s === 'open') e.back = true;
      else if (!s) visit(e.to);
    }
    state.set(n, 'done');
  };
  for (const n of [...detail.entryStages, ...names]) if (!state.has(n)) visit(n);

  const entry = new Set(detail.entryStages);
  const layer = new Map();
  const layerOf = (n: string): number => {
    if (layer.has(n)) return layer.get(n);
    let l = 0;
    if (!entry.has(n)) {
      for (const e of edges) if (e.to === n && !e.self && !e.back) l = Math.max(l, layerOf(e.from) + 1);
    }
    layer.set(n, l);
    return l;
  };
  names.forEach(layerOf);

  const rows: string[][] = [];
  for (const n of names) (rows[layer.get(n)] ||= []).push(n);
  const rowWidth = (row: string[]) => row.reduce((w, n) => w + nodeWidth(n), 0) + H_GAP * (row.length - 1);
  const inner = Math.max(0, ...rows.filter(Boolean).map(rowWidth));
  // Same-layer edges bow above their row, so the top padding makes room for them.
  const sameRow = edges.some((e) => !e.self && layer.get(e.from) === layer.get(e.to));
  const top = PAD + (sameRow ? SAME_ROW_BOW : 0);
  const nodes = new Map();
  rows.forEach((row, l) => {
    if (!row) return;
    let x = PAD + (inner - rowWidth(row)) / 2;
    for (const n of row) {
      const w = nodeWidth(n);
      nodes.set(n, { id: n, layer: l, entry: entry.has(n), x: r1(x), y: top + l * (NODE_H + V_GAP), w, h: NODE_H });
      x += w + H_GAP;
    }
  });
  const right = PAD + inner;

  // Parallel forward edges between one pair fan out side by side.
  const pairs = new Map();
  for (const e of edges) {
    if (e.self || e.back || layer.get(e.to) !== layer.get(e.from) + 1) continue;
    const k = `${e.from}\0${e.to}`;
    pairs.set(k, [...(pairs.get(k) || []), e]);
  }
  // Lanes for routed edges start right of every self-loop and its label; each
  // next lane starts right of the previous routed edge's label, so no lane
  // runs through a label.
  let lane = right + LOOP_REACH + LANE_GAP;
  for (const e of edges.filter((x) => x.self && x.kind === 'transition')) {
    const n = nodes.get(e.from);
    lane = Math.max(lane, n.x + n.w + LOOP_REACH - LABEL_GAP + labelWidth(e.label!) + LANE_GAP);
  }
  // Row centres: a routed label sits at one, level with boxes, where no
  // routed edge's horizontal run (always in a gap between rows) can pass.
  const centres = rows.map((_, l) => top + l * (NODE_H + V_GAP) + NODE_H / 2);
  let edgeRight = lane;
  for (const e of edges) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if (e.self) {
      const x = a.x + a.w; const y = a.y;
      e.path = `M ${x} ${y + 12} C ${x + LOOP_REACH} ${y - 6}, ${x + LOOP_REACH} ${y + a.h + 6}, ${x} ${y + a.h - 12}`;
      Object.assign(e, { labelX: x + LOOP_REACH - LABEL_GAP, labelY: y + a.h / 2, anchor: 'start' });
    } else if (layer.get(e.to) === layer.get(e.from) + 1 && !e.back) {
      const group = pairs.get(`${e.from}\0${e.to}`);
      const c = forwardCurve(a, b, group.indexOf(e), group.length);
      e.path = `M ${r1(c.x1)} ${c.y1} Q ${r1(c.cx)} ${c.cy}, ${r1(c.x2)} ${c.y2}`;
      // Beside the pair's curves rather than on them: right of the rightmost
      // point any curve of this pair reaches within the label's height, so
      // neither this edge's line nor a parallel one strikes it through.
      const reach = Math.max(...group.map((p: GraphEdge, i: number) => rightmostNear(forwardCurve(a, b, i, group.length), c.cy)));
      Object.assign(e, { labelX: r1(reach + LABEL_GAP), labelY: c.cy, anchor: 'start' });
    } else if (layer.get(e.to) === layer.get(e.from)) {
      // Same row: top to top, bowing above the row, so the curve never enters
      // the band the row's boxes occupy. Such edges only point into an entry
      // stage (row 0), except for a back edge, so the space above is free.
      const x1 = a.x + a.w / 2; const x2 = b.x + b.w / 2; const y = a.y;
      e.path = `M ${r1(x1)} ${y} C ${r1(x1)} ${y - SAME_ROW_BOW}, ${r1(x2)} ${y - SAME_ROW_BOW}, ${r1(x2)} ${y}`;
      Object.assign(e, { labelX: r1((x1 + x2) / 2), labelY: y - 0.75 * SAME_ROW_BOW - 8, anchor: 'middle' });
    } else {
      // Back or layer-skipping: down into the gap below `from`, across to a
      // lane right of every box, along it to the gap above `to`, then in.
      // Horizontal runs stay inside the gaps between rows, so no box is crossed.
      const bx = r1(lane);
      // Ports at the right quarter of each box, apart from the centred
      // next-layer edges that share these sides.
      const x1 = r1(a.x + a.w * 0.75); const y1 = a.y + a.h; const g1 = y1 + LANE_INSET;
      const x2 = r1(b.x + b.w * 0.75); const y2 = b.y; const g2 = y2 - LANE_INSET;
      e.path = `M ${x1} ${y1} L ${x1} ${g1} L ${bx} ${g1} L ${bx} ${g2} L ${x2} ${g2} L ${x2} ${y2}`;
      // Level with a spanned row centre; when both runs share one gap (no row
      // between them), midway between the runs, clear of both.
      const spanned = centres.filter((c: number) => c > Math.min(g1, g2) && c < Math.max(g1, g2));
      const labelY = spanned.length ? spanned[Math.floor((spanned.length - 1) / 2)] : (g1 + g2) / 2;
      Object.assign(e, { labelX: bx + LABEL_GAP, labelY, anchor: 'start' });
      const labelEnd = e.kind === 'transition' ? LABEL_GAP + labelWidth(e.label!) : 0;
      edgeRight = bx + labelEnd;
      lane = edgeRight + LANE_GAP;
    }
    if (e.kind === 'needs') { delete e.labelX; delete e.labelY; delete e.anchor; } else e.labelBox = labelBox(e);
  }
  for (const e of edges) if (e.labelBox) edgeRight = Math.max(edgeRight, e.labelBox.x + e.labelBox.w);

  return {
    nodes: names.map((n): GraphNode => nodes.get(n)),
    edges,
    width: r1(edgeRight + PAD),
    height: top + PAD + rows.length * NODE_H + (rows.length - 1) * V_GAP,
  };
}
