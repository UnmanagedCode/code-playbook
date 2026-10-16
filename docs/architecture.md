# Architecture

## Modules

### Backend

| File | Responsibility |
|---|---|
| `server.js` | wiring only, in this order: `securityHeaders` → `/api` routes → `serveUi(distDir)` → JSON 404 → `jsonErrorHandler`. Logs the missing entry file at startup (`checkBuilt`), listens on `$PORT` |
| `src/securityHeaders.js` | `CSP` and the middleware setting it and `X-Content-Type-Options: nosniff` on every response |
| `src/static.js` | `serveUi(distDir)`: `/` and `ASSET_RE` paths from `frontend/dist` (`DEFAULT_DIST`), the unbuilt 503; `checkBuilt(distDir, log)` |
| `src/conductorClient.js` | the only module that talks to cc. `forward` answers `{status, body}`; `list`/`validate` throw on anything but 200 JSON. `playbookPath` segment-encodes an id |
| `src/playbookStore.js` | overlay dir I/O: `assertOverlayId` (path safety), atomic `write`, `remove` |
| `src/authoring.js` | save / delete sequencing: guard → reserved check → cc validate → store |
| `src/routes.js` | HTTP layer; thrown `httpError`s become `{error, code, …}` |
| `src/httpError.js` | the error type carrying status, code and extra body fields |
| `src/errorHandler.js` | `jsonErrorHandler`: the last error handler on the router and the app; JSON only, never a stack |

### Frontend (`frontend/`, React + Vite + Tailwind v4 + cc's shadcn/Radix components + lucide)

| File | Responsibility |
|---|---|
| `src/main.tsx` | mounts `App` in `StrictMode` |
| `src/App.tsx` | routes (query string), list loading, detail fetch per navigation with a stale-response guard, the in-memory draft, the flash notice, the id and delete dialogs |
| `src/lib/route.ts` | `parseRoute`, `navigate` (`pushState`, never a hash), `useNavigation` (`location.search` plus a navigation count) |
| `src/lib/api.ts` | `playbooksApi` over relative `api/…` paths; failures are `ApiError(status, message, code?, body?)`, status 0 for an unreachable backend |
| `src/lib/utils.ts`, `modalFocus.ts`, `textEntry.ts` | copied from cc (`cn()`, modal focus return) |
| `src/components/ui/*` | copied from cc: button, badge, alert, card, dialog, input, textarea, label, checkbox, native-select, skeleton |
| `src/components/PlaybookList.tsx` | grouped list, New playbook, load errors |
| `src/components/PlaybookDetail.tsx`, `StagePanel.tsx`, `TransitionsTable.tsx` | the detail screen |
| `src/components/StageGraph.tsx` | SVG render of a `layoutGraph` result; nodes are focusable buttons |
| `src/components/IdDialog.tsx`, `ConfirmDialog.tsx` | the id prompt (Duplicate, New playbook) and the destructive confirm (Delete, Delete file, Remove stage) |
| `src/components/MessagePanel.tsx`, `BackButton.tsx`, `AppHeader.tsx` | messages, the phone-only Back, the header |
| `src/components/editor/useEditor.ts` | the editor's state machine: debounced validate, stale verdicts dropped, target lookup for the drift warning, save, stage-name drafts |
| `src/components/editor/Editor.tsx`, `StageCard.tsx`, `NeedsRow.tsx`, `ToolRow.tsx`, `TransitionRow.tsx`, `Field.tsx`, `ErrorList.tsx` | the editor's controls; every edit goes through `formEdits` |
| `src/model/formModel.ts` | **pure** form state and transformations |
| `src/model/formEdits.ts` | **pure** one function per editor gesture: `(form, …) → new form` |
| `src/model/editorModel.ts` | **pure** status text and tone, notices, hints, option lists |
| `src/model/listModel.ts` | **pure** list grouping, load-error groups, the viewer's derived text |
| `src/model/graphLayout.ts` | **pure** layered layout |
| `src/model/saveGate.ts` | **pure** `canSave`: when the editor's Save is enabled |
| `src/model/wording.ts` | **pure** live-worker sentences for the drift and rename warnings and the delete confirm |
| `src/model/types.ts` | cc's API shapes and the form shapes |

The **pure** modules touch no DOM; vitest imports them directly.

## Build on install

- `npm install` installs the devDependencies, then `prepare` runs `vite build --config frontend/vite.config.ts` into `frontend/dist/` (ignored). `base: './'` keeps every asset URL relative.
- `package-lock.json`, `node_modules/` and `frontend/dist/` are ignored, so `npm install` leaves `git status` clean and Update's `git pull --ff-only` never collides.
- Unbuilt (`frontend/dist/index.html` missing): `node server.js` logs `UI not built: <abs path> is missing — run npm install` once and starts anyway. `/` and `/index.html` answer `503 text/plain` `UI not built — run npm install`; every other non-API path is the JSON 404; `/api/*` works.

## Theme

- `frontend/index.html` loads, in order: `/pluginBridge.js` (blocking, first), `/pluginTheme.css`, `theme-init.js`, then the module.
- Embedded, the bridge sets `dark` and `data-cc-theme` on `<html>` and keeps them in step with cc; cc's unlayered `/pluginTheme.css` supplies the tokens and the Geist fonts.
- Standalone, `frontend/public/theme-init.js` follows `prefers-color-scheme` live, and `src/cc-theme-fallback.css` (a one-time snapshot of cc's tokens in `@layer base`) keeps the page legible. Fonts fall back to the system stack.
- `src/index.css` is the recipe block from cc's `docs/plugin-ui.md`. Own code colours only through token utilities (`tests/frontend-theme.test.mjs`).
- The stage graph paints with token utilities (`fill-muted`, `stroke-success`, `fill-warning`, `fill-card`, …): the browser re-resolves them when `.dark` flips, so no JS reads or caches a colour.

## Content safety

- Every playbook string (ids, names, descriptions, stage and tool names, pin JSON, cc's error and load-error messages) is a React text child or a React-set attribute value. No raw-HTML API, no `style` prop, no links (`tests/frontend-security.test.mjs`).
- SVG marker ids come from `useId`, never from content.
- `CSP` (`src/securityHeaders.js`) allows `style-src 'unsafe-inline'` only because Radix Dialog's scroll lock injects a `<style>`; `form-action 'none'` holds because the id dialog's form submits through `onSubmit` only.

## Division of rules

cc owns every rule about playbook content and ids. This plugin checks only:
- path safety of a filename (`assertOverlayId`);
- `body.id` equals the path id;
- `takenIds` notices (`idNotices`);
- pin JSON parses (without a parse there is no definition to validate);
- a renamed stage doesn't collide with another stage's name (object keys).

Nothing is written without cc's `ok:true` for that exact body.

## Form model

- A form stage has a stable `key` (card identity survives renames).
- `entryStages` is an ordered list; toggling appends.
- Tools are rows `{tool, policy, pin:[{arg, json}]}`, so "undeclared" and `"deny"` stay distinct.
- `formFromDetail` / `definitionFromForm` implement the mapping in [protocol.md](protocol.md#detail--definition). `definitionFromForm` answers `{definition}` or `{localErrors}`.
- `renameStage` and `removeStage` cascade over entry stages, needs anchors, positions and transitions by exact name.
- `placeErrors` buckets located errors to stage keys, transition row indexes, or the playbook panel.
- `formEdits` holds every other gesture: a need anchors on the first other stage; a position of exactly `[anchor]` follows its anchor; choosing `pin` seeds the tool's first pin arg (spawn_instance's, or `mode` when cc lists none); any other policy clears pins; `none` removes the tool; Add pin takes the first unused arg; Add stage names `stage-N`, skipping taken names.
- Saved bytes: `definitionFromForm` fixes key order, `api.ts` sends `JSON.stringify(definition)`, and `playbookStore` writes `JSON.stringify(definition, null, 2) + '\n'`. `tests/fixtures/edit-scripts.json` and the golden files in `tests/fixtures/saved/` pin the result (Tests, below).

## Graph layout

- Edges: transitions (labelled `via`) and needs (anchor → stage, unlabelled).
- DFS from the entry stages, then the rest in declaration order, marks cycle-closing edges `back`.
- Layer: 0 for an entry stage or a stage with no forward predecessor, else one below its deepest forward predecessor.
- Rows keep declaration order and are centred. Next-layer edges are quadratic curves through the gap between the rows (parallel ones fan out). Same-layer edges bow above the row (the top padding grows by `SAME_ROW_BOW` when there are any). Back and layer-skipping edges are polylines: gap below the source, a lane right of every box, gap above the target. Lanes start right of every self-loop label and each starts right of the previous routed edge's label (widths from `CHAR_W`, which assumes the 11.5px monospace labels `StageGraph.tsx` renders); a routed label sits level with a row centre, where no horizontal run passes, or midway between its own runs when they share one gap. A next-layer label sits right of the rightmost point any curve of the same pair reaches within the label's height. `StageGraph.tsx` paints labels after every path, on an opaque `fill-card` rect sized from `labelBox`. Every labelled edge carries a `labelBox`. Self-loops are arcs on the node's right.

## Tests

`npm test` runs, in order: `tests/run.mjs` (the `node:test` API, every `tests/*.test.mjs`), `tsc -p frontend`, and vitest (`frontend/vitest.config.ts`, happy-dom, every `frontend/src/**/*.test.{ts,tsx}`).

### node:test (`tests/`)

| File | Covers |
|---|---|
| `serving.test.mjs` | over a fixture dist: `/`, `/index.html`, assets served with type and `no-store`; traversal, sources, maps and decoy files 404; host URLs and unknown paths 404 JSON; unbuilt 503 with the API up; `checkBuilt`; the CSP and `nosniff` on 200, 404, 503, 400s, 422, 502, 503 and 500; the source `index.html`'s head order and relative refs |
| `dist.test.mjs` | the real build (fails with "run npm install" when missing): files match `ASSET_RE`, no `.map`, no inline script/style, relative refs, head order, no absolute or `data:` URL in the CSS, no `"/api/` in the JS, served with the CSP |
| `frontend-theme.test.mjs` | `index.css` imports and dark variant; its `@theme inline` block equals the recipe's (skipped without `$CC_PROJECTS_ROOT/code-conductor/docs/plugin-ui.md`); the fallback is `@layer base` and declares every mapped token; no literal colour in own code; only `theme-init.js` touches the theme |
| `frontend-security.test.mjs` | no raw-HTML or eval API; in own code no `style=`, `href=`, `<a`, `location.hash`, `window.parent`, storage; no root-relative request |
| `roundTrip.test.mjs` | the server half of the round-trip: each golden body PUT through the backend is written byte for byte as the golden file |
| `authoring.test.mjs` | save target, the draft sent to cc as JSON, validate-before-write, unreachable cc, id mismatch, the path guard, cc judging path-safe ids, reserved ids, atomic write, rename ordering, delete scope, `PROJECTS_ROOT` unset |
| `routes.test.mjs` | verbatim forwarding (incl. slash ids and cc 404s), dot/empty-segment detail ids refused with no request to cc, the cc client's own path guard with a JSON Content-Type to cc, `BODY_NOT_JSON`, `PATH_INVALID` without a stack, the generic 500, `CONDUCTOR_URL` unset or malformed, unreachable cc, bad JSON |
| `pluginManifest.test.mjs` | manifest fields cc relies on; `dependencies` is `express` only; the UI devDependencies, `prepare`/`typecheck`/`test`/`test:web` scripts and `engines.node`; `.gitignore` |
| `fixtures.test.mjs` | the fixtures match `tests/contractShape.mjs` |

### vitest (`frontend/src/`)

| File | Covers |
|---|---|
| `model/formModel.test.ts` | lossless round-trip over every fixture, the via and description rules, deny vs undeclared, entry order, pin JSON, rename/remove cascades (and a blank rename refused), duplicate, the New playbook seed (refused blank, accepted once named), `idNotices`, `placeErrors` |
| `model/graphLayout.test.ts` | per fixture: a node per stage, no overlaps, an edge per transition and per need, entry stages in layer 0, and (by sampling each path, every box including the edge's own endpoints, skipping only the samples at its ports) no edge inside a box; each label clear of the lines its rule guarantees (its own pair's curves, plus every routed lane for a self-loop or routed label) and no label backing over any line's start or arrowhead; longest-path layering; cycles; a synthetic graph with same-layer, layer-skipping and back edges, and same-layer bows clearing the row band by more than half a box; a routed edge whose runs share one gap; a transition plus needs between one pair; another pair's curve and a back-edge lane passing behind a forward label. Every `labelBox` coordinate must be finite and inside the canvas |
| `model/saveGate.test.ts` | Save enabled only for the accepted current revision; a refused rename blocks it while its stage exists |
| `model/wording.test.ts` | the live-worker sentences for a count of 1, many and unknown |
| `model/formEdits.test.ts` | each gesture's exact effect, and that every edit leaves its input unchanged |
| `model/editorModel.test.ts` | every status text and tone, the notices, the option lists |
| `model/listModel.test.ts` | group order, the empty User group, load-error groups, list error text, viewer text |
| `model/realConductor.test.ts` | skipped unless `RUN_REAL_CC=1` and `CONDUCTOR_URL`: live contract shape, every live playbook round-tripped through cc's real validator, the New playbook seed |
| `lib/route.test.ts`, `lib/api.test.ts`, `themeInit.test.ts` | routes and no hash; the exact wire format and `ApiError`s; standalone theme follows the OS, embedded does nothing |
| `components/App.test.tsx` | list skeleton then groups, list 404, selection, read-only edit route, a reloaded draft URL, Delete (confirm, DELETE, flash) and its failure, Delete file, stale detail dropped |
| `components/IdDialog.test.tsx` | notices, the Continue gate, Enter resolves the trimmed id, Escape/Cancel resolve null and return focus, initial id selected |
| `components/StageGraph.test.tsx` | nodes and edges, click/Enter/Space, no content-derived attributes |
| `components/security.test.tsx` | hostile content renders as text in the detail, list and editor |
| `components/editor/Editor.test.tsx` | (fake timers) debounce, stale verdicts, the Save gate, 422 and 500 on save, `?from=`, drift and rename warnings, the remove-stage confirm, Enter commits a rename without saving |
| `components/editor/roundTrip.test.tsx` | the UI half of the round-trip: each edit script, played by accessible name, PUTs exactly the golden body |

Fixtures:
- `tests/fixtures/cc-api/`: the list (`playbooks.json`) and one detail per listed playbook (a plugin id's `/` is `__` in the filename). `mine.json` uses every field the validator admits.
- `tests/fixtures/fakeConductor.mjs` (types: `fakeConductor.d.mts`): `startFakeConductor({validate, handle})` → `{url, calls, down, close}`; `calls` records each request's method, path, body and Content-Type. Like cc, validate refuses a non-JSON Content-Type with 400 `BODY_NOT_JSON`. `cannedValidate` mirrors cc's required-name and required-description rule (with cc's message text) and otherwise refuses only a stage named `bad`.
- `tests/fixtures/edit-scripts.json`: the edit scripts (`duplicate-mine` uses every editor gesture; `rename-mine` saves with `?from=`; `new-fresh`), as op steps naming stages by their current name. `tests/fixtures/saved/<saved id>.json`: the golden file each script must save, byte for byte.
- `tests/helpers.mjs`: `bootWithFake(t, …)` (server + fake + tmp `PROJECTS_ROOT`, torn down via `t.after`) and `rawRequest` (sends a path unnormalised, so `..` and `%2F` reach the server).
- `tests/_frontendFiles.mjs`: `sourceFiles({tests})` and `headTags(html)` for the text guards.
- `frontend/src/test/fakeApi.ts`: a `fetch` stub serving the plugin's API from the same fixtures, recording each call.

## Visual harness

`npm run harness` builds, then runs `harness/playwright/golden-path.mjs`:
- `codePlaywright.mjs` resolves the shared `code-playwright` `browser.mjs` from `$CC_PROJECTS_ROOT/.plugins/`;
- `boot.mjs` boots `server.js` with a sandboxed `PROJECTS_ROOT` via `bootServer`;
- the golden path starts the fake cc in-process and asserts as it goes: the grouped list, the relay graph, a read-only plugin playbook, the id-dialog notices, a canned error on a stage card, Save gating and refused renames, a save, the drift and rename warnings, New playbook blank then named; the `duplicate-mine` edit script saved byte-identical to its golden file; an OS light/dark flip that changes `<html>.dark` and the graph's and page's computed colours; keyboard paths (list, graph node → stage heading, dialog focus trap and return, editor Tab order); a list 500, an unreachable cc and the loading skeleton; hostile content; no console error beyond the host URLs' standalone 404s and no CSP violation; and the list, a detail and the editor at 390×844 with no horizontal overflow;
- screenshots go to `harness/playwright/screenshots/` (git-ignored);
- with `CONDUCTOR_URL` set, it uses that live cc and captures only the list and relay's detail.

`npm run harness:embedded` → `harness/playwright/embedded.mjs`, against a **scratch** cc only (it saves and deletes a playbook):

```bash
cd <cc-checkout> && CC_ISOLATED_ROOT=$(mktemp -d) PORT=<port> scripts/run-isolated.sh &
B=http://127.0.0.1:<port>
curl -XPOST $B/api/projects/external -H 'content-type: application/json' -d '{"name":"code-playbook","path":"<this checkout>"}'
curl -XPOST $B/api/plugins/rescan; curl -XPOST $B/api/plugins/code-playbook/enable; curl -XPOST $B/api/plugins/code-playbook/start
CC_URL=$B CC_SCRATCH_PROJECTS=<CC_ISOLATED_ROOT>/projects CC_PROJECTS_ROOT=<projects root with code-playwright> npm run harness:embedded
curl -XPOST $B/api/plugins/code-playbook/stop   # before stopping the scratch cc
```

It checks the host URLs answer 200 and Geist loads; inside cc's shell the frame follows cc's theme (an OS flip under "system", and cc's own `<html>` class) with the graph repainting; a duplicate saves into the scratch store's overlay dir and is deleted again; the visit adds one joint history entry and Back leaves `#plugin/code-playbook`; no CSP violation.
