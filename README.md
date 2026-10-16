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

- **Backend:** Node (the version range in `package.json`'s `engines`) with `express` as the only runtime dependency.
- **Frontend:** React + Vite + Tailwind v4 + cc's shadcn/Radix components + lucide icons, all devDependencies, built into `frontend/dist/` by `npm install` (the `prepare` script). It meets the host contract and security practices of cc's `docs/plugin-ui.md` (Parts 1 and 2) and follows its reference setup (Part 3): it follows cc's light/dark theme live, uses only relative URLs, and renders all content as text under a CSP.

```
conductor.plugin.json   cc plugin manifest (backend + frontend "Code Playbook")
server.js               entry: wires the modules, serves frontend/dist, listens on $PORT
src/                    backend: cc client, overlay store, save/delete, HTTP routes,
                        static.js (UI serving) and securityHeaders.js (CSP + nosniff)
frontend/               UI source: index.html, src/ (App, components, lib, pure model/), public/theme-init.js
tests/                  node:test suites, a fake cc, contract fixtures, edit scripts with golden saved files
harness/playwright/     golden path over the fake cc; embedded check on a scratch cc
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
1. Run `npm install` in the checkout. It installs `express` (cc starts the backend with `npm start`) and builds the UI into `frontend/dist/`.
2. **Settings → Plugins → Rescan**. A new plugin project is undiscovered until a Rescan. If the main checkout has no manifest yet, the first valid manifest among its worktrees is used, and enabling defaults to that worktree.
3. **Enable** the Code Playbook row, then open the **Code Playbook** tab.

## Run standalone

```bash
npm install                                                         # also builds the UI
CONDUCTOR_URL=http://127.0.0.1:<cc-port> PROJECTS_ROOT=/path/to/projects npm start
npm run dev                                                         # Vite dev server, API proxied to 127.0.0.1:7310 (or $PLUGIN_BACKEND)
```

Without a build (`frontend/dist/index.html` missing) the backend still starts, logs the missing file, and answers `/` with a plain-text 503 saying to run `npm install`; the API keeps working.

| Env | Meaning | When absent |
|---|---|---|
| `PORT` | listen port | `DEFAULT_PORT` in `server.js` |
| `CONDUCTOR_URL` | cc base URL, read from and validated against | cc-backed routes answer `503 CONDUCTOR_URL_UNSET` |
| `PROJECTS_ROOT` | cc's projects root; files go to `$PROJECTS_ROOT/.code-conductor/playbooks/` | writes answer `503 PROJECTS_ROOT_UNSET` |
| `HOST` | listen address; set it only for standalone use. The API that writes and deletes playbook files has no authentication, so a non-loopback address exposes it to that network | `127.0.0.1` |

cc sets `PORT`, `CONDUCTOR_URL` and `PROJECTS_ROOT` when it starts the plugin.

## Test

```bash
npm test                                                                  # node:test suites, then tsc, then vitest — offline, against the fake cc
RUN_REAL_CC=1 CONDUCTOR_URL=http://127.0.0.1:<cc-port> npm run test:web   # adds the live-cc contract + validator checks
npm run harness                                                           # builds, then the golden path; screenshots in harness/playwright/screenshots/
CC_URL=http://127.0.0.1:<scratch-port> npm run harness:embedded           # inside a scratch cc's shell, started from a separate cc clone (setup: docs/architecture.md → Visual harness)
```

Both harnesses need `CC_PROJECTS_ROOT` pointing at a projects root with the `code-playwright` plugin installed. Run the embedded one only against a scratch cc: it saves and deletes a playbook.

## Known limitations

- Needs a cc that serves `/api/playbooks`. An older cc answers 404, and the tab says to restart code-conductor.
- Built-in and plugin playbooks are read-only here. Duplicate one, or save a user playbook under a built-in's id to override it.
- No raw-JSON editor.
- The harness's fake cc serves a static list, so a playbook saved in the harness does not appear in its list.
- The UI is built by `npm install`. A cc started with `NODE_ENV=production` or `npm_config_omit=dev` makes the Library hook skip the devDependencies, the build fails, and the tab shows the unbuilt 503.
- Needs the Node version in `package.json`'s `engines` (Vite 8 and Vitest require it).
- Follows cc's (or, standalone, the OS's) light/dark theme; it has no theme toggle of its own.

More: [docs/protocol.md](docs/protocol.md) (REST surface and on-disk format) · [docs/architecture.md](docs/architecture.md) (modules, tests, harness).

## License

AGPL-3.0-or-later. Copyright (c) 2026 UnmanagedCode. See [LICENSE](LICENSE).
