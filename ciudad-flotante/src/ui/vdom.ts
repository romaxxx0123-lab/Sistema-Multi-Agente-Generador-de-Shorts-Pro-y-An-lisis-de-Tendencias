/**
 * Mini DOM virtual para la interfaz.
 *
 * Los paneles se describen con funciones puras que devuelven árboles de `VNode` (`h(...)`) y se
 * vuelven a pintar varias veces por segundo con datos vivos de la simulación. `patch` reconcilia
 * el DOM real con el árbol nuevo tocando solo lo que cambia: así se conservan el hover, el foco,
 * el desplazamiento de las listas y las transiciones CSS entre repintados.
 *
 * Props especiales:
 *  - `key`: identidad estable entre repintados (listas que cambian de orden o de longitud).
 *  - `class`: cadena de clases. `style`: cadena CSS o un objeto { propiedad: valor }.
 *  - `html`: contenido HTML crudo (iconos SVG). Si está presente, se ignoran los hijos.
 *  - `on<evento>`: manejadores (onclick, onmousedown, oncontextmenu…); se reasignan en cada repintado.
 *  - `value`, `checked`, `disabled`, `selected`: se aplican como propiedades del elemento.
 *  - Cualquier otra prop se aplica como atributo (`data-*`, `title`, `aria-*`…). `false`/`null`
 *    lo quitan; `true` pone el atributo vacío.
 */

export type Props = Record<string, unknown>;
export type VChild = VNode | string;
export type VInput = VChild | number | null | undefined | false | VInput[];

export interface VNode {
  tag: string;
  props: Props;
  children: VChild[];
  key: string | number | undefined;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'selected']);

interface ElState {
  props: Props;
  key: string | number | undefined;
  html: string | undefined;
}

const STATE = new WeakMap<Node, ElState>();

function flatten(input: VInput, out: VChild[]): void {
  if (input === null || input === undefined || input === false) return;
  if (Array.isArray(input)) {
    for (const c of input) flatten(c, out);
    return;
  }
  if (typeof input === 'number') {
    out.push(String(input));
    return;
  }
  out.push(input);
}

/** Crea un nodo virtual. */
export function h(tag: string, props?: Props | null, ...children: VInput[]): VNode {
  const kids: VChild[] = [];
  flatten(children, kids);
  const p = props ?? {};
  const key = p['key'] as string | number | undefined;
  return { tag, props: p, children: kids, key };
}

/** Une clases condicionales: cx('a', cond && 'b'). */
export function cx(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/* Creación                                                            */
/* ------------------------------------------------------------------ */

function create(v: VChild, svg: boolean): Node {
  if (typeof v === 'string') return document.createTextNode(v);
  const isSvg = svg || v.tag === 'svg';
  const el = isSvg ? document.createElementNS(SVG_NS, v.tag) : document.createElement(v.tag);
  const st: ElState = { props: {}, key: v.key, html: undefined };
  STATE.set(el, st);
  applyProps(el as HTMLElement, st, v.props, isSvg);
  if (typeof v.props['html'] === 'string') {
    el.innerHTML = v.props['html'] as string;
    st.html = v.props['html'] as string;
  } else {
    const childSvg = isSvg && v.tag !== 'foreignObject';
    for (const c of v.children) el.appendChild(create(c, childSvg));
  }
  return el;
}

function applyProps(el: HTMLElement, st: ElState, next: Props, svg: boolean): void {
  const prev = st.props;
  for (const k of Object.keys(prev)) {
    if (k in next || k === 'key' || k === 'html') continue;
    if (k.startsWith('on')) (el as unknown as Record<string, unknown>)[k] = null;
    else if (k === 'class') svg ? el.removeAttribute('class') : (el.className = '');
    else if (k === 'style') el.removeAttribute('style');
    else if (PROP_KEYS.has(k)) (el as unknown as Record<string, unknown>)[k] = k === 'value' ? '' : false;
    else el.removeAttribute(k);
  }
  for (const k of Object.keys(next)) {
    if (k === 'key' || k === 'html') continue;
    const v = next[k];
    if (k.startsWith('on')) {
      (el as unknown as Record<string, unknown>)[k] = typeof v === 'function' ? v : null;
      continue;
    }
    if (prev[k] === v && k !== 'value' && k !== 'checked') continue;
    if (k === 'class') {
      const c = (v as string | undefined) ?? '';
      if (svg) el.setAttribute('class', c);
      else if (el.className !== c) el.className = c;
    } else if (k === 'style') {
      if (typeof v === 'string') {
        if (el.getAttribute('style') !== v) el.setAttribute('style', v);
      } else if (v && typeof v === 'object') {
        const obj = v as Record<string, string | number | null>;
        const old = (prev[k] && typeof prev[k] === 'object' ? prev[k] : {}) as Record<string, unknown>;
        for (const name of Object.keys(old)) if (!(name in obj)) el.style.removeProperty(name);
        for (const [name, val] of Object.entries(obj)) {
          if (val === null || val === undefined) el.style.removeProperty(name);
          else el.style.setProperty(name, String(val));
        }
      } else el.removeAttribute('style');
    } else if (PROP_KEYS.has(k)) {
      const rec = el as unknown as Record<string, unknown>;
      if (k === 'value') {
        const s = v === null || v === undefined ? '' : String(v);
        if (rec[k] !== s) rec[k] = s;
      } else if (rec[k] !== !!v) rec[k] = !!v;
    } else if (v === false || v === null || v === undefined) el.removeAttribute(k);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  st.props = next;
}

/* ------------------------------------------------------------------ */
/* Reconciliación                                                      */
/* ------------------------------------------------------------------ */

function sameKind(node: Node, v: VChild): boolean {
  if (typeof v === 'string') return node.nodeType === 3;
  if (node.nodeType !== 1) return false;
  const st = STATE.get(node);
  if (!st || st.key !== v.key) return false;
  return (node as Element).localName === v.tag;
}

function patchNode(node: Node, v: VChild, svg: boolean): Node {
  if (typeof v === 'string') {
    if (node.nodeValue !== v) node.nodeValue = v;
    return node;
  }
  const el = node as HTMLElement;
  const st = STATE.get(el)!;
  const isSvg = svg || v.tag === 'svg';
  applyProps(el, st, v.props, isSvg);
  const html = v.props['html'];
  if (typeof html === 'string') {
    if (st.html !== html) {
      el.innerHTML = html;
      st.html = html;
    }
    return el;
  }
  if (st.html !== undefined) {
    el.innerHTML = '';
    st.html = undefined;
  }
  patchChildren(el, v.children, isSvg && v.tag !== 'foreignObject');
  return el;
}

/** Reconcilia los hijos de `parent` con la lista virtual `children`. */
export function patchChildren(parent: Element, children: VChild[], svg = false): void {
  const existing = Array.from(parent.childNodes);
  // Índice por clave de los nodos existentes con clave.
  const keyed = new Map<string | number, Node>();
  for (const n of existing) {
    const st = STATE.get(n);
    if (st && st.key !== undefined) keyed.set(st.key, n);
  }
  const used = new Set<Node>();
  let cursor = 0;
  for (let i = 0; i < children.length; i++) {
    const v = children[i]!;
    let match: Node | undefined;
    if (typeof v !== 'string' && v.key !== undefined) {
      const k = keyed.get(v.key);
      if (k && !used.has(k) && sameKind(k, v)) match = k;
    } else {
      // Sin clave: el siguiente nodo existente sin clave y del mismo tipo.
      while (cursor < existing.length) {
        const cand = existing[cursor]!;
        const st = STATE.get(cand);
        if (used.has(cand) || (st && st.key !== undefined)) {
          cursor++;
          continue;
        }
        break;
      }
      const cand = existing[cursor];
      if (cand && sameKind(cand, v)) {
        match = cand;
        cursor++;
      }
    }
    let node: Node;
    if (match) {
      used.add(match);
      node = patchNode(match, v, svg);
    } else node = create(v, svg);
    const at = parent.childNodes[i];
    if (at !== node) parent.insertBefore(node, at ?? null);
  }
  // Quitar lo que sobra.
  while (parent.childNodes.length > children.length) parent.removeChild(parent.lastChild!);
}

/** Pinta `tree` (uno o varios nodos) dentro de `container`. */
export function patch(container: Element, tree: VInput): void {
  const kids: VChild[] = [];
  flatten(tree, kids);
  patchChildren(container, kids, container.namespaceURI === SVG_NS);
}

/** Crea un elemento real a partir de un nodo virtual (para piezas sueltas: fantasma de arrastre). */
export function render(v: VNode): HTMLElement {
  return create(v, v.tag === 'svg') as HTMLElement;
}
