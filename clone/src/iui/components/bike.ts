/* Bicycle diagrams — an original side-view illustration and a matching
   assembly walkthrough. Both views are built from the same SVG helpers. */

import { h, svg, setText } from "../dom";
import { defineBlock, Ctx } from "../registry";

let bikeSeq = 0;

/* Part groups used by the system tabs. */
const BIKE_SYSTEMS: Record<string, string[]> = {
  frame: ["frame"],
  wheels: ["wheels"],
  drivetrain: ["drivetrain"],
  brakes: ["brakes"],
  cockpit: ["cockpit"],
};

/** Highlight the selected system. Other groups drop to 30% opacity. */
function applyBikeSystem(art: Element, system: string) {
  const parts = BIKE_SYSTEMS[system];
  art.setAttribute("data-uniform", String(!parts));
  for (const g of Array.from(art.querySelectorAll("[data-part]")))
    g.setAttribute("data-highlighted", String(!parts || parts.includes(g.getAttribute("data-part")!)));
}

/* -------------------------------------------------------------------------
   Bike side-view illustration.
   Every part carries a `data-part` group name so a system can be highlighted.
   ------------------------------------------------------------------------- */

export function bikeSvg(opts: { callouts?: boolean; view?: "assembled" | "exploded" } = {}) {
  const uid = `bike-${++bikeSeq}`;
  const g = (part: string, ...children: (SVGElement | null)[]) => {
    const el = svg("g", { "data-part": part, class: part });
    for (const c of children) if (c) el.append(c);
    return el;
  };

  const wheel = (cx: number, cy: number, r: number, cls: string) => {
    const spokes: SVGElement[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      spokes.push(
        svg("line", {
          x1: cx,
          y1: cy,
          x2: cx + Math.cos(a) * (r - 12),
          y2: cy + Math.sin(a) * (r - 12),
          class: `${cls} spoke`,
        }),
      );
    }
    const wrap = svg("g", { class: cls });
    wrap.append(
      ...spokes,
      svg("circle", { cx, cy, r: r - 4, class: `${cls} tire` }),
      svg("circle", { cx, cy, r: r - 14, class: `${cls} rim` }),
      svg("circle", { cx, cy, r: 7, class: `${cls} hub` }),
    );
    return wrap;
  };

  const s = svg("svg", {
    viewBox: "0 0 720 420",
    class: `iui-bike ${uid}`,
    role: "img",
    "aria-label": "Side view of a bicycle",
  });

  // ---- wheels
  const rear = g("wheels", wheel(168, 296, 84, "wheel rear"));
  const front = g("wheels", wheel(548, 296, 84, "wheel front"));

  // ---- frame (two triangles + fork)
  const frame = g(
    "frame",
    svg("path", {
      d: "M168 296 L330 296 L296 186 L430 172 L456 212 L330 296 Z",
      class: "tube",
    }),
    svg("path", { d: "M296 186 L282 168 L312 168", class: "tube" }), // seat cluster
    svg("path", { d: "M430 172 L448 176 L456 212 L438 214 Z", class: "tube head" }),
    svg("path", { d: "M456 212 L548 296", class: "tube fork" }),
    svg("path", { d: "M168 296 L296 186", class: "tube stay" }), // seat stay
    svg("path", { d: "M168 296 L330 296", class: "tube stay" }), // chain stay
  );

  // ---- drivetrain
  const drive = g(
    "drivetrain",
    svg("circle", { cx: 330, cy: 296, r: 26, class: "ring" }),
    svg("circle", { cx: 330, cy: 296, r: 14, class: "ring2" }),
    svg("path", { d: "M330 322 L330 344 M316 344 L344 344", class: "crank" }),
    svg("path", { d: "M168 296 L330 270 M168 296 L330 322", class: "chain" }),
    svg("circle", { cx: 168, cy: 296, r: 13, class: "cog" }),
  );

  // ---- brakes
  const brakes = g(
    "brakes",
    svg("path", { d: "M548 296 L536 258 M548 296 L560 258 M530 258 L566 258", class: "caliper" }),
    svg("path", { d: "M430 176 L392 160 M392 160 L378 172", class: "cable" }),
    svg("path", { d: "M436 206 C470 240 510 268 538 282", class: "cable" }),
  );

  // ---- cockpit
  const cockpit = g(
    "cockpit",
    svg("path", { d: "M438 170 L452 142", class: "stem" }),
    svg("path", { d: "M452 142 C428 132 408 134 396 144 C412 140 430 142 452 142", class: "bar" }),
    svg("path", { d: "M396 144 L390 156", class: "bar grip" }),
    svg("path", { d: "M296 186 L288 162", class: "post" }),
    svg("path", { d: "M268 158 C276 148 306 148 314 158 C304 166 278 166 268 158 Z", class: "saddle" }),
  );

  s.append(rear, front, frame, drive, brakes, cockpit);

  if (opts.callouts) {
    const call = (x: number, y: number, n: string) => {
      const wrap = svg("g", { class: "callout" });
      wrap.append(
        svg("circle", { cx: x, cy: y, r: 16 }),
        svg("text", { x, y: y + 4, "text-anchor": "middle", text: n }),
      );
      return wrap;
    };
    s.append(call(300, 128, "02"), call(468, 110, "01"), call(322, 344, "03"), call(160, 342, "04"));
  }

  if (opts.view) s.setAttribute("data-view", opts.view);
  return s;
}

/** Exploded-view offsets, applied to part groups. */
export function applyBikeView(root: HTMLElement, view: "assembled" | "exploded") {
  const svgEl = root.querySelector("svg.iui-bike");
  if (!svgEl) return;
  svgEl.setAttribute("data-view", view);
  const wheels = svgEl.querySelectorAll('g[data-part="wheels"]');
  const front = wheels[1] ?? null;
  const rear = wheels[0] ?? null;
  const cockpit = svgEl.querySelector('g[data-part="cockpit"]');
  const drive = svgEl.querySelector('g[data-part="drivetrain"]');
  const set = (el: Element | null, v: string) => el && el.setAttribute("transform", v);
  if (view === "exploded") {
    set(front, "translate(46, 30)");
    set(rear, "translate(-40, 30)");
    set(cockpit, "translate(10, -34)");
    set(drive, "translate(28, 26)");
  } else {
    set(front, "");
    set(rear, "");
    set(cockpit, "");
    set(drive, "");
  }
}

/* -------------------------------------------------------------------------
   Hero explainer block: bike + system tabs + copy per system.
   ------------------------------------------------------------------------- */

defineBlock(
  "bike",
  (
    el,
    props: {
      title?: string;
      tabs: string[];
      panels: Record<string, { heading: string; body: string }>;
      select?: string;
    },
    ctx: Ctx,
  ) => {
    const wrap = h("div", { class: "iui-bike-block" });
    const figure = h("div", { class: "iui-bike-figure" });
    figure.append(bikeSvg());
    const art = figure.querySelector("svg.iui-bike")!;

    const bar = h("div", { class: "iui-tabs" });
    const copy = h("div", { class: "iui-bike-copy" });
    const heading = h("h4");
    const body = h("p");
    copy.append(heading, body);

    const systemOf = (name: string) =>
      ({
        All: "all",
        Frame: "frame",
        Wheels: "wheels",
        Drivetrain: "drivetrain",
        Brakes: "brakes",
        Cockpit: "cockpit",
      })[name] ?? "all";

    const select = (name: string) => {
      wrap.dataset.system = systemOf(name);
      applyBikeSystem(art, wrap.dataset.system);
      for (const b of Array.from(bar.children))
        b.setAttribute("aria-pressed", String(b.textContent === name));
      const panel = props.panels[name];
      if (panel) {
        setText(heading, panel.heading);
        setText(body, panel.body);
      }
    };

    for (const name of props.tabs) {
      const btn = h("button", { class: "iui-tab", type: "button", text: name });
      btn.addEventListener("click", () => {
        select(name);
        ctx.emit?.("select", { value: name });
      });
      bar.append(btn);
    }

    wrap.append(figure, bar, copy);
    el.append(wrap);
    select(props.select ?? props.tabs[0]);
  },
);

/* -------------------------------------------------------------------------
   Assembly walkthrough.
   ------------------------------------------------------------------------- */

interface StepSpec {
  title: string;
  find: string;
  body: string;
  check: { title: string; detail: string };
}

defineBlock(
  "steps",
  (
    el,
    props: {
      title: string;
      sub: string;
      caption: string;
      steps: StepSpec[];
      start?: number;
      callouts?: boolean;
    },
    ctx: Ctx,
  ) => {
    const card = h("div", { class: "iui-steps" });
    const head = h("div", { class: "iui-steps-head" });
    const titles = h("div");
    titles.append(
      h("div", { class: "t", text: props.title }),
      h("div", { class: "s", text: props.sub }),
    );
    const switcher = h("div", { class: "iui-switcher" });
    const asmBtn = h("button", { type: "button", text: "Assembled", "aria-pressed": "true" });
    const expBtn = h("button", { type: "button", text: "Exploded", "aria-pressed": "false" });
    switcher.append(asmBtn, expBtn);
    head.append(titles, switcher);

    const diagram = h("div", { class: "iui-steps-diagram" });
    const bike = bikeSvg({ callouts: props.callouts !== false });
    diagram.append(bike);
    const caption = h("div", { class: "iui-steps-caption", text: props.caption });

    const kicker = h("div", { class: "iui-step-kicker" });
    const stepTitle = h("div", { class: "iui-step-title" });
    const findEl = h("div", { class: "iui-step-find" });
    const bodyEl = h("div", { class: "iui-step-body" });

    const checkRow = h("label", { class: "iui-steps-check" });
    const checkInput = h("input", { type: "checkbox" }) as HTMLInputElement;
    const checkText = h("span");
    const checkTitle = h("strong");
    const checkDetail = h("span", { class: "iui-detail" });
    checkText.append(checkTitle, checkDetail);
    checkRow.append(checkInput, checkText);

    const foot = h("div", { class: "iui-steps-foot" });
    const dots = h("div", { class: "iui-dots" });
    const dotEls: HTMLElement[] = props.steps.map(() => h("i"));
    dotEls.forEach((d) => dots.append(d));
    const nav = h("div", { class: "iui-steps-nav" });
    const back = h("button", { type: "button", class: "iui-button", text: "Back" });
    const next = h("button", { type: "button", class: "iui-button", "data-variant": "solid" });
    nav.append(back, next);
    foot.append(dots, nav);

    card.append(head, diagram, caption, kicker, stepTitle, findEl, bodyEl, checkRow, foot);
    el.append(card);

    let i = Math.min(Math.max(props.start ?? 0, 0), props.steps.length - 1);
    const render = () => {
      const step = props.steps[i];
      setText(kicker, `Step ${i + 1} of ${props.steps.length}`);
      setText(stepTitle, step.title);
      setText(findEl, `Find · ${step.find}`);
      setText(bodyEl, step.body);
      setText(checkTitle, step.check.title);
      setText(checkDetail, step.check.detail);
      checkInput.checked = false;
      dotEls.forEach((d, j) => d.classList.toggle("on", j === i));
      back.disabled = i === 0;
      setText(next, i === props.steps.length - 1 ? "Finish" : "Next");
      next.dataset.variant = "solid";
      applyBikeView(card, card.dataset.view === "exploded" ? "exploded" : "assembled");
    };
    back.addEventListener("click", () => {
      i = Math.max(0, i - 1);
      render();
      ctx.emit?.("step", { index: i, total: props.steps.length });
    });
    next.addEventListener("click", () => {
      i = (i + 1) % props.steps.length;
      render();
      ctx.emit?.("step", { index: i, total: props.steps.length });
    });
    asmBtn.addEventListener("click", () => {
      asmBtn.setAttribute("aria-pressed", "true");
      expBtn.setAttribute("aria-pressed", "false");
      card.dataset.view = "assembled";
      applyBikeView(card, "assembled");
      ctx.emit?.("view", { view: "assembled" });
    });
    expBtn.addEventListener("click", () => {
      asmBtn.setAttribute("aria-pressed", "false");
      expBtn.setAttribute("aria-pressed", "true");
      card.dataset.view = "exploded";
      applyBikeView(card, "exploded");
      ctx.emit?.("view", { view: "exploded" });
    });
    render();
  },
);
