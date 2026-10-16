// Pins the wire format to this plugin's backend (byte-identical to the pre-port UI's) and how failures
// become ApiError.
import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, playbooksApi } from './api';
import type { Definition } from '@/model/types';

const def: Definition = { id: 'mine-2', name: 'n', description: 'd', entryStages: [], stages: {}, transitions: [] };
type Init = RequestInit & { headers: Record<string, string> };
function stub(res: () => Response | Promise<Response>) {
  const fn = vi.fn(async (_url: string, _init: Init) => res());
  vi.stubGlobal('fetch', fn);
  return fn;
}
const ok = (body: unknown = { ok: true }) => () => new Response(JSON.stringify(body), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

test('URLs: relative, a plugin id segment-encoded on reads, the whole id encoded on writes, from only when it differs', async () => {
  const fn = stub(ok());
  await playbooksApi.list();
  await playbooksApi.detail('acme/release');
  await playbooksApi.detail('a b');
  await playbooksApi.validate(def);
  await playbooksApi.save('mine-2', def, 'mine');
  await playbooksApi.save('mine-2', def, 'mine-2');
  await playbooksApi.save('mine-2', def);
  await playbooksApi.remove('mine');
  expect(fn.mock.calls.map(([u, i]) => `${i.method} ${u}`)).toEqual([
    'GET api/playbooks', 'GET api/playbooks/acme/release', 'GET api/playbooks/a%20b', 'POST api/playbooks/validate',
    'PUT api/playbooks/mine-2?from=mine', 'PUT api/playbooks/mine-2', 'PUT api/playbooks/mine-2', 'DELETE api/playbooks/mine',
  ]);
});

test('the JSON content-type only with a body, and the body is JSON.stringify(definition)', async () => {
  const fn = stub(ok());
  await playbooksApi.list();
  await playbooksApi.save('mine-2', def);
  expect(fn.mock.calls[0][1].headers).toEqual({});
  expect(fn.mock.calls[0][1].body).toBeUndefined();
  expect(fn.mock.calls[1][1].headers).toEqual({ 'content-type': 'application/json' });
  expect(fn.mock.calls[1][1].body).toBe(JSON.stringify(def));
});

test('errors: a JSON body gives message, code and the parsed body; text gives its text; nothing gives HTTP n', async () => {
  stub(() => new Response(JSON.stringify({ error: 'refused', code: 'PLAYBOOK_INVALID', errors: [{ message: 'x' }] }), { status: 422 }));
  const e = await playbooksApi.save('x', def).catch((x) => x);
  expect(e).toBeInstanceOf(ApiError);
  expect([e.status, e.message, e.code, e.body]).toEqual([422, 'refused', 'PLAYBOOK_INVALID', { error: 'refused', code: 'PLAYBOOK_INVALID', errors: [{ message: 'x' }] }]);
  stub(() => new Response('Bad Gateway', { status: 502 }));
  expect(await playbooksApi.list().catch((x) => [x.status, x.message, x.body])).toEqual([502, 'Bad Gateway', undefined]);
  stub(() => new Response('', { status: 500 }));
  expect(await playbooksApi.list().catch((x) => x.message)).toBe('HTTP 500');
  stub(() => new Response('{}', { status: 500 }));
  expect(await playbooksApi.list().catch((x) => x.message)).toBe('HTTP 500');
});

test('a network failure is status 0 with the unreachable message', async () => {
  stub(() => { throw new TypeError('Failed to fetch'); });
  const e = await playbooksApi.list().catch((x) => x);
  expect([e.status, e.message]).toEqual([0, 'the code-playbook backend is unreachable: Failed to fetch']);
});
