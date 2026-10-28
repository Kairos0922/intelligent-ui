const URL_CONTROL = /[\u0000-\u0020\u007f]+/g;

/** Accept only URL shapes that are safe to place in an href/src attribute. */
export function safeUrl(raw: unknown, kind: "link" | "image" = "link"): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.replace(URL_CONTROL, "");
  if (!url || url.length > 4096) return null;

  if (/^https?:\/\//i.test(url)) return url;
  if (kind === "link" && /^(mailto|tel):/i.test(url)) return url;

  if (kind === "image") {
    if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)(;[a-z0-9=._-]+)*,/i.test(url)) return url;
    if (/^blob:/i.test(url)) return url;
  }

  if (url.startsWith("#") || url.startsWith("?")) return url;
  if (/^\/(?!\/)/.test(url)) return url;
  if (/^\.{1,2}\//.test(url)) return url;
  if (kind === "image" && /^\/\//.test(url)) return url;

  return null;
}

/** Plain text from a model payload; strips control chars, caps length. */
export function safeText(raw: unknown, max = 4000): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max);
}

/** Reject CSS values that could fetch a remote resource or escape the prop. */
export function safeColor(raw: unknown, fallback = "transparent"): string {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim().slice(0, 120);
  if (!v) return fallback;
  if (/url\s*\(|expression\s*\(|javascript:|[;{}<>]/i.test(v)) return fallback;
  if (!/^#|^rgba?\(|^hsla?\(|^[a-z]+$/i.test(v)) return fallback;
  return v;
}

const SVG_TAGS = new Set([
  "svg", "g", "path", "circle", "rect", "line", "polyline", "polygon",
  "ellipse", "defs", "lineargradient", "radialgradient", "stop", "clippath",
  "mask", "title", "desc",
]);

const SVG_ATTRS = new Set([
  "viewBox", "width", "height", "fill", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray",
  "stroke-dashoffset", "opacity", "fill-opacity", "stroke-opacity", "fill-rule",
  "clip-rule", "transform", "d", "x", "y", "dx", "dy", "cx", "cy", "r", "rx",
  "ry", "x1", "y1", "x2", "y2", "points", "offset", "stop-color",
  "stop-opacity", "aria-hidden", "focusable", "role", "xmlns",
]);

function scrubSvg(el: Element) {
  for (const child of Array.from(el.children)) {
    if (!SVG_TAGS.has(child.localName.toLowerCase())) {
      child.remove();
      continue;
    }
    scrubSvg(child);
  }
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    const lower = name.toLowerCase();
    const value = attr.value;
    const isEvent = lower.startsWith("on");
    const isLink = lower === "href" || lower === "xlink:href";
    const isStyle = lower === "style" || lower === "class" || lower === "id";
    const isExternalRef = /url\s*\(/i.test(value);
    if (isEvent || isLink || isStyle || isExternalRef || !SVG_ATTRS.has(name)) {
      el.removeAttribute(name);
    }
  }
}

/**
 * Rebuild a model-supplied inline SVG icon from the allowlist. Returns "" for
 * anything that is not a well-formed, inert SVG (so the tile simply renders
 * without an icon instead of executing markup).
 */
export function sanitizeSvgIcon(html: unknown): string {
  if (typeof html !== "string") return "";
  const source = html.trim();
  if (!source || source.length > 20_000) return "";

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${source}</svg>`,
      "image/svg+xml",
    );
  } catch {
    return "";
  }
  if (doc.querySelector("parsererror")) return "";
  const svg = doc.querySelector("svg svg");
  if (!svg) return "";
  if (svg.querySelectorAll("*").length > 200) return "";

  scrubSvg(svg);
  svg.removeAttribute("id");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  return svg.outerHTML;
}
