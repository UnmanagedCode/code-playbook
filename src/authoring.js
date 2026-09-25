import { httpError } from './httpError.js';
import { assertOverlayId } from './playbookStore.js';

// Save and delete of user playbooks. cc owns every rule about what a playbook
// may contain; this module only sequences the guard, cc's verdict and the write.
export function createAuthoring({ conductor, store }) {
  async function refuseReserved(ids) {
    const { takenIds } = await conductor.list();
    for (const id of ids) {
      if (takenIds.reserved.includes(id)) {
        throw httpError(409, 'PLAYBOOK_ID_RESERVED', `'${id}' is reserved: cc ignores an overlay file with this id`);
      }
    }
  }

  // Writes <id>.json once cc has validated `definition`. With `from` (a rename),
  // <from>.json is removed only after the new file is in place.
  async function save(id, definition, from) {
    assertOverlayId(id);
    const renaming = from !== undefined && from !== id;
    if (renaming) assertOverlayId(from);
    if (typeof definition !== 'object' || definition === null || definition.id !== id) {
      throw httpError(400, 'PLAYBOOK_ID_MISMATCH', `the body's id must equal the path id '${id}'`);
    }
    await refuseReserved(renaming ? [id, from] : [id]);
    const verdict = await conductor.validate(definition);
    if (!verdict.ok) {
      throw httpError(422, 'PLAYBOOK_INVALID', `code-conductor refused '${id}'`, { errors: verdict.errors });
    }
    await store.write(id, definition);
    if (renaming) await store.remove(from);
    return { ok: true, id };
  }

  async function remove(id) {
    assertOverlayId(id);
    await refuseReserved([id]);
    if (!(await store.remove(id))) {
      throw httpError(404, 'PLAYBOOK_NOT_FOUND', `no user playbook file '${id}.json'`);
    }
    return { ok: true, id };
  }

  return { save, remove };
}
