// Embedded check (npm run harness:embedded) against a SCRATCH cc that already
// runs this checkout as its code-playbook plugin (docs/architecture.md →
// Visual harness has the setup). Never point it at the cc you work in: it
// saves a playbook through the plugin.
//
//   CC_URL                 the scratch cc's base URL (required)
//   CC_SCRATCH_PROJECTS    the scratch cc's projects root; when set, the save is
//                          checked to have landed in its overlay dir
//
// Checks: the host URLs load and the Geist font is available; inside cc's
// shell the page follows cc's theme live (OS flip under "system", and cc's own
// <html> class); one visit adds exactly one joint history entry; no CSP
// violation. Screenshots go to screenshots/embedded-*.png.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHarness } from './codePlaywright.mjs';

const CC = process.env.CC_URL?.replace(/\/$/, '');
if (!CC) throw new Error('CC_URL is not set: start a scratch cc (scripts/run-isolated.sh) with this plugin enabled');
const SCRATCH = process.env.CC_SCRATCH_PROJECTS;
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');
await fs.mkdir(SHOTS, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `embedded-${name}.png`) });
const SAVED_ID = `embedded-check-${Date.now()}`;

const { withPage } = await loadHarness();

await withPage(async (page) => {
  const csp = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  const hostAssets = new Map();
  page.on('response', (r) => {
    const p = new URL(r.url()).pathname;
    if (p === '/pluginBridge.js' || p === '/pluginTheme.css') hostAssets.set(p, r.status());
  });

  // 1. The plugin page on its own: host URLs served, Geist loaded.
  await page.goto(`${CC}/plugins/code-playbook/`);
  await page.locator('nav[aria-label="Playbooks"] button[data-id="relay"]').waitFor();
  assert.deepEqual(Object.fromEntries(hostAssets), { '/pluginBridge.js': 200, '/pluginTheme.css': 200 });
  assert.equal(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('13px "Geist Variable"'); }), true, 'Geist Variable loaded');
  await shot(page, '01-page');

  // 2. Inside cc's shell, after one cc entry.
  await page.goto(`${CC}/`);
  await page.waitForLoadState('networkidle');
  const historyBefore = await page.evaluate(() => history.length);
  await page.goto(`${CC}/#plugin/code-playbook/`);
  const frameEl = page.locator('iframe[data-plugin-frame]');
  await frameEl.waitFor();
  const frame = await (await frameEl.elementHandle()).contentFrame();
  await frame.locator('nav[aria-label="Playbooks"] button[data-id="relay"]').click();
  await frame.getByRole('group', { name: 'stage graph of relay' }).waitFor();

  const state = async () => ({
    cc: await page.evaluate(() => document.documentElement.classList.contains('dark')),
    frame: await frame.evaluate(() => document.documentElement.classList.contains('dark')),
    ccTheme: await frame.evaluate(() => document.documentElement.getAttribute('data-cc-theme')),
    rect: await frame.locator('svg [data-stage] rect').first().evaluate((el) => getComputedStyle(el).fill),
  });
  const waitFrameDark = (d) => frame.waitForFunction((x) => document.documentElement.classList.contains('dark') === x, d);

  // Under cc's "system" theme the OS flip reaches cc, and the bridge carries it into the frame.
  await page.emulateMedia({ colorScheme: 'dark' });
  await waitFrameDark(true);
  const dark = await state();
  await shot(page, '02-shell-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await waitFrameDark(false);
  const light = await state();
  await shot(page, '03-shell-light');
  assert.deepEqual([dark.cc, dark.frame, dark.ccTheme], [true, true, 'dark']);
  assert.deepEqual([light.cc, light.frame, light.ccTheme], [false, false, 'light']);
  assert.notEqual(dark.rect, light.rect, 'the graph repaints with the theme');

  // cc's own <html> class (the sidebar toggle's effect) is followed too.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await waitFrameDark(true);
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await waitFrameDark(false);

  // 3. Duplicate → editor → save inside the frame; the in-plugin navigation adds no history entry.
  await frame.getByRole('button', { name: 'Duplicate', exact: true }).click();
  const dialog = frame.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Id' }).fill(SAVED_ID);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await frame.waitForSelector('[data-status]:has-text("Valid — ready to save")', { timeout: 15_000 });
  await shot(page, '04-shell-editor');
  await frame.getByRole('button', { name: 'Save', exact: true }).click();
  await frame.getByText(`Saved ${SAVED_ID}.json.`).waitFor();
  if (SCRATCH) {
    const file = path.join(SCRATCH, '.code-conductor', 'playbooks', `${SAVED_ID}.json`);
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).id, SAVED_ID, `saved into ${file}`);
  }
  await frame.locator(`nav[aria-label="Playbooks"] button[data-id="${SAVED_ID}"]`).click();
  await frame.getByRole('button', { name: 'Delete', exact: true }).click();
  await frame.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await frame.getByText(`Deleted ${SAVED_ID}.json.`).waitFor();

  assert.equal(await page.evaluate(() => history.length), historyBefore + 1, 'one joint history entry for the whole visit');
  await page.goBack();
  await page.waitForFunction(() => !location.hash.startsWith('#plugin/code-playbook'));
  assert.deepEqual(csp, [], 'no CSP violation');
}, { headless: true, viewport: { width: 1280, height: 900 } });

console.log(`embedded checks passed; screenshots in ${SHOTS}`);
