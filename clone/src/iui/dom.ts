/* Tiny DOM helpers used across the Intelligent UI runtime. */

type Attrs = Record<string, unknown> | null | undefined;

function applyAttrs(el: Element, attrs: Attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.setAttribute("class", String(v));
    else if (k === "text") el.textContent = String(v);
    else if (k === "html") el.innerHTML = String(v);
    else if (k === "style" && typeof v === "object") {
      Object.assign((el as HTMLElement).style, v);
    } else if (k === "dataset" && typeof v === "object") {
      Object.assign((el as HTMLElement).dataset, v as Record<string, string>);
    } else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else el.setAttribute(k, v === true ? "" : String(v));
  }
}

type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

export function svg(
  tag: string,
  attrs?: Attrs,
  ...children: Child[]
): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** in-place text setter (avoids layout thrash when value is unchanged) */
export function setText(el: Element, value: string) {
  if (el.textContent !== value) el.textContent = value;
}

export function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
