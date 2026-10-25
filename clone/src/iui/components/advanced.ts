/* =========================================================================
   Advanced answer surfaces — decisions, code and recall.
   -------------------------------------------------------------------------
   matrix   rows × columns trade-off table with score bars
   code     line-numbered snippet with an optional highlight range
   diff     unified diff with add/delete/context rows
   fileTree repository tree with change status
   formula  expression + variables + result + steps
   flashcards flip cards that keep their state local to the host
   ========================================================================= */

import { h } from "../dom";
import { defineBlock, type Ctx } from "../registry";
import { safeText } from "../security";

/* ------------------------------------------------------------------ utils */

function text(raw: unknown, max = 4000): string {
  return safeText(raw, max).trim();
}

function int(raw: unknown, min: number, max: number, fallback: number): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : fallback;
  return Math.min(max, Math.max(min, value));
}

function num(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function panelHead(title: unknown, sub: unknown): HTMLElement | null {
  const heading = text(title, 240);
  const subtitle = text(sub, 500);
  if (!heading && !subtitle) return null;
  const head = h("div", { class: "iui-panel-head" });
  if (heading) head.append(h("div", { class: "iui-panel-title", text: heading }));
  if (subtitle) head.append(h("div", { class: "iui-panel-sub", text: subtitle }));
  return head;
}

function footnote(raw: unknown): HTMLElement | null {
  const note = text(raw, 500);
  return note ? h("p", { class: "iui-panel-footnote", text: note }) : null;
}

function formatNumber(value: number, format: unknown, currency: unknown): string {
  const abs = Math.abs(value);
  const digits = Number.isInteger(abs)
    ? 0
    : abs < 0.01
      ? 4
      : abs < 1
        ? 2
        : abs < 100
          ? 1
          : 0;
  try {
    if (format === "percent") {
      return `${value.toLocaleString("en-US", { maximumFractionDigits: digits })}%`;
    }
    if (format === "currency") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency:
          typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency)
            ? currency.toUpperCase()
            : "USD",
        maximumFractionDigits: digits,
      }).format(value);
    }
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: format === "score" ? 1 : digits,
    }).format(value);
  } catch {
    return String(value);
  }
}

/* ----------------------------------------------------------------- matrix */

type MatrixColumn = { label: string; sub?: string };
type MatrixRow = {
  label: string;
  sub?: string;
  values: (string | number)[];
  note?: string;
};

defineBlock(
  "matrix",
  (
    el,
    props: {
      title?: string;
      sub?: string;
      columns?: MatrixColumn[];
      rows?: MatrixRow[];
      best?: "high" | "low" | "none";
      max?: number;
      format?: "number" | "score" | "percent" | "currency";
      currency?: string;
      caption?: string;
    },
  ) => {
    const columns = Array.isArray(props.columns)
      ? props.columns.slice(0, 5).map((column) => ({
          label: text(column?.label, 80) || "Option",
          sub: text(column?.sub, 100) || undefined,
        }))
      : [];
    const rows = Array.isArray(props.rows)
      ? props.rows.slice(0, 8).map((row) => ({
          label: text(row?.label, 100) || "Criterion",
          sub: text(row?.sub, 160) || undefined,
          values: Array.isArray(row?.values) ? row.values.slice(0, columns.length) : [],
          note: text(row?.note, 200) || undefined,
        }))
      : [];

    const section = h("section", { class: "iui-panel iui-matrix" });
    const head = panelHead(props.title, props.sub);
    if (head) section.append(head);

    if (!columns.length || !rows.length) {
      section.append(h("div", { class: "iui-empty", text: "No matrix data" }));
      el.append(section);
      return;
    }

    const numeric = rows.flatMap((row) =>
      row.values.map((value) => num(value)).filter((value): value is number => value !== null),
    );
    const scaleMax = (() => {
      const explicit = num(props.max);
      if (explicit !== null && explicit > 0) return explicit;
      if (props.format === "percent") return 100;
      return Math.max(1, ...numeric.map((value) => Math.abs(value)));
    })();

    let bestCells = new Set<string>();
    if (props.best !== "none" && numeric.length) {
      const extreme = props.best === "low" ? Math.min(...numeric) : Math.max(...numeric);
      rows.forEach((row, rowIndex) => {
        row.values.forEach((value, columnIndex) => {
          if (num(value) === extreme) bestCells.add(`${rowIndex}:${columnIndex}`);
        });
      });
    }

    const scroll = h("div", { class: "iui-matrix-scroll" });
    const table = h("table", {
      class: "iui-matrix-table",
      "aria-label": text(props.title, 160) || "Comparison matrix",
    });
    const thead = h("thead");
    const headerRow = h("tr");
    headerRow.append(h("th", { scope: "col", class: "iui-matrix-corner" }, h("span", { class: "sr-only", text: "Criterion" })));
    for (const column of columns) {
      const th = h("th", { scope: "col", class: "iui-matrix-col" });
      th.append(h("span", { class: "iui-matrix-col-label", text: column.label }));
      if (column.sub) th.append(h("span", { class: "iui-matrix-col-sub", text: column.sub }));
      headerRow.append(th);
    }
    thead.append(headerRow);
    const tbody = h("tbody");

    rows.forEach((row, rowIndex) => {
      const tr = h("tr");
      const th = h("th", { scope: "row", class: "iui-matrix-row-head" });
      th.append(h("span", { class: "iui-matrix-row-label", text: row.label }));
      if (row.sub) th.append(h("span", { class: "iui-matrix-row-sub", text: row.sub }));
      if (row.note) th.append(h("span", { class: "iui-matrix-row-note", text: row.note }));
      tr.append(th);

      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        const value = row.values[columnIndex];
        const numericValue = num(value);
        const cell = h("td", { class: "iui-matrix-cell" });
        const isBest = bestCells.has(`${rowIndex}:${columnIndex}`);
        if (isBest) cell.classList.add("is-best");
        if (numericValue === null) {
          cell.append(h("span", { class: "iui-matrix-text", text: text(value, 120) }));
        } else {
          const track = h("span", { class: "iui-matrix-track", "aria-hidden": "true" });
          const fill = h("span", { class: "iui-matrix-fill" });
          const width = Math.max(0, Math.min(100, (Math.abs(numericValue) / scaleMax) * 100));
          fill.style.width = `${width}%`;
          track.append(fill);
          cell.append(
            h("span", {
              class: "iui-matrix-value",
              text: formatNumber(numericValue, props.format, props.currency),
            }),
            track,
          );
        }
        if (isBest) cell.setAttribute("aria-label", `Best value: ${cell.textContent}`);
        tr.append(cell);
      }
      tbody.append(tr);
    });

    table.append(thead, tbody);
    scroll.append(table);
    section.append(scroll);
    const note =
      footnote(props.caption) ||
      (numeric.length && props.best !== "none"
        ? h("p", {
            class: "iui-panel-footnote",
            text:
              props.best === "low"
                ? "Lower is better · highlighted cell is best"
                : "Higher is better · highlighted cell is best",
          })
        : null);
    if (note) section.append(note);
    el.append(section);
  },
);

/* ------------------------------------------------------------------- code */

defineBlock(
  "code",
  (
    el,
    props: {
      title?: string;
      sub?: string;
      path?: string;
      lang?: string;
      start?: number;
      highlight?: number[];
      code?: string;
      caption?: string;
    },
  ) => {
    const section = h("section", { class: "iui-panel iui-code" });
    const head = panelHead(props.title, props.sub);
    if (head) section.append(head);

    const path = text(props.path, 240);
    const lang = text(props.lang, 40);
    if (path || lang) {
      const meta = h("div", { class: "iui-code-meta" });
      if (path) meta.append(h("code", { class: "iui-code-path", text: path }));
      if (lang) meta.append(h("span", { class: "iui-code-lang", text: lang }));
      section.append(meta);
    }

    const source = safeText(props.code, 40_000).replace(/\r\n/g, "\n");
    const lines = source.split("\n");
    const truncated = lines.length > 300;
    const visible = lines.slice(0, 300);
    if (!source.trim()) {
      section.append(h("div", { class: "iui-empty", text: "No code" }));
      el.append(section);
      return;
    }

    const start = int(props.start, 1, 999_999, 1);
    const highlighted = new Set(
      (Array.isArray(props.highlight) ? props.highlight : [])
        .map((line) => num(line))
        .filter((line): line is number => line !== null)
        .map((line) => Math.round(line)),
    );
    const scroll = h("div", { class: "iui-code-scroll", tabindex: "0" });
    const pre = h("pre", { class: "iui-code-pre" });
    const code = h("code");
    visible.forEach((line, index) => {
      const lineNo = start + index;
      const row = h("span", {
        class: "iui-code-line",
        "data-line": String(lineNo),
      });
      if (highlighted.has(lineNo)) row.classList.add("is-highlighted");
      row.append(
        h("span", { class: "iui-code-no", "aria-hidden": "true", text: String(lineNo) }),
        h("span", { class: "iui-code-text", text: line || " " }),
      );
      code.append(row);
    });
    pre.append(code);
    scroll.append(pre);
    section.append(scroll);
    if (truncated) {
      section.append(h("p", { class: "iui-panel-footnote", text: "Snippet truncated at 300 lines" }));
    }
    const note = footnote(props.caption);
    if (note) section.append(note);
    el.append(section);
  },
);

/* ------------------------------------------------------------------- diff */

type DiffLine = { t: "add" | "del" | "ctx" | "hunk"; text: string; old?: number; new?: number };

defineBlock(
  "diff",
  (
    el,
    props: {
      title?: string;
      sub?: string;
      path?: string;
      lines?: DiffLine[];
      caption?: string;
    },
  ) => {
    const section = h("section", { class: "iui-panel iui-diff" });
    const head = panelHead(props.title, props.sub);
    if (head) section.append(head);

    const rawLines = Array.isArray(props.lines) ? props.lines.slice(0, 300) : [];
    const lines = rawLines
      .map((line): DiffLine | null => {
        if (!line || typeof line !== "object") return null;
        const kind =
          line.t === "add" || line.t === "del" || line.t === "hunk" ? line.t : "ctx";
        const body = safeText(line.text, 2000);
        if (kind !== "hunk" && body === "" && line.text === undefined) return null;
        return {
          t: kind,
          text: body,
          old: num(line.old) ?? undefined,
          new: num(line.new) ?? undefined,
        };
      })
      .filter((line): line is DiffLine => line !== null);

    if (!lines.length) {
      section.append(h("div", { class: "iui-empty", text: "No diff lines" }));
      el.append(section);
      return;
    }

    const path = text(props.path, 240);
    const counts = {
      add: lines.filter((line) => line.t === "add").length,
      del: lines.filter((line) => line.t === "del").length,
    };
    const meta = h("div", { class: "iui-diff-meta" });
    if (path) meta.append(h("code", { class: "iui-diff-path", text: path }));
    meta.append(
      h("span", { class: "iui-diff-count is-add", text: `+${counts.add}` }),
      h("span", { class: "iui-diff-count is-del", text: `−${counts.del}` }),
    );
    section.append(meta);

    const body = h("div", { class: "iui-diff-body", role: "table" });
    let oldNo = 1;
    let newNo = 1;
    for (const line of lines) {
      if (line.t === "hunk") {
        const range = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?/.exec(line.text);
        if (range) {
          oldNo = Number(range[1]);
          newNo = Number(range[2]);
        }
        body.append(h("div", { class: "iui-diff-hunk", role: "row" }, h("span", { role: "cell", text: line.text })));
        continue;
      }
      const old = line.old ?? oldNo;
      const next = line.new ?? newNo;
      const row = h("div", { class: "iui-diff-line", "data-kind": line.t, role: "row" });
      const marker = line.t === "add" ? "+" : line.t === "del" ? "−" : " ";
      row.append(
        h("span", {
          class: "iui-diff-marker",
          "aria-hidden": "true",
          role: "cell",
          text: marker,
        }),
        h("span", {
          class: "iui-diff-no",
          "aria-hidden": "true",
          role: "cell",
          text: line.t === "add" ? "" : String(old),
        }),
        h("span", {
          class: "iui-diff-no",
          "aria-hidden": "true",
          role: "cell",
          text: line.t === "del" ? "" : String(next),
        }),
        h("span", { class: "iui-diff-text", role: "cell", text: line.text || " " }),
      );
      body.append(row);
      if (line.t !== "add") oldNo = old + 1;
      if (line.t !== "del") newNo = next + 1;
    }
    section.append(body);
    const note = footnote(props.caption);
    if (note) section.append(note);
    el.append(section);
  },
);

/* --------------------------------------------------------------- fileTree */

type TreeItem = {
  path: string;
  type?: "file" | "dir";
  status?: "new" | "modified" | "deleted";
  note?: string;
};

defineBlock(
  "fileTree",
  (
    el,
    props: {
      title?: string;
      sub?: string;
      root?: string;
      items?: TreeItem[];
      caption?: string;
    },
  ) => {
    const section = h("section", { class: "iui-panel iui-filetree" });
    const head = panelHead(props.title, props.sub);
    if (head) section.append(head);
    const root = text(props.root, 240);
    if (root) section.append(h("div", { class: "iui-filetree-root", text: root }));

    const items = Array.isArray(props.items)
      ? props.items.slice(0, 80).map((item) => ({
          path: text(item?.path, 300).replace(/^\.?\//, ""),
          type: item?.type === "dir" ? ("dir" as const) : item?.type === "file" ? ("file" as const) : null,
          status:
            item?.status === "new" || item?.status === "modified" || item?.status === "deleted"
              ? item.status
              : null,
          note: text(item?.note, 200) || undefined,
        }))
      : [];
    if (!items.length) {
      section.append(h("div", { class: "iui-empty", text: "No files" }));
      el.append(section);
      return;
    }

    const list = h("div", { class: "iui-filetree-list", role: "list" });
    for (const item of items) {
      const cleanPath = item.path.replace(/\/+$/, "");
      if (!cleanPath) continue;
      const parts = cleanPath.split("/");
      const name = parts.at(-1) ?? cleanPath;
      const isDir = item.type === "dir" || (item.type === null && item.path.endsWith("/"));
      const depth = Math.max(0, parts.length - 1);
      const row = h("div", {
        class: "iui-filetree-row",
        role: "listitem",
        "aria-label": cleanPath,
        title: cleanPath,
      });
      row.style.paddingLeft = `${depth * 16}px`;
      const icon = h("span", {
        class: "iui-filetree-icon",
        "aria-hidden": "true",
        text: isDir ? "▸" : "·",
      });
      const label = h("span", {
        class: isDir ? "iui-filetree-name is-dir" : "iui-filetree-name",
        text: name,
      });
      row.append(icon, label);
      if (item.status) {
        row.append(
          h("span", {
            class: "iui-filetree-status",
            "data-status": item.status,
            text: item.status === "modified" ? "modified" : item.status,
          }),
        );
      }
      if (item.note) row.append(h("span", { class: "iui-filetree-note", text: item.note }));
      list.append(row);
    }
    section.append(list);
    const note = footnote(props.caption);
    if (note) section.append(note);
    el.append(section);
  },
);

/* ---------------------------------------------------------------- formula */

type FormulaVar = { symbol: string; label?: string; value: string | number };
type FormulaStep = { label?: string; expression: string; result?: string };

defineBlock(
  "formula",
  (
    el,
    props: {
      title?: string;
      sub?: string;
      expression?: string;
      result?: string;
      unit?: string;
      vars?: FormulaVar[];
      steps?: FormulaStep[];
      note?: string;
    },
  ) => {
    const expression = text(props.expression, 2000);
    const section = h("section", { class: "iui-panel iui-formula" });
    const head = panelHead(props.title, props.sub);
    if (head) section.append(head);

    if (!expression) {
      section.append(h("div", { class: "iui-empty", text: "No formula" }));
      el.append(section);
      return;
    }

    const display = h("div", {
      class: "iui-formula-expression",
      role: "math",
      "aria-label": expression,
      text: expression,
    });
    section.append(display);

    const vars = Array.isArray(props.vars) ? props.vars.slice(0, 12) : [];
    if (vars.length) {
      const dl = h("dl", { class: "iui-formula-vars" });
      for (const variable of vars) {
        const symbol = text(variable?.symbol, 40);
        const label = text(variable?.label, 100);
        const value = text(variable?.value, 100);
        if (!symbol && !label) continue;
        const item = h("div", { class: "iui-formula-var" });
        const dt = h("dt");
        if (symbol) dt.append(h("span", { class: "iui-formula-symbol", text: symbol }));
        if (label) dt.append(h("span", { class: "iui-formula-var-label", text: label }));
        item.append(dt, h("dd", { text: value || "—" }));
        dl.append(item);
      }
      section.append(dl);
    }

    const result = text(props.result, 200);
    const unit = text(props.unit, 40);
    if (result) {
      const out = h("div", { class: "iui-formula-result", "aria-live": "polite" });
      out.append(h("span", { class: "iui-formula-result-value", text: result }));
      if (unit) out.append(h("span", { class: "iui-formula-result-unit", text: unit }));
      section.append(out);
    }

    const steps = Array.isArray(props.steps) ? props.steps.slice(0, 8) : [];
    if (steps.length) {
      const list = h("ol", { class: "iui-formula-steps" });
      for (const step of steps) {
        const stepExpression = text(step?.expression, 500);
        if (!stepExpression) continue;
        const item = h("li");
        const label = text(step?.label, 100);
        if (label) item.append(h("span", { class: "iui-formula-step-label", text: label }));
        item.append(h("span", { class: "iui-formula-step-expression", text: stepExpression }));
        const stepResult = text(step?.result, 100);
        if (stepResult) item.append(h("span", { class: "iui-formula-step-result", text: stepResult }));
        list.append(item);
      }
      section.append(list);
    }

    const note = footnote(props.note);
    if (note) section.append(note);
    el.append(section);
  },
);

/* ------------------------------------------------------------- flashcards */

type Flashcard = { front: string; back: string; hint?: string; tag?: string };

defineBlock(
  "flashcards",
  (
    el,
    props: {
      title?: string;
      sub?: string;
      columns?: number;
      cards?: Flashcard[];
    },
    ctx: Ctx,
  ) => {
    const section = h("section", { class: "iui-panel iui-flashcards" });
    const head = panelHead(props.title, props.sub);
    if (head) section.append(head);

    const cards = Array.isArray(props.cards)
      ? props.cards.slice(0, 20).map((card) => ({
          front: text(card?.front, 500),
          back: text(card?.back, 1200),
          hint: text(card?.hint, 200) || undefined,
          tag: text(card?.tag, 40) || undefined,
        }))
      : [];
    if (!cards.length) {
      section.append(h("div", { class: "iui-empty", text: "No flashcards" }));
      el.append(section);
      return;
    }

    const columns = int(props.columns, 1, 3, 2);
    const grid = h("div", { class: "iui-flashcard-grid" });
    grid.style.setProperty("--iui-flashcard-cols", String(columns));
    section.append(h("p", { class: "iui-flashcard-hint", text: "Tap a card to reveal the answer" }));

    cards.forEach((card, index) => {
      const button = h("button", {
        type: "button",
        class: "iui-flashcard",
        "aria-pressed": "false",
        "aria-label": `${card.front || `Card ${index + 1}`}. Reveal answer`,
      });
      const inner = h("span", { class: "iui-flashcard-inner" });
      const front = h("span", {
        class: "iui-flashcard-face iui-flashcard-front",
        "aria-hidden": "false",
      });
      if (card.tag) front.append(h("span", { class: "iui-flashcard-tag", text: card.tag }));
      front.append(h("span", { class: "iui-flashcard-front-text", text: card.front || "Question" }));
      if (card.hint) front.append(h("span", { class: "iui-flashcard-hint-text", text: card.hint }));
      front.append(h("span", { class: "iui-flashcard-prompt", text: "Reveal" }));
      const back = h("span", {
        class: "iui-flashcard-face iui-flashcard-back",
        "aria-hidden": "true",
      });
      back.append(h("span", { class: "iui-flashcard-back-text", text: card.back || "Answer" }));
      back.append(h("span", { class: "iui-flashcard-prompt", text: "Back" }));
      inner.append(front, back);
      button.append(inner);
      button.addEventListener("click", () => {
        const flipped = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", String(flipped));
        front.setAttribute("aria-hidden", String(flipped));
        back.setAttribute("aria-hidden", String(!flipped));
        button.setAttribute(
          "aria-label",
          flipped
            ? `${card.front || `Card ${index + 1}`}. Hide answer`
            : `${card.front || `Card ${index + 1}`}. Reveal answer`,
        );
        ctx.emit?.("flip", {
          index,
          side: flipped ? "back" : "front",
          front: card.front,
          total: cards.length,
        });
      });
      grid.append(button);
    });
    section.append(grid);
    el.append(section);
  },
);
