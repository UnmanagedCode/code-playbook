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

function assertNoEdgeCrossesANode(g) {
  for (const e of g.edges) {
    const pts = samplePath(e.path);
    for (const n of g.nodes) {
      if (n.id === e.from || n.id === e.to) continue;
      const hit = pts.find((p) => inside(p, n));
      assert.equal(hit, undefined, `${e.kind} ${e.from}->${e.to} passes through ${n.id} at ${hit}`);
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
