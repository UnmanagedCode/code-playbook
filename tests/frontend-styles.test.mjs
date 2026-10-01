// Pins: public/styles.css is dark-only, declares code-conductor's shell tokens
// on :root (values checked against the host's own stylesheet when it is on
// disk), colours everything else with those tokens or the host's own literals,
// and styles controls the way the host does. Reads the stylesheet as text:
// happy-dom doesn't resolve cascaded custom properties reliably.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const css = stripComments(readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

const ROOT_RE = /:root\s*\{([^}]*)\}/;
const rootMatch = css.match(ROOT_RE);
const root = rootMatch ? rootMatch[1] : '';
const declared = new Set([...root.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

// The host stylesheet's non-token colour literals: primary-button text, its
// hover fill, and the plain-button hover fill.
const HOST_LITERALS = ['#0a0c12', '#8cb9ff', '#262b3d'];
const TINT_TOKENS = ['--accent', '--green', '--amber', '--red'];

function declarations(body) {
  const out = new Map();
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out.set(part.slice(0, i).trim(), part.slice(i + 1).trim().replace(/\s+/g, ' '));
  }
  return out;
}

// Top-level rules only: the @media block is dropped before parsing.
const topLevel = css.replace(ROOT_RE, '').replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
const rules = [...topLevel.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
  body: m[2],
}));

// The value `prop` ends up with across every top-level rule listing `selector`
// in its selector list (equal specificity, so the last declaration wins).
function decl(selector, prop) {
  let value;
  for (const r of rules) {
    if (!r.selectors.includes(selector)) continue;
    const d = declarations(r.body);
    if (d.has(prop)) value = d.get(prop);
  }
  return value;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

test(':root block exists', () => {
  assert.ok(rootMatch, 'styles.css has no :root block');
});

test('dark-only: no prefers-color-scheme query, :root declares color-scheme: dark', () => {
  assert.doesNotMatch(css, /prefers-color-scheme/);
  assert.match(root, /(^|[;\s])color-scheme\s*:\s*dark\s*(;|$)/);
});

test("declares the host shell's token names on :root", () => {
  for (const name of ['--bg', '--panel', '--panel-2', '--text', '--muted', '--border', '--accent', ...TINT_TOKENS.slice(1)]) {
    assert.ok(declared.has(name), `:root does not declare ${name}`);
  }
});

test('every var(--name) used is declared on :root', () => {
  const used = new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
  assert.ok(used.size > 0);
  for (const name of used) assert.ok(declared.has(name), `var(${name}) is not declared on :root`);
});

test("colours outside :root are tokens or the host's own literals", () => {
  const rootDecls = declarations(root);
  const tints = new Set(['0,0,0', ...TINT_TOKENS.map((t) => rgb(rootDecls.get(t) ?? '#000000'))]);
  const values = rules.flatMap((r) => [...declarations(r.body).values()]).join('\n');
  for (const [hex] of values.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    assert.ok(HOST_LITERALS.includes(hex.toLowerCase()), `hard-coded colour ${hex}`);
  }
  for (const m of values.matchAll(/rgba?\(([^)]*)\)/g)) {
    const triplet = m[1].split(',').slice(0, 3).map((s) => s.trim()).join(',');
    assert.ok(tints.has(triplet), `${m[0]} is not a tint of ${TINT_TOKENS.join('/')} or black`);
  }
});

test('controls use the host radius and button looks', () => {
  const controls = rules.find((r) => r.selectors.join(', ') === 'button, select, input, textarea');
  assert.ok(controls, 'no `button, select, input, textarea` rule');
  assert.equal(declarations(controls.body).get('border-radius'), '6px');
  assert.equal(decl('button.primary', 'background'), 'var(--accent)');
  assert.equal(decl('button.primary', 'color'), '#0a0c12');
  assert.equal(decl('button.primary:disabled', 'background'), 'var(--panel-2)');
  assert.equal(decl('button.primary:disabled', 'font-weight'), '400');
  assert.equal(decl('button:disabled', 'opacity'), '.5');
  assert.equal(decl('button:disabled', 'cursor'), 'not-allowed');
  assert.equal(decl('button.danger', 'color'), 'var(--red)');
});

test('index.html theme-color equals :root --bg', () => {
  const meta = html.match(/<meta\s+name="theme-color"\s+content="([^"]+)"/);
  assert.ok(meta, 'index.html has no theme-color meta');
  assert.equal(meta[1].toLowerCase(), declarations(root).get('--bg')?.toLowerCase());
});

test(":root matches code-conductor's shell :root", (t) => {
  const hostFile = process.env.CC_PROJECTS_ROOT && path.join(process.env.CC_PROJECTS_ROOT, 'code-conductor', 'public', 'styles.css');
  if (!hostFile || !existsSync(hostFile)) return t.skip('code-conductor not under $CC_PROJECTS_ROOT');
  const host = declarations(stripComments(readFileSync(hostFile, 'utf8')).match(ROOT_RE)[1]);
  const ours = declarations(root);
  for (const prop of ['--bg', '--panel', '--panel-2', '--text', '--muted', '--border', ...TINT_TOKENS, 'font-family', 'font-size', 'color-scheme']) {
    assert.ok(host.has(prop), `host :root has no ${prop}`);
    assert.equal(ours.get(prop), host.get(prop), `:root ${prop}`);
  }
});
