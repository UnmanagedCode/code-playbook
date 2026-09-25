import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures } from './fixtures/fakeConductor.mjs';
import { layoutGraph } from '../public/graphLayout.js';

const { details } = await loadFixtures();

// Points along an SVG path made of M, L, Q and C commands, sampled per segment.
function samplePath(d) {
  const tokens = d.match(/[MLQC]|-?[\d.]+/g);
  const pts = [];
  let cur = null;
  let i = 0;
  const num = () => Number(tokens[i++]);
  const lerp = (a, b, t) => a + (b - a) * t;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    const n = { M: 1, L: 1, Q: 2, C: 3 }[cmd];
    const ctrl = Array.from({ length: n }, () => [num(), num()]);
    if (cmd === 'M') { cur = ctrl[0]; pts.push(cur); continue; }
    const seg = [cur, ...ctrl];
    for (let k = 1; k <= 50; k++) {
      let q = seg;
      while (q.length > 1) q = q.slice(1).map((p, j) => [lerp(q[j][0], p[0], k / 50), lerp(q[j][1], p[1], k / 50)]);
      pts.push(q[0]);
    }
    cur = seg.at(-1);
  }
  return pts;
}
const inside = ([x, y], n) => x > n.x + 1 && x < n.x + n.w - 1 && y > n.y + 1 && y < n.y + n.h - 1;

const near = ([x, y], [px, py]) => Math.hypot(x - px, y - py) <= PORT_SLACK;
const PORT_SLACK = 3;

// Every box is checked, the edge's own endpoints included: an edge drawn
// through its own target is a crossing too. Only the samples at the path's
// start and end ports, which sit on a box border by construction, are exempt.
function assertNoEdgeCrossesANode(g) {
  for (const e of g.edges) {
    const pts = samplePath(e.path);
    const ends = [pts[0], pts.at(-1)];
    const body = pts.filter((p) => !ends.some((q) => near(p, q)));
    for (const n of g.nodes) {
      const hit = body.find((p) => inside(p, n));
      assert.equal(hit, undefined, `${e.kind} ${e.from}->${e.to} passes through ${n.id} at ${hit}`);
    }
  }
}

// Every label is finite, inside the canvas, and clear of the lines its
// placement rule guarantees (guaranteedClear); no label hides an arrow.
function assertNoLabelCrossed(g) {
  for (const e of g.edges.filter((x) => x.label)) {
    assert.ok(e.labelBox, `${e.from}->${e.to} has a label box`);
    for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(e.labelBox[k]), `${e.from}->${e.to} labelBox.${k} is finite (${e.labelBox[k]})`);
    for (const k of ['labelX', 'labelY']) assert.ok(Number.isFinite(e[k]), `${e.from}->${e.to} ${k} is finite (${e[k]})`);
    const b = e.labelBox;
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= g.width && b.y + b.h <= g.height, `${e.from}->${e.to} label inside the canvas`);
  }
  for (const e of g.edges.filter((x) => x.labelBox)) {
    for (const other of guaranteedClear(g, e)) {
      const hit = samplePath(other.path).find((p) => inside(p, e.labelBox));
      assert.equal(hit, undefined, `${other.from}->${other.to} crosses the label of ${e.from}->${e.to} at ${hit}`);
    }
  }
  assertNoBackingOnAnArrow(g);
}

const routed = (e) => / L /.test(e.path);

// The lines the placement rule keeps clear of a label: every curve joining the
// label's own pair, plus, for a self-loop or routed label, every routed lane
// (lanes start right of self-loop labels and of each earlier routed label, and
// horizontal runs never reach a row centre). Any other line may pass behind a
// label; its opaque backing keeps the text readable there.
function guaranteedClear(g, e) {
  const own = g.edges.filter((x) => x.from === e.from && x.to === e.to);
  const lanes = e.self || routed(e) ? g.edges.filter(routed) : [];
  return [...new Set([...own, ...lanes])];
}

// graph.js pads the backing 2px each side of labelBox.
const backing = (b) => ({ x: b.x - 2, y: b.y, w: b.w + 4, h: b.h });
const ARROW_LEN = 12; // marker-end: 7 marker units × the 1.6 stroke width, rounded up

// No backing hides where a line starts, or its arrowhead (the last ARROW_LEN
// px before its end), whatever edge the line belongs to.
function assertNoBackingOnAnArrow(g) {
  for (const e of g.edges.filter((x) => x.labelBox)) {
    const box = backing(e.labelBox);
    for (const other of g.edges) {
      const pts = samplePath(other.path);
      const end = pts.at(-1);
      const tip = [pts[0], ...pts.filter((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) <= ARROW_LEN)];
      const hit = tip.find((p) => inside(p, box));
      assert.equal(hit, undefined, `the label of ${e.from}->${e.to} covers an end or arrowhead of ${other.from}->${other.to} at ${hit}`);
    }
  }
}

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('the graph shows the whole definition, for every fixture', async (t) => {
  for (const d of Object.values(details)) {
    await t.test(d.id, () => {
      const g = layoutGraph(d);
      assert.deepEqual(g.nodes.map((n) => n.id), Object.keys(d.stages), 'one node per stage, in declaration order');
      for (let i = 0; i < g.nodes.length; i++) {
        for (let j = i + 1; j < g.nodes.length; j++) {
          assert.ok(!overlap(g.nodes[i], g.nodes[j]), `${g.nodes[i].id} overlaps ${g.nodes[j].id}`);
        }
        const n = g.nodes[i];
        assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= g.width && n.y + n.h <= g.height, `${n.id} inside the canvas`);
      }

      const transitions = g.edges.filter((e) => e.kind === 'transition');
      assert.deepEqual(transitions.map((e) => [e.from, e.to, e.label]), d.transitions.map((t) => [t.from, t.to, t.via]), 'one edge per transition, labelled via');
      for (const e of transitions) assert.equal(e.self, e.from === e.to, `${e.from}->${e.to} self flag`);

      const needs = g.edges.filter((e) => e.kind === 'needs');
      const expected = Object.entries(d.stages).flatMap(([name, s]) => s.needs.map((n) => [n.stage, name]));
      assert.deepEqual(needs.map((e) => [e.from, e.to]), expected, 'one dashed edge per needs entry, anchor → stage');
      for (const e of needs) assert.equal(e.label, undefined, 'needs edges are unlabelled');

      for (const s of d.entryStages) assert.equal(g.nodes.find((n) => n.id === s).layer, 0, `entry ${s} in layer 0`);
      for (const e of g.edges) assert.match(e.path, /^M [\d.-]+ [\d.-]+ [LQC] /, `${e.kind} ${e.from}->${e.to} has a path`);
      assertNoEdgeCrossesANode(g);
      assertNoLabelCrossed(g);
    });
  }
});

test('layers follow the longest path from the entry stages, and cycles terminate', () => {
  const g = layoutGraph(details.forge);
  const layer = Object.fromEntries(g.nodes.map((n) => [n.id, n.layer]));
  assert.deepEqual(layer, { plan: 0, 'plan-rival': 1, 'plan-verify': 2, implement: 3, review: 4 });

  const cyclic = {
    entryStages: ['a'],
    stages: { a: { needs: [] }, b: { needs: [] }, c: { needs: [] } },
    transitions: [{ from: 'a', to: 'b', via: 'send_prompt' }, { from: 'b', to: 'c', via: 'send_prompt' }, { from: 'c', to: 'a', via: 'send_prompt' }],
  };
  const cg = layoutGraph(cyclic);
  assert.deepEqual(cg.nodes.map((n) => n.layer), [0, 1, 2]);
  assert.equal(cg.edges.find((e) => e.from === 'c').back, true, 'the closing edge is drawn as a back edge');
});

test('no edge is drawn through a box it does not connect: same-layer, layer-skipping and back edges', () => {
  const stage = (needs = []) => ({ needs });
  const g = layoutGraph({
    entryStages: ['a', 'b', 'c'],
    stages: { a: stage(), b: stage(), c: stage([{ stage: 'a' }]), d: stage(), e: stage(), f: stage() },
    transitions: [
      { from: 'c', to: 'a', via: 'send_prompt' }, // same layer, across b
      { from: 'a', to: 'd', via: 'send_prompt' },
      { from: 'd', to: 'e', via: 'send_prompt' },
      { from: 'a', to: 'e', via: 'approve_plan' }, // skips d's layer
      { from: 'e', to: 'b', via: 'reject_plan' }, // back up across layers
      { from: 'b', to: 'f', via: 'send_prompt' },
    ],
  });
  const layer = Object.fromEntries(g.nodes.map((n) => [n.id, n.layer]));
  assert.deepEqual(layer, { a: 0, b: 0, c: 0, d: 1, e: 2, f: 1 });
  assertNoEdgeCrossesANode(g);
  for (const e of g.edges.filter((x) => layer[x.from] === layer[x.to] && !x.self)) {
    const row = g.nodes.find((n) => n.id === e.from);
    const clear = Math.max(...samplePath(e.path).map(([, y]) => Math.max(y - (row.y + row.h), row.y - y)));
    assert.ok(clear > row.h / 2, `${e.from}->${e.to} clears its row band by ${clear}px, more than NODE_H/2`);
  }
});

test('the endpoint check sees an edge drawn through its own target', () => {
  const g = layoutGraph({ entryStages: ['a'], stages: { a: { needs: [] }, b: { needs: [] } }, transitions: [{ from: 'a', to: 'b', via: 'send_prompt' }] });
  const b = g.nodes.find((n) => n.id === 'b');
  const e = g.edges[0];
  e.path = `${e.path} L ${b.x + b.w / 2} ${b.y + b.h / 2}`; // run on into b's middle
  assert.throws(() => assertNoEdgeCrossesANode(g), /passes through b/);
});

test('routed lanes are spaced so no lane crosses an earlier routed edge\'s label', () => {
  const s = { needs: [] };
  const g = layoutGraph({
    entryStages: ['a'],
    stages: { a: s, b: s, c: s, d: s },
    transitions: [
      { from: 'a', to: 'b', via: 'send_prompt' },
      { from: 'b', to: 'c', via: 'send_prompt' },
      { from: 'c', to: 'd', via: 'send_prompt' },
      { from: 'a', to: 'c', via: 'approve_plan' },
      { from: 'a', to: 'd', via: 'get_recent_messages' },
      { from: 'b', to: 'd', via: 'reject_plan' },
      { from: 'd', to: 'd', via: 'set_idle_timeout' },
    ],
  });
  assert.equal(g.edges.filter((e) => e.path.includes(' L ')).length, 3, 'three routed edges');
  assertNoEdgeCrossesANode(g);
  assertNoLabelCrossed(g);
  for (const e of g.edges.filter((x) => x.labelBox)) {
    assert.ok(e.labelBox.x + e.labelBox.w <= g.width, `${e.from}->${e.to} label inside the canvas`);
  }
});

test('a routed edge whose runs sit in adjacent gaps still gets a finite label inside the canvas', () => {
  // DFS from a reaches c (needs), then b via c→b, so b→c closes the cycle and is
  // drawn as a routed back edge whose two runs share the gap between rows 0 and 1.
  const g = layoutGraph({
    entryStages: ['a', 'b'],
    stages: { a: { needs: [] }, b: { needs: [] }, c: { needs: [{ stage: 'a' }] } },
    transitions: [{ from: 'b', to: 'c', via: 'send_prompt' }, { from: 'c', to: 'b', via: 'approve_plan' }],
  });
  assert.ok(g.edges.some((e) => e.back && e.path.includes(' L ')), 'a routed back edge');
  assertNoEdgeCrossesANode(g);
  assertNoLabelCrossed(g);
});

test('a transition and needs between the same pair: the transition label is clear of both curves', () => {
  const g = layoutGraph({
    entryStages: ['a'],
    stages: { a: { needs: [] }, b: { needs: [{ stage: 'a' }, { stage: 'a', position: ['*'] }] } },
    transitions: [{ from: 'a', to: 'b', via: 'approve_plan' }],
  });
  assert.equal(g.edges.filter((e) => e.from === 'a' && e.to === 'b').length, 3);
  assertNoEdgeCrossesANode(g);
  assertNoLabelCrossed(g);
});

test('a label may sit over another pair\'s line: the scoped check holds, and no arrowhead is covered', async (t) => {
  const s = (needs = []) => ({ needs });
  const shapes = {
    'another pair\'s curve crosses a forward label': {
      entryStages: ['a', 'b'],
      stages: { a: s(), b: s(), c: s([{ stage: 'b' }]) },
      transitions: [{ from: 'a', to: 'c', via: 'get_recent_messages' }],
    },
    'a back-edge lane crosses a forward label': {
      entryStages: ['s0'],
      stages: { s0: s(), s1: s() },
      // A forward label long enough to reach the lane the back edge s1→s0 takes.
      transitions: [{ from: 's0', to: 's1', via: 'get_recent_messages' }, { from: 's1', to: 's0', via: 'reject_plan' }],
    },
  };
  for (const [name, detail] of Object.entries(shapes)) {
    await t.test(name, () => {
      const g = layoutGraph(detail);
      assertNoEdgeCrossesANode(g);
      assertNoLabelCrossed(g);
    });
  }
});
