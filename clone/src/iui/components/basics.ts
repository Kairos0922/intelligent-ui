/* Base Intelligent UI blocks. */

import { h, frag, setText, fmtInt, svg } from "../dom";
import { renderInline } from "../md";
import { defineBlock, Ctx } from "../registry";
import { safeColor, sanitizeSvgIcon } from "../security";
import { enlargeButton } from "./lightbox";

/* ---- media ------------------------------------------------------------- */

defineBlock("collage", (el, props: { images: { src: string; alt?: string }[] }) => {
  const wrap = h("div", { class: "iui-hero-collage" });
  props.images.slice(0, 3).forEach((im) =>
    wrap.append(h("img", { src: im.src, alt: im.alt ?? "", loading: "lazy" })),
  );
  el.append(wrap);
});

defineBlock("strip", (el, props: { images: { src: string; alt?: string }[] }) => {
  const wrap = h("div", { class: "iui-image-strip" });
  props.images.slice(0, 3).forEach((im) =>
    wrap.append(h("img", { src: im.src, alt: im.alt ?? "", loading: "lazy" })),
  );
  el.append(wrap);
});

defineBlock(
  "mediaRow",
  (el, props: { items: { img: string; title: string; sub?: string }[] }) => {
    const row = h("div", { class: "iui-media-row" });
    for (const item of props.items) {
      const card = h("div", { class: "iui-media-card" });
      card.append(
        h("img", { src: item.img, alt: item.title, loading: "lazy" }),
        h("div", { class: "iui-media-title", text: item.title }),
      );
      if (item.sub) card.append(h("div", { class: "iui-media-sub", text: item.sub }));
      row.append(card);
    }
    el.append(row);
  },
);

defineBlock(
  "outfitGrid",
  (el, props: { items: { img: string; title: string; sub?: string }[] }) => {
    const row = h("div", { class: "iui-outfit-grid" });
    for (const item of props.items) {
      const card = h("div", { class: "iui-outfit" });
      const im = h("img", { src: item.img, alt: item.title, loading: "lazy" });
      card.append(
        enlargeButton(im as HTMLImageElement, item.title),
        h("div", { class: "t", text: item.title }),
      );
      if (item.sub) card.append(h("div", { class: "s", text: item.sub }));
      row.append(card);
    }
    el.append(row);
  },
);

defineBlock(
  "dayList",
  (
    el,
    props: {
      eyebrow?: string;
      variant?: "tall" | "square";
      items: {
        img: string;
        day?: string;
        title: string;
        body: string;
        /** optional muted closing line */
        sleep?: string;
      }[];
    },
  ) => {
    const card = h("div", { class: "iui-days" });
    if (props.variant) card.dataset.variant = props.variant;
    for (const d of props.items) {
      const row = h("div", { class: "iui-day" });
      const media = h("div", { class: "m" });
      const im = h("img", { src: d.img, alt: d.title, loading: "lazy" });
      // Tall rows open the lightbox; square rows keep the image bare.
      media.append(
        props.variant === "square" ? im : enlargeButton(im as HTMLImageElement, d.title),
      );
      const body = h("div", { class: "b" });
      if (d.day) body.append(h("div", { class: "iui-muted", text: d.day }));
      body.append(h("div", { class: "t", text: d.title }));
      body.append(h("div", { class: props.variant === "square" ? "bd" : "iui-muted", text: d.body }));
      if (d.sleep) body.append(h("div", { class: "iui-muted s", text: d.sleep }));
      row.append(media, body);
      card.append(row);
    }
    el.append(card);
  },
);

/* ---- chips row ---------------------------------------------------------- */

defineBlock("chips", (el, props: { items: string[] }) => {
  el.classList.add("iui-chips-row");
  const row = h("div", { class: "iui-chips" });
  for (const t of props.items) row.append(h("span", { class: "iui-chip", text: t }));
  el.append(row);
});

/* ---- feature image (fixed-ratio single hero) ---------------------------- */

defineBlock(
  "figure",
  (el, props: { img: string; alt?: string; ratio?: string; caption?: string }) => {
    const fig = h("figure", { class: "iui-figure" });
    const im = h("img", { src: props.img, alt: props.alt ?? "", loading: "lazy" });
    if (props.ratio) im.style.aspectRatio = props.ratio;
    fig.append(im);
    if (props.caption) fig.append(h("figcaption", { class: "iui-muted", text: props.caption }));
    el.append(fig);
  },
);

/* ---- 3fr / 2fr mosaic hero ---------------------------------------------- */

defineBlock("rtHero", (el, props: { images: { src: string; alt?: string }[] }) => {
  const wrap = h("div", { class: "iui-rt-hero" });
  props.images.slice(0, 3).forEach((im) =>
    wrap.append(h("img", { src: im.src, alt: im.alt ?? "", loading: "lazy" })),
  );
  el.append(wrap);
});

/* ---- two-column image mosaic -------------------------------------------- */

defineBlock(
  "pair",
  (el, props: { images: { src: string; alt?: string }[]; ratio?: string }) => {
    const wrap = h("div", { class: "iui-pair" });
    for (const im of props.images.slice(0, 2)) {
      const f = h("div", { class: "f" });
      const img = h("img", { src: im.src, alt: im.alt ?? "", loading: "lazy" });
      if (props.ratio) img.style.aspectRatio = props.ratio;
      f.append(img);
      wrap.append(f);
    }
    el.append(wrap);
  },
);

/* ---- menu -------------------------------------------------------------- */

defineBlock(
  "menu",
  (el, props: { items: { img: string; title: string; body: string }[] }) => {
    const menu = h("div", { class: "iui-menu" });
    for (const item of props.items) {
      const row = h("div", { class: "iui-menu-item" });
      const text = h("div");
      text.append(
        h("strong", { class: "iui-menu-name", text: item.title }),
        h("p", { text: item.body }),
      );
      row.append(h("img", { src: item.img, alt: item.title, loading: "lazy" }), text);
      menu.append(row);
    }
    el.append(menu);
  },
);

/* ---- generic card ------------------------------------------------------ */

defineBlock(
  "card",
  (el, props: { eyebrow?: string; title?: string; list?: string[]; body?: string }) => {
    const card = h("div", { class: "iui-card" });
    if (props.eyebrow) card.append(h("div", { class: "iui-eyebrow", text: props.eyebrow }));
    if (props.title) card.append(h("h2", { text: props.title }));
    if (props.body) card.append(h("p", { text: props.body }));
    if (props.list) {
      const ul = h("ul");
      for (const li of props.list) {
        const item = h("li");
        item.append(renderInline(li));
        ul.append(item);
      }
      card.append(ul);
    }
    el.append(card);
  },
);

/* ---- timed checklist --------------------------------------------------- */

interface CheckItem {
  time: string;
  title: string;
  detail: string;
  done?: boolean;
}

defineBlock(
  "checklist",
  (el, props: { title: string; count?: number; items: CheckItem[]; total: number }, ctx: Ctx) => {
    const card = h("div", { class: "iui-checklist-card" });
    const head = h("div", { class: "iui-checklist-header" });
    const count = h("span");
    head.append(h("h4", { text: props.title }), count);
    const list = h("div");
    const items: CheckItem[] = props.items.map((i) => ({ ...i }));
    const refresh = () => {
      const n = items.filter((i) => i.done).length;
      setText(count, `${n} of ${props.total ?? items.length}`);
      return n;
    };
    items.forEach((item) => {
      const label = h("label", { class: "iui-checklist-item" });
      const input = h("input", { type: "checkbox" }) as HTMLInputElement;
      input.checked = !!item.done;
      input.addEventListener("change", () => {
        item.done = input.checked;
        const n = refresh();
        ctx.emit?.("change", {
          item: item.title,
          done: input.checked,
          completed: n,
          total: props.total ?? items.length,
        });
      });
      const text = h("span");
      text.append(
        h("span", { class: "iui-time", text: item.time }),
        h("strong", { text: item.title }),
        h("span", { class: "iui-detail", text: item.detail }),
      );
      label.append(input, text);
      list.append(label);
    });
    card.append(head, list);
    el.append(card);
    refresh();
  },
);

/* ---- packing checklist -------------------------------------------------- */

defineBlock(
  "packing",
  (
    el,
    props: {
      title: string;
      total: number;
      groups: { label: string; items: { text: string; done?: boolean }[] }[];
    },
    ctx: Ctx,
  ) => {
    const card = h("fieldset", { class: "iui-card iui-packing" });
    card.append(h("legend", { class: "sr-only", text: props.title }));
    const head = h("div", { class: "iui-pack-head" });
    const count = h("span", { class: "iui-muted" });
    head.append(h("span", { class: "iui-pack-title", text: props.title }), count);
    const bar = h("div", { class: "iui-progress" });
    const fill = h("span");
    bar.append(fill);
    card.append(head, bar);

    const all: { done: boolean }[] = [];
    const refresh = () => {
      const n = all.filter((i) => i.done).length;
      setText(count, `${n}/${props.total} packed`);
      fill.style.width = `${(n / props.total) * 100}%`;
      return n;
    };

    for (const group of props.groups) {
      const g = h("div");
      g.append(h("div", { class: "iui-pack-group", text: group.label }));
      for (const item of group.items) {
        const label = h("label", { class: "iui-pack-item" });
        const input = h("input", { type: "checkbox" }) as HTMLInputElement;
        input.checked = !!item.done;
        const state = { done: !!item.done };
        all.push(state);
        input.addEventListener("change", () => {
          state.done = input.checked;
          const n = refresh();
          ctx.emit?.("change", {
            item: item.text,
            group: group.label,
            done: input.checked,
            completed: n,
            total: props.total,
          });
        });
        label.append(input, h("span", { text: item.text }));
        g.append(label);
      }
      card.append(g);
    }
    el.append(card);
    refresh();
  },
);

/* ---- preference form --------------------------------------------------- */

defineBlock(
  "form",
  (
    el,
    props: {
      fieldsets: { legend: string; options: string[]; checked?: number }[];
      cta: string;
      ctaPrompt?: string;
    },
    ctx: Ctx,
  ) => {
    const form = h("div", { class: "iui-form" });
    const values: string[] = props.fieldsets.map(() => "");
    props.fieldsets.forEach((fs, i) => {
      const fieldset = h("fieldset");
      fieldset.append(h("legend", { text: fs.legend }));
      values[i] = fs.options[fs.checked ?? 0];
      fs.options.forEach((opt, j) => {
        const label = h("label");
        const input = h("input", { type: "radio", name: `iui-form-${el.dataset.block}-${i}` }) as HTMLInputElement;
        input.checked = j === (fs.checked ?? 0);
        input.value = opt;
        input.addEventListener("change", () => {
          values[i] = opt;
          refresh();
        });
        label.append(input, h("span", { text: opt }));
        fieldset.append(label);
      });
      form.append(fieldset);
    });
    const cta = h("button", { class: "iui-cta", type: "button" });
    // A compact arrow signals that the button submits the form.
    const arrow = svg(
      "svg",
      {
        width: "12",
        height: "12",
        fill: "none",
        viewBox: "0 0 12 12",
        "aria-hidden": "true",
      },
      svg("path", {
        d: "M2.5 6h7M6.5 3l3 3-3 3",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "1.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
    const refresh = () => {
      setText(cta, props.cta);
      cta.append(arrow);
    };
    cta.addEventListener("click", () => {
      const prompt = props.ctaPrompt
        ? props.ctaPrompt.replace(/\{(\d+)\}/g, (_, k) => values[Number(k)])
        : `${props.cta}: ${values.join(" · ")}`;
      ctx.emit?.("submit", { values: [...values] });
      ctx.onPrompt(prompt);
    });
    form.append(cta);
    el.append(form);
    refresh();
  },
);

/* ---- quantity stepper --------------------------------------------------- */

interface QtyRow {
  name: string;
  per: number;
  unit: string;
  decimals?: number;
}

defineBlock(
  "calculator",
  (
    el,
    props: {
      title?: string;
      label: string;
      unit: string;
      value: number;
      min?: number;
      max?: number;
      rows: QtyRow[];
      note?: string;
      copyLabel?: string;
    },
    ctx: Ctx,
  ) => {
    const card = h("div", { class: "iui-stepper-card" });
    if (props.label)
      card.append(h("div", { class: "iui-eyebrow", text: props.label }));

    let n = props.value;
    const min = props.min ?? 1;
    const max = props.max ?? 20;

    const stepper = h("div", { class: "iui-stepper" });
    const minus = h("button", { type: "button", "aria-label": "Fewer people", text: "−" });
    const readout = h("div", { "aria-live": "polite" });
    const strong = h("strong");
    const unitEl = h("span", { text: props.unit });
    readout.append(strong, unitEl);
    const plus = h("button", { type: "button", "aria-label": "More people", text: "+" });
    stepper.append(minus, readout, plus);

    const heading = h("h4", { text: props.title ?? "Your shopping quantities" });
    const dl = h("dl", { class: "iui-quantities" });
    const rowCells: { dd: HTMLElement; row: QtyRow }[] = [];
    for (const row of props.rows) {
      const div = h("div");
      const dd = h("dd");
      div.append(h("dt", { text: row.name }), dd);
      dl.append(div);
      rowCells.push({ dd, row });
    }

    const format = (row: QtyRow, guests: number) => {
      const v = row.per * guests;
      const dec = row.decimals ?? 0;
      const text = dec ? v.toFixed(dec) : String(Math.round(v));
      return `${text} ${row.unit}`.trim();
    };

    const refresh = () => {
      setText(strong, String(n));
      for (const { dd, row } of rowCells) setText(dd, format(row, n));
    };

    minus.addEventListener("click", () => {
      n = Math.max(min, n - 1);
      refresh();
      ctx.emit?.("change", { value: n });
    });
    plus.addEventListener("click", () => {
      n = Math.min(max, n + 1);
      refresh();
      ctx.emit?.("change", { value: n });
    });

    card.append(stepper, heading, dl);
    if (props.note) card.append(h("p", { class: "iui-muted", text: props.note }));

    if (props.copyLabel) {
      const copy = h("button", { type: "button", class: "iui-pill", text: props.copyLabel });
      const status = h("span", { class: "iui-muted", role: "status" });
      copy.addEventListener("click", async () => {
        const lines = rowCells.map(
          ({ row }) => `${row.name}: ${format(row, n)}`,
        );
        const text = `Shopping list (${n} ${props.unit.toLowerCase()})\n${lines.join("\n")}`;
        try {
          await navigator.clipboard.writeText(text);
          setText(status, "Copied");
          ctx.emit?.("copy", { text });
        } catch {
          setText(status, "Copy failed");
        }
        setTimeout(() => setText(status, ""), 1600);
      });
      card.append(copy, status);
    }
    el.append(card);
    refresh();
  },
);

/* ---- tabs --------------------------------------------------------------- */

defineBlock(
  "tabs",
  (el, props: { items: string[]; panels: Record<string, string>; select?: string }, ctx: Ctx) => {
    const wrap = h("div", { class: "iui-tabpanel" });
    const bar = h("div", { class: "iui-tabs", role: "tablist" });
    const body = h("div", { class: "iui-tab-body" });
    const buttons = new Map<string, HTMLButtonElement>();

    const select = (name: string) => {
      for (const [key, btn] of buttons) {
        btn.setAttribute("aria-pressed", String(key === name));
      }
      const md = props.panels[name] ?? "";
      const para = h("p");
      para.append(renderInline(md));
      body.replaceChildren(para);
    };

    props.items.forEach((name, i) => {
      const btn = h("button", {
        class: "iui-tab",
        type: "button",
        role: "tab",
        text: name,
        "aria-pressed": "false",
      });
      btn.addEventListener("click", () => {
        select(name);
        ctx.emit?.("select", { value: name });
      });
      buttons.set(name, btn);
      bar.append(btn);
      if (i === 0 && !props.select) props.select = name;
    });

    wrap.append(bar, body);
    el.append(wrap);
    select(props.select ?? props.items[0]);
  },
);

/* ---- plan tiles --------------------------------------------------------- */

defineBlock(
  "tiles",
  (
    el,
    props: {
      title: string;
      sub?: string;
      cols?: number;
      tiles: { bg: string; icon?: string; label: string; sub?: string }[];
      footer?: string;
      arrow?: boolean;
    },
  ) => {
    const card = h("div", { class: "iui-plan" });
    card.append(h("div", { class: "iui-plan-title", text: props.title }));
    if (props.sub) card.append(h("div", { class: "iui-plan-sub", text: props.sub }));
    const grid = h("div", { class: "iui-tile-grid" });
    grid.style.gridTemplateColumns = `repeat(${props.cols ?? 2}, minmax(0,1fr))`;
    for (const t of props.tiles) {
      const tile = h("div", { class: "iui-tile2" });
      tile.style.background = safeColor(t.bg);
      if (t.icon) tile.append(h("div", { class: "ic", html: sanitizeSvgIcon(t.icon) }));
      tile.append(h("div", { class: "t", text: t.label }));
      if (t.sub) tile.append(h("div", { class: "s", text: t.sub }));
      grid.append(tile);
    }
    card.append(grid);
    if (props.arrow) card.append(h("div", { class: "iui-plan-arrow", html: "&#8595;" }));
    if (props.footer) card.append(h("div", { class: "iui-plan-foot", text: props.footer }));
    el.append(card);
  },
);
