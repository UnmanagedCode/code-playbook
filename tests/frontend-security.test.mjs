// A text guard over the UI sources (tests excluded: they carry hostile strings
// on purpose). Content renders as text: no raw-HTML API anywhere, and in the
// plugin's own code no style or link built from anything, no hash routing, no
// reach into cc's window or storage, and no root-relative request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceFiles } from './_frontendFiles.mjs';

const files = sourceFiles().filter(([n]) => n.startsWith('src/'));
const own = files.filter(([n]) => !n.startsWith('src/components/ui/'));
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Invariant: nothing turns a string into markup or code.
test('no raw-HTML or eval API in any UI source', () => {
  const RAW = /dangerouslySetInnerHTML|\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|\beval\(|new Function\b/;
  assert.ok(files.length > 20);
  for (const [n, src] of files) assert.equal(RAW.test(code(src)), false, `${n}: ${code(src).match(RAW)?.[0]}`);
});

// Invariant: own code sets no style and renders no link (so no content-built href), routes by query string,
// and leaves cc's window and the shared storage alone.
test('own code: no style prop, no links, no hash, no window.parent, no storage', () => {
  const BANNED = /\bstyle=|\bhref=|<a[\s>]|location\.hash|window\.parent|\blocalStorage\b|\bsessionStorage\b/;
  for (const [n, src] of own) assert.equal(BANNED.test(code(src)), false, `${n}: ${code(src).match(BANNED)?.[0]}`);
});

// Invariant: every request is relative, so it reaches this plugin's backend under /plugins/code-playbook/, not cc's API.
test('no root-relative fetch or api call', () => {
  const ROOTED = /\b(?:fetch|call)\(\s*['"`]\/|\bcall\(\s*['"][A-Z]+['"],\s*['"`]\//;
  for (const [n, src] of own) assert.equal(ROOTED.test(code(src)), false, `${n}: ${code(src).match(ROOTED)?.[0]}`);
});
