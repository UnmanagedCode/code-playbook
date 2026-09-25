// A stand-in for code-conductor's /api/playbooks* surface, serving the
// contract-shaped JSON in cc-api/. Shared by the tests and the harness.
//
// startFakeConductor({ validate, handle }) → { url, calls, down, close }
//   validate(draft)          → the validate response body (default: cannedValidate)
//   handle(method, path, body) → { status, body } to preempt a route, or undefined
//   calls                    every request seen: { method, path, body, contentType }
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

// The canned validator. It mirrors one real cc rule, with cc's message text:
// name and description are required non-empty strings (so a blank draft is not
// shown as valid). Otherwise it refuses only a stage named `bad`, located to
// that stage.
export function cannedValidate(draft) {
  const errors = [];
  for (const field of ['name', 'description']) {
    if (typeof draft?.[field] !== 'string' || !draft[field].trim()) {
      errors.push({ message: `${field} is required and must be a non-empty string`, stage: null, transition: null });
    }
  }
  if (draft && typeof draft.stages === 'object' && draft.stages && 'bad' in draft.stages) {
    errors.push({ message: "stage 'bad': refused by the fake conductor", stage: 'bad', transition: null });
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

// cc's own gate on validate, with its message text.
const BODY_NOT_JSON = { error: 'the draft must be sent as Content-Type: application/json', code: 'BODY_NOT_JSON' };

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
    const contentType = req.headers['content-type'];
    calls.push({ method: req.method, path: url.pathname, body, contentType });

    const send = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    const pre = handle?.(req.method, url.pathname, body);
    if (pre) return send(pre.status, pre.body);

    if (req.method === 'GET' && url.pathname === '/api/playbooks') return send(200, list);
    if (req.method === 'POST' && url.pathname === '/api/playbooks/validate') {
      if (!/^application\/json\b/.test(contentType || '')) return send(400, BODY_NOT_JSON);
      return send(200, validate(body));
    }
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
