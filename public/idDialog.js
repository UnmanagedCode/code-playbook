import { el, fill } from './dom.js';
import { idNotices } from './formModel.js';

// Asks for a new playbook id, showing the takenIds notices live as it is typed.
// Resolves to the id, or null when cancelled.
export function askId({ title, initial = '', takenIds }) {
  return new Promise((resolve) => {
    const notices = el('div', { class: 'id-notices' });
    const input = el('input', { class: 'mono', value: initial, 'aria-label': 'playbook id', placeholder: 'my-playbook' });
    const ok = el('button', { class: 'primary', type: 'submit', text: 'Continue' });
    const update = () => {
      const id = input.value.trim();
      const n = idNotices(id, takenIds, null);
      fill(notices, 
        n.block && el('div', { class: 'notice block', text: n.block }),
        ...n.warn.map((w) => el('div', { class: 'notice warn', text: w })));
      ok.disabled = id === '' || !!n.block;
    };
    const dialog = el('dialog', { class: 'id-dialog' },
      el('form', { method: 'dialog' },
        el('h3', { text: title }),
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'id' }), input,
          el('span', { class: 'hint', text: 'cc validates the id when the playbook is checked and saved.' })),
        notices,
        el('menu', {}, el('button', { type: 'button', text: 'Cancel', on: { click: () => dialog.close('') } }), ok)));
    input.addEventListener('input', update);
    dialog.addEventListener('close', () => {
      const id = dialog.returnValue === 'ok' ? input.value.trim() : null;
      dialog.remove();
      resolve(id);
    });
    ok.value = 'ok';
    document.body.append(dialog);
    update();
    dialog.showModal();
    input.select();
  });
}
