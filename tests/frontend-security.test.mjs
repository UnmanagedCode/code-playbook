// A text guard over the UI sources. Content renders as text: no raw-HTML or
// eval API in any file of frontend/ (build output aside), and in the plugin's
// own code no style or link built from anything, no hash routing, no reach
// into cc's window or storage, and no root-relative request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { FRONTEND, sourceFiles } from './_frontendFiles.mjs';

// Every text source under frontend/ but the build output: index.html, public/, src/ (tests included) and the configs.
function allFrontendFiles() {
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(path.join(FRONTEND, rel), { withFileTypes: true })) {
      const r = path.posix.join(rel, e.name);
      if (e.isDirectory()) {
        if (r !== 'dist' && e.name !== 'node_modules') walk(r);
      } else if (/\.(?:html|ts|tsx|js|mjs|css)$/.test(e.name)) {
        out.push([r, readFileSync(path.join(FRONTEND, r), 'utf8')]);
      }
    }
  };
  walk('');
  return out;
}

const all = allFrontendFiles();
// The plugin's own UI code. components/ui/ is excluded from the own-code checks below: it holds cc's
// primitives, copied unchanged from cc (they set no content-built style or link, but are not ours to police).
const own = sourceFiles().filter(([n]) => n.startsWith('src/') && !n.startsWith('src/components/ui/'));
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Invariant: nothing anywhere in the UI turns a string into markup or code.
test('no raw-HTML or eval API in any frontend file', () => {
  const RAW = /dangerouslySetInnerHTML|\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|\beval\(|new Function\b/;
  for (const must of ['index.html', 'public/theme-init.js', 'vite.config.ts', 'vitest.config.ts', 'src/App.tsx']) {
    assert.ok(all.some(([n]) => n === must), `scanned: ${must}`);
  }
  for (const [n, src] of all) assert.equal(RAW.test(code(src)), false, `${n}: ${code(src).match(RAW)?.[0]}`);
});

// Invariant: own code sets no style and renders no link (so no content-built href), routes by query string,
// and leaves cc's window and the shared storage alone.
test('own code (outside the copied components/ui/): no style prop, no links, no hash, no window.parent, no storage', () => {
  const BANNED = /\bstyle=|\bhref=|<a[\s>]|location\.hash|window\.parent|\blocalStorage\b|\bsessionStorage\b/;
  assert.ok(own.length > 20);
  for (const [n, src] of own) assert.equal(BANNED.test(code(src)), false, `${n}: ${code(src).match(BANNED)?.[0]}`);
});

// fetch('/…'), or the API helper's call('METHOD', '/…') with or without a type argument.
const ROOTED = /\bfetch\(\s*['"`]\/|\bcall\s*(?:<[^>]*>)?\s*\(\s*['"`][A-Z]+['"`]\s*,\s*['"`]\//;

// Invariant: the root-relative check recognises every request form the code uses (so the check below is not vacuous).
test('the root-relative pattern matches each request form', () => {
  for (const s of ["fetch('/api/x')", 'fetch(`/x`)', "call('GET', '/x')", "call<PlaybookList>('GET', '/x')", "call<{ ok: true }>('PUT', `/x`, d)"]) {
    assert.ok(ROOTED.test(s), s);
  }
  for (const s of ["fetch('api/x')", "call<PlaybookList>('GET', 'api/playbooks')"]) assert.ok(!ROOTED.test(s), s);
});

// Invariant: every request is relative, so it reaches this plugin's backend under /plugins/code-playbook/, not cc's API.
test('no root-relative fetch or api call', () => {
  for (const [n, src] of own) assert.equal(ROOTED.test(code(src)), false, `${n}: ${code(src).match(ROOTED)?.[0]}`);
});
