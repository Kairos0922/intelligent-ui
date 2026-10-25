/* Route map card — a hand-built schematic map with group controls, markers,
   a detail panel and optional destination cards. */

import { h, svg, setText } from "../dom";
import { defineBlock, Ctx } from "../registry";

interface Place {
  id: string;
  name: string;
  sub: string;
  group: string;
  x: number; // % of map width
  y: number; // % of map height
  photo?: string;
  stop?: string;
}

function terrain() {
  const s = svg("svg", {
    viewBox: "0 0 800 400",
    preserveAspectRatio: "xMidYMid slice",
    class: "iui-map-terrain",
  });
  const water = "#cfe4f0";
  const land = "#f2f3ee";
  const park = "#dcebd9";
  const forest = "#d3e6d8";

  s.append(svg("rect", { x: 0, y: 0, width: 800, height: 400, fill: land }));
  // coastline
  s.append(
    svg("path", {
      d: "M0 0 L118 0 C126 44 132 92 122 150 C112 214 96 268 104 400 L0 400 Z",
      fill: water,
    }),
  );
  // inland inlet
  s.append(
    svg("path", {
      d: "M598 0 L640 0 C636 26 610 44 606 74 C602 104 622 118 614 148 C606 176 578 186 576 214 C574 240 588 258 580 282 C572 304 556 316 558 340 L572 340 C578 314 596 300 602 276 C608 250 594 236 598 212 C602 188 630 176 636 148 C642 118 622 100 626 72 C630 46 652 28 652 0 Z",
      fill: water,
    }),
  );
  // river
  s.append(
    svg("path", {
      d: "M300 400 C360 372 420 366 470 344 C540 314 620 300 800 296 L800 312 C640 316 560 330 496 358 C444 380 386 390 336 400 Z",
      fill: water,
      opacity: 0.85,
    }),
  );
  // parks / forest
  s.append(
    svg("path", {
      d: "M206 108 C232 92 276 88 312 96 C348 104 372 122 370 146 C368 170 340 184 306 186 C268 188 228 180 210 162 C196 148 196 122 206 108 Z",
      fill: forest,
    }),
  );
  s.append(
    svg("path", {
      d: "M596 118 C616 104 654 102 680 112 C704 122 716 140 710 158 C704 176 676 188 648 186 C618 184 594 170 590 152 C587 138 588 126 596 118 Z",
      fill: park,
    }),
  );
  s.append(
    svg("path", {
      d: "M470 158 C486 148 512 148 528 156 C540 162 544 174 536 184 C524 196 496 198 480 190 C468 184 464 166 470 158 Z",
      fill: park,
    }),
  );
  // urban patches
  s.append(svg("rect", { x: 566, y: 46, width: 92, height: 62, rx: 10, fill: "#e8e9e3" }));
  s.append(svg("rect", { x: 560, y: 268, width: 96, height: 60, rx: 10, fill: "#e8e9e3" }));

  // highways
  const road = (d: string, width = 4, color = "#ffffff", opacity = 1) =>
    s.append(svg("path", { d, fill: "none", stroke: color, "stroke-width": width, opacity, "stroke-linecap": "round" }));
  // main road
  road("M596 300 C588 250 596 210 604 172 C614 130 622 92 632 54", 5, "#e9e9e2");
  road("M596 300 C588 250 596 210 604 172 C614 130 622 92 632 54", 3.4, "#f7d98a");
  // coastal road
  road("M520 296 C480 268 452 236 430 206 C404 172 360 150 320 132 C282 116 250 106 222 96", 4, "#e9e9e2");
  road("M520 296 C480 268 452 236 430 206 C404 172 360 150 320 132 C282 116 250 106 222 96", 2.6, "#ffffff");
  road("M222 96 C260 88 300 80 336 70 C392 54 440 42 494 36", 3.4, "#e9e9e2");
  road("M632 54 C600 86 560 110 520 130", 2.6, "#ffffff");
  road("M320 132 C368 142 420 152 470 160", 2.4, "#ffffff");
  road("M104 208 C210 214 330 220 452 228 C540 234 590 250 640 280", 3, "#ffffff", 0.8);
  return s;
}

defineBlock(
  "map",
  (
    el,
    props: {
      height?: number;
      groups: { id: string; label: string }[];
      places: Place[];
      select?: string;
      /** accessible label for the map group */
      label?: string;
      /** show the destination-card row under the map */
      destCards?: boolean;
    },
    ctx: Ctx,
  ) => {
    const card = h("div", { class: "iui-map-card", "data-theme": "light" });
    const map = h("div", {
      class: "iui-map",
      role: "group",
      "aria-label": props.label ?? "Interactive map",
      "data-expanded": "false",
    });
    if (props.height) map.style.height = `${props.height}px`;
    map.append(terrain());

    const dash = svg("svg", {
      viewBox: "0 0 800 400",
      preserveAspectRatio: "none",
      class: "iui-map-route",
    });
    const pct = (p: Place) => `${(p.x / 100) * 800} ${(p.y / 100) * 400}`;
    const routePoints = props.places.map(pct).join(" L");
    dash.append(
      svg("path", {
        d: `M${routePoints}`,
        fill: "none",
        stroke: "#3c4043",
        "stroke-width": 2,
        "stroke-dasharray": "1 7",
        "stroke-linecap": "round",
        opacity: 0.75,
      }),
    );
    map.append(dash);

    // controls: group filter, reset, and expand
    const controls = h("div", { class: "iui-map-controls" });
    const selectWrap = h("div", { class: "iui-map-select-wrap" });
    const select = h("select", { "aria-label": "Choose route days" }) as HTMLSelectElement;
    for (const g of props.groups) {
      const opt = h("option", { value: g.id, text: g.label });
      select.append(opt);
    }
    const chevron = svg("svg", { viewBox: "0 0 16 16", width: 14, height: 14, "aria-hidden": "true" });
    chevron.append(
      svg("path", { d: "m4 6 4 4 4-4", fill: "none", stroke: "currentColor", "stroke-width": 1.5 }),
    );
    selectWrap.append(select, chevron);
    const reset = h("button", {
      class: "iui-map-reset",
      type: "button",
      "aria-label": "Reset map view",
      title: "Reset view",
    });
    const arrow = svg("svg", { viewBox: "0 0 20 20", width: 20, height: 20, "aria-hidden": "true" });
    arrow.append(
      svg("path", {
        d: "M15.3189 2.74488C16.5305 2.27925 17.7205 3.46977 17.2545 4.6814L12.7496 16.3962C12.2726 17.6365 10.5368 17.688 9.98689 16.4783L7.99275 12.0916C7.97591 12.0545 7.94582 12.0244 7.90877 12.0076L3.52107 10.0134C2.3117 9.4634 2.36394 7.7277 3.60408 7.25074L15.3189 2.74488ZM15.7965 3.98609L4.08064 8.49195C3.94162 8.54571 3.93608 8.74075 4.07185 8.8025L8.45955 10.7966C8.78924 10.9466 9.05382 11.2111 9.20369 11.5408L11.1978 15.9285C11.2598 16.064 11.4539 16.0579 11.5074 15.9187L16.0133 4.20386C16.0654 4.06795 15.9324 3.93431 15.7965 3.98609Z",
        fill: "currentColor",
      }),
    );
    reset.append(arrow);
    controls.append(selectWrap, reset);
    const expand = h("button", {
      class: "iui-map-expand",
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
    });
    const corners = svg("svg", { viewBox: "0 0 16 16", width: 14, height: 14, "aria-hidden": "true" });
    corners.append(
      svg("path", {
        d: "M6 3H3v3m7-3h3v3M3 10v3h3m7-3v3h-3",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
    expand.append(corners, document.createTextNode("Expand"));

    // markers
    const markerWrap = h("div", { class: "iui-map-markers" });
    const markers = new Map<string, HTMLButtonElement>();
    props.places.forEach((p, i) => {
      const m = h("button", {
        type: "button",
        class: "iui-map-marker",
        "aria-pressed": "false",
        "aria-label": p.name,
      });
      m.style.left = `${p.x}%`;
      m.style.top = `${p.y}%`;
      m.append(
        h("span", { class: "n", text: String(i + 1) }),
        h("span", { class: "iui-map-label", text: p.name }),
      );
      m.addEventListener("click", () => {
        setSelected(p);
        ctx.emit?.("select", { place: p.id, name: p.name });
      });
      markerWrap.append(m);
      markers.set(p.id, m);
    });

    // details panel
    const details = h("div", { class: "iui-map-details" });
    const dLeft = h("div");
    const dName = h("strong");
    const dSub = h("span", { class: "iui-map-detail-sub" });
    dLeft.append(dName, dSub);
    const dClose = h("button", { type: "button", "aria-label": "Close details", text: "×" });
    details.append(dLeft, dClose);

    map.append(controls, expand, markerWrap, details);

    // destination cards
    const cards = h("div", { class: "iui-dest-cards" });
    for (const p of props.places) {
      const c = h("button", { type: "button", class: "iui-dest-card" });
      if (p.photo) c.append(h("img", { src: p.photo, alt: p.name, loading: "lazy" }));
      const t = h("div");
      t.append(
        h("div", { class: "t", text: p.name }),
        h("div", { class: "s", text: p.sub }),
      );
      c.append(t);
      c.addEventListener("click", () => {
        setSelected(p);
        ctx.emit?.("select", { place: p.id, name: p.name });
      });
      cards.append(c);
    }

    card.append(map);
    if (props.destCards) card.append(cards);
    el.append(card);

    let selected: Place | null = null;
    function setSelected(p: Place | null) {
      selected = p;
      for (const [id, m] of markers) m.setAttribute("aria-pressed", String(id === p?.id));
      if (p) {
        details.style.display = "flex";
        setText(dName, p.name);
        setText(dSub, p.stop ? `${p.sub} · ${p.stop}` : p.sub);
      } else {
        details.style.display = "none";
      }
    }
    dClose.addEventListener("click", () => setSelected(null));
    setSelected(props.places[0] ?? null);

    const applyFilter = (group: string) => {
      for (const p of props.places) {
        const m = markers.get(p.id);
        if (!m) continue;
        const show = group === "all" || p.group === group;
        m.style.display = show ? "" : "none";
      }
      const visible = props.places.filter((p) => group === "all" || p.group === group);
      if (selected && !visible.some((p) => p.id === selected!.id)) setSelected(visible[0] ?? null);
    };
    select.addEventListener("change", () => {
      applyFilter(select.value);
      ctx.emit?.("filter", { group: select.value });
    });
    reset.addEventListener("click", () => {
      select.value = "all";
      applyFilter("all");
      setSelected(props.places[0] ?? null);
    });

    // expand → dialog with a larger copy of the same map
    const dialog = h("dialog", { class: "iui-map-dialog" }) as HTMLDialogElement;
    const dialogMap = h("div", { class: "iui-map iui-map-expanded" });
    dialogMap.append(terrain(), dash.cloneNode(true), markerWrap.cloneNode(true));
    const dlgClose = h("button", { class: "iui-map-expand", type: "button", text: "Close ✕" });
    dlgClose.addEventListener("click", () => dialog.close());
    dialogMap.append(dlgClose);
    dialog.append(dialogMap);
    el.append(dialog);
    expand.addEventListener("click", () => dialog.showModal());
    dialogMap.querySelectorAll(".iui-map-marker").forEach((node, idx) => {
      node.addEventListener("click", () => {
        setSelected(props.places[idx]);
        dialog.close();
        map.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    });
  },
);
