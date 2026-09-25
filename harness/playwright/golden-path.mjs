// Visual-verification golden path (npm run harness). Boots the plugin against
// the fake cc (tests/fixtures/fakeConductor.mjs) with a sandboxed
// PROJECTS_ROOT, drives list → detail → duplicate → edit → save → new, and
// writes screenshots/NN-<name>.png at 1280×900 plus a 390×844 pass.
//
// With CONDUCTOR_URL already set, it points at that live cc instead and
// captures the read screens only (the list and relay's detail).
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHarness } from './codePlaywright.mjs';
import { bootPlaybook } from './boot.mjs';
import { startFakeConductor, loadFixtures } from '../../tests/fixtures/fakeConductor.mjs';
import { duplicateForm, definitionFromForm, newStage } from '../../public/formModel.js';

const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');
const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

const { withPage } = await loadHarness();
await fs.rm(SHOTS, { recursive: true, force: true });
await fs.mkdir(SHOTS, { recursive: true });

const live = process.env.CONDUCTOR_URL;
const fake = live ? null : await startFakeConductor();
const srv = await bootPlaybook({ conductorUrl: live || fake.url });
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
const settle = (page) => page.waitForSelector('[data-status]:not(:has-text("Validating"))');
const stageCard = (page, name) => page.locator(`.stage-card[data-stage="${name}"]`);

try {
  await withPage(async (page) => {
    page.on('dialog', (d) => d.accept());
    await page.goto(srv.url);
    await page.waitForSelector('.group[data-source="builtin"] .list-entry');

    if (live) {
      await shot(page, '01-list');
      await page.click('.list-entry[data-id="relay"]');
      await page.waitForSelector('.graph');
      await shot(page, '02-relay-detail', true);
      return;
    }

    // 1. grouped list + load errors
    for (const source of ['builtin', 'user', 'plugin:acme']) assert.ok(await page.locator(`.group[data-source="${source}"]`).count(), source);
    assert.equal(await page.locator('.load-error[data-id="broken"] button:has-text("Delete file")').count(), 1);
    await shot(page, '01-list');

    // 2. relay: graph with needs + transition edges, tool table with pins
    await page.click('.list-entry[data-id="relay"]');
    await page.waitForSelector('.graph');
    assert.ok(await page.locator('.edge-needs').count() >= 2, 'needs edges drawn');
    assert.ok(await page.locator('.edge-transition').count() >= 2, 'transition edges drawn');
    assert.ok(await page.locator('#stage-plan td.policy-pin').count() === 1, 'pinned spawn_instance');
    await shot(page, '02-relay-detail', true);

    // 3. plugin playbook: read-only, Duplicate only
    await page.click('.list-entry[data-id="acme/release"]');
    await page.waitForSelector('h2:has-text("Acme release")');
    assert.equal(await page.locator('.actions button:has-text("Edit")').count(), 0);
    assert.equal(await page.locator('.actions button:has-text("Duplicate")').count(), 1);
    await shot(page, '03-plugin-readonly');

    // 3b. mine: a same-row needs edge (draft → review) bowing below its row
    await page.click('.list-entry[data-id="mine"]');
    await page.waitForSelector('h2:has-text("Mine")');
    await shot(page, '03b-mine-detail', true);

    // 4. duplicate relay → id dialog notices
    await page.click('.list-entry[data-id="relay"]');
    await page.waitForSelector('h2:has-text("Relay")');
    await page.click('.actions button:has-text("Duplicate")');
    const idInput = page.locator('.id-dialog input');
    await idInput.fill('custom');
    assert.equal(await page.locator('.id-dialog .notice.block').count(), 1);
    assert.ok(await page.locator('.id-dialog button.primary').isDisabled());
    await shot(page, '04a-id-reserved');
    await idInput.fill('solo');
    assert.match(await page.locator('.id-dialog .notice.warn').innerText(), /overrides the shipped/);
    await shot(page, '04b-id-override');
    await idInput.fill('my-relay');
    assert.equal(await page.locator('.id-dialog .notice').count(), 0);
    await shot(page, '04c-id-clear');
    await page.click('.id-dialog button.primary');
    await page.waitForSelector('.editor');

    // 5. add a stage named `bad`: the fake's canned verdict lands on its card
    await settle(page);
    await page.click('[data-action="add-stage"]');
    const nameInput = page.locator('.stage-card').last().locator('.stage-name');
    await nameInput.fill('bad');
    await nameInput.press('Tab');
    await settle(page);
    assert.match(await stageCard(page, 'bad').locator('.errors').innerText(), /refused by the fake/);
    assert.ok(await page.locator('[data-action="save"]').isDisabled(), 'Save disabled while cc refuses');
    await stageCard(page, 'bad').scrollIntoViewIfNeeded();
    await shot(page, '05-editor-bad');

    // 6. rename it `ok` → valid → Save enabled
    await nameInput.fill('ok');
    await nameInput.press('Tab');
    await settle(page);
    assert.ok(!(await page.locator('[data-action="save"]').isDisabled()), 'Save enabled once cc accepts');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, '06-editor-ok');

    // 7. save → the sandbox holds exactly the form's definition
    await page.click('[data-action="save"]');
    await page.waitForSelector('text=Saved my-relay.json.');
    const { details } = await loadFixtures();
    const form = duplicateForm(details.relay, 'my-relay');
    form.stages.push(newStage('ok'));
    const written = JSON.parse(await fs.readFile(path.join(srv.sandbox.dirs.PROJECTS_ROOT, '.code-conductor', 'playbooks', 'my-relay.json'), 'utf8'));
    assert.deepEqual(written, definitionFromForm(form).definition);
    await shot(page, '07-saved');

    // 8. edit `mine` (liveWorkers: 2): drift warning + stage-description hint
    await page.goto(`${srv.url}/?edit=mine`);
    await page.waitForSelector('.editor');
    await settle(page);
    assert.match(await page.locator('.notice.warn').first().innerText(), /2 live workers are bound to 'mine'/);
    assert.ok(await page.locator('.hint:has-text("reach the conductor verbatim")').count() >= 1);
    await shot(page, '08-edit-mine', true);

    // 9. rename `mine` → rename warning
    await page.locator('[data-f="id"]').fill('mine-2');
    await settle(page);
    assert.match(await page.locator('.notice.warn').last().innerText(), /removes mine\.json.*PLAYBOOK_UNKNOWN/);
    await shot(page, '09-rename-mine');

    // 10. New playbook from the user group
    await page.goto(srv.url);
    await page.click('.group[data-source="user"] button:has-text("New playbook")');
    await page.locator('.id-dialog input').fill('fresh');
    await page.click('.id-dialog button.primary');
    await page.waitForSelector('.stage-card[data-stage="start"]');
    await settle(page);
    assert.ok(await page.locator('[data-f^="entry:"]').isChecked());
    assert.match(await page.locator('.playbook-errors').innerText(), /name is required[\s\S]*description is required/);
    assert.ok(await page.locator('[data-action="save"]').isDisabled(), 'the blank seed is not savable');
    await shot(page, '10a-new-playbook-blank', true);
    await page.locator('[data-f="name"]').fill('Fresh');
    await page.locator('[data-f="description"]').fill('A fresh playbook.');
    await settle(page);
    assert.equal(await page.locator('.playbook-errors').count(), 0);
    assert.ok(!(await page.locator('[data-action="save"]').isDisabled()), 'savable once named');
    await shot(page, '10b-new-playbook-named', true);
  }, { headless: true, viewport: DESKTOP });

  if (!live) {
    await withPage(async (page) => {
      await page.goto(srv.url);
      await page.waitForSelector('.group[data-source="builtin"] .list-entry');
      await shot(page, '11-mobile-list', true);
      await page.goto(`${srv.url}/?playbook=solo`);
      await page.waitForSelector('.graph');
      await shot(page, '12-mobile-detail', true);
      await page.goto(`${srv.url}/?edit=mine`);
      await page.waitForSelector('.editor');
      await settle(page);
      await shot(page, '13-mobile-editor');
    }, { headless: true, viewport: MOBILE });
  }
  console.log(`screenshots in ${SHOTS}`);
} finally {
  await srv.close();
  await fake?.close();
}
