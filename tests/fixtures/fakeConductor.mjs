// A stand-in for code-conductor's /api/playbooks* surface, serving the
// contract-shaped JSON in cc-api/. Shared by the tests and the harness.
//
// startFakeConductor({ validate, handle }) → { url, calls, down, close }
//   validate(draft)          → the validate response body (default: cannedValidate)
//   handle(method, path, body) → { status, body } to preempt a route, or undefined
//   calls                    every request seen: { method, path, body }
//   down()                   stop listening; the url then refuses connections
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cc-api');

// Detail fixtures are named by id, with a plugin id's `/` written as `__`.
export async function loadFixtures() {
  const list = JSON.parse(await fs.readFile(path.join(API_DIR, 'playbooks.json'), 'utf8'));
  const details = {};
  for (const name of await fs.readdir(API_DIR)) {
    if (name === 'playbooks.json' || !name.endsWith('.json')) continue;
    const d = JSON.parse(await fs.readFile(path.join(API_DIR, name), 'utf8'));
    details[d.id] = d;
  }
  return { list, details };
}

// The canned validator: a stage named `bad` is refused and located to that
// stage; everything else passes. The fake never judges a definition itself.
export function cannedValidate(draft) {
  if (draft && typeof draft.stages === 'object' && draft.stages && 'bad' in draft.stages) {
    return { ok: false, errors: [{ message: "stage 'bad': refused by the fake conductor", stage: 'bad', transition: null }] };
  }
  return { ok: true };
}

export async function startFakeConductor({ validate = cannedValidate, handle } = {}) {
  const { list, details } = await loadFixtures();
  const calls = [];

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body;
    try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
    const url = new URL(req.url, 'http://fake');
    calls.push({ method: req.method, path: url.pathname, body });

    const send = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    const pre = handle?.(req.method, url.pathname, body);
    if (pre) return send(pre.status, pre.body);

    if (req.method === 'GET' && url.pathname === '/api/playbooks') return send(200, list);
    if (req.method === 'POST' && url.pathname === '/api/playbooks/validate') return send(200, validate(body));
    const m = /^\/api\/playbooks\/(.+)$/.exec(url.pathname);
    if (req.method === 'GET' && m) {
      const id = decodeURIComponent(m[1]);
      if (details[id]) return send(200, details[id]);
      return send(404, { error: `no playbook '${id}'`, code: 'PLAYBOOK_UNKNOWN' });
    }
    send(404, { error: `fake conductor has no route ${req.method} ${url.pathname}` });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  let open = true;
  const stop = () => {
    if (!open) return Promise.resolve();
    open = false;
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  };
  return { url, calls, down: stop, close: stop };
}
