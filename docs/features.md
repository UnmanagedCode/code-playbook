# Features

The **Code Playbook** tab (cc nav label from `conductor.plugin.json`). Also runs standalone at the backend's own URL.

- **Theme:** embedded, the page follows cc's light/dark live (the sidebar toggle, and the OS while cc's theme is "system"); standalone, it follows the OS. There is no theme toggle of its own.
- **Loading:** the list and the main pane show skeletons until their data arrives.

## List (left column)

- Groups in this order: **Built-in** (`source: builtin`), **User** (`source: user`), then one **Plugin · `<id>`** group per `plugin:<id>` source, sorted by id. Entries are sorted by id inside each group.
- The User group is always shown and carries **New playbook**; empty, it says "No user playbooks yet."
- **Load errors**: cc's `errors`, grouped by id. An id that is in `takenIds.user` (a file in the overlay dir that cc refused) offers **Delete file**. This is the only way to remove a broken file from the GUI: cc won't load it, so there is nothing to open in the editor.
- A user file whose id is a built-in id overrides that built-in. It is listed under User and badged **overrides built-in** in its detail.
- A list that cannot be loaded shows **Cannot load playbooks** with the reason, and the main pane **Playbooks unavailable**. A cc that answers 404 to `/api/playbooks` reads "cc does not serve /api/playbooks yet — restart code-conductor."; an unreachable backend reads "the code-playbook backend is unreachable: …".
- Below Tailwind's `md` breakpoint, the list hides while a playbook, editor or draft is open, and **All playbooks** returns to it.

## Detail (`?playbook=<id>`)

- Name, id, source badge, live-worker count (`liveWorkers`; `null` shows as `unknown`), description and entry-stage chips.
- **Graph** (`frontend/src/model/graphLayout.ts`, drawn by `frontend/src/components/StageGraph.tsx` in theme colours):
  - one box per stage; an entry stage has a bold success-coloured border; a spawnable stage's name is info-coloured;
  - solid arrows are transitions, labelled with the driving tool (`via`, `send_prompt` for an edge with no `on`);
  - dashed arrows are `needs`, drawn anchor → stage. Without them, playbooks whose flow lives in `needs` (e.g. `relay`) would render as disconnected boxes;
  - an arrow to the next layer curves straight down through the gap between the two rows, its label just right of that curve and of any other curve joining the same pair;
  - an arrow between two stages of one row (it can only point into an entry stage, or be a back edge) leaves the top of one box and bows above the row into the other's top, clear of every box in the row;
  - back, upward and layer-skipping arrows leave the right quarter of the source's bottom edge, drop into the gap below its row, run right to a vertical lane beside the whole graph (one lane each, spaced so a lane never runs through the previous one's label, and all right of every self-loop label), climb or descend to the gap above their target row, and enter the right quarter of the target's top edge. Their label sits beside the lane, level with a row the lane passes, or midway between the two runs when both lie in the same gap. Every horizontal run stays inside a gap between rows, so no arrow is drawn under a box it doesn't connect;
  - a self-loop is an arc on the right of its box;
  - a label is placed clear of every curve joining its own two stages (e.g. a transition plus a `needs` between one pair) and, for a self-loop or routed label, of every routed lane. Another pair's line may pass behind a label: every label is drawn after all the arrows on a backing the colour of the panel, which keeps its text readable there, and no backing covers the start or arrowhead of any line;
  - every box is a focusable button ("Stage `<name>`"): click, Enter or Space scrolls to that stage's panel and focuses its heading (no smooth scroll under reduced motion).
- One panel per stage: entry / spawnable / workers badges, the description, `needs` as `stage · position · liveness`, and the tool table (`tool | policy | pinned arg = value`, with `*` shown as "fallback"). A stage with no tools says that every tool is allowed and `spawn_instance` is denied.
- Transitions table: `from → to`, `via`, description.
- Actions:
  - built-in and plugin: **Duplicate** only;
  - user: **Edit**, **Duplicate**, **Delete**.

## Delete

A confirm dialog (title "Delete `<id>`.json?"), then `DELETE api/playbooks/<id>`; on success the list reloads and the welcome screen reads "Deleted `<id>`.json.". A failure keeps the dialog open with "Delete failed: `<reason>`". **Delete file** in Load errors confirms "cc could not load it, so there is nothing to open in the editor." the same way. The confirm text adds:

| Condition | Line |
|---|---|
| id is in `takenIds.builtin` | "This restores the shipped '`<id>`' definition." |
| `liveWorkers` ≠ 0, override of a built-in | the workers continue under the shipped definition |
| `liveWorkers` ≠ 0, not a built-in | the workers lose their playbook (`PLAYBOOK_UNKNOWN`) |

## Duplicate and New playbook

Both open the **id dialog**, then an in-memory draft (`?draft=1`; reloading a draft URL returns to the list).

- Duplicate suggests `<slug>-copy` (the part after `/` for a plugin id) and copies everything else, name and description included.
- New playbook opens with empty name and description and one stage, `start`: an entry stage with `spawn_instance: allow`. cc refuses the empty name and description (shown under **Playbook errors**, Save disabled) until they are filled in.
- The dialog shows the id notices live (below). **Continue** is disabled for an empty or reserved id; Enter continues, Escape or Cancel closes it and focus returns to the button that opened it.

## Editor (`?edit=<id>`, or a draft)

- Fields: id, name, description.
- **Stage cards**:
  - name (applied on blur or Enter; Enter never saves; renaming rewrites every reference: entry stages, needs anchors, positions, transitions). A blank name, or one another stage holds, is refused inline, because stages are object keys. While a refusal is showing, Save is disabled and the status reads *N stage rename(s) refused*;
  - **entry stage** checkbox. Checking appends to `entryStages`, so an authored order is kept;
  - workers `one | many`;
  - **Remove stage**: a confirm dialog lists everything removed with it (entry flag, needs anchored on it, its place in other positions, touching transitions). A position list emptied that way falls back to `[anchor]`;
  - description, with the hint: "Stage descriptions reach the conductor verbatim (its role prompt when this is the preferred playbook, and describe_playbook), so editing one changes what the conductor does.";
  - needs rows: anchor, position checkboxes (every stage plus "any stage (*)"), liveness `live | retired | any`;
  - tools: the `spawn_instance` row first (`not declared | deny | allow | pin`), with the hint that a stage is spawnable only when it is declared `allow` or `pin` and `*` never confers it. Then one row per declared tool, and **add tool…** offering the undeclared names from `governableTools` plus `*`;
  - removing a need, tool, pin or transition moves focus to that section's Add control;
  - `pin` is offered only for a tool whose `pinArgs` is non-empty (never `*`). A pin row picks one of that tool's `pinArgs` and takes a JSON value (`"text"`, `true`, `3`, `null`).
- **Transitions**: from, to, via (`send_prompt (default — no on)` or any other governable tool), optional description.
- An empty stage or transition description is omitted from the saved file.

### Validation and Save

- Every change is sent to cc's validate, debounced; a response for an older revision is discarded.
- cc's errors are placed on the stage card or transition rows they name. Anything else, including an error naming a stage that no longer exists, goes to **Playbook errors**. No error is dropped.
- Pin JSON that doesn't parse is the one error found locally, placed on its stage.
- The status line next to Save reads *Saving…*, *N stage rename(s) refused*, *N local error(s)*, *Validating…*, *Valid — ready to save*, *Valid, but the id is blocked* or *N error(s) from cc*.
- **Save** (`canSave` in `frontend/src/model/saveGate.ts`) is enabled only when cc accepted the current revision, there are no local errors or refused stage renames, and the id isn't blocked. A 422 from save is placed like a validate response; any other failure is shown above the form.
- After a save, the tab opens the saved playbook, or the welcome screen when cc doesn't list it, with "Saved `<id>`.json." shown until the next navigation. **Cancel** returns to the detail (edit) or to where the draft started.

### Notices

| Notice | Kind | Rule |
|---|---|---|
| "`<id>` is reserved: cc ignores an overlay file with this id." | blocks Save | id in `takenIds.reserved` |
| "`<id>` overrides the shipped `<id>` playbook until this file is deleted." | warning | id in `takenIds.builtin` |
| "`<id>` overwrites the existing user playbook `<id>`." | warning | id in `takenIds.user` and not the id being edited |
| "N live workers are bound to `<id>`. Definitions aren't pinned to a run: saving applies to their next governed call, and a stage removed or renamed under a worker refuses it STAGE_UNKNOWN." (`null`: "An unknown number of live workers may be bound to `<id>`. …") | warning | the id names a loaded playbook whose `liveWorkers` ≠ 0 |
| "Saving under `<new>` removes `<old>`.json." plus, unless `liveWorkers` is 0, "N live workers bound to `<old>` will lose their playbook (PLAYBOOK_UNKNOWN)." (`null`: "Any live workers bound to `<old>` (cc could not count them) will …") | warning | editing, with the id changed (a rename) |

The live-worker sentences, including the delete confirm's, come from `frontend/src/model/wording.ts`.

Every other rule on ids and contents is cc's, reported through validate.
