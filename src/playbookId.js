// A playbook id as the path below /api/playbooks/, each `/`-separated segment
// encoded on its own (a plugin id's `/` stays a separator). null for an id
// with an empty, `.` or `..` segment: encodeURIComponent leaves dots alone, and
// URL resolution would turn them into a path outside /api/playbooks/.
// Shared by the backend's cc client and the frontend's API helper.
export function playbookIdPath(id) {
  const segs = id.split('/');
  if (segs.some((seg) => seg === '' || seg === '.' || seg === '..')) return null;
  return segs.map(encodeURIComponent).join('/');
}
