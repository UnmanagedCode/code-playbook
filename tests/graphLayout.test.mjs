import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures } from './fixtures/fakeConductor.mjs';
import { layoutGraph } from '../public/graphLayout.js';

const { details } = await loadFixtures();

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
      for (const e of g.edges) assert.match(e.path, /^M [\d.-]+ [\d.-]+ [QC] /, `${e.kind} ${e.from}->${e.to} has a path`);
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
