# code-playbook

A code-conductor (cc) plugin that adds a **Code Playbook** tab: view every playbook cc runs conductors under, and author your own in a structured form editor.

A playbook is a stage graph that decides which tools a conductor may call on a worker at each stage. cc ships built-in playbooks, plugins can contribute more, and users add their own as JSON files in cc's overlay dir. This plugin makes those files something you edit in a form rather than by hand.

## What it does

- **Viewer**: every playbook, grouped as built-in, user and `plugin:<id>`, with a stage graph, per-stage needs, workers and tool policies, and cc's load errors.
- **Editor** (user playbooks only): stages, entry stages, needs, tool policies with pins, and transitions. Every change is validated by cc, and Save is enabled only for a revision cc accepted.
- **Duplicate** any playbook, or start a **New playbook** from the User group.
- **Delete** a user playbook. Deleting a user file that overrides a built-in restores the shipped definition. Files cc could not load can be deleted from the load-errors panel.

Details of every screen, warning and notice: [docs/features.md](docs/features.md).

## Stack and layout

Node (the version range in `package.json`'s `engines`), `express` as the only runtime dependency, and a dependency-free ES-module frontend (no build step).

```
conductor.plugin.json   cc plugin manifest (backend + frontend "Code Playbook")
server.js               entry: wires the modules, serves public/, listens on $PORT
src/                    backend: cc client, overlay store, save/delete, HTTP routes
public/                 frontend: viewer, graph, editor; formModel.js and graphLayout.js are pure
tests/                  node:test suites, a fake cc and contract fixtures
harness/playwright/     visual-verification golden path over the fake cc
docs/                   features, protocol, architecture
```

## Add it to code-conductor

Needs a cc that serves `/api/playbooks`. A plugin is an ordinary cc project whose checkout holds `conductor.plugin.json`; cc's own `docs/plugins.md` has the full rules. Two ways in:

**A. Through the Plugin Library** (cc clones, installs and enables it):
1. Write a library entry at `<projects root>/.code-conductor/plugins/library/code-playbook.json`:
   ```json
   {
     "id": "code-playbook",
     "name": "Code Playbook",
     "description": "View and author playbooks",
     "repo": "<clone URL>",
     "postClone": "npm install",
     "postPull": "npm install"
   }
   ```
   `repo` is a URL: `https://…` / `git://…` for a remote, or `file:///<absolute path>` for a local bare repo or git bundle. A plain path is refused.
2. **Settings → Plugins → Library → Install**. cc clones it into `<projects root>/.plugins/code-playbook`, registers it as a project, runs `postClone` and enables it.
3. Open the **Code Playbook** tab. The first request starts the backend; **Start** on its Settings → Plugins row does the same.

Later updates: **Update** on the same Library entry (`git pull --ff-only`, then `postPull`, then a restart if the plugin was running).

**B. From a project cc already has** (e.g. this repo, registered as a cc project):
1. Run `npm install` in the checkout. cc starts the backend with `npm start`, which needs `express`.
2. **Settings → Plugins → Rescan**. A new plugin project is undiscovered until a Rescan. If the main checkout has no manifest yet, the first valid manifest among its worktrees is used, and enabling defaults to that worktree.
3. **Enable** the Code Playbook row, then open the **Code Playbook** tab.

## Run standalone

```bash
npm install
CONDUCTOR_URL=http://127.0.0.1:<cc-port> PROJECTS_ROOT=/path/to/projects npm start
```

| Env | Meaning | When absent |
|---|---|---|
| `PORT` | listen port | `DEFAULT_PORT` in `server.js` |
| `CONDUCTOR_URL` | cc base URL, read from and validated against | cc-backed routes answer `503 CONDUCTOR_URL_UNSET` |
| `PROJECTS_ROOT` | cc's projects root; files go to `$PROJECTS_ROOT/.code-conductor/playbooks/` | writes answer `503 PROJECTS_ROOT_UNSET` |
| `HOST` | listen address; set it only for standalone use. The API that writes and deletes playbook files has no authentication, so a non-loopback address exposes it to that network | `127.0.0.1` |

cc sets `PORT`, `CONDUCTOR_URL` and `PROJECTS_ROOT` when it starts the plugin.

## Test

```bash
npm test                                                            # offline, against the fake cc
RUN_REAL_CC=1 CONDUCTOR_URL=http://127.0.0.1:<cc-port> npm test     # adds the live-cc contract + validator checks
npm run harness                                                     # screenshots in harness/playwright/screenshots/
```

`npm run harness` needs `CC_PROJECTS_ROOT` pointing at a projects root with the `code-playwright` plugin installed.

## Known limitations

- Needs a cc that serves `/api/playbooks`. An older cc answers 404, and the tab says to restart code-conductor.
- Built-in and plugin playbooks are read-only here. Duplicate one, or save a user playbook under a built-in's id to override it.
- No raw-JSON editor.
- The harness's fake cc serves a static list, so a playbook saved in the harness does not appear in its list.

More: [docs/protocol.md](docs/protocol.md) (REST surface and on-disk format) · [docs/architecture.md](docs/architecture.md) (modules, tests, harness).

## License

AGPL-3.0-or-later. Copyright (c) 2026 UnmanagedCode. See [LICENSE](LICENSE).
