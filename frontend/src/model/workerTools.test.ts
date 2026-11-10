// Pins the client mirror of cc's worker-tools rules: kinds, per-row advisory notes, duplicates.
import { describe, expect, test } from 'vitest';
import { WORKER_TOOLS_HINT } from './editorModel';
import { duplicatePatterns, patternKind, WORKER_TOOLS_EXEMPT, workerToolNotes } from './workerTools';
import type { WorkerToolPolicy } from './types';

const row = (pattern: string, policy: WorkerToolPolicy = 'allow') => ({ pattern, policy });
const codes = (pattern: string, policy: WorkerToolPolicy = 'allow') => workerToolNotes([row(pattern, policy)], 0).map((n) => n.code);

// Invariant: a bare * is the fallback, any other key containing * is a wildcard (anywhere, not just a prefix), the rest exact.
test('patternKind', () => {
  expect(patternKind('Read')).toBe('exact');
  expect(patternKind('mcp__x__*')).toBe('wildcard');
  expect(patternKind('a*b')).toBe('wildcard');
  expect(patternKind('*')).toBe('fallback');
  expect(patternKind('**')).toBe('wildcard');
});

describe('pattern-invalid follows cc: ^[A-Za-z0-9_*-]+$', () => {
  // Invariant: anchored, non-empty, ASCII class only.
  for (const p of ['', ' ', 'Bash(git:*)', 'a.b', 'a|b', 'é']) test(`flags ${JSON.stringify(p)}`, () => expect(codes(p)).toContain('pattern-invalid'));
  for (const p of ['Read', 'mcp__a-b__*', '*', 'a_b-C9']) test(`accepts ${JSON.stringify(p)}`, () => expect(codes(p)).not.toContain('pattern-invalid'));
});

// Invariant: only an exact-key deny of an exempt tool is flagged; allow, a covering wildcard and other case are not (no stricter than cc).
test('exempt-deny', () => {
  for (const t of WORKER_TOOLS_EXEMPT) {
    expect(codes(t, 'deny')).toContain('exempt-deny');
    expect(codes(t, 'allow')).not.toContain('exempt-deny');
  }
  expect(codes('ExitPlanMode', 'deny')).toContain('exempt-deny');
  expect(codes('ExitPlanMode', 'allow')).not.toContain('exempt-deny');
  expect(codes('AskUser*', 'deny')).not.toContain('exempt-deny');
  expect(codes('askuserquestion', 'deny')).not.toContain('exempt-deny');
});

// Invariant: each duplicated pattern is reported once in first-seen order, case-sensitively; the note sits on every copy and no other row.
test('duplicatePatterns and the duplicate note', () => {
  expect(duplicatePatterns([row('Read'), row('Read')])).toEqual(['Read']);
  expect(duplicatePatterns([row('Read'), row('read')])).toEqual([]);
  expect(duplicatePatterns([row('B'), row('A'), row('B'), row('A'), row('B')])).toEqual(['B', 'A']);
  expect(duplicatePatterns([row('A'), row('B'), row('B'), row('A')])).toEqual(['A', 'B']);
  // Invariant: first-seen order holds for array-index keys, which a plain object would reorder numerically.
  expect(duplicatePatterns([row('2'), row('1'), row('2'), row('1')])).toEqual(['2', '1']);
  // Invariant: keys that collide with Object.prototype members are detected as ordinary patterns.
  expect(duplicatePatterns([row('__proto__'), row('Read'), row('__proto__'), row('constructor'), row('constructor')])).toEqual(['__proto__', 'constructor']);
  expect(duplicatePatterns([row(''), row('')])).toEqual(['']);
  const rows = [row('Read'), row('Bash'), row('Read')];
  expect([0, 1, 2].map((i) => workerToolNotes(rows, i).some((n) => n.code === 'duplicate'))).toEqual([true, false, true]);
});

// Invariant: the exempt list is exactly cc's two tools, and the hint names both (the tests above must not shrink with the list).
test('WORKER_TOOLS_EXEMPT is literally AskUserQuestion and ExitPlanMode, and the hint names both', () => {
  expect(WORKER_TOOLS_EXEMPT).toEqual(['AskUserQuestion', 'ExitPlanMode']);
  expect(WORKER_TOOLS_HINT).toContain('AskUserQuestion');
  expect(WORKER_TOOLS_HINT).toContain('ExitPlanMode');
});

// Invariant: workerToolNotes honours the duplicate set it is handed (not one recomputed from the rows): a pattern in the set gets the note, one outside it does not.
test('workerToolNotes uses an explicitly passed duplicate set', () => {
  const rows = [row('Read'), row('Bash')];
  expect(workerToolNotes(rows, 0, new Set(['Read'])).map((n) => n.code)).toEqual(['duplicate']);
  expect(workerToolNotes(rows, 1, new Set(['Read'])).map((n) => n.code)).toEqual([]);
  expect(workerToolNotes(rows, 0, new Set()).map((n) => n.code)).toEqual([]);
});
