// The server half of the editor round-trip: a body the pre-port UI sent (the
// golden file, re-serialised as JSON.stringify does in the browser) is
// written byte for byte as the golden file. The UI half is
// frontend/src/components/editor/roundTrip.test.tsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { bootWithFake, rawRequest } from './helpers.mjs';

const SAVED = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'saved');
const scripts = JSON.parse(await fs.readFile(path.join(SAVED, '..', 'edit-scripts.json'), 'utf8'));

for (const [name, script] of Object.entries(scripts)) {
  // Invariant: the overlay file the backend writes for this script's body equals the golden bytes.
  test(`${name}: the saved file equals the golden bytes`, async (t) => {
    const { port, overlay } = await bootWithFake(t);
    const golden = await fs.readFile(path.join(SAVED, `${script.saved}.json`), 'utf8');
    const from = script.start.edit ? `?from=${encodeURIComponent(script.start.edit)}` : '';
    const r = await rawRequest(port, 'PUT', `/api/playbooks/${encodeURIComponent(script.saved)}${from}`, JSON.parse(golden));
    assert.equal(r.status, 200, r.text);
    assert.equal(await fs.readFile(path.join(overlay, `${script.saved}.json`), 'utf8'), golden);
  });
}
