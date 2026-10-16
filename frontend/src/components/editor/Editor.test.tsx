// The editor's state machine: debounced validation, stale verdicts dropped, the Save gate, save failures
// placed or shown, the drift and rename warnings, the remove-stage confirm, and Enter never saving.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from './Editor';
import { fakeApi, fixtures, json } from '@/test/fakeApi';
import { formFromDetail, newPlaybookForm } from '@/model/formModel';

// Fake timers only: no wall clock. Testing Library drains its act() with a setTimeout(0), which it advances
// itself only when it sees jest's fake-timer API, so that API is shimmed onto vitest's.
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const settle = () => act(() => vi.advanceTimersByTimeAsync(350));
const status = () => screen.getByRole('status').textContent;
const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
const stage = (name: string) => screen.getByRole('region', { name: `Stage ${name}` });

function renderEditor(over: Partial<React.ComponentProps<typeof Editor>> = {}) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(<Editor mode="edit" form={formFromDetail(fixtures.details.mine)} title="Edit mine" originalId="mine" originalLive={2}
    list={fixtures.list} onSaved={onSaved} onCancel={onCancel} {...over} />);
  return { onSaved, onCancel };
}
const validates = (calls: { url: string }[]) => calls.filter((c) => c.url === 'api/playbooks/validate').length;

// Invariant: one validate per burst of edits, VALIDATE_DEBOUNCE_MS after the last; the status moves Validating… → Valid.
test('validation is debounced per burst', async () => {
  const { calls } = fakeApi();
  renderEditor();
  expect(status()).toBe('Validating…');
  await settle();
  expect(validates(calls)).toBe(1);
  expect(status()).toBe('Valid — ready to save');
  expect(saveButton().disabled).toBe(false);
  const u = user();
  await u.type(screen.getByRole('textbox', { name: 'Name' }), 'abc');
  expect(status()).toBe('Validating…');
  expect(saveButton().disabled).toBe(true);
  await settle();
  expect(validates(calls)).toBe(2);
  expect(JSON.parse(calls.at(-1)!.body!).name).toBe(`${fixtures.details.mine.name}abc`);
});

// Invariant: a verdict for an older revision never lands: the newer revision owns the status.
test('an older revision\'s verdict is dropped', async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((r) => { releaseFirst = r; });
  let n = 0;
  fakeApi({ handle: async (m, url) => {
    if (url !== 'api/playbooks/validate') return undefined;
    n++;
    if (n === 2) { await firstGate; return json({ ok: false, errors: [{ message: 'stale verdict', stage: null, transition: null }] }); }
    return undefined;
  } });
  renderEditor();
  await settle();
  const u = user();
  await u.type(screen.getByRole('textbox', { name: 'Name' }), 'x');
  await settle(); // validate #2 is in flight, held
  await u.type(screen.getByRole('textbox', { name: 'Name' }), 'y');
  await settle(); // validate #3 answers ok
  expect(status()).toBe('Valid — ready to save');
  await act(async () => releaseFirst());
  expect(status()).toBe('Valid — ready to save');
  expect(screen.queryByText('stale verdict')).toBeNull();
});

// Invariant: Save is enabled only for a revision cc accepted, with no local error, refused rename or blocked id.
test('the Save gate', async () => {
  fakeApi();
  renderEditor();
  await settle();
  const u = user();
  expect(saveButton().disabled).toBe(false);

  // cc refuses a stage named `bad`; the error lands on that card.
  const name = within(stage('hold')).getByRole('textbox', { name: 'Stage name' });
  await u.clear(name);
  await u.type(name, 'bad');
  await u.tab();
  await settle();
  expect(status()).toBe('1 error from cc');
  expect(within(stage('bad')).getByText("stage 'bad': refused by the fake conductor")).toBeTruthy();
  expect(saveButton().disabled).toBe(true);

  // A refused rename (blank, then a taken name) blocks Save and is shown on the card.
  for (const [typed, why] of [[' ', 'a stage name cannot be empty'], ['draft', "a stage named 'draft' already exists"]]) {
    await u.clear(name);
    await u.type(name, typed);
    await u.tab();
    expect(within(stage('bad')).getByText(why)).toBeTruthy();
    expect(status()).toBe('1 stage rename refused');
    expect(saveButton().disabled).toBe(true);
  }
  await u.clear(name);
  await u.type(name, 'hold');
  await u.tab();
  await settle();
  expect(saveButton().disabled).toBe(false);

  // Unparseable pin JSON is a local error.
  const pin = within(stage('build')).getAllByRole('textbox', { name: 'Pin value (JSON)' })[0];
  await u.clear(pin);
  await u.type(pin, 'not json');
  await settle();
  expect(status()).toBe('1 local error');
  expect(saveButton().disabled).toBe(true);
  await u.clear(pin);
  await u.type(pin, '"plan"');
  await settle();
  expect(saveButton().disabled).toBe(false);

  // A reserved id is blocked even though cc accepts the definition.
  const id = screen.getByRole('textbox', { name: 'Id' });
  await u.clear(id);
  await u.type(id, 'custom');
  await settle();
  expect(status()).toBe('Valid, but the id is blocked');
  expect(screen.getByText("'custom' is reserved: cc ignores an overlay file with this id.")).toBeTruthy();
  expect(saveButton().disabled).toBe(true);
});

// Invariant: a 422 from save places cc's located errors on the form, like a validate refusal.
test('a 422 on save places its errors on the stage card', async () => {
  fakeApi({ handle: (m) => (m === 'PUT' ? json({ error: 'refused', code: 'PLAYBOOK_INVALID', errors: [{ message: 'hold: no way in', stage: 'hold', transition: null }] }, 422) : undefined) });
  const { onSaved } = renderEditor();
  await settle();
  await user().click(saveButton());
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(within(stage('hold')).getByText('hold: no way in')).toBeTruthy();
  expect(status()).toBe('1 error from cc');
  expect(onSaved).not.toHaveBeenCalled();
});

// Invariant: any other save failure is shown as the backend's error, and the form stays as it was.
test('a 500 on save shows the error', async () => {
  fakeApi({ handle: (m) => (m === 'PUT' ? json({ error: 'could not write the file', code: 'PLAYBOOK_WRITE_FAILED' }, 500) : undefined) });
  const { onSaved } = renderEditor();
  await settle();
  await user().click(saveButton());
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(screen.getByText('could not write the file')).toBeTruthy();
  expect(onSaved).not.toHaveBeenCalled();
  expect(saveButton().disabled).toBe(false);
});

// Invariant: a successful save reports the saved id, PUT with ?from= in edit mode only when the id changed.
test('save PUTs the definition and reports the id', async () => {
  const { calls } = fakeApi();
  const { onSaved } = renderEditor();
  await settle();
  const u = user();
  const id = screen.getByRole('textbox', { name: 'Id' });
  await u.clear(id);
  await u.type(id, 'mine-2');
  await settle();
  await u.click(saveButton());
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(calls.filter((c) => c.method === 'PUT').map((c) => c.url)).toEqual(['api/playbooks/mine-2?from=mine']);
  expect(onSaved).toHaveBeenCalledWith('mine-2');
});

// Invariant: naming a loaded playbook looks up its live workers after the debounce, then warns of drift.
test('the drift warning follows the target lookup', async () => {
  const { calls } = fakeApi();
  renderEditor({ mode: 'draft', form: newPlaybookForm('fresh'), originalId: null, originalLive: 0, title: 'New playbook' });
  await settle();
  const u = user();
  const id = screen.getByRole('textbox', { name: 'Id' });
  await u.clear(id);
  await u.type(id, 'mine');
  expect(screen.queryByText(/live workers are bound to 'mine'/)).toBeNull();
  await settle();
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(calls.some((c) => c.method === 'GET' && c.url === 'api/playbooks/mine')).toBe(true);
  expect(screen.getByText(/^2 live workers are bound to 'mine'\./)).toBeTruthy();
  expect(screen.getByText("'mine' overwrites the existing user playbook 'mine'.")).toBeTruthy();
});

// Invariant: in edit mode the original's drift shows at once, and a changed id warns what the rename removes.
test('drift and rename warnings in edit mode', async () => {
  fakeApi();
  renderEditor();
  await settle();
  expect(screen.getByText(/^2 live workers are bound to 'mine'\./)).toBeTruthy();
  const u = user();
  const id = screen.getByRole('textbox', { name: 'Id' });
  await u.clear(id);
  await u.type(id, 'mine-2');
  await settle();
  expect(screen.getByText("Saving under 'mine-2' removes mine.json. 2 live workers bound to 'mine' will lose their playbook (PLAYBOOK_UNKNOWN).")).toBeTruthy();
});

// Invariant: Remove stage asks first and lists everything that goes with the stage; confirming removes it.
test('the remove-stage dialog lists the impact', async () => {
  fakeApi();
  renderEditor();
  await settle();
  const u = user();
  await u.click(within(stage('draft')).getByRole('button', { name: 'Remove stage' }));
  const dialog = await screen.findByRole('dialog', { name: "Remove stage 'draft'?" });
  expect(within(dialog).getByText('This also removes:')).toBeTruthy();
  expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'its entry-stage flag', "stage 'review' needs 'draft'", "stage 'build' needs 'draft'",
  ]);
  await u.click(within(dialog).getByRole('button', { name: 'Remove stage' }));
  expect(screen.queryByRole('region', { name: 'Stage draft' })).toBeNull();
});

// Invariant: Enter in a stage name commits the rename (cascading by name) and never saves.
test('Enter in a stage-name input commits the rename without saving', async () => {
  const { calls } = fakeApi();
  const { onSaved } = renderEditor();
  await settle();
  const u = user();
  const name = within(stage('build')).getByRole('textbox', { name: 'Stage name' });
  await u.clear(name);
  await u.type(name, 'make{Enter}');
  expect(stage('make')).toBeTruthy();
  expect(document.activeElement).toBe(name);
  const firstTransition = screen.getByRole('group', { name: 'Transition 1' });
  expect((within(firstTransition).getByRole('combobox', { name: 'To' }) as HTMLSelectElement).value).toBe('make');
  await settle();
  expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  expect(onSaved).not.toHaveBeenCalled();
});

// Invariant: a save failure describes the revision that failed; the next edit clears it.
test('an edit clears a previous save failure', async () => {
  fakeApi({ handle: (m) => (m === 'PUT' ? json({ error: 'could not write the file', code: 'PLAYBOOK_WRITE_FAILED' }, 500) : undefined) });
  renderEditor();
  await settle();
  const u = user();
  await u.click(saveButton());
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(screen.getByText('could not write the file')).toBeTruthy();
  await u.type(screen.getByRole('textbox', { name: 'Name' }), '!');
  expect(screen.queryByText('could not write the file')).toBeNull();
});

// Invariant: removing a stage two needs anchor on opens the confirm (listing the repeated impact line) with no
// console error (a duplicate React key would log one).
test('the remove-stage confirm lists a repeated impact line without a console error', async () => {
  fakeApi();
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const form = formFromDetail(fixtures.details.mine);
  const review = form.stages.find((s) => s.name === 'review')!;
  review.needs = [{ stage: 'draft', position: ['draft'], liveness: 'live' }, { stage: 'draft', position: ['draft'], liveness: 'any' }];
  renderEditor({ form });
  await settle();
  const u = user();
  await u.click(within(stage('draft')).getByRole('button', { name: 'Remove stage' }));
  const dialog = await screen.findByRole('dialog', { name: "Remove stage 'draft'?" });
  expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent).filter((t) => t === "stage 'review' needs 'draft'")).toHaveLength(2);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});
