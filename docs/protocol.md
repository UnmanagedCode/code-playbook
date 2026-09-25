# Protocol

## REST (this backend, under `/api`)

The frontend calls only these, by relative path (`api/…`), so it works standalone and under cc's `/plugins/code-playbook/` mount.

| Route | Behaviour |
|---|---|
| `GET /api/health` | `{ok:true}` |
| `GET /api/playbooks` | cc's `GET /api/playbooks`, status and body verbatim |
| `GET /api/playbooks/<id>` | cc's detail, verbatim. `<id>` may be raw (`acme/release`) or encoded (`acme%2Frelease`); it is forwarded segment-encoded |
| `POST /api/playbooks/validate` | cc's validate: the request must be `Content-Type: application/json`; its parsed body is re-sent to cc as JSON, and cc's status and answer come back verbatim |
| `PUT /api/playbooks/<id>[?from=<old>]` | save, below |
| `DELETE /api/playbooks/<id>` | delete, below |

Errors are `{error, code}` (plus `errors` for `PLAYBOOK_INVALID`):

| Status | `code` | When |
|---|---|---|
| 400 | `PLAYBOOK_ID_INVALID` | `<id>` or `from` is empty, contains `/`, `\`, NUL or `..`, starts with `.`, or resolves outside the overlay dir |
| 400 | `PLAYBOOK_ID_MISMATCH` | the body isn't an object, or its `id` ≠ `<id>` |
| 400 | `BODY_INVALID` | the body is labelled JSON but doesn't parse |
| 400 | `BODY_NOT_JSON` | validate or save sent without `Content-Type: application/json` (cc refuses validate the same way); nothing reaches cc |
| 400 | `PATH_INVALID` | the path holds a malformed percent-encoding (e.g. `%c0%ae`) |
| 404 | `PLAYBOOK_NOT_FOUND` | delete: no `<id>.json` (always the case for a built-in or plugin id) |
| 409 | `PLAYBOOK_ID_RESERVED` | `<id>` (or `from`) is in cc's `takenIds.reserved` |
| 422 | `PLAYBOOK_INVALID` | cc's validate answered `ok:false`; `errors` is cc's located list, verbatim |
| 500 | `PLAYBOOK_WRITE_FAILED` / `PLAYBOOK_DELETE_FAILED` | the filesystem operation failed |
| 502 | `CONDUCTOR_UNREACHABLE` | cc didn't answer (connection refused or the client timeout in `src/conductorClient.js`) |
| 502 | `CONDUCTOR_BAD_RESPONSE` | save/delete: cc's list or validate answered other than 200 JSON |
| 503 | `CONDUCTOR_URL_UNSET` | `CONDUCTOR_URL` absent (every cc-backed route) |
| 503 | `PROJECTS_ROOT_UNSET` | `PROJECTS_ROOT` absent (writes and deletes) |
| 500 | `INTERNAL` | anything unexpected; the error itself is logged by the backend, never sent |

Every error, including one raised before a route runs, leaves as this JSON (`jsonErrorHandler` in `src/errorHandler.js`, installed on the API router and the app); express's HTML error page, which carries a stack, is never sent. An unknown non-API path gets express's plain "Cannot GET" 404.

The id guard is a path-safety check only. Whether an id is a valid playbook slug is decided by cc's validator on the body.

### Save sequence (`PUT`)

1. Id guard on `<id>`, and on `from` when it differs from `<id>`.
2. `body.id === <id>`, else 400.
3. cc `GET /api/playbooks`: `<id>` or `from` in `takenIds.reserved` → 409.
4. cc `POST /api/playbooks/validate` with the body: `ok:false` → 422.
5. `mkdir -p` the overlay dir, then the atomic write (below).
6. With `from` ≠ `<id>`: unlink `<from>.json` (already gone is fine). This runs only after step 5 succeeded.

Answer: `{ok:true, id}`. Nothing is written on any refusal, or when cc can't be asked.

### Delete sequence (`DELETE`)

1. Id guard. 2. Reserved check against cc's `takenIds.reserved` (so cc's `custom.json` catalog store is never touched). 3. Unlink `<id>.json`; missing → 404.

Answer: `{ok:true, id}`.

## On disk

- Target: `$PROJECTS_ROOT/.code-conductor/playbooks/<id>.json`, pretty-printed JSON plus a trailing newline: the definition exactly as the editor sent it.
- Atomic write: `.<id>.json.<pid>-<random hex>.tmp` in the same dir, fsynced, then renamed onto `<id>.json`. The temp name doesn't end in `.json`, so cc's loader never reads a partial file. On failure the temp file is removed.
- cc reads the overlay on every load, so a save takes effect with no restart.

## cc routes consumed

`GET /api/playbooks`, `GET /api/playbooks/:id`, `POST /api/playbooks/validate`. Their shapes (`source`, `editable`, `takenIds`, `governableTools[].pinArgs`, `liveWorkers`, located `errors`, the `via` rule) are defined in cc's `docs/protocol.md`, subsection **REST — /api/playbooks**. `tests/contractShape.mjs` holds the key sets this plugin relies on.

## Detail → definition

The editor's saved definition is the detail with:
- `spawnable` dropped from every stage;
- each transition's `via` written as `on`, or dropped when it is `send_prompt`;
- `source`, `editable` and `liveWorkers` dropped;
- empty stage and transition descriptions omitted.

cc's defaults (`position:[anchor]`, `liveness:"live"`, `workers:"one"`) stay explicit; cc treats them as identical to an omitted key.

## Frontend routes

Query parameters on the page URL (mirrored into cc's URL by `/pluginBridge.js`):

| Param | Screen |
|---|---|
| none | list + welcome |
| `playbook=<id>` | detail |
| `edit=<id>` | editor for a user playbook |
| `draft=1` | the in-memory draft from Duplicate / New playbook |
