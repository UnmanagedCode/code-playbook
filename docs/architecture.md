# Architecture

## Modules

| File | Responsibility |
|---|---|
| `server.js` | wiring only: builds the cc client, store and authoring, mounts routes, serves `public/` with cache-busted asset refs, listens on `$PORT` |
| `src/conductorClient.js` | the only module that talks to cc. `forward` answers `{status, body}`; `list`/`validate` throw on anything but 200 JSON. `playbookPath` segment-encodes an id |
| `src/playbookStore.js` | overlay dir I/O: `assertOverlayId` (path safety), atomic `write`, `remove` |
| `src/authoring.js` | save / delete sequencing: guard → reserved check → cc validate → store |
| `src/routes.js` | HTTP layer; thrown `httpError`s become `{error, code, …}` |
| `src/httpError.js` | the error type carrying status, code and extra body fields |
| `src/errorHandler.js` | `jsonErrorHandler`: the last error handler on the router and the app; JSON only, never a stack |
| `public/app.js` | bootstrap, routing on query params, list reloads, Duplicate/New/Delete flows |
| `public/api.js` | relative fetch helpers, each answering `{ok, status, data}` |
| `public/dom.js` | `el`/`svg`/`select` builders and `fill` (replaceChildren that skips falsy children) |
| `public/viewer.js` | list, detail and message screens |
| `public/graph.js` | SVG render of a `layoutGraph` result |
| `public/graphLayout.js` | **pure** layered layout |
| `public/formModel.js` | **pure** form state and transformations |
| `public/editor.js` | the form over `formModel`, debounced validate, notices, save |
| `public/idDialog.js` | the id prompt shared by Duplicate and New playbook |
| `public/saveGate.js` | **pure** `canSave`: when the editor's Save is enabled |
| `public/wording.js` | **pure** live-worker sentences for the drift and rename warnings and the delete confirm |

The **pure** modules touch no DOM, so the node tests import them directly. Everything under `public/` is plain ES modules with no build step.

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

## Graph layout

- Edges: transitions (labelled `via`) and needs (anchor → stage, unlabelled).
- DFS from the entry stages, then the rest in declaration order, marks cycle-closing edges `back`.
- Layer: 0 for an entry stage or a stage with no forward predecessor, else one below its deepest forward predecessor.
- Rows keep declaration order and are centred. Next-layer edges are quadratic curves through the gap between the rows (parallel ones fan out). Same-layer edges bow above the row (the top padding grows by `SAME_ROW_BOW` when there are any). Back and layer-skipping edges are polylines: gap below the source, a lane right of every box, gap above the target. Lanes start right of every self-loop label and each starts right of the previous routed edge's label (widths from `CHAR_W`); a routed label sits level with a row centre, where no horizontal run passes, or midway between its own runs when they share one gap. A next-layer label sits right of the rightmost point any curve of the same pair reaches within the label's height. `graph.js` paints labels after every path, on an opaque `label-bg` rect sized from `labelBox`. Every labelled edge carries a `labelBox`. Self-loops are arcs on the node's right.

## Tests

`npm test` runs `tests/run.mjs` (the `node:test` API, every `tests/*.test.mjs`).

| File | Covers |
|---|---|
| `formModel.test.mjs` | lossless round-trip over every fixture, the via and description rules, deny vs undeclared, entry order, pin JSON, rename/remove cascades (and a blank rename refused), duplicate, the New playbook seed (refused blank, accepted once named), `idNotices`, `placeErrors` |
| `graphLayout.test.mjs` | per fixture: a node per stage, no overlaps, an edge per transition and per need, entry stages in layer 0, and (by sampling each path, every box including the edge's own endpoints, skipping only the samples at its ports) no edge inside a box; each label clear of the lines its rule guarantees (its own pair's curves, plus every routed lane for a self-loop or routed label) and no label backing over any line's start or arrowhead; longest-path layering; cycles; a synthetic graph with same-layer, layer-skipping and back edges, and same-layer bows clearing the row band by more than half a box; a routed edge whose runs share one gap; a transition plus needs between one pair; another pair's curve and a back-edge lane passing behind a forward label. Every `labelBox` coordinate must be finite and inside the canvas |
| `authoring.test.mjs` | save target, the draft sent to cc as JSON, validate-before-write, unreachable cc, id mismatch, the path guard, cc judging path-safe ids, reserved ids, atomic write, rename ordering, delete scope, `PROJECTS_ROOT` unset |
| `routes.test.mjs` | verbatim forwarding (incl. slash ids and cc 404s), dot/empty-segment detail ids refused with no request to cc, the cc client's own path guard with a JSON Content-Type to cc, `BODY_NOT_JSON`, `PATH_INVALID` without a stack, the generic 500, `CONDUCTOR_URL` unset or malformed, unreachable cc, bad JSON |
| `saveGate.test.mjs` | Save enabled only for the accepted current revision; a refused rename blocks it while its stage exists |
| `wording.test.mjs` | the live-worker sentences for a count of 1, many and unknown |
| `static.test.mjs` | frontend served, relative refs, absolute bridge tag |
| `frontend-styles.test.mjs` | `public/styles.css` is dark-only; `:root` declares code-conductor's shell token names and every `var(--…)` used; colours outside `:root` are tokens, tints of `--accent`/`--green`/`--amber`/`--red`/black, or the host's own literals (`HOST_LITERALS`); controls carry the host radius and the primary, disabled and danger button looks; `index.html`'s `theme-color` equals `--bg`; `:root` values equal the host's `:root` (skipped unless `$CC_PROJECTS_ROOT/code-conductor/public/styles.css` exists) |
| `pluginManifest.test.mjs` | manifest fields cc relies on |
| `fixtures.test.mjs` | the fixtures match `tests/contractShape.mjs` |
| `real-conductor.test.mjs` | skipped unless `RUN_REAL_CC=1` and `CONDUCTOR_URL`: live contract shape, every live playbook round-tripped through cc's real validator, the New playbook seed |

Fixtures:
- `tests/fixtures/cc-api/`: the list (`playbooks.json`) and one detail per listed playbook (a plugin id's `/` is `__` in the filename). `mine.json` uses every field the validator admits.
- `tests/fixtures/fakeConductor.mjs`: `startFakeConductor({validate, handle})` → `{url, calls, down, close}`; `calls` records each request's method, path, body and Content-Type. Like cc, validate refuses a non-JSON Content-Type with 400 `BODY_NOT_JSON`. `cannedValidate` mirrors cc's required-name and required-description rule (with cc's message text) and otherwise refuses only a stage named `bad`.
- `tests/helpers.mjs`: `bootWithFake(t, …)` (server + fake + tmp `PROJECTS_ROOT`, torn down via `t.after`) and `rawRequest` (sends a path unnormalised, so `..` and `%2F` reach the server).

## Visual harness

`npm run harness` → `harness/playwright/golden-path.mjs`:
- `codePlaywright.mjs` resolves the shared `code-playwright` `browser.mjs` from `$CC_PROJECTS_ROOT/.plugins/`;
- `boot.mjs` boots `server.js` with a sandboxed `PROJECTS_ROOT` via `bootServer`;
- the golden path starts the fake cc in-process and asserts as it goes: the grouped list, the relay graph, a read-only plugin playbook, the id-dialog notices, a canned error on a stage card, Save gating, the saved file's bytes, the drift and rename warnings, and New playbook both blank (name/description errors, Save disabled) and named. It then repeats the list, a detail and the editor at a mobile width;
- screenshots go to `harness/playwright/screenshots/` (git-ignored);
- with `CONDUCTOR_URL` set, it uses that live cc and captures only the list and relay's detail.
