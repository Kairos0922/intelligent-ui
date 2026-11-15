import qrcode from "qrcode-generator";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Render a real QR code (byte mode, error correction M) as an SVG.
 * The experiment uses a library rather than a decorative matrix so the
 * "present the code" path is actually testable with a standard decoder.
 */
export function qrSvg(payload: string, label: string): SVGSVGElement {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();

  const count = qr.getModuleCount();
  const margin = 4;
  const size = count + margin * 2;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.dataset.qrPayload = payload;
  svg.dataset.qrModules = String(count);

  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("width", String(size));
  bg.setAttribute("height", String(size));
  bg.setAttribute("fill", "#ffffff");
  svg.append(bg);

  const path: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        path.push(`M${col + margin} ${row + margin}h1v1h-1z`);
      }
    }
  }
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path.join(""));
  shape.setAttribute("fill", "#000000");
  svg.append(shape);
  return svg;
}
