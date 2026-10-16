// Pins how the backend serves the built UI (src/static.js) and the headers
// every response carries (src/securityHeaders.js), against a fixture dist so
// it holds whether or not `npm install` has built the real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createServer } from '../server.js';
import { CSP } from '../src/securityHeaders.js';
import { checkBuilt } from '../src/static.js';
import { startFakeConductor } from './fixtures/fakeConductor.mjs';
import { rawRequest, sampleDefinition } from './helpers.mjs';
import { FRONTEND, headTags } from './_frontendFiles.mjs';

const JS = './assets/index-Ab_9-x.js';
const CSS = './assets/index-Cd1.css';
const INDEX = `<!doctype html><html><head><script src="/pluginBridge.js"></script><link rel="stylesheet" href="/pluginTheme.css"><script src="theme-init.js"></script><script type="module" src="${JS}"></script><link rel="stylesheet" href="${CSS}"></head><body><div id="root"></div></body></html>`;
// Files that sit in the dist but must never be served: names ASSET_RE refuses.
const DECOYS = ['a.b.js', 'x/y.js', 'assets/sub/z.css', '.hidden.js', '_under.js', 'assets/-dash.js', 'assets/index-Ab_9-x.js.map'];

async function fixtureDist(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-playbook-dist-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const files = {
    'index.html': INDEX,
    'theme-init.js': '/* theme */',
    'assets/index-Ab_9-x.js': 'console.log(1);',
    'assets/index-Cd1.css': 'body{}',
    'assets/neighbour.js': 'console.log(2);',
    ...Object.fromEntries(DECOYS.map((d) => [d, 'decoy'])),
  };
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), text);
  }
  return dir;
}

async function boot(t, { distDir, conductorUrl, projectsRoot } = {}) {
  const fake = await startFakeConductor();
  const root = projectsRoot ?? await fs.mkdtemp(path.join(os.tmpdir(), 'code-playbook-'));
  const server = createServer({ conductorUrl: conductorUrl === undefined ? fake.url : (conductorUrl ?? undefined), projectsRoot: root, distDir });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    server.close();
    await fake.close();
    if (!projectsRoot) await fs.rm(root, { recursive: true, force: true });
  });
  return { fake, port: server.address().port };
}

const assertHeaders = (r, label) => {
  assert.equal(r.headers['content-security-policy'], CSP, `${label}: CSP`);
  assert.equal(r.headers['x-content-type-options'], 'nosniff', `${label}: nosniff`);
};

// Invariant: `/`, `/index.html`, theme-init.js and assets are served with their type and no-store; the query
// string never changes what `/` serves.
test('serves index.html and allowlisted assets', async (t) => {
  const { port } = await boot(t, { distDir: await fixtureDist(t) });
  for (const [p, type, body] of [
    ['/', 'text/html', INDEX], ['/index.html', 'text/html', INDEX], ['/?playbook=relay', 'text/html', INDEX],
    ['/theme-init.js', 'javascript', '/* theme */'], [JS.slice(1), 'javascript', 'console.log(1);'],
    [CSS.slice(1), 'text/css', 'body{}'], ['/assets/neighbour.js', 'javascript', 'console.log(2);'],
  ]) {
    const r = await rawRequest(port, 'GET', p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers['content-type'], new RegExp(type), p);
    assert.match(r.headers['cache-control'], /no-store/, p);
    assert.equal(r.text, body, p);
  }
  const head = await rawRequest(port, 'HEAD', '/');
  assert.equal(head.status, 200);
});

// Invariant: nothing outside the allowlist is served — traversal, sources, maps, nested dirs, node_modules.
test('traversal, sources and maps answer 404 JSON', async (t) => {
  const { port } = await boot(t, { distDir: await fixtureDist(t) });
  for (const p of ['/../server.js', '/%2e%2e/server.js', '/server.js', '/package.json', '/src/routes.js', '/frontend/src/main.tsx',
    '/assets/index-Ab_9-x.js.map', '/assets/sub/x.js', '/node_modules/express/index.js']) {
    const r = await rawRequest(port, 'GET', p);
    assert.equal(r.status, 404, p);
    assert.deepEqual(r.json, { error: 'not found', code: 'NOT_FOUND' }, p);
  }
});

// Invariant: a file present in the dist is still refused when its name falls outside ASSET_RE.
test('decoys present in the dist answer 404', async (t) => {
  const { port } = await boot(t, { distDir: await fixtureDist(t) });
  for (const d of DECOYS) {
    const r = await rawRequest(port, 'GET', `/${d}`);
    assert.equal(r.status, 404, d);
    assert.notEqual(r.text, 'decoy', d);
  }
});

// Invariant: no SPA fallback — the host URLs and unknown paths are a real 404, as JSON, never index.html.
test('host URLs and unknown paths answer 404 JSON, not HTML', async (t) => {
  const { port } = await boot(t, { distDir: await fixtureDist(t) });
  for (const p of ['/pluginBridge.js', '/pluginTheme.css', '/pluginTheme/fonts/x.woff2', '/nope', '/api/nope']) {
    const r = await rawRequest(port, 'GET', p);
    assert.equal(r.status, 404, p);
    assert.match(r.headers['content-type'], /application\/json/, p);
    assert.deepEqual(r.json, { error: 'not found', code: 'NOT_FOUND' }, p);
  }
});

// Invariant: unbuilt, the backend still serves its API; only `/` and `/index.html` answer the plain-text 503.
test('unbuilt dist: / is a plain-text 503, assets 404, the API is up', async (t) => {
  const { port } = await boot(t, { distDir: path.join(os.tmpdir(), 'code-playbook-no-such-dist') });
  for (const p of ['/', '/index.html']) {
    const r = await rawRequest(port, 'GET', p);
    assert.equal(r.status, 503, p);
    assert.equal(r.headers['content-type'], 'text/plain; charset=utf-8', p);
    assert.equal(r.text, 'UI not built — run npm install', p);
    assertHeaders(r, p);
  }
  for (const p of ['/theme-init.js', JS.slice(1), '/pluginBridge.js', '/pluginTheme.css']) {
    const r = await rawRequest(port, 'GET', p);
    assert.equal(r.status, 404, p);
    assert.equal(r.json.code, 'NOT_FOUND', p);
  }
  const h = await rawRequest(port, 'GET', '/api/health');
  assert.equal(h.status, 200);
  assert.deepEqual(h.json, { ok: true });
});

// Invariant: the startup check names the missing entry file and reports unbuilt; a built dist logs nothing.
test('checkBuilt logs the missing index.html and returns false', async (t) => {
  const lines = [];
  const missing = path.join(os.tmpdir(), 'code-playbook-no-such-dist');
  assert.equal(checkBuilt(missing, (l) => lines.push(l)), false);
  assert.deepEqual(lines, [`UI not built: ${path.join(missing, 'index.html')} is missing — run npm install`]);
  assert.equal(checkBuilt(await fixtureDist(t), (l) => lines.push(l)), true);
  assert.equal(lines.length, 1);
});

// Invariant: the CSP and nosniff ride every response, whatever its status or which layer produced it.
test('every response carries the CSP and nosniff', async (t) => {
  const dist = await fixtureDist(t);
  const { port, fake } = await boot(t, { distDir: dist });
  const bad = sampleDefinition('x');
  bad.stages.bad = { needs: [], workers: 'one', tools: {} };
  const cases = [
    [200, 'GET', '/'], [200, 'GET', JS.slice(1)], [404, 'GET', '/nope'], [200, 'GET', '/api/health'],
    [400, 'PUT', '/api/playbooks/x', '{not json', 'BODY_INVALID'],
    [400, 'GET', '/api/playbooks/%c0%ae', undefined, 'PATH_INVALID'],
    [422, 'PUT', '/api/playbooks/x', JSON.stringify(bad), 'PLAYBOOK_INVALID'],
  ];
  for (const [status, method, p, body, code] of cases) {
    const r = await sendRaw(port, method, p, body);
    assert.equal(r.status, status, `${method} ${p}: ${r.text}`);
    if (code) assert.equal(JSON.parse(r.text).code, code);
    assertHeaders(r, `${method} ${p}`);
  }

  const unbuilt = await boot(t, { distDir: path.join(dist, 'missing') });
  const r503 = await rawRequest(unbuilt.port, 'GET', '/');
  assert.equal(r503.status, 503);
  assertHeaders(r503, '503 unbuilt');

  const unset = await boot(t, { distDir: dist, conductorUrl: null });
  const r503b = await rawRequest(unset.port, 'GET', '/api/playbooks');
  assert.equal(r503b.json.code, 'CONDUCTOR_URL_UNSET');
  assertHeaders(r503b, '503 CONDUCTOR_URL_UNSET');

  await fake.down();
  const r502 = await rawRequest(port, 'GET', '/api/playbooks');
  assert.equal(r502.status, 502);
  assert.equal(r502.json.code, 'CONDUCTOR_UNREACHABLE');
  assertHeaders(r502, '502');

  // projectsRoot is a regular file, so the overlay mkdir fails after cc accepted the draft: the error
  // handler's generic 500.
  const file = path.join(dist, 'index.html');
  const broken = await boot(t, { distDir: dist, projectsRoot: file });
  const r500 = await rawRequest(broken.port, 'PUT', '/api/playbooks/x', sampleDefinition('x'));
  assert.equal(r500.status, 500, r500.text);
  assert.equal(r500.json.code, 'INTERNAL');
  assertHeaders(r500, '500');
});

// Invariant: the source page loads the bridge first as a blocking classic script, then the host theme, then
// theme-init.js; every other ref is relative (so it resolves under /plugins/code-playbook/ and at / alike).
test('frontend/index.html: host URLs first, in order, everything else relative', async () => {
  const html = await fs.readFile(path.join(FRONTEND, 'index.html'), 'utf8');
  const tags = headTags(html).filter((t) => t.tag === 'script' || (t.tag === 'link' && /rel="stylesheet"/.test(t.attrs)));
  const ref = (t) => t.attrs.match(/(?:src|href)="([^"]+)"/)[1];
  assert.deepEqual(tags.slice(0, 3).map(ref), ['/pluginBridge.js', '/pluginTheme.css', 'theme-init.js']);
  assert.doesNotMatch(tags[0].attrs, /\b(?:defer|async|type=)/, 'the bridge is a blocking classic script');
  const module = tags.find((t) => /type="module"/.test(t.attrs));
  assert.equal(ref(module), './src/main.tsx');
  const rootRelative = [...html.matchAll(/\s(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(rootRelative, ['/pluginBridge.js', '/pluginTheme.css']);
});

// A raw request with an exact body (rawRequest always JSON-encodes its body).
async function sendRaw(port, method, p, body) {
  const http = (await import('node:http')).default;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: body === undefined ? {} : { 'content-type': 'application/json' } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
