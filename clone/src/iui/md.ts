/* Markdown-lite renderer for streaming prose.
   Supports: **bold**, *italic*, `code`, [link](url), line breaks, and
   "- " / "1. " line lists. */

import { frag } from "./dom";
import { safeUrl } from "./security";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderInline(md: string): DocumentFragment {
  const html = escapeHtml(md)
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (match, label: string, href: string) => {
        // `href` is already HTML-escaped; only http(s)/mailto/tel and relative
        // targets survive, so a model cannot inject a javascript: link.
        const safe = safeUrl(href, "link");
        if (!safe) return label;
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      },
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const f = frag();
  f.append(tpl.content);
  return f;
}

const UL = /^\s*[-*]\s/;
const OL = /^\s*\d+[.)]\s/;

/**
 * Render a streamed block whose markdown is still growing.
 * The block element may be swapped (p -> ul -> ol) while streaming;
 * the current element is returned so callers can keep their reference.
 */
export function renderBlock(
  container: HTMLElement,
  md: string,
  opts: { allowList?: boolean } = {},
): HTMLElement {
  const lines = md.split("\n");
  // a trailing empty line is just an unfinished newline while streaming
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

  const allowList = opts.allowList !== false;
  /** the block's "base" tag: recorded when a list swap happens, otherwise the
   *  element's own tag (headings keep their level) */
  const baseTag = (el: HTMLElement) => (el.dataset.tag ?? el.tagName).toUpperCase();
  const isHeading = /^H[1-6]$/.test(baseTag(container));
  const isUl = allowList && !isHeading && lines.length > 0 && lines.every((l) => UL.test(l));
  const isOl = allowList && !isHeading && lines.length > 0 && lines.every((l) => OL.test(l));
  const wantTag = isUl ? "UL" : isOl ? "OL" : baseTag(container);

  let el = container;
  if (el.tagName !== wantTag) {
    const next = document.createElement(wantTag.toLowerCase());
    for (const a of Array.from(el.attributes)) next.setAttribute(a.name, a.value);
    next.dataset.tag = baseTag(el).toLowerCase();
    el.parentElement?.replaceChild(next, el);
    el = next;
  }

  if (isUl || isOl) {
    const f = frag();
    for (const line of lines) {
      const li = document.createElement("li");
      li.append(renderInline(line.replace(/^\s*(?:[-*]|\d+[.)])\s/, "")));
      f.append(li);
    }
    el.replaceChildren(f);
  } else {
    const f = frag();
    lines.forEach((p, i) => {
      if (i) f.append(document.createElement("br"));
      f.append(renderInline(p));
    });
    el.replaceChildren(f);
  }
  return el;
}
