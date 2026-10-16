// Pins the routes the query string carries and that navigation never writes a hash (a hash adds a joint
// history entry cc's bridge cannot turn into a replace).
import { afterEach, expect, test } from 'vitest';
import { navigate, navigationSeq, parseRoute } from './route';

afterEach(() => history.replaceState(null, '', '/'));

test('parseRoute: playbook wins over edit for the id; edit and draft are flags', () => {
  expect(parseRoute('')).toEqual({ draft: false, selectedId: null, edit: false });
  expect(parseRoute('?playbook=acme%2Frelease')).toEqual({ draft: false, selectedId: 'acme/release', edit: false });
  expect(parseRoute('?edit=mine')).toEqual({ draft: false, selectedId: 'mine', edit: true });
  expect(parseRoute('?playbook=a&edit=b')).toEqual({ draft: false, selectedId: 'a', edit: true });
  expect(parseRoute('?draft=1')).toEqual({ draft: true, selectedId: null, edit: false });
});

test('navigate writes ?query or the bare pathname, never a hash, and counts each navigation', () => {
  const before = navigationSeq();
  navigate({ playbook: 'acme/release' });
  expect(location.search).toBe('?playbook=acme%2Frelease');
  expect(location.hash).toBe('');
  navigate({});
  expect(location.search).toBe('');
  expect(location.href.endsWith('/')).toBe(true);
  expect(location.hash).toBe('');
  expect(navigationSeq()).toBe(before + 2);
});

// Invariant: each navigation adds exactly one history entry (embedded, cc's bridge turns each into a replace).
test('each navigate adds exactly one history entry', () => {
  const start = history.length;
  navigate({ playbook: 'relay' });
  expect(history.length).toBe(start + 1);
  navigate({ edit: 'mine' });
  expect(history.length).toBe(start + 2);
  navigate({});
  expect(history.length).toBe(start + 3);
});
