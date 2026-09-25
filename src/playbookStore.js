import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { httpError } from './httpError.js';

// cc's user overlay: every `<id>.json` here is a user playbook.
export function overlayDir(projectsRoot) {
  return path.join(projectsRoot, '.code-conductor', 'playbooks');
}

// Path safety only. Whether an id is a valid playbook slug is cc's call, made
// by its validator on the body (whose id must equal this one).
export function assertOverlayId(id) {
  const bad = typeof id !== 'string' || id === '' || id.startsWith('.') || id.includes('..')
    || /[/\\\0]/.test(id);
  if (bad) throw httpError(400, 'PLAYBOOK_ID_INVALID', `'${String(id)}' cannot name a file in the playbook overlay`);
}

export function createPlaybookStore({ projectsRoot }) {
  function fileFor(id) {
    if (!projectsRoot) throw httpError(503, 'PROJECTS_ROOT_UNSET', 'PROJECTS_ROOT is not set: there is no overlay dir to write playbooks into');
    assertOverlayId(id);
    const dir = path.resolve(overlayDir(projectsRoot));
    const file = path.resolve(dir, `${id}.json`);
    if (path.dirname(file) !== dir) throw httpError(400, 'PLAYBOOK_ID_INVALID', `'${id}' resolves outside the playbook overlay`);
    return { dir, file };
  }

  // Atomic: the temp name does not end in `.json`, so cc's loader never reads a
  // partial file, and rename replaces the target in one step.
  async function write(id, definition) {
    const { dir, file } = fileFor(id);
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.${id}.json.${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`);
    try {
      const fh = await fs.open(tmp, 'wx');
      try {
        await fh.writeFile(JSON.stringify(definition, null, 2) + '\n');
        await fh.sync();
      } finally {
        await fh.close();
      }
      await fs.rename(tmp, file);
    } catch (e) {
      await fs.rm(tmp, { force: true });
      throw httpError(500, 'PLAYBOOK_WRITE_FAILED', `could not write ${file}: ${e.message}`);
    }
  }

  // Returns false when there was no file to remove.
  async function remove(id) {
    const { file } = fileFor(id);
    try {
      await fs.unlink(file);
      return true;
    } catch (e) {
      if (e.code === 'ENOENT') return false;
      throw httpError(500, 'PLAYBOOK_DELETE_FAILED', `could not remove ${file}: ${e.message}`);
    }
  }

  return { write, remove };
}
