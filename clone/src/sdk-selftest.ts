import {
  createIntelligentUI,
  encodeOps,
  type IntelligentUIOptions,
  type IuiEvent,
} from "./sdk/index";
import {
  createIuiExtractor,
  formatIuiAction,
  IUI_ACTION_PREFIX,
  iuiSystemPrompt,
  iuiTool,
  parseAgentText,
  parseIuiAction,
  validateOps,
} from "./sdk/agent";
import { renderInline } from "./iui/md";

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];
const stage = document.getElementById("stage")!;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function test(name: string, fn: () => string | Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function mount(options: Partial<Omit<IntelligentUIOptions, "container">> = {}) {
  const host = document.createElement("div");
  stage.append(host);
  const ui = createIntelligentUI({
    container: host,
    theme: "light",
    animate: false,
    scroll: "none",
    ...options,
  });
  return { host, ui };
}

await test("NDJSON buffering (7-byte chunks)", () => {
  const { host, ui } = mount();
  const wire = encodeOps([
    { t: "p" },
    { t: "md", v: "Hello **world** — streamed." },
    { t: "comp", id: "c1", type: "card", props: { title: "Card", body: "Body copy" } },
    { t: "ask", v: ["One", "Two"] },
    { t: "done" },
  ]);
  for (let i = 0; i < wire.length; i += 7) ui.ingest(wire.slice(i, i + 7));

  assert(ui.answers.length === 1, `expected 1 answer, got ${ui.answers.length}`);
  const answer = ui.answers[0];
  assert(answer.done, "answer did not finish");
  assert(host.textContent?.includes("Hello world"), "markdown text missing");
  assert(host.querySelector('[data-block="card"]'), "card block missing");
  assert(host.querySelectorAll(".iui-action").length === 2, "suggestion chips missing");
  const detail = `${wire.length} bytes / ${Math.ceil(wire.length / 7)} chunks · ${answer.opCount} ops`;
  ui.destroy();
  return detail;
});

await test("connect(AsyncIterable, NDJSON)", async () => {
  const { host, ui } = mount();
  async function* source() {
    yield '{"t":"p"}\n{"t":"md","v":"Split ';
    await sleep(5);
    yield 'line"}\n';
    yield '{"t":"done"}\n';
  }
  const answer = await ui.connect(source());
  assert(answer.done, "answer did not finish");
  assert(host.textContent?.includes("Split line"), "streamed prose missing");
  ui.destroy();
  return "async iterable → answer + done";
});

await test("connect(ReadableStream, SSE)", async () => {
  const { host, ui } = mount();
  const ops = [
    { t: "p" },
    { t: "md", v: "SSE works" },
    { t: "comp", id: "c1", type: "chips", props: { items: ["a", "b"] } },
    { t: "done" },
  ];
  const payload =
    ops.map((op) => `data: ${JSON.stringify(op)}\n\n`).join("") + "data: [DONE]\n\n";
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < payload.length; i += 11) {
        controller.enqueue(encoder.encode(payload.slice(i, i + 11)));
      }
      controller.close();
    },
  });
  const answer = await ui.connect(stream, { format: "sse" });
  assert(answer.done, "answer did not finish");
  assert(host.textContent?.includes("SSE works"), "SSE prose missing");
  assert(host.querySelectorAll(".iui-chip").length === 2, "SSE block missing");
  ui.destroy();
  return `${payload.length} bytes split every 11 chars`;
});

await test("connect(data: URL, NDJSON)", async () => {
  const { host, ui } = mount();
  const body = encodeOps([
    { t: "p" },
    { t: "md", v: "From a data URL" },
    { t: "done" },
  ]);
  const answer = await ui.connect("data:application/x-ndjson," + encodeURIComponent(body));
  assert(answer.done, "answer did not finish");
  assert(host.textContent?.includes("From a data URL"), "data URL prose missing");
  ui.destroy();
  return "fetch(Response) path";
});

await test("validation repairs / drops unsafe ops", () => {
  const result = validateOps([
    { t: "comp", id: "u", type: "definitelyNotABlock", props: {} },
    { t: "comp", id: "f", type: "figure", props: { img: "javascript:alert(1)", caption: "x" } },
    { t: "comp", type: "card", props: { title: "Auto id" } },
    { t: "md", v: "ok" },
    { t: "table", head: ["a", "b"], rows: [["1"]] },
  ]);
  const figure = result.ops.find((op) => op.t === "comp" && op.type === "figure");
  assert(figure && figure.t === "comp", "safe part of figure should survive");
  assert(figure && figure.t === "comp" && !("img" in (figure.props ?? {})), "unsafe image URL survived");
  const card = result.ops.find((op) => op.t === "comp" && op.type === "card");
  assert(card && card.t === "comp" && !!card.id, "missing id was not assigned");
  const table = result.ops.find((op) => op.t === "table");
  assert(table && table.t === "table" && table.rows[0].length === 2, "ragged table not repaired");
  assert(result.issues.length >= 3, "expected issues to be reported");
  return `${result.ops.length} ops kept, ${result.issues.length} issues`;
});

await test("markdown links: scheme allowlist", () => {
  const host = document.createElement("div");
  host.append(renderInline("[ok](https://example.com) [bad](javascript:alert(1)) [rel](/pricing)"));
  const links = [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  assert(links.length === 2, `expected 2 links, got ${links.length}`);
  assert(links.includes("https://example.com"), "https link dropped");
  assert(!links.some((href) => href?.startsWith("javascript:")), "javascript: link survived");
  return links.join(", ");
});

await test("agent extractor (fenced iui block)", () => {
  const text =
    "Intro line.\n\n```iui\n" +
    '{"t":"p"}\n{"t":"md","v":"From fence"}\n' +
    '{"t":"comp","id":"c1","type":"chips","props":{"items":["x"]}}\n' +
    '{"t":"done"}\n```\n\nOutro line.\n';
  const ops: unknown[] = [];
  let prose = "";
  const issues: unknown[] = [];
  const extractor = createIuiExtractor({
    onOp: (op) => ops.push(op),
    onText: (t) => (prose += t),
    onIssue: (i) => issues.push(i),
  });
  for (let i = 0; i < text.length; i += 13) extractor.push(text.slice(i, i + 13));
  extractor.end();
  assert(ops.length === 4, `expected 4 ops, got ${ops.length}`);
  assert(issues.length === 0, `unexpected issues: ${JSON.stringify(issues)}`);
  assert(prose.includes("Intro line."), "leading prose missing");
  assert(prose.includes("Outro line."), "trailing prose missing");
  assert(!prose.includes("```"), "fence leaked into prose");
  return `${ops.length} ops · ${prose.trim().replace(/\s+/g, " ").length} chars prose`;
});

await test("parseAgentText (finished answer)", () => {
  const answer =
    "Before.\n```iui\n{\"t\":\"p\"}\n{\"t\":\"md\",\"v\":\"Hi\"}\n{\"t\":\"done\"}\n```\nAfter.";
  const parsed = parseAgentText(answer);
  assert(parsed.ops.length === 3, `expected 3 ops, got ${parsed.ops.length}`);
  assert(parsed.text.includes("Before.") && parsed.text.includes("After."), "prose lost");
  assert(!parsed.text.includes("```"), "fence not stripped");
  return `${parsed.ops.length} ops · issues ${parsed.issues.length}`;
});

await test("tool schema", () => {
  const tool = iuiTool();
  assert(tool.function.name === "render_iui", "tool name");
  const ops = tool.function.parameters.properties.ops;
  assert(ops.type === "array" && !!ops.items, "ops array schema");
  return `${tool.function.name} · ${JSON.stringify(ops.items.properties)}`;
});

await test("agent action envelope", () => {
  const wire = formatIuiAction({
    action: "select",
    blockId: "c1",
    blockType: "tabs",
    answerId: "a1",
    payload: { value: "Option B" },
  });
  assert(wire.startsWith(IUI_ACTION_PREFIX), "action prefix missing");
  const parsed = parseIuiAction(wire);
  assert(parsed?.action === "select", "action name not parsed");
  assert(parsed.blockId === "c1" && parsed.payload?.value === "Option B", "action payload lost");
  assert(parseIuiAction("ordinary chat message") === null, "ordinary text parsed as action");
  assert(iuiSystemPrompt().includes(IUI_ACTION_PREFIX), "system prompt lacks action contract");
  return wire.slice(0, 72);
});

await test("insight blocks (chart, stats, timeline, calendar)", () => {
  const events: IuiEvent[] = [];
  const { host, ui } = mount({ onEvent: (event) => events.push(event) });
  ui.ingest(
    encodeOps([
      {
        t: "comp",
        id: "chart1",
        type: "chart",
        props: {
          title: "Weekly active agents",
          labels: ["Mon", "Tue", "Wed"],
          series: [{ name: "Agents", values: [12, 18, 15] }],
        },
      },
      {
        t: "comp",
        id: "stats1",
        type: "stats",
        props: {
          items: [
            { label: "Valid ops", value: "98.4%", change: "+2.1 pts", trend: "up" },
            { label: "Repair rate", value: "4.2%", change: "-1.3 pts", trend: "down" },
          ],
        },
      },
      {
        t: "comp",
        id: "timeline1",
        type: "timeline",
        props: {
          items: [
            { date: "2026-09-01", title: "MCP adapter", status: "done" },
            { date: "2026-10-25", title: "DSH adapter", status: "current" },
          ],
        },
      },
      {
        t: "comp",
        id: "calendar1",
        type: "calendar",
        props: {
          month: "2026-10",
          select: "2026-10-14",
          events: [
            { date: "2026-10-14", title: "Design review", time: "09:30" },
            { date: "2026-10-20", title: "Release", time: "16:00", tone: "success" },
          ],
        },
      },
      { t: "done" },
    ]),
  );

  assert(host.querySelector('[data-block="chart"] .iui-chart-line'), "chart line missing");
  assert(host.querySelectorAll(".iui-legend span").length >= 2, "chart legend missing");
  assert(host.querySelectorAll(".iui-stat").length === 2, "stats cards missing");
  assert(host.querySelectorAll(".iui-timeline-item").length === 2, "timeline entries missing");
  assert(host.querySelectorAll(".iui-calendar-day:not(.is-empty)").length === 31, "calendar days missing");

  const day = host.querySelector<HTMLButtonElement>('[data-date="2026-10-20"]');
  assert(day, "calendar day button missing");
  day.click();
  assert(day.getAttribute("aria-pressed") === "true", "calendar selection not applied");
  assert(
    host.querySelector(".iui-calendar-events")?.textContent?.includes("Release"),
    "selected-day events missing",
  );
  const selected = events.find((event) => event.type === "block" && event.name === "select");
  if (!selected || selected.type !== "block") throw new Error("calendar select event missing");
  assert(selected.detail.date === "2026-10-20", "calendar event date wrong");
  ui.destroy();
  return "chart + stats + timeline + calendar select";
});

await test("advanced blocks (matrix, code, diff, fileTree, formula, flashcards)", () => {
  const events: IuiEvent[] = [];
  const { host, ui } = mount({ onEvent: (event) => events.push(event) });
  ui.ingest(
    encodeOps([
      {
        t: "comp",
        id: "matrix1",
        type: "matrix",
        props: {
          title: "Option comparison",
          columns: [{ label: "Cost" }, { label: "Speed" }, { label: "Fit" }],
          rows: [
            { label: "Option A", values: [4, 9, 7] },
            { label: "Option B", values: [8, 5, 6] },
          ],
          caption: "Higher is better except cost",
        },
      },
      {
        t: "comp",
        id: "code1",
        type: "code",
        props: {
          title: "Patch the prompt",
          path: "src/sdk/agent.ts",
          lang: "ts",
          start: 10,
          highlight: [11],
          code: "const first = 1;\nconst second = 2;\nreturn first + second;",
        },
      },
      {
        t: "comp",
        id: "diff1",
        type: "diff",
        props: {
          path: "src/sdk/agent.ts",
          lines: [
            { t: "ctx", text: "export function run() {" },
            { t: "del", text: "  return oldValue;" },
            { t: "add", text: "  return newValue;" },
            { t: "ctx", text: "}" },
          ],
        },
      },
      {
        t: "comp",
        id: "tree1",
        type: "fileTree",
        props: {
          root: "intelligent-ui/",
          items: [
            { path: "src/", type: "dir" },
            { path: "src/iui/", type: "dir" },
            { path: "src/iui/registry.ts", status: "modified", note: "state bindings" },
          ],
        },
      },
      {
        t: "comp",
        id: "formula1",
        type: "formula",
        props: {
          title: "Annual subscription",
          expression: "monthly × 12 = annual",
          vars: [
            { symbol: "m", label: "Monthly", value: "$220" },
            { symbol: "n", label: "Months", value: "12" },
          ],
          result: "$2,640",
          steps: [{ label: "Multiply", expression: "220 × 12", result: "2,640" }],
        },
      },
      {
        t: "comp",
        id: "cards1",
        type: "flashcards",
        props: {
          title: "Recall",
          cards: [
            { front: "What is IUI?", back: "A streamed UI protocol.", tag: "basics" },
            { front: "Tool name?", back: "render_iui" },
          ],
        },
      },
      { t: "done" },
    ]),
  );

  assert(host.querySelectorAll(".iui-matrix-table tbody tr").length === 2, "matrix rows missing");
  assert(host.querySelectorAll(".iui-matrix-cell.is-best").length === 1, "matrix best cell missing");
  assert(host.querySelector(".iui-code-path")?.textContent === "src/sdk/agent.ts", "code path missing");
  assert(host.querySelectorAll(".iui-code-line").length === 3, "code lines missing");
  assert(host.querySelectorAll('.iui-diff-line[data-kind="add"]').length === 1, "diff add row missing");
  assert(host.querySelectorAll(".iui-filetree-row").length === 3, "file tree rows missing");
  assert(host.querySelector(".iui-formula-result")?.textContent?.includes("$2,640"), "formula result missing");
  const card = host.querySelector<HTMLButtonElement>(".iui-flashcard");
  assert(card, "flashcard missing");
  card.click();
  assert(card.getAttribute("aria-pressed") === "true", "flashcard did not flip");
  const flip = events.find((event) => event.type === "block" && event.name === "flip");
  if (!flip || flip.type !== "block") throw new Error("flashcard flip event missing");
  assert(flip.detail.side === "back" && flip.detail.index === 0, "flashcard event payload wrong");
  ui.destroy();
  return "matrix + code + diff + fileTree + formula + flashcards";
});

await test("state bindings (set patches components)", () => {
  const { host, ui } = mount();
  ui.ingest(
    encodeOps([
      {
        t: "comp",
        id: "chart1",
        type: "chart",
        props: { title: "Before", labels: ["Mon", "Tue"], series: [{ name: "Agents", values: [1, 2] }] },
      },
      {
        t: "comp",
        id: "stats1",
        type: "stats",
        props: { items: [{ label: "Before", value: "1" }] },
      },
      {
        t: "comp",
        id: "matrix1",
        type: "matrix",
        props: {
          columns: [{ label: "A" }, { label: "B" }],
          rows: [
            { label: "One", values: [1, 2] },
            { label: "Two", values: [3, 4] },
          ],
        },
      },
    ]),
  );
  ui.ingest(
    encodeOps([
      { t: "set", id: "chart1", path: "title", v: "After" },
      { t: "set", id: "chart1", path: "labels", v: ["Mon", "Tue"] },
      { t: "set", id: "chart1", path: "series", v: [{ name: "Agents", values: [30, 10] }] },
      { t: "set", id: "stats1", path: "items", v: [{ label: "After", value: "2" }] },
      {
        t: "set",
        id: "matrix1",
        path: "rows",
        v: [
          { label: "One", values: [5, 6] },
          { label: "Two", values: [7, 8] },
        ],
      },
      { t: "set", id: "matrix1", path: "rows.0.values.0", v: 99 },
      { t: "done" },
    ]),
  );

  const chart = host.querySelector('[data-block="chart"]');
  const stats = host.querySelector('[data-block="stats"]');
  const matrix = host.querySelector('[data-block="matrix"]');
  assert(host.querySelectorAll('[data-block="chart"]').length === 1, "chart remounted twice");
  assert(chart?.querySelector(".iui-panel-title")?.textContent === "After", "chart title not patched");
  assert(chart?.textContent?.includes("30"), "chart series not patched");
  assert(stats?.querySelectorAll(".iui-stat").length === 1, "stats not replaced");
  assert(stats?.textContent?.includes("After"), "stats content not patched");
  assert(matrix?.querySelectorAll(".iui-matrix-table tbody tr").length === 2, "matrix rows not replaced");
  assert(matrix?.textContent?.includes("99"), "nested matrix path not patched");
  ui.destroy();
  return "chart title/labels/series + stats items + nested matrix path";
});

await test("block interaction events", () => {
  const host = document.createElement("div");
  stage.append(host);
  const events: IuiEvent[] = [];
  const ui = createIntelligentUI({
    container: host,
    theme: "light",
    animate: false,
    scroll: "none",
    onEvent: (event) => events.push(event),
  });
  ui.ingest(
    encodeOps([
      {
        t: "comp",
        id: "c1",
        type: "checklist",
        props: {
          title: "T",
          total: 2,
          items: [
            { time: "0:00", title: "One", detail: "first" },
            { time: "1:00", title: "Two", detail: "second" },
          ],
        },
      },
    ]),
  );
  const box = host.querySelector<HTMLInputElement>(".iui-checklist-item input");
  assert(box, "checkbox not rendered");
  box.click();
  const change = events.find((event) => event.type === "block" && event.name === "change");
  if (!change || change.type !== "block") throw new Error("no block event");
  assert(change.detail.completed === 1, "wrong completed count");
  const detail = JSON.stringify(change.detail);
  ui.destroy();
  return detail;
});

await test("unknown block → event, not mounted", () => {
  const events: IuiEvent[] = [];
  const { host, ui } = mount({ onEvent: (event) => events.push(event) });
  ui.ingest(
    encodeOps([
      { t: "comp", id: "x1", type: "not-a-real-block", props: { title: "nope" } },
      { t: "done" },
    ]),
  );
  assert(!host.querySelector('[data-block="not-a-real-block"]'), "unknown block was mounted");
  const event = events.find((item) => item.type === "unknown-block");
  assert(event && event.type === "unknown-block", "no unknown-block event");
  assert(event.id === "x1" && event.blockType === "not-a-real-block", "wrong event payload");
  assert(!host.textContent?.includes("nope"), "unknown props leaked into the answer");
  ui.destroy();
  return `${event.blockType} @ ${event.id}`;
});

await test("theme + lifecycle", () => {
  const host = document.createElement("div");
  stage.append(host);
  const ui = createIntelligentUI({ container: host, theme: "dark", scroll: "none" });
  assert(ui.el.getAttribute("data-theme") === "dark", "dark theme not applied");
  ui.setTheme("light");
  assert(ui.el.getAttribute("data-theme") === "light", "light theme not applied");
  ui.setTokens({ font: "Georgia, serif", "--iui-text": "#123456" });
  assert(ui.el.style.getPropertyValue("--iui-font").includes("Georgia"), "token override missed");
  ui.setTokens({ font: "Georgia, serif" }, true);
  assert(ui.el.style.getPropertyValue("--iui-text") === "", "replaced tokens were not removed");
  ui.destroy();
  assert(!host.querySelector(".iui-root"), "root not removed on destroy");
  return "theme, token replace, destroy";
});

await test("theme inherit follows the host dark marker", () => {
  const host = document.createElement("div");
  host.className = "dark";
  stage.append(host);
  const ui = createIntelligentUI({ container: host, theme: "inherit", scroll: "none" });
  assert(ui.el.getAttribute("data-theme") === "dark", "host dark marker not applied");
  assert(
    getComputedStyle(ui.el).getPropertyValue("color-scheme").includes("dark"),
    "dark color-scheme missing",
  );
  host.classList.remove("dark");
  ui.setTheme("inherit");
  assert(ui.el.getAttribute("data-theme") === "light", "host light marker not applied");
  assert(
    getComputedStyle(ui.el).getPropertyValue("color-scheme").includes("light"),
    "light color-scheme missing",
  );
  ui.destroy();
  return "inherit -> dark/light without a host workaround";
});

await test("set op rejects unsafe URLs", () => {
  const events: IuiEvent[] = [];
  const { host, ui } = mount({ onEvent: (event) => events.push(event) });
  ui.ingest(
    encodeOps([
      {
        t: "comp",
        id: "f1",
        type: "figure",
        props: { img: "https://example.com/safe.png", alt: "Before" },
      },
    ]),
  );
  const image = host.querySelector<HTMLImageElement>(".iui-figure img");
  assert(image, "figure image missing");
  const before = image.getAttribute("src");
  ui.ingest(encodeOps([{ t: "set", id: "f1", path: "img", v: "javascript:alert(1)" }]));
  ui.end();
  assert(image.getAttribute("src") === before, "unsafe set URL replaced the image");
  assert(
    events.some((event) => event.type === "validation"),
    "unsafe set URL did not emit a validation event",
  );
  ui.destroy();
  return "javascript URL dropped, safe src unchanged";
});

await test("runtime enforces the op budget", () => {
  const events: IuiEvent[] = [];
  const { ui } = mount({ onEvent: (event) => events.push(event) });
  ui.ingest(encodeOps(Array.from({ length: 520 }, () => ({ t: "p" }))));
  ui.end();
  assert(ui.answers[0].opCount === 512, `expected 512 ops, got ${ui.answers[0].opCount}`);
  assert(
    events.some(
      (event) =>
        event.type === "validation" &&
        event.issues.some((issue) => issue.message.includes("op limit")),
    ),
    "op limit event missing",
  );
  ui.destroy();
  return "520 input ops -> 512 applied";
});

await test("duplicate ids and unknown set targets are reported", () => {
  const events: IuiEvent[] = [];
  const { host, ui } = mount({ onEvent: (event) => events.push(event) });
  ui.ingest(
    encodeOps([
      { t: "comp", id: "same", type: "card", props: { title: "First" } },
      { t: "comp", id: "same", type: "card", props: { title: "Second" } },
      { t: "set", id: "missing", path: "title", v: "Nope" },
      { t: "done" },
    ]),
  );
  assert(host.querySelectorAll('[data-block="card"]').length === 1, "duplicate block mounted");
  assert(
    events.some(
      (event) =>
        event.type === "validation" &&
        event.issues.some((issue) => issue.message.includes("duplicate component id")),
    ),
    "duplicate id event missing",
  );
  assert(
    events.some(
      (event) =>
        event.type === "validation" &&
        event.issues.some((issue) => issue.message.includes("set targets unknown")),
    ),
    "unknown set event missing",
  );
  ui.destroy();
  return "duplicate and orphan ops rejected";
});

await test("tabs expose selected state and keyboard navigation", () => {
  const { host, ui } = mount();
  ui.ingest(
    encodeOps([
      {
        t: "comp",
        id: "tabs1",
        type: "tabs",
        props: { items: ["One", "Two"], panels: { One: "First", Two: "Second" } },
      },
      { t: "done" },
    ]),
  );
  const tabs = [...host.querySelectorAll<HTMLButtonElement>(".iui-tab")];
  assert(tabs.length === 2, "expected two tabs");
  assert(tabs[0].getAttribute("aria-selected") === "true", "first tab not selected");
  assert(tabs[1].getAttribute("aria-selected") === "false", "second tab selected early");
  assert(tabs[0].tabIndex === 0 && tabs[1].tabIndex === -1, "roving tabindex missing");
  assert(host.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby") === tabs[0].id, "tabpanel label missing");
  tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  assert(tabs[1].getAttribute("aria-selected") === "true", "ArrowRight did not select the next tab");
  assert(host.querySelector(".iui-tab-body")?.textContent?.includes("Second"), "panel did not change");
  ui.destroy();
  return "aria-selected, tabpanel, roving tabindex, ArrowRight";
});

await test("forms keep radio groups separate", () => {
  const { host, ui } = mount();
  ui.ingest(
    encodeOps([
      {
        t: "comp",
        id: "form1",
        type: "form",
        props: {
          fieldsets: [{ legend: "First", options: ["A", "B"] }],
          cta: "Send",
        },
      },
      {
        t: "comp",
        id: "form2",
        type: "form",
        props: {
          fieldsets: [{ legend: "Second", options: ["A", "B"] }],
          cta: "Send",
        },
      },
      { t: "done" },
    ]),
  );
  const names = [...new Set([...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((input) => input.name))];
  assert(names.length === 2, `expected two radio groups, got ${names.length}`);
  ui.destroy();
  return names.join(" / ");
});

await test("map expand mirrors aria-expanded", async () => {
  const { host, ui } = mount();
  ui.ingest(
    encodeOps([
      {
        t: "comp",
        id: "map1",
        type: "map",
        props: {
          groups: [{ id: "all", label: "All" }],
          places: [{ id: "p1", name: "One", sub: "First", group: "all", x: 20, y: 30 }],
        },
      },
      { t: "done" },
    ]),
  );
  const expand = host.querySelector<HTMLButtonElement>(".iui-map-expand");
  const dialog = host.querySelector<HTMLDialogElement>(".iui-map-dialog");
  assert(expand && dialog, "map expand controls missing");
  expand.click();
  assert(expand.getAttribute("aria-expanded") === "true", "expand did not set aria-expanded");
  dialog.close();
  await sleep(50);
  assert(expand.getAttribute("aria-expanded") === "false", "close did not clear aria-expanded");
  ui.destroy();
  return "expand -> dialog -> close";
});

await test("lightboxes are scoped to each runtime root", () => {
  const first = mount();
  const second = mount();
  const payload = encodeOps([
    {
      t: "comp",
      id: "looks",
      type: "outfitGrid",
      props: {
        items: [{ img: "data:image/png;base64,iVBORw0KGgo=", title: "Look" }],
      },
    },
    { t: "done" },
  ]);
  first.ui.ingest(payload);
  second.ui.ingest(payload);
  first.host.querySelector<HTMLButtonElement>(".iui-enlarge")?.click();
  second.host.querySelector<HTMLButtonElement>(".iui-enlarge")?.click();
  assert(first.host.querySelectorAll("dialog.iui-lightbox").length === 1, "first lightbox missing");
  assert(second.host.querySelectorAll("dialog.iui-lightbox").length === 1, "second lightbox missing");
  first.ui.reset();
  assert(first.host.querySelectorAll("dialog.iui-lightbox").length === 0, "reset did not close the first lightbox");
  assert(second.host.querySelectorAll("dialog.iui-lightbox").length === 1, "reset removed the second lightbox");
  first.ui.destroy();
  second.ui.destroy();
  return "one dialog per .iui-theme root";
});

await test("mount errors become IuiEvent errors", () => {
  const events: IuiEvent[] = [];
  const { ui } = mount({ onEvent: (event) => events.push(event) });
  ui.registerBlock("selftestBoom", () => {
    throw new Error("boom");
  });
  ui.ingest(
    encodeOps([
      { t: "comp", id: "boom1", type: "selftestBoom", props: {} },
      { t: "done" },
    ]),
  );
  const error = events.find((event) => event.type === "error" && event.phase === "mount");
  assert(error && error.type === "error", "mount error event missing");
  assert(error.error.message === "boom", "wrong mount error message");
  ui.destroy();
  return "mount phase error emitted";
});

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;

const summary = document.getElementById("summary")!;
summary.textContent = `${passed}/${results.length} passed${failed ? ` · ${failed} failed` : ""}`;
summary.style.color = failed ? "#c02626" : "#0a7c42";

const rows = document.getElementById("rows")!;
for (const result of results) {
  const tr = document.createElement("tr");
  const status = document.createElement("td");
  status.className = result.ok ? "pass" : "fail";
  status.textContent = result.ok ? "PASS" : "FAIL";
  const name = document.createElement("td");
  name.textContent = result.name;
  const detail = document.createElement("td");
  const code = document.createElement("code");
  code.textContent = result.detail;
  detail.append(code);
  tr.append(status, name, detail);
  rows.append(tr);
}

(window as unknown as Record<string, unknown>).__selftest = {
  pass: passed,
  fail: failed,
  total: results.length,
  results,
};
