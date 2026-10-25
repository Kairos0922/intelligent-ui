/* =========================================================================
   Click-to-enlarge dialog.

   A thumbnail can open a modal with the full-size image: centred image on a
   dimmed backdrop, close button, ESC / backdrop-click to dismiss, and focus
   restored to the trigger.
   ========================================================================= */

import { h } from "../dom";

let dialog: HTMLDialogElement | null = null;
let dialogImg: HTMLImageElement | null = null;
let opener: HTMLButtonElement | null = null;

function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  dialogImg = h("img", { alt: "" }) as HTMLImageElement;
  const close = h("button", { class: "iui-lightbox-x", type: "button", "aria-label": "Close" });
  close.append(h("span", { text: "\u00d7" }));
  dialog = h("dialog", { class: "iui-lightbox" }) as HTMLDialogElement;
  dialog.append(dialogImg, close);
  close.addEventListener("click", () => dialog?.close());
  // a click on the dialog element itself is a click outside the image
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog?.close();
  });
  dialog.addEventListener("close", () => {
    if (opener) opener.setAttribute("aria-expanded", "false");
    opener = null;
  });
  document.body.append(dialog);
  return dialog;
}

export function openLightbox(src: string, alt: string, trigger: HTMLButtonElement | null): void {
  const d = ensureDialog();
  dialogImg!.src = src;
  dialogImg!.alt = alt;
  opener = trigger;
  if (trigger) trigger.setAttribute("aria-expanded", "true");
  if (!d.open) d.showModal();
}

/** Wrap an image in a button that opens the lightbox. The rounded clip lives
 *  on the button, not on the image itself. */
export function enlargeButton(img: HTMLImageElement, alt: string): HTMLButtonElement {
  const btn = h("button", {
    class: "iui-enlarge",
    type: "button",
    "aria-label": `Enlarge ${alt}`,
    "aria-haspopup": "dialog",
    "aria-expanded": "false",
    "data-state": "closed",
  }) as HTMLButtonElement;
  btn.append(img);
  btn.addEventListener("click", () => {
    btn.dataset.state = "open";
    openLightbox(img.currentSrc || img.src, alt, btn);
  });
  return btn;
}
