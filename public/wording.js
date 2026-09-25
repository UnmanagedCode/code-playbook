// The live-worker sentences of the editor's warnings and the delete confirm.
// Pure. `live` is cc's liveWorkers: a count, or null when cc could not read it.

const workers = (n) => `${n} live worker${n === 1 ? '' : 's'}`;
const unknown = (id) => `Any live workers bound to '${id}' (cc could not count them)`;
const lose = (id, live) => (live === null
  ? `${unknown(id)} will lose their playbook (PLAYBOOK_UNKNOWN).`
  : `${workers(live)} bound to '${id}' will lose ${live === 1 ? 'its' : 'their'} playbook (PLAYBOOK_UNKNOWN).`);

export function driftWarning(id, live) {
  const who = live === null
    ? `An unknown number of live workers may be bound to '${id}'.`
    : `${workers(live)} ${live === 1 ? 'is' : 'are'} bound to '${id}'.`;
  return `${who} Definitions aren't pinned to a run: saving applies to their next governed call, and a stage removed or renamed under a worker refuses it STAGE_UNKNOWN.`;
}

export function renameWarning(fromId, toId, live) {
  const head = `Saving under '${toId}' removes ${fromId}.json.`;
  return live === 0 ? head : `${head} ${lose(fromId, live)}`;
}

export function deleteConfirm(id, { builtin, live }) {
  const lines = [`Delete ${id}.json?`];
  if (builtin) lines.push(`This restores the shipped '${id}' definition.`);
  if (live !== 0) {
    lines.push(builtin
      ? `${live === null ? unknown(id) : `${workers(live)} bound to '${id}'`} will continue under the shipped definition.`
      : lose(id, live));
  }
  return lines.join('\n\n');
}
