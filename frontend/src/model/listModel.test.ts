// Pins the list pane's grouping and order, the load-error groups (and which can be deleted), and the
// viewer's derived text.
import { expect, test } from 'vitest';
import { loadFixtures } from '../../../tests/fixtures/fakeConductor.mjs';
import { confirmParts, deleteFileConfirm, groupPlaybooks, liveText, listErrorText, loadErrorGroups, pinText, policyText } from './listModel';
import type { PlaybookList, PlaybookSummary } from './types';

const { list } = await loadFixtures();
const summary = (id: string, source: string): PlaybookSummary => ({ id, name: id, description: '', source, editable: source === 'user', entryStages: [], spawnableStages: [] });

test('groups: Built-in, User, then plugins sorted by source; entries sorted by id', () => {
  const l: PlaybookList = { ...list, playbooks: [summary('z/b', 'plugin:z'), summary('b', 'builtin'), summary('a/x', 'plugin:a'), summary('a', 'builtin'), summary('u', 'user')] };
  expect(groupPlaybooks(l).map((g) => [g.source, g.label, g.entries.map((e) => e.id)])).toEqual([
    ['builtin', 'Built-in', ['a', 'b']], ['user', 'User', ['u']], ['plugin:a', 'Plugin · a', ['a/x']], ['plugin:z', 'Plugin · z', ['z/b']],
  ]);
});

test('the User group is kept when empty', () => {
  const groups = groupPlaybooks({ ...list, playbooks: [summary('a', 'builtin')] });
  expect(groups.map((g) => [g.source, g.entries.length])).toEqual([['builtin', 1], ['user', 0]]);
});

test('load errors grouped by id and sorted; deletable only for a user file', () => {
  const l = { ...list, errors: [{ id: 'z', message: 'm1' }, { id: 'broken', message: 'm2' }, { id: 'z', message: 'm3' }] };
  expect(loadErrorGroups(l)).toEqual([
    { id: 'broken', messages: ['m2'], deletable: true },
    { id: 'z', messages: ['m1', 'm3'], deletable: false },
  ]);
});

test('listErrorText: a 404 says to restart cc; anything else is the error message (unreachable included)', () => {
  expect(listErrorText({ status: 404, message: 'x' })).toBe('cc does not serve /api/playbooks yet — restart code-conductor.');
  expect(listErrorText({ status: 502, message: 'code-conductor at x is unreachable' })).toBe('code-conductor at x is unreachable');
  expect(listErrorText({ status: 0, message: 'the code-playbook backend is unreachable: boom' })).toBe('the code-playbook backend is unreachable: boom');
});

test('liveText, policyText, pinText', () => {
  expect(liveText(null)).toBe('unknown');
  expect(liveText(0)).toBe('0');
  expect(policyText('deny')).toBe('deny');
  expect(policyText({ pin: {} })).toBe('pin');
  expect(pinText('allow')).toBe('');
  expect(pinText({ pin: { mode: 'x', n: 3, b: null } })).toBe('mode = "x", n = 3, b = null');
});

test('confirm texts split into a title and body paragraphs', () => {
  expect(confirmParts(deleteFileConfirm('broken'))).toEqual({ title: 'Delete broken.json?', paragraphs: ['cc could not load it, so there is nothing to open in the editor.'] });
  expect(confirmParts('Delete x.json?')).toEqual({ title: 'Delete x.json?', paragraphs: [] });
});
