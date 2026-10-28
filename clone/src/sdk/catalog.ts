export type PropKind = "string" | "number" | "boolean" | "array" | "object";

export interface PropSpec {
  type: PropKind;
  description?: string;
  enum?: string[];
  items?: PropSpec;
  properties?: Record<string, PropSpec>;
  required?: string[];
}

export interface BlockStateSpec {
  /** Prop path accepted by a `set` op, e.g. "items" or "series". */
  path: string;
  /** Model-facing explanation of what the path replaces. */
  description: string;
}

export interface BlockSpec {
  type: string;
  title: string;
  /** Model-facing explanation: what the block is for. */
  description: string;
  kind: "media" | "layout" | "content" | "interactive" | "domain" | "demo";
  props: {
    type: "object";
    properties: Record<string, PropSpec>;
    required?: string[];
  };
  /** State paths that can be patched after mount with a `set` op. */
  state?: BlockStateSpec[];
}

const s = (description: string, extra: Partial<PropSpec> = {}): PropSpec => ({
  type: "string",
  description,
  ...extra,
});
const n = (description: string): PropSpec => ({ type: "number", description });
const b = (description: string): PropSpec => ({ type: "boolean", description });
const arr = (items: PropSpec, description?: string): PropSpec => ({
  type: "array",
  items,
  ...(description ? { description } : {}),
});
const obj = (properties: Record<string, PropSpec>, required?: string[]): PropSpec => ({
  type: "object",
  properties,
  ...(required ? { required } : {}),
});

const image = (label = "Image URL (https, data:image or same-origin)") =>
  obj({ src: s(label), alt: s("Alt text") }, ["src"]);

export const BLOCK_CATALOG: BlockSpec[] = [
  {
    type: "collage",
    title: "Hero collage",
    description: "1–3 photos in an asymmetric hero grid. Use as the opening visual of a story/answer.",
    kind: "media",
    props: {
      type: "object",
      required: ["images"],
      properties: { images: arr(image(), "1–3 images; first is the largest") },
    },
  },
  {
    type: "strip",
    title: "Image strip",
    description: "1–3 photos in an equal-width horizontal strip. Good for a compact mood board.",
    kind: "media",
    props: {
      type: "object",
      required: ["images"],
      properties: { images: arr(image(), "1–3 images") },
    },
  },
  {
    type: "rtHero",
    title: "Wide mosaic hero",
    description: "Three-photo mosaic (3fr/2fr) used as a wide story hero.",
    kind: "media",
    props: {
      type: "object",
      required: ["images"],
      properties: { images: arr(image(), "Exactly 3 images") },
    },
  },
  {
    type: "pair",
    title: "Image pair",
    description: "Two photos side by side, optionally with a fixed aspect ratio.",
    kind: "media",
    props: {
      type: "object",
      required: ["images"],
      properties: {
        images: arr(image(), "1–2 images"),
        ratio: s("CSS aspect-ratio for each photo, e.g. \"4 / 3\""),
      },
    },
  },
  {
    type: "figure",
    title: "Feature figure",
    description: "One large photo with an optional caption and aspect ratio.",
    kind: "media",
    props: {
      type: "object",
      required: ["img"],
      properties: {
        img: s("Image URL"),
        alt: s("Alt text"),
        ratio: s("CSS aspect-ratio, e.g. \"16 / 9\""),
        caption: s("Caption under the image"),
      },
    },
  },
  {
    type: "mediaRow",
    title: "Media row",
    description: "A row of photo cards with a title and optional subtitle (products, recipes, places).",
    kind: "media",
    props: {
      type: "object",
      required: ["items"],
      properties: {
        items: arr(
          obj(
            { img: s("Image URL"), title: s("Card title"), sub: s("Optional subtitle") },
            ["img", "title"],
          ),
          "2–4 cards",
        ),
      },
    },
  },
  {
    type: "chips",
    title: "Tag chips",
    description: "A single row of small tag chips (dietary tags, categories, amenities).",
    kind: "layout",
    props: {
      type: "object",
      required: ["items"],
      properties: { items: arr(s("Chip label"), "2–6 short labels") },
    },
  },
  {
    type: "card",
    title: "Summary card",
    description: "A generic bordered card with an eyebrow, heading, body copy and a list. Use for tips, summaries, key facts.",
    kind: "content",
    props: {
      type: "object",
      properties: {
        eyebrow: s("Small uppercase label"),
        title: s("Card heading"),
        body: s("Short paragraph"),
        list: arr(s("List item; may contain **bold** and `code`"), "Bullet items"),
      },
    },
  },
  {
    type: "chart",
    title: "Chart",
    description: "Line, area or grouped-bar chart for numeric data. Use for trends, comparisons and distributions; keep it to one question per chart.",
    kind: "content",
    props: {
      type: "object",
      required: ["labels", "series"],
      properties: {
        title: s("Chart heading"),
        sub: s("Optional subtitle or unit note"),
        variant: s("Chart shape", { enum: ["line", "bar", "area"] }),
        labels: arr(s("X-axis label"), "2–24 labels, in display order"),
        series: arr(
          obj(
            {
              name: s("Series name for the legend"),
              values: arr(n("Y value; one per label"), "One value per label"),
              color: s("Optional CSS colour; defaults to a built-in series colour"),
            },
            ["name", "values"],
          ),
          "1–5 series",
        ),
        height: n("Chart height in px (170–420, default 240)"),
        format: s("Number format for values and the y-axis", {
          enum: ["number", "compact", "percent", "currency"],
        }),
        currency: s("ISO 4217 code when format is currency, e.g. USD"),
        legend: b("Show the series legend (default true)"),
        baseline: s("Y-axis baseline: auto (default line/area) or zero (default bar)", {
          enum: ["auto", "zero"],
        }),
      },
    },
    state: [
      { path: "labels", description: "replace x-axis labels" },
      { path: "series", description: "replace all series and values" },
      { path: "title", description: "replace the heading" },
      { path: "sub", description: "replace the subtitle" },
    ],
  },
  {
    type: "stats",
    title: "Metric stats",
    description: "A compact grid of KPI cards: label, display value, optional change/trend and detail. Use for dashboards, summaries and before/after comparisons.",
    kind: "content",
    props: {
      type: "object",
      required: ["items"],
      properties: {
        title: s("Optional section heading"),
        sub: s("Optional subtitle"),
        columns: n("Grid columns, 1–4 (default min(items, 4))"),
        items: arr(
          obj(
            {
              label: s("Metric label"),
              value: s("Display value, e.g. \"$12.4k\", \"38%\" or \"2.1×\""),
              change: s("Optional delta text, e.g. \"+12.4% vs last month\""),
              trend: s("Arrow and colour direction", { enum: ["up", "down", "flat"] }),
              detail: s("Optional supporting note"),
            },
            ["label", "value"],
          ),
          "1–8 metrics",
        ),
      },
    },
    state: [
      { path: "items", description: "replace all metric cards" },
      { path: "title", description: "replace the heading" },
      { path: "sub", description: "replace the subtitle" },
    ],
  },
  {
    type: "menu",
    title: "Menu list",
    description: "Restaurant-style menu: a photo, dish name and description per row.",
    kind: "domain",
    props: {
      type: "object",
      required: ["items"],
      properties: {
        items: arr(
          obj(
            { img: s("Dish photo URL"), title: s("Dish name"), body: s("Dish description") },
            ["img", "title", "body"],
          ),
          "2–6 dishes",
        ),
      },
    },
  },
  {
    type: "outfitGrid",
    title: "Outfit grid",
    description: "Grid of outfit thumbnails that open in a lightbox; title + optional description per look.",
    kind: "domain",
    props: {
      type: "object",
      required: ["items"],
      properties: {
        items: arr(
          obj(
            { img: s("Photo URL"), title: s("Look name"), sub: s("Optional description") },
            ["img", "title"],
          ),
          "2–6 looks",
        ),
      },
    },
  },
  {
    type: "dayList",
    title: "Day-by-day list",
    description: "Vertical day list: photo + day label + title + description + optional closing line.",
    kind: "domain",
    props: {
      type: "object",
      required: ["items"],
      properties: {
        eyebrow: s("Optional small label above the list"),
        variant: s("Thumbnail shape", { enum: ["tall", "square"] }),
        items: arr(
          obj(
            {
              img: s("Photo URL"),
              day: s("Optional day/date label, e.g. \"Day 1 · City\""),
              title: s("Title"),
              body: s("Description"),
              sleep: s("Optional muted closing line, e.g. \"Sleep: ...\""),
            },
            ["img", "title", "body"],
          ),
          "1–8 entries",
        ),
      },
    },
  },
  {
    type: "timeline",
    title: "Timeline",
    description: "Vertical chronological history or roadmap with dated entries, optional tags and done/current/upcoming status. Use for project plans, life stories, process history.",
    kind: "content",
    props: {
      type: "object",
      required: ["items"],
      properties: {
        title: s("Optional section heading"),
        sub: s("Optional subtitle"),
        items: arr(
          obj(
            {
              date: s("Date or period label, e.g. \"2026-03-14\" or \"Q1 2026\""),
              title: s("Entry title"),
              body: s("Optional description"),
              tag: s("Optional short tag, e.g. \"Shipped\""),
              status: s("Visual state of the marker", {
                enum: ["done", "current", "upcoming"],
              }),
              tone: s("Optional accent tone", {
                enum: ["neutral", "success", "warning", "danger"],
              }),
            },
            ["date", "title"],
          ),
          "1–40 entries, in display order",
        ),
      },
    },
    state: [
      { path: "items", description: "replace all dated entries" },
      { path: "title", description: "replace the heading" },
      { path: "sub", description: "replace the subtitle" },
    ],
  },
  {
    type: "calendar",
    title: "Month calendar",
    description: "One-month calendar with dated events, event dots and a selected-day detail list. Users can pick a day; the selection returns as a select action.",
    kind: "interactive",
    props: {
      type: "object",
      required: ["month"],
      properties: {
        title: s("Optional section heading"),
        sub: s("Optional subtitle"),
        month: s("Month to display in YYYY-MM form, e.g. \"2026-10\""),
        weekStart: n("First weekday: 0 = Sunday (default), 1 = Monday"),
        locale: s("BCP-47 locale for month and weekday labels, e.g. \"en-US\" or \"zh-CN\""),
        today: s("Optional YYYY-MM-DD to outline as today"),
        select: s("Optional initially selected YYYY-MM-DD"),
        events: arr(
          obj(
            {
              date: s("Event date, YYYY-MM-DD"),
              title: s("Event title"),
              time: s("Optional time label, e.g. \"09:30\""),
              tone: s("Optional dot tone", {
                enum: ["neutral", "success", "warning", "danger"],
              }),
            },
            ["date", "title"],
          ),
          "0–200 events; dates outside the displayed month are ignored",
        ),
      },
    },
    state: [{ path: "select", description: "change the selected day (YYYY-MM-DD)" }],
  },
  {
    type: "checklist",
    title: "Timed checklist",
    description: "Interactive checklist with a per-item time label and a live 'n of total' counter. Use for cooking steps, routines, procedures.",
    kind: "interactive",
    props: {
      type: "object",
      required: ["title", "items", "total"],
      properties: {
        title: s("Checklist title"),
        total: n("Total number of steps (for the counter)"),
        items: arr(
          obj(
            {
              time: s("Time label, e.g. \"0:00\""),
              title: s("Step title"),
              detail: s("Step detail"),
              done: b("Initially checked"),
            },
            ["time", "title", "detail"],
          ),
          "2–20 steps",
        ),
      },
    },
    state: [{ path: "items", description: "replace steps (include done flags)" }],
  },
  {
    type: "packing",
    title: "Packing list",
    description: "Interactive grouped packing checklist with a progress bar and 'n/total packed' counter.",
    kind: "interactive",
    props: {
      type: "object",
      required: ["title", "total", "groups"],
      properties: {
        title: s("List title"),
        total: n("Total items across all groups"),
        groups: arr(
          obj(
            {
              label: s("Group label"),
              items: arr(
                obj({ text: s("Item text"), done: b("Initially packed") }, ["text"]),
                "Items in this group",
              ),
            },
            ["label", "items"],
          ),
          "1–8 groups",
        ),
      },
    },
    state: [{ path: "groups", description: "replace groups and done flags" }],
  },
  {
    type: "form",
    title: "Preference form",
    description: "One or more radio groups plus a CTA that sends the chosen combination back as a follow-up prompt.",
    kind: "interactive",
    props: {
      type: "object",
      required: ["fieldsets", "cta"],
      properties: {
        fieldsets: arr(
          obj(
            {
              legend: s("Question / group label"),
              options: arr(s("Option label"), "2–6 options"),
              checked: n("Index of the initially selected option (0-based)"),
            },
            ["legend", "options"],
          ),
          "1–4 groups",
        ),
        cta: s("Button label, e.g. \"Build my plan\""),
        ctaPrompt: s("Optional prompt template sent on submit; {0}, {1}… are replaced by the chosen options"),
      },
    },
  },
  {
    type: "calculator",
    title: "Quantity stepper",
    description: "Interactive guest/serving stepper with a live quantities table and an optional copy-to-clipboard list. Use for shopping lists and scaling recipes.",
    kind: "interactive",
    props: {
      type: "object",
      required: ["label", "unit", "value", "rows"],
      properties: {
        title: s("Table heading, e.g. \"Your shopping quantities\""),
        label: s("Small uppercase label above the stepper"),
        unit: s("Unit of the stepper value, e.g. \"servings\""),
        value: n("Initial value"),
        min: n("Minimum"),
        max: n("Maximum"),
        rows: arr(
          obj(
            {
              name: s("Ingredient name"),
              per: n("Amount per unit"),
              unit: s("Unit label"),
              decimals: n("Decimal places (default 0)"),
            },
            ["name", "per", "unit"],
          ),
          "1–12 rows",
        ),
        note: s("Optional footnote"),
        copyLabel: s("Optional copy-button label, e.g. \"Copy shopping list\""),
      },
    },
  },
  {
    type: "tabs",
    title: "Tabbed prose",
    description: "A tab bar that swaps a short markdown panel. Use for comparisons, systems, or alternate explanations.",
    kind: "layout",
    props: {
      type: "object",
      required: ["items", "panels"],
      properties: {
        items: arr(s("Tab label"), "2–6 tabs"),
        panels: obj({}, []),
        select: s("Initially selected tab label"),
      },
    },
  },
  {
    type: "tiles",
    title: "Plan tiles",
    description: "A titled card with a grid of coloured icon tiles and an optional footer arrow. Use for plans, zones, or grouped recommendations.",
    kind: "layout",
    props: {
      type: "object",
      required: ["title", "tiles"],
      properties: {
        title: s("Card title"),
        sub: s("Optional subtitle"),
        cols: n("Grid columns (default 2)"),
        tiles: arr(
          obj(
            {
              bg: s("CSS background colour (hex/rgb/hsl)"),
              icon: s("Optional inline SVG icon markup (sanitized)"),
              label: s("Tile label"),
              sub: s("Optional tile subtitle"),
            },
            ["bg", "label"],
          ),
          "2–8 tiles",
        ),
        footer: s("Optional footer text"),
        arrow: b("Show a down-arrow footer"),
      },
    },
  },
  {
    type: "map",
    title: "Route map",
    description: "Schematic interactive map with numbered stops, a group filter, a details panel and optional destination cards.",
    kind: "interactive",
    props: {
      type: "object",
      required: ["groups", "places"],
      properties: {
        height: n("Map height in px (default ~340)"),
        label: s("Accessible map label"),
        groups: arr(
          obj({ id: s("Group id"), label: s("Group label") }, ["id", "label"]),
          "Filter options; include {\"id\":\"all\",\"label\":\"All\"}",
        ),
        places: arr(
          obj(
            {
              id: s("Stable id"),
              name: s("Place name"),
              sub: s("Short description"),
              group: s("Group id this stop belongs to"),
              x: n("Horizontal position, 0–100"),
              y: n("Vertical position, 0–100"),
              photo: s("Optional photo URL"),
              stop: s("Optional stop label, e.g. \"Night 2\""),
            },
            ["id", "name", "sub", "group", "x", "y"],
          ),
          "1–12 stops",
        ),
        select: s("Initially selected group id"),
        destCards: b("Show destination cards under the map"),
      },
    },
  },
  {
    type: "bike",
    title: "Annotated figure + system tabs",
    description: "Exploded technical illustration with system tabs (frame, wheels, drivetrain…) and a copy panel per system.",
    kind: "domain",
    props: {
      type: "object",
      required: ["tabs", "panels"],
      properties: {
        title: s("Optional heading"),
        tabs: arr(s("System name"), "1–8 systems"),
        panels: obj({}, []),
        select: s("Initially selected tab"),
      },
    },
  },
  {
    type: "steps",
    title: "Step-by-step walkthrough",
    description: "Illustrated multi-step guide with progress dots, assembled/exploded toggle and a per-step check-off.",
    kind: "interactive",
    props: {
      type: "object",
      required: ["title", "sub", "caption", "steps"],
      properties: {
        title: s("Guide title"),
        sub: s("Subtitle"),
        caption: s("Caption under the diagram"),
        start: n("Zero-based initial step"),
        steps: arr(
          obj(
            {
              title: s("Step title"),
              find: s("What to locate, e.g. \"front brake caliper\""),
              body: s("Step instructions"),
              check: obj(
                { title: s("Check-off title"), detail: s("Check-off detail") },
                ["title", "detail"],
              ),
            },
            ["title", "find", "body", "check"],
          ),
          "2–10 steps",
        ),
      },
    },
  },
  {
    type: "matrix",
    title: "Comparison matrix",
    description: "Rows × columns comparison matrix with numeric score bars, optional best-value highlighting and text cells. Use for product/job/option trade-offs.",
    kind: "content",
    props: {
      type: "object",
      required: ["columns", "rows"],
      properties: {
        title: s("Optional section heading"),
        sub: s("Optional subtitle"),
        columns: arr(
          obj({ label: s("Column label"), sub: s("Optional column note") }, ["label"]),
          "2–5 columns",
        ),
        rows: arr(
          obj(
            {
              label: s("Row label"),
              sub: s("Optional row note"),
              values: arr(s("Cell value; numbers become bars, strings stay text"), "One value per column"),
              note: s("Optional footnote for this row"),
            },
            ["label", "values"],
          ),
          "2–8 rows",
        ),
        best: s("Highlight the highest or lowest numeric cell", {
          enum: ["high", "low", "none"],
        }),
        max: n("Score-scale upper bound for bars; defaults to the largest value"),
        format: s("Number format for numeric cells", {
          enum: ["number", "score", "percent", "currency"],
        }),
        currency: s("ISO 4217 code when format is currency"),
        caption: s("Footnote below the matrix"),
      },
    },
    state: [
      { path: "rows", description: "replace all matrix rows" },
      { path: "columns", description: "replace all columns" },
      { path: "title", description: "replace the heading" },
      { path: "sub", description: "replace the subtitle" },
    ],
  },
  {
    type: "code",
    title: "Code block",
    description: "A file path, language badge and line-numbered code snippet. Use for implementation snippets, config and API examples.",
    kind: "content",
    props: {
      type: "object",
      required: ["code"],
      properties: {
        title: s("Optional section heading"),
        sub: s("Optional subtitle"),
        path: s("File path shown above the code"),
        lang: s("Language label, e.g. ts, python, json"),
        start: n("First line number (default 1)"),
        highlight: arr(n("Line number to highlight"), "Optional line numbers"),
        code: s("Verbatim code; newlines are preserved"),
        caption: s("Optional footnote"),
      },
    },
    state: [
      { path: "code", description: "replace the snippet" },
      { path: "path", description: "replace the file path" },
      { path: "title", description: "replace the heading" },
    ],
  },
  {
    type: "diff",
    title: "Code diff",
    description: "Unified diff with added/deleted/context lines, optional old/new line numbers and hunk headers. Use for reviews and proposed patches.",
    kind: "content",
    props: {
      type: "object",
      required: ["lines"],
      properties: {
        title: s("Optional section heading"),
        sub: s("Optional subtitle"),
        path: s("File path shown above the diff"),
        lines: arr(
          obj(
            {
              t: s("Line kind", { enum: ["add", "del", "ctx", "hunk"] }),
              text: s("Line text without the leading +/- marker"),
              old: n("Optional old-file line number"),
              new: n("Optional new-file line number"),
            },
            ["t", "text"],
          ),
          "2–300 lines",
        ),
        caption: s("Optional footnote"),
      },
    },
    state: [
      { path: "lines", description: "replace the diff lines" },
      { path: "path", description: "replace the file path" },
      { path: "title", description: "replace the heading" },
    ],
  },
  {
    type: "fileTree",
    title: "File tree",
    description: "Repository file tree with directories, files, change status and notes. Use for codebase orientation, review scope and patch plans.",
    kind: "content",
    props: {
      type: "object",
      required: ["items"],
      properties: {
        title: s("Optional section heading"),
        sub: s("Optional subtitle"),
        root: s("Repository root label, e.g. \"intelligent-ui/\""),
        items: arr(
          obj(
            {
              path: s("Path relative to root; depth comes from slashes"),
              type: s("Node kind; inferred from a trailing slash when omitted", {
                enum: ["file", "dir"],
              }),
              status: s("Change status", { enum: ["new", "modified", "deleted"] }),
              note: s("Optional short note"),
            },
            ["path"],
          ),
          "2–80 nodes",
        ),
        caption: s("Optional footnote"),
      },
    },
    state: [
      { path: "items", description: "replace the tree nodes" },
      { path: "title", description: "replace the heading" },
      { path: "root", description: "replace the root label" },
    ],
  },
  {
    type: "formula",
    title: "Formula / calculation",
    description: "A formula with substituted variables, a result and optional steps. Use for budget math, unit conversion, sizing and quantitative explanations.",
    kind: "content",
    props: {
      type: "object",
      required: ["expression"],
      properties: {
        title: s("Optional section heading"),
        sub: s("Optional subtitle"),
        expression: s("Formula text, e.g. \"monthly × 12 = annual\""),
        result: s("Display result, e.g. \"$2,640\""),
        unit: s("Optional result unit, e.g. \"kg\""),
        vars: arr(
          obj(
            {
              symbol: s("Variable symbol or short name"),
              label: s("What the variable means"),
              value: s("Value with optional unit, e.g. \"$220\""),
            },
            ["symbol", "value"],
          ),
          "1–12 variables",
        ),
        steps: arr(
          obj(
            {
              label: s("Optional step label"),
              expression: s("Expression for this step"),
              result: s("Optional step result"),
            },
            ["expression"],
          ),
          "1–8 steps",
        ),
        note: s("Optional caveat or assumption"),
      },
    },
    state: [
      { path: "expression", description: "replace the formula" },
      { path: "result", description: "replace the result" },
      { path: "vars", description: "replace the variable list" },
      { path: "steps", description: "replace the calculation steps" },
    ],
  },
  {
    type: "flashcards",
    title: "Flashcards",
    description: "A grid of flip cards for studying, vocabulary, interview prep and quick recall. Each card flips locally and emits a non-agent flip event.",
    kind: "interactive",
    props: {
      type: "object",
      required: ["cards"],
      properties: {
        title: s("Optional section heading"),
        sub: s("Optional subtitle"),
        columns: n("Grid columns, 1–3 (default 2)"),
        cards: arr(
          obj(
            {
              front: s("Prompt / question side"),
              back: s("Answer / explanation side"),
              hint: s("Optional hint shown on the front"),
              tag: s("Optional category tag"),
            },
            ["front", "back"],
          ),
          "1–20 cards",
        ),
      },
    },
    state: [
      { path: "cards", description: "replace all flashcards" },
      { path: "title", description: "replace the heading" },
    ],
  },
];

const registeredTypes = new Set(BLOCK_CATALOG.map((b) => b.type));

/** Known block types, including specs registered at runtime. */
export const BLOCK_TYPES: ReadonlySet<string> = registeredTypes;

/**
 * Register an additional block spec at runtime.
 *
 * Host adapters and demo bundles use this to extend the catalog without
 * shipping their components in `@intelligent-ui/core`. Registration updates
 * prompts, validation and the exported catalog immediately. Duplicate types
 * throw; the returned disposer removes the spec again (useful for HMR).
 */
export function registerBlockSpec(spec: BlockSpec): () => void {
  if (registeredTypes.has(spec.type)) {
    throw new Error(`[iui] block type already registered: ${spec.type}`);
  }
  BLOCK_CATALOG.push(spec);
  registeredTypes.add(spec.type);
  return () => {
    const index = BLOCK_CATALOG.findIndex((block) => block.type === spec.type);
    if (index !== -1) BLOCK_CATALOG.splice(index, 1);
    registeredTypes.delete(spec.type);
  };
}

export function findBlock(type: string): BlockSpec | undefined {
  return BLOCK_CATALOG.find((b) => b.type === type);
}

function typeLabel(spec: PropSpec, depth = 0): string {
  if (spec.enum) return spec.enum.map((v) => JSON.stringify(v)).join("|");
  switch (spec.type) {
    case "array":
      return `${spec.items ? typeLabel(spec.items, depth + 1) : "any"}[]`;
    case "object": {
      if (depth >= 3) return "object";
      const entries = Object.entries(spec.properties ?? {}).map(([k, v]) => {
        const req = spec.required?.includes(k);
        return `${k}${req ? "" : "?"}: ${typeLabel(v, depth + 1)}`;
      });
      return `{${entries.join(", ")}}`;
    }
    default:
      return spec.type;
  }
}

function propSummary(spec: BlockSpec): string {
  const entries = Object.entries(spec.props.properties).map(([key, prop]) => {
    const req = spec.props.required?.includes(key);
    return `${key}${req ? "" : "?"}: ${typeLabel(prop)}`;
  });
  return entries.length ? entries.join("; ") : "(no props)";
}

function stateSummary(spec: BlockSpec): string {
  if (!spec.state?.length) return "";
  return ` state: ${spec.state.map((item) => `${item.path} (${item.description})`).join("; ")}`;
}

/** Filter accepted by catalog consumers. All fields are intersected. */
export interface CatalogFilter {
  /** only these block types */
  include?: Iterable<string>;
  /** drop these block types */
  exclude?: Iterable<string>;
  /** only these kinds (media / layout / content / interactive / domain / demo) */
  kinds?: Iterable<BlockSpec["kind"]>;
}

/** Select catalog entries without rendering them. */
export function selectBlocks(options: CatalogFilter = {}): BlockSpec[] {
  const include = options.include ? new Set(options.include) : null;
  const exclude = options.exclude ? new Set(options.exclude) : null;
  const kinds = options.kinds ? new Set(options.kinds) : null;
  return BLOCK_CATALOG.filter(
    (b) =>
      (!include || include.has(b.type)) &&
      (!exclude || !exclude.has(b.type)) &&
      (!kinds || kinds.has(b.kind)),
  );
}

/** Compact catalog text for a system prompt (one line per block). */
export function catalogPrompt(options: CatalogFilter = {}): string {
  return selectBlocks(options)
    .map((b) => `- ${b.type} — ${b.description} props: ${propSummary(b)}${stateSummary(b)}`)
    .join("\n");
}
