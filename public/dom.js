// el(tag, props, ...children). `props` keys: `class`, `text`, `on: {event: fn}`,
// `dataset: {}`; `value`/`checked`/`disabled`/`selected` are set as
// properties; anything else becomes an attribute. Falsy children are skipped.
export function el(tag, props = {}, ...children) {
  return build(document.createElement(tag), props, children);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, props = {}, ...children) {
  return build(document.createElementNS(SVG_NS, tag), props, children);
}

const PROPS = new Set(['value', 'checked', 'disabled', 'selected']);

function build(node, props, children) {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.setAttribute('class', v);
    else if (k === 'text') node.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (PROPS.has(k)) node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function select(options, value, props = {}) {
  return el('select', props, ...options.map(([v, label]) => el('option', { value: v, selected: v === value, text: label ?? v })));
}

// replaceChildren, skipping the falsy children a conditional `a && el(…)` yields.
export function fill(node, ...children) {
  node.replaceChildren(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
}
