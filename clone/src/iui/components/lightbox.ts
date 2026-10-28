import { h } from "../dom";

interface Lightbox {
  dialog: HTMLDialogElement;
  img: HTMLImageElement;
  opener: HTMLButtonElement | null;
}

const boxes = new WeakMap<HTMLElement, Lightbox>();

function rootFor(trigger: HTMLButtonElement | null): HTMLElement {
  return trigger?.closest<HTMLElement>(".iui-theme") ?? document.body;
}

function ensureDialog(root: HTMLElement): Lightbox {
  const existing = boxes.get(root);
  if (existing) return existing;

  const img = h("img", { alt: "" }) as HTMLImageElement;
  const close = h("button", { class: "iui-lightbox-x", type: "button", "aria-label": "Close" });
  close.append(h("span", { text: "\u00d7" }));
  const dialog = h("dialog", { class: "iui-lightbox" }) as HTMLDialogElement;
  const box: Lightbox = { dialog, img, opener: null };
  dialog.append(img, close);
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    if (box.opener) {
      box.opener.setAttribute("aria-expanded", "false");
      box.opener.dataset.state = "closed";
    }
    box.opener = null;
  });
  root.append(dialog);
  boxes.set(root, box);
  return box;
}

export function openLightbox(src: string, alt: string, trigger: HTMLButtonElement | null): void {
  const root = rootFor(trigger);
  const box = ensureDialog(root);
  if (box.opener && box.opener !== trigger) {
    box.opener.setAttribute("aria-expanded", "false");
    box.opener.dataset.state = "closed";
  }
  box.img.src = src;
  box.img.alt = alt;
  box.opener = trigger;
  if (trigger) trigger.setAttribute("aria-expanded", "true");
  if (!box.dialog.open) box.dialog.showModal();
}

/** Wrap an image in a button that opens the lightbox. */
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

export function disposeLightboxes(root: HTMLElement): void {
  for (const dialog of root.querySelectorAll<HTMLDialogElement>("dialog.iui-lightbox")) {
    if (dialog.open) dialog.close();
    dialog.remove();
  }
  boxes.delete(root);
}
