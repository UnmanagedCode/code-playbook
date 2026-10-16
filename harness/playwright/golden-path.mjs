// Visual-verification golden path (npm run harness, which builds first).
// Boots the plugin against the fake cc (tests/fixtures/fakeConductor.mjs) with
// a sandboxed PROJECTS_ROOT and drives list → detail → duplicate → edit → save
// → new, the saved bytes of the duplicate-mine edit script, the theme flip,
// keyboard paths, failure states, hostile content and a 390×844 pass, writing
// screenshots/NN-<name>.png. Fails on any console error other than the two
// host URLs' standalone 404s.
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '..', '..', 'tests', 'fixtures');
const SHOTS = path.join(HERE, 'screenshots');
const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };
const HOST_URLS = /\/plugin(?:Bridge\.js|Theme\.css)$/;

const { withPage } = await loadHarness();
await fs.rm(SHOTS, { recursive: true, force: true });
await fs.mkdir(SHOTS, { recursive: true });

const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
const status = (page) => page.locator('[data-status]');
const settle = (page) => page.waitForSelector('[data-status]:not(:has-text("Validating"))');
const saveButton = (page) => page.getByRole('button', { name: 'Save', exact: true });
const nav = (page) => page.getByRole('navigation', { name: 'Playbooks' });
const entry = (page, id) => nav(page).locator(`button[data-id="${id}"]`);
const stage = (page, name) => page.getByRole('region', { name: `Stage ${name}`, exact: true });
const overlayFile = (srv, id) => path.join(srv.sandbox.dirs.PROJECTS_ROOT, '.code-conductor', 'playbooks', `${id}.json`);

// Records console errors; `allowed(msg)` says which are expected. Fails on a CSP violation whatever `allowed` says.
function watchConsole(page) {
  const bad = [];
  let allow = () => false;
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const url = m.location()?.url ?? '';
    if (/Content Security Policy/i.test(text)) { bad.push(`CSP: ${text}`); return; }
    if (HOST_URLS.test(url) || (/MIME type/.test(text) && /plugin(?:Bridge\.js|Theme\.css)/.test(text))) return;
    if (!allow(text, url)) bad.push(`${text} (${url})`);
  });
  page.on('pageerror', (e) => bad.push(`pageerror: ${e.message}`));
  return { bad, allowing: (fn) => { allow = fn; } };
}

async function openDialogFor(page, opener) {
  await opener.click();
  return page.getByRole('dialog');
}

// The edit-script interpreter for the React DOM: every control by its accessible name.
function interpreter(page) {
  const group = (scope, name) => scope.getByRole('group', { name, exact: true });
  const tool = (s) => group(stage(page, s.stage), `Tool ${s.tool}`);
  const need = (s) => group(stage(page, s.stage), `Need ${s.index + 1}`);
  const pinRow = (s) => group(tool(s), `Pin ${s.index + 1}`);
  const transition = (i) => group(page.getByRole('region', { name: 'Transitions', exact: true }), `Transition ${i + 1}`);
  const select = (scope, name, value) => scope.getByRole('combobox', { name, exact: true }).selectOption(String(value));
  const click = (scope, name) => scope.getByRole('button', { name, exact: true }).click();
  const playbook = () => page.getByRole('region', { name: 'Playbook', exact: true });
  return async (s) => {
    switch (s.op) {
      case 'field': return playbook().getByRole('textbox', { name: { id: 'Id', name: 'Name', description: 'Description' }[s.field], exact: true }).fill(s.value);
      case 'renameStage': {
        const input = stage(page, s.stage).getByRole('textbox', { name: 'Stage name', exact: true });
        await input.fill(s.to);
        return input.press('Tab');
      }
      case 'entry': return stage(page, s.stage).getByRole('checkbox', { name: 'Entry stage', exact: true }).setChecked(s.on);
      case 'workers': return select(stage(page, s.stage), 'Workers', s.value);
      case 'stageDescription': return stage(page, s.stage).getByRole('textbox', { name: 'Description', exact: true }).fill(s.value);
      case 'addNeed': return click(stage(page, s.stage), 'Add need');
      case 'needAnchor': return select(need(s), 'Anchor', s.value);
      case 'needPosition': return group(need(s), 'Position').getByRole('checkbox', { name: s.member === '*' ? 'any stage (*)' : s.member, exact: true }).setChecked(s.on);
      case 'needLiveness': return select(need(s), 'Liveness', s.value);
      case 'removeNeed': return click(need(s), 'Remove need');
      case 'policy': return select(tool(s), 'Policy', s.value);
      case 'addPin': return click(tool(s), 'Add pin');
      case 'pinArg': return select(pinRow(s), 'Pin argument', s.value);
      case 'pinJson': return pinRow(s).getByRole('textbox', { name: 'Pin value (JSON)', exact: true }).fill(s.value);
      case 'removePin': return click(pinRow(s), 'Remove pin');
      case 'addTool': return select(stage(page, s.stage), 'Add tool', s.tool);
      case 'removeTool': return click(tool(s), `Remove tool ${s.tool}`);
      case 'addTransition': return click(page, 'Add transition');
      case 'transition':
        if (s.field === 'description') return transition(s.index).getByRole('textbox', { name: 'Description', exact: true }).fill(s.value);
        return select(transition(s.index), s.field[0].toUpperCase() + s.field.slice(1), s.value);
      case 'removeTransition': return click(transition(s.index), 'Remove transition');
      case 'addStage': return click(page, 'Add stage');
      case 'removeStage': {
        await click(stage(page, s.stage), 'Remove stage');
        return click(page.getByRole('dialog'), 'Remove stage');
      }
      default: throw new Error(`unknown op ${s.op}`);
    }
  };
}

const computed = (page, selector, prop) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el)[p], prop);
const activeLabel = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return el?.labels?.[0]?.textContent ?? el?.getAttribute('aria-label') ?? el?.textContent ?? null;
});
const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const live = process.env.CONDUCTOR_URL;
let mode = 'ok'; // the fake's list answer: 'ok' | '500'
const fake = live ? null : await startFakeConductor({ handle: (m, p) => (mode === '500' && p === '/api/playbooks' ? { status: 500, body: { error: 'cc fell over' } } : undefined) });
const srv = await bootPlaybook({ conductorUrl: live || fake.url });

try {
  await withPage(async (page) => {
    const consoleErrors = watchConsole(page);
    await page.goto(srv.url);
    await entry(page, 'relay').waitFor();

    if (live) {
      await shot(page, '01-list');
      await entry(page, 'relay').click();
      await page.getByRole('group', { name: 'stage graph of relay' }).waitFor();
      await shot(page, '02-relay-detail', true);
      return;
    }

    // 1. grouped list + load errors
    for (const source of ['builtin', 'user', 'plugin:acme']) assert.equal(await nav(page).locator(`section[data-source="${source}"]`).count(), 1, source);
    assert.equal(await nav(page).locator('[data-id="broken"]').getByRole('button', { name: 'Delete file' }).count(), 1);
    await shot(page, '01-list');

    // 2. relay: graph with needs + transition edges, tool table with pins
    await entry(page, 'relay').click();
    const graph = page.getByRole('group', { name: 'stage graph of relay' });
    await graph.waitFor();
    assert.ok(await graph.locator('[data-edge="needs"]').count() >= 2, 'needs edges drawn');
    assert.ok(await graph.locator('[data-edge="transition"]').count() >= 2, 'transition edges drawn');
    assert.equal(await page.locator('section[data-stage="plan"] tr[data-tool="spawn_instance"] [data-policy="pin"]').count(), 1, 'pinned spawn_instance');
    await shot(page, '02-relay-detail', true);

    // 3. plugin playbook: read-only, Duplicate only
    await entry(page, 'acme/release').click();
    await page.getByRole('heading', { name: 'Acme release' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Duplicate', exact: true }).count(), 1);
    await shot(page, '03-plugin-readonly');

    // 3b. mine: the same-row needs edge (draft → review, both entry stages) bows above its row: its control
    // points sit above the boxes' top edge, so the curve never enters the row.
    await entry(page, 'mine').click();
    const mineGraph = page.getByRole('group', { name: 'stage graph of mine' });
    await mineGraph.waitFor();
    const bow = await mineGraph.evaluate((svg) => {
      const edge = [...svg.querySelectorAll('[data-edge="needs"] path')].find((p) => p.querySelector('title')?.textContent === 'review needs draft');
      const top = Number(svg.querySelector('[data-stage="draft"] rect').getAttribute('y'));
      const nums = edge?.getAttribute('d').match(/-?[\d.]+/g)?.map(Number) ?? [];
      return { d: edge?.getAttribute('d'), top, starts: nums[1], controls: [nums[3], nums[5]], ends: nums[7] };
    });
    assert.match(bow.d, /^M [\d.]+ [\d.]+ C /, 'a cubic same-row edge');
    assert.deepEqual([bow.starts, bow.ends], [bow.top, bow.top], 'leaves and enters at the top edge');
    for (const y of bow.controls) assert.ok(y < bow.top, `control point y ${y} above the row top ${bow.top}`);
    await shot(page, '03b-mine-detail', true);

    // 4. duplicate relay → id dialog notices
    await entry(page, 'relay').click();
    const dialog = await openDialogFor(page, page.getByRole('button', { name: 'Duplicate', exact: true }));
    const idInput = dialog.getByRole('textbox', { name: 'Id' });
    const cont = dialog.getByRole('button', { name: 'Continue' });
    await idInput.fill('custom');
    await dialog.getByText("'custom' is reserved").waitFor();
    assert.ok(await cont.isDisabled());
    await shot(page, '04a-id-reserved');
    await idInput.fill('solo');
    await dialog.getByText(/overrides the shipped/).waitFor();
    await shot(page, '04b-id-override');
    await idInput.fill('my-relay');
    assert.equal(await dialog.getByRole('alert').count(), 0);
    await shot(page, '04c-id-clear');
    await cont.click();
    await page.getByRole('heading', { name: 'New playbook (from relay)' }).waitFor();

    // 5. add a stage named `bad`: the fake's canned verdict lands on its card
    await settle(page);
    await page.getByRole('button', { name: 'Add stage' }).click();
    const nameInput = page.getByRole('region', { name: /^Stage stage-/ }).getByRole('textbox', { name: 'Stage name' });
    await nameInput.fill('bad');
    await nameInput.press('Tab');
    await settle(page);
    await stage(page, 'bad').getByText('refused by the fake').waitFor();
    assert.ok(await saveButton(page).isDisabled(), 'Save disabled while cc refuses');
    await stage(page, 'bad').scrollIntoViewIfNeeded();
    await shot(page, '05-editor-bad');

    // 6. rename it `ok` → valid → Save enabled
    const okInput = stage(page, 'bad').getByRole('textbox', { name: 'Stage name' });
    await okInput.fill('ok');
    await okInput.press('Tab');
    await settle(page);
    assert.ok(!(await saveButton(page).isDisabled()), 'Save enabled once cc accepts');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, '06-editor-ok');

    // 6b. a refused rename (blank, then another stage's name) blocks Save until fixed
    const okName = stage(page, 'ok').getByRole('textbox', { name: 'Stage name' });
    for (const [name, why] of [['   ', /cannot be empty/], ['plan', /already exists/]]) {
      await okName.fill(name);
      await okName.press('Tab');
      await stage(page, 'ok').getByText(why).waitFor();
      assert.ok(await saveButton(page).isDisabled(), `Save disabled while the rename to ${JSON.stringify(name)} is refused`);
      assert.match(await status(page).innerText(), /stage rename refused/);
    }
    await stage(page, 'ok').scrollIntoViewIfNeeded();
    await shot(page, '06b-rename-refused');
    await okName.fill('ok');
    await okName.press('Tab');
    await settle(page);
    assert.ok(!(await saveButton(page).isDisabled()), 'Save enabled again once the rename is resolved');

    // 7. save → the sandbox holds the playbook, with the added stage
    await saveButton(page).click();
    await page.getByRole('heading', { name: 'Saved my-relay.json.' }).waitFor();
    const written = JSON.parse(await fs.readFile(overlayFile(srv, 'my-relay'), 'utf8'));
    const { details } = await loadFixtures();
    assert.equal(written.id, 'my-relay');
    assert.deepEqual(Object.keys(written.stages), [...Object.keys(details.relay.stages), 'ok']);
    await shot(page, '07-saved');

    // 8. edit `mine` (liveWorkers: 2): drift warning + stage-description hint
    await page.goto(`${srv.url}/?edit=mine`);
    await settle(page);
    await page.getByText(/2 live workers are bound to 'mine'/).waitFor();
    assert.ok(await page.getByText(/reach the conductor verbatim/).count() >= 1);
    await shot(page, '08-edit-mine', true);

    // 9. rename `mine` → rename warning
    await page.getByRole('region', { name: 'Playbook' }).getByRole('textbox', { name: 'Id' }).fill('mine-2');
    await settle(page);
    await page.getByText(/removes mine\.json.*PLAYBOOK_UNKNOWN/).waitFor();
    await shot(page, '09-rename-mine');

    // 10. New playbook from the user group
    await page.goto(srv.url);
    const newDialog = await openDialogFor(page, nav(page).getByRole('button', { name: 'New playbook' }));
    await newDialog.getByRole('textbox', { name: 'Id' }).fill('fresh');
    await newDialog.getByRole('button', { name: 'Continue' }).click();
    await stage(page, 'start').waitFor();
    await settle(page);
    assert.ok(await stage(page, 'start').getByRole('checkbox', { name: 'Entry stage' }).isChecked());
    assert.match(await page.locator('[data-playbook-errors]').innerText(), /name is required[\s\S]*description is required/);
    assert.ok(await saveButton(page).isDisabled(), 'the blank seed is not savable');
    await shot(page, '10a-new-playbook-blank', true);
    await page.getByRole('region', { name: 'Playbook' }).getByRole('textbox', { name: 'Name' }).fill('Fresh');
    await page.getByRole('region', { name: 'Playbook' }).getByRole('textbox', { name: 'Description' }).fill('A fresh playbook.');
    await settle(page);
    assert.equal(await page.locator('[data-playbook-errors]').count(), 0);
    assert.ok(!(await saveButton(page).isDisabled()), 'savable once named');
    await shot(page, '10b-new-playbook-named', true);

    // 11. bytes: the duplicate-mine edit script saves exactly its golden file
    const scripts = JSON.parse(await fs.readFile(path.join(FIXTURES, 'edit-scripts.json'), 'utf8'));
    const script = scripts['duplicate-mine'];
    await page.goto(`${srv.url}/?playbook=mine`);
    const dupDialog = await openDialogFor(page, page.getByRole('button', { name: 'Duplicate', exact: true }));
    await dupDialog.getByRole('textbox', { name: 'Id' }).fill(script.start.id);
    await dupDialog.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('region', { name: 'Playbook' }).waitFor();
    const run = interpreter(page);
    for (const s of script.steps) await run(s);
    await page.waitForSelector('[data-status]:has-text("Valid — ready to save")');
    await shot(page, '11-round-trip-editor', true);
    await saveButton(page).click();
    await page.getByRole('heading', { name: `Saved ${script.saved}.json.` }).waitFor();
    const golden = await fs.readFile(path.join(FIXTURES, 'saved', `${script.saved}.json`), 'utf8');
    assert.equal(await fs.readFile(overlayFile(srv, script.saved), 'utf8'), golden, 'saved bytes equal the golden file');

    // 12. theme: the page follows the OS standalone, live, and the graph's token colours flip with it
    await page.goto(`${srv.url}/?playbook=mine`);
    await page.getByRole('group', { name: 'stage graph of mine' }).waitFor();
    const paint = async () => ({
      dark: await page.evaluate(() => document.documentElement.classList.contains('dark')),
      node: await computed(page, 'svg [data-stage] rect', 'fill'),
      label: await computed(page, 'svg [data-edge-label] text', 'fill'),
      body: await computed(page, 'body', 'backgroundColor'),
    });
    // matchMedia's change event fires on the next frame, so wait for theme-init.js to apply it.
    const scheme = async (s) => {
      await page.emulateMedia({ colorScheme: s });
      await page.waitForFunction((d) => document.documentElement.classList.contains('dark') === d, s === 'dark');
    };
    await scheme('light');
    const light = await paint();
    await shot(page, '12a-light-detail');
    await scheme('dark');
    const dark = await paint();
    await shot(page, '12b-dark-detail');
    assert.deepEqual([light.dark, dark.dark], [false, true], '<html>.dark follows the OS live');
    for (const k of ['node', 'label', 'body']) assert.notEqual(light[k], dark[k], `${k} colour flips`);
    await page.goto(srv.url);
    await entry(page, 'relay').waitFor();
    await shot(page, '12c-dark-list');
    await page.goto(`${srv.url}/?edit=mine`);
    await settle(page);
    await shot(page, '12d-dark-editor');
    await scheme('light');
    await shot(page, '12e-light-editor');

    // 13. keyboard
    await page.goto(srv.url);
    await entry(page, 'forge').waitFor();
    for (let i = 0; i < 10 && !(await page.evaluate(() => document.activeElement?.hasAttribute('data-id'))); i++) await page.keyboard.press('Tab');
    const focusedId = await page.evaluate(() => document.activeElement?.getAttribute('data-id'));
    assert.ok(focusedId, 'Tab reaches a list entry');
    await page.keyboard.press('Enter');
    await page.waitForURL(`**/?playbook=${encodeURIComponent(focusedId)}`);
    await page.goto(`${srv.url}/?playbook=relay`);
    await page.getByRole('group', { name: 'stage graph of relay' }).waitFor();
    for (let i = 0; i < 20 && !(await page.evaluate(() => !!document.activeElement?.closest('svg [data-stage]'))); i++) await page.keyboard.press('Tab');
    const node = await page.evaluate(() => document.activeElement?.getAttribute('data-stage'));
    assert.ok(node, 'Tab reaches a graph node');
    await page.keyboard.press('Enter');
    await page.waitForFunction((n) => document.activeElement?.tagName === 'H3' && document.activeElement.textContent === n, node);
    const dupButton = page.getByRole('button', { name: 'Duplicate', exact: true });
    await dupButton.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'focus stays in the dialog');
    }
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.textContent === 'Duplicate');
    await page.goto(`${srv.url}/?edit=mine`);
    await settle(page);
    await page.getByRole('region', { name: 'Playbook' }).getByRole('textbox', { name: 'Id' }).focus();
    const order = [await activeLabel(page)];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      order.push(await activeLabel(page));
    }
    assert.deepEqual(order, ['Id', 'Name', 'Description', 'Stage name'], 'editor Tab order follows the layout');

    // 14. hostile content is not in this boot's fixtures; console so far: host URLs only, no CSP violation
    assert.deepEqual(consoleErrors.bad, [], 'console errors beyond the host URLs');

    // 15. states: a cc error, an unreachable cc, and the loading skeleton (backend responses are expected errors here)
    consoleErrors.allowing((text) => /Failed to load resource: the server responded with a status of 50[02]/.test(text));
    mode = '500';
    await page.goto(srv.url);
    await page.getByText('Cannot load playbooks').waitFor();
    await page.getByRole('heading', { name: 'Playbooks unavailable' }).waitFor();
    assert.equal(await page.getByText('cc fell over').count(), 2);
    await shot(page, '15a-list-500');
    mode = 'ok';
    let release;
    const gate = new Promise((r) => { release = r; });
    await page.route('**/api/playbooks', async (route) => { await gate; await route.continue(); });
    await page.goto(srv.url);
    await nav(page).getByText('Loading playbooks').waitFor({ state: 'attached' });
    await shot(page, '15b-list-loading');
    release();
    await entry(page, 'relay').waitFor();
    await page.unroute('**/api/playbooks');
    await fake.down();
    await page.reload();
    await page.getByText(/code-conductor at .* is unreachable/).first().waitFor();
    await shot(page, '15c-cc-unreachable');
    assert.deepEqual(consoleErrors.bad, [], 'console errors beyond the host URLs and the expected 5xx');
  }, { headless: true, viewport: DESKTOP });

  if (!live) {
    // Phone: the list, then a detail (list hidden, Back shown), then the editor, none wider than the screen.
    const fake2 = await startFakeConductor();
    const srv2 = await bootPlaybook({ conductorUrl: fake2.url });
    try {
      await withPage(async (page) => {
        const consoleErrors = watchConsole(page);
        await page.goto(srv2.url);
        await entry(page, 'relay').waitFor();
        assert.ok(await noPageOverflow(page), 'list fits 390px');
        await shot(page, '16-mobile-list', true);
        await page.goto(`${srv2.url}/?playbook=solo`);
        await page.getByRole('group', { name: 'stage graph of solo' }).waitFor();
        assert.ok(!(await nav(page).isVisible()), 'the list hides while a playbook is open');
        assert.ok(await page.getByRole('button', { name: 'All playbooks' }).isVisible(), 'Back is shown');
        assert.ok(await noPageOverflow(page), 'detail fits 390px');
        await shot(page, '17-mobile-detail', true);
        await page.goto(`${srv2.url}/?edit=mine`);
        await settle(page);
        assert.ok(await noPageOverflow(page), 'editor fits 390px');
        await shot(page, '18-mobile-editor');
        await shot(page, '18b-mobile-editor-full', true);
        await page.getByRole('button', { name: 'Cancel' }).click();
        await page.getByRole('button', { name: 'All playbooks' }).click();
        await entry(page, 'relay').waitFor();
        assert.deepEqual(consoleErrors.bad, []);
      }, { headless: true, viewport: MOBILE });
    } finally {
      await srv2.close();
      await fake2.close();
    }

    await hostile();
  }
  console.log(`screenshots in ${SHOTS}`);
} finally {
  await srv.close();
  await fake?.close();
}

// A cc serving a playbook whose every text field carries markup: it must show as text, and run nothing.
async function hostile() {
  const H = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>" style="color:red';
  const id = 'evil-<img src=x onerror=alert(1)>';
  const st = `s${H}`;
  const { list } = await loadFixtures();
  const detail = {
    id, name: `Name ${H}`, description: `Desc ${H}`, source: 'user', editable: true, entryStages: [st], liveWorkers: 0,
    stages: { [st]: { needs: [], workers: 'one', spawnable: true, description: `Stage ${H}`, tools: { spawn_instance: { pin: { mode: H } } } } },
    transitions: [{ from: st, to: st, via: 'send_prompt', description: `T ${H}` }],
  };
  const hostileList = {
    ...list,
    playbooks: [...list.playbooks, { id, name: detail.name, description: detail.description, source: 'user', editable: true, entryStages: [st], spawnableStages: [st] }],
    errors: [{ id: 'broken', message: `Load ${H}` }],
  };
  const fake3 = await startFakeConductor({
    handle: (m, p) => {
      if (m !== 'GET') return undefined;
      if (p === '/api/playbooks') return { status: 200, body: hostileList };
      if (decodeURIComponent(p) === `/api/playbooks/${id}`) return { status: 200, body: detail };
      return undefined;
    },
  });
  const srv3 = await bootPlaybook({ conductorUrl: fake3.url });
  try {
    await withPage(async (page) => {
      const consoleErrors = watchConsole(page);
      for (const search of [`?playbook=${encodeURIComponent(id)}`, `?edit=${encodeURIComponent(id)}`]) {
        await page.goto(`${srv3.url}/${search}`);
        await page.getByRole('heading', { name: search.startsWith('?edit') ? `Edit ${id}` : detail.name }).waitFor();
        if (search.startsWith('?edit')) await settle(page);
        const found = await page.evaluate(() => ({
          elements: document.querySelectorAll('#root img, #root script, #root iframe').length,
          xss: window.__xss,
          redStyle: [...document.querySelectorAll('#root [style]')].filter((e) => /red/.test(e.getAttribute('style'))).length,
          handlers: [...document.querySelectorAll('#root *')].flatMap((e) => [...e.attributes].filter((a) => a.name.startsWith('on')).map((a) => a.name)),
        }));
        assert.deepEqual(found, { elements: 0, xss: undefined, redStyle: 0, handlers: [] }, search);
        if (!search.startsWith('?edit')) {
          for (const text of [detail.name, detail.description, `Stage ${H}`, `T ${H}`, `Load ${H}`]) assert.ok(await page.getByText(text, { exact: true }).count() >= 1, text);
        }
        await shot(page, search.startsWith('?edit') ? '19b-hostile-editor' : '19a-hostile-detail', true);
      }
      assert.deepEqual(consoleErrors.bad, [], 'no CSP violation or other console error');
    }, { headless: true, viewport: DESKTOP });
  } finally {
    await srv3.close();
    await fake3.close();
  }
}
