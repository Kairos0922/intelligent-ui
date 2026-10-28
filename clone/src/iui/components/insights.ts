import { h, svg } from "../dom";
import { defineBlock, type Ctx } from "../registry";
import { safeColor, safeText } from "../security";

const PALETTE_SIZE = 5;
const DAY_MS = 86_400_000;

function num(raw: unknown, fallback = 0): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function int(raw: unknown, min: number, max: number, fallback: number): number {
  const value = Math.round(num(raw, fallback));
  return Math.min(max, Math.max(min, value));
}

function fmtValue(
  value: number,
  format: string | undefined,
  currency: string | undefined,
  compact = false,
): string {
  const abs = Math.abs(value);
  const decimals =
    abs === 0
      ? 0
      : abs < 0.01
        ? 4
        : abs < 1
          ? 2
          : abs < 100 && !Number.isInteger(abs)
            ? 1
            : 0;
  try {
    if (format === "percent") {
      return `${value.toLocaleString("en-US", {
        maximumFractionDigits: decimals,
      })}%`;
    }
    if (format === "currency") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency)
          ? currency.toUpperCase()
          : "USD",
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: compact ? 1 : decimals,
      }).format(value);
    }
    if (format === "compact" || compact) {
      return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
    }
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return String(value);
  }
}

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

function niceScale(min: number, max: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 1 };
  if (min === max) {
    if (min === 0) max = 1;
    else if (min > 0) min = 0;
    else max = 0;
  }
  const step = niceStep((max - min) / 4);
  return {
    min: Math.floor(min / step) * step,
    max: Math.ceil(max / step) * step,
    step,
  };
}

function dateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateKey(raw: unknown): { year: number; month: number; day: number } | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= days ? { year, month, day } : null;
}

function localeOf(raw: unknown): string {
  const locale = typeof raw === "string" && raw.trim() ? raw.trim() : "en-US";
  try {
    new Intl.DateTimeFormat(locale);
    return locale;
  } catch {
    return "en-US";
  }
}

function panelHead(title: unknown, sub: unknown): HTMLElement | null {
  const heading = safeText(title, 240).trim();
  const subtitle = safeText(sub, 500).trim();
  if (!heading && !subtitle) return null;
  const head = h("div", { class: "iui-panel-head" });
  if (heading) head.append(h("div", { class: "iui-panel-title", text: heading }));
  if (subtitle) head.append(h("div", { class: "iui-panel-sub", text: subtitle }));
  return head;
}

type ChartSeries = { name: string; values: number[]; color?: string };

defineBlock(
  "chart",
  (
    el,
    props: {
      title?: string;
      sub?: string;
      variant?: "line" | "bar" | "area";
      labels?: string[];
      series?: ChartSeries[];
      height?: number;
      format?: "number" | "compact" | "percent" | "currency";
      currency?: string;
      legend?: boolean;
      baseline?: "auto" | "zero";
    },
  ) => {
    const labels = Array.isArray(props.labels)
      ? props.labels
          .slice(0, 24)
          .map((label) =>
            typeof label === "number" ? String(label) : safeText(label, 80),
          )
      : [];
    const series = Array.isArray(props.series)
      ? props.series.slice(0, PALETTE_SIZE).map((item) => ({
          name: safeText(item?.name, 80) || "Series",
          values: Array.isArray(item?.values) ? item.values.slice(0, labels.length) : [],
          color: typeof item?.color === "string" ? item.color : undefined,
        }))
      : [];

    const chart = h("div", { class: "iui-chart" });
    const head = panelHead(props.title, props.sub);
    if (head) chart.append(head);

    if (!labels.length || !series.length) {
      chart.append(h("div", { class: "iui-chart-empty", text: "No chart data" }));
      el.append(chart);
      return;
    }

    const height = int(props.height, 170, 420, 240);
    const variant = props.variant === "bar" ? "bar" : props.variant === "area" ? "area" : "line";
    const width = 640;
    const pad = { left: 56, right: 16, top: 16, bottom: 38 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const format = props.format;
    const currency = props.currency;

    const allValues = series.flatMap((item) =>
      labels.map((_, index) => num(item.values[index], 0)),
    );
    const zeroBaseline = variant === "bar" || props.baseline === "zero";
    let scaleMin = Math.min(...allValues);
    let scaleMax = Math.max(...allValues);
    if (zeroBaseline) {
      scaleMin = Math.min(0, scaleMin);
      scaleMax = Math.max(0, scaleMax);
      if (scaleMin === scaleMax) scaleMax = scaleMin + 1;
    } else {
      const spread = scaleMax - scaleMin;
      if (spread === 0 && scaleMax === 0) {
        scaleMin = 0;
        scaleMax = 1;
      } else {
        const pad = spread > 0 ? spread * 0.02 : Math.abs(scaleMax) * 0.05 || 1;
        scaleMin -= pad;
        scaleMax += pad;
      }
    }
    const scale = niceScale(scaleMin, scaleMax);
    const y = (value: number) =>
      pad.top + ((scale.max - value) / (scale.max - scale.min || 1)) * plotH;
    const n = labels.length;

    const root = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": safeText(props.title, 240) || "Chart",
    });

    for (let value = scale.min; value <= scale.max + scale.step / 2; value += scale.step) {
      const lineY = y(value);
      root.append(
        svg("line", {
          x1: pad.left,
          y1: lineY,
          x2: width - pad.right,
          y2: lineY,
          class: value === 0 ? "iui-chart-zero" : "iui-chart-grid",
        }),
        svg("text", {
          x: pad.left - 9,
          y: lineY,
          "text-anchor": "end",
          "dominant-baseline": "middle",
          class: "iui-chart-tick",
        }, fmtValue(value, format, currency, true)),
      );
    }

    const labelEvery = Math.max(1, Math.ceil(n / 8));
    const xForIndex = (index: number) => {
      if (variant === "bar") return pad.left + (plotW / n) * (index + 0.5);
      return n === 1 ? pad.left + plotW / 2 : pad.left + (plotW / (n - 1)) * index;
    };

    for (let index = 0; index < n; index++) {
      if (index % labelEvery !== 0 && index !== n - 1) continue;
      const x = xForIndex(index);
      const label = labels[index] || "";
      root.append(
        svg(
          "text",
          {
            x,
            y: height - 15,
            "text-anchor": "middle",
            class: "iui-chart-tick",
          },
          label.length > 16 ? `${label.slice(0, 15)}…` : label,
        ),
      );
    }

    const barWidth = Math.max(2, (plotW / n) * 0.72 / series.length);
    series.forEach((item, seriesIndex) => {
      const color =
        safeColor(item.color, "") || `var(--iui-series-${(seriesIndex % PALETTE_SIZE) + 1})`;

      if (variant === "bar") {
        const groupCenter = plotW / n;
        item.values.forEach((raw, index) => {
          const value = num(raw, 0);
          const base = y(0);
          const top = y(Math.max(0, value));
          const bottom = y(Math.min(0, value));
          const x =
            pad.left +
            groupCenter * index +
            groupCenter / 2 -
            (barWidth * series.length) / 2 +
            barWidth * seriesIndex;
          const bar = svg("rect", {
            x,
            y: top,
            width: barWidth,
            height: Math.max(1, bottom - top),
            rx: 3,
            fill: color,
            class: "iui-chart-bar",
          });
          bar.append(svg("title", {}, `${labels[index]}: ${fmtValue(value, format, currency)}`));
          root.append(bar);
        });
        return;
      }

      const points = labels.map((_, index) => ({
        x: xForIndex(index),
        value: num(item.values[index], 0),
      }));
      const line = points
        .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${y(point.value).toFixed(2)}`)
        .join(" ");
      if (variant === "area") {
        const baselineY = y(zeroBaseline ? 0 : scale.min);
        root.append(
          svg("path", {
            d: `${line} L${xForIndex(n - 1)} ${baselineY} L${xForIndex(0)} ${baselineY} Z`,
            fill: color,
            "fill-opacity": "0.14",
            stroke: "none",
            class: "iui-chart-area",
          }),
        );
      }
      root.append(
        svg("path", {
          d: line,
          fill: "none",
          stroke: color,
          "stroke-width": "2.5",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          class: "iui-chart-line",
        }),
      );
      points.forEach((point, index) => {
        const dot = svg("circle", {
          cx: point.x,
          cy: y(point.value),
          r: "2.8",
          fill: color,
          stroke: "var(--iui-bg)",
          "stroke-width": "1.5",
          class: "iui-chart-point",
        });
        dot.append(
          svg("title", {}, `${labels[index]}: ${fmtValue(point.value, format, currency)}`),
        );
        root.append(dot);
      });
    });

    chart.append(root);

    if (props.legend !== false && series.length > 0) {
      const legend = h("div", { class: "iui-legend" });
      series.forEach((item, index) => {
        const color =
          safeColor(item.color, "") || `var(--iui-series-${(index % PALETTE_SIZE) + 1})`;
        const entry = h("span");
        const swatch = h("span", { class: "swatch" });
        swatch.style.background = color;
        entry.append(swatch, h("span", { text: item.name }));
        legend.append(entry);
      });
      chart.append(legend);
    }

    const table = h("table", { class: "sr-only" });
    table.append(h("caption", { text: safeText(props.title, 240) || "Chart data" }));
    const headRow = h("tr");
    headRow.append(h("th", { scope: "col", text: "Label" }));
    for (const item of series) headRow.append(h("th", { scope: "col", text: item.name }));
    const thead = h("thead");
    thead.append(headRow);
    const tbody = h("tbody");
    labels.forEach((label, index) => {
      const row = h("tr");
      row.append(h("th", { scope: "row", text: label }));
      for (const item of series) {
        row.append(h("td", { text: fmtValue(num(item.values[index], 0), format, currency) }));
      }
      tbody.append(row);
    });
    table.append(thead, tbody);
    chart.append(table);

    el.append(chart);
  },
);

type Trend = "up" | "down" | "flat";

defineBlock(
  "stats",
  (
    el,
    props: {
      title?: string;
      sub?: string;
      columns?: number;
      items?: { label: string; value: string | number; change?: string; trend?: Trend; detail?: string }[];
    },
  ) => {
    const section = h("section", { class: "iui-stats" });
    const head = panelHead(props.title, props.sub);
    if (head) section.append(head);

    const items = Array.isArray(props.items) ? props.items.slice(0, 8) : [];
    if (!items.length) {
      section.append(h("div", { class: "iui-empty", text: "No metrics" }));
      el.append(section);
      return;
    }

    const columns = int(props.columns, 1, 4, Math.min(items.length, 4));
    const grid = h("dl", { class: "iui-stat-grid" });
    grid.style.setProperty("--iui-stat-cols", String(columns));

    for (const item of items) {
      const stat = h("div", { class: "iui-stat" });
      stat.append(h("dt", { text: safeText(item?.label, 120) }));
      const value = h("dd");
      const rawValue = item?.value;
      const valueText =
        typeof rawValue === "number" && Number.isFinite(rawValue)
          ? String(rawValue)
          : safeText(rawValue, 80);
      value.append(h("div", { class: "iui-stat-value", text: valueText }));
      const change = safeText(item?.change, 80).trim();
      if (change) {
        const trend: Trend =
          item?.trend === "down" || item?.trend === "flat" || item?.trend === "up"
            ? item.trend
            : "flat";
        const changeRow = h("div", { class: `iui-stat-change iui-trend-${trend}` });
        changeRow.append(
          h("span", {
            class: "iui-stat-arrow",
            "aria-hidden": "true",
            text: trend === "up" ? "↑" : trend === "down" ? "↓" : "→",
          }),
          h("span", { text: change }),
        );
        value.append(changeRow);
      }
      const detail = safeText(item?.detail, 240).trim();
      if (detail) value.append(h("div", { class: "iui-stat-detail", text: detail }));
      stat.append(value);
      grid.append(stat);
    }

    section.append(grid);
    el.append(section);
  },
);

defineBlock(
  "timeline",
  (
    el,
    props: {
      title?: string;
      sub?: string;
      items?: {
        date: string;
        title: string;
        body?: string;
        tag?: string;
        status?: "done" | "current" | "upcoming";
        tone?: "neutral" | "success" | "warning" | "danger";
      }[];
    },
  ) => {
    const section = h("section", { class: "iui-timeline" });
    const head = panelHead(props.title, props.sub);
    if (head) section.append(head);

    const items = Array.isArray(props.items) ? props.items.slice(0, 40) : [];
    if (!items.length) {
      section.append(h("div", { class: "iui-empty", text: "No timeline entries" }));
      el.append(section);
      return;
    }

    const list = h("ol", { class: "iui-timeline-list" });
    for (const item of items) {
      const entry = h("li", { class: "iui-timeline-item" });
      if (item?.status) entry.dataset.status = item.status;
      if (item?.tone) entry.dataset.tone = item.tone;
      entry.append(h("span", { class: "iui-timeline-dot", "aria-hidden": "true" }));

      const content = h("div", { class: "iui-timeline-content" });
      const date = safeText(item?.date, 80);
      if (parseDateKey(date)) {
        content.append(h("time", { class: "iui-timeline-date", datetime: date, text: date }));
      } else {
        content.append(h("div", { class: "iui-timeline-date", text: date }));
      }
      content.append(h("div", { class: "iui-timeline-title", text: safeText(item?.title, 200) }));
      const body = safeText(item?.body, 1200).trim();
      if (body) content.append(h("p", { class: "iui-timeline-body", text: body }));
      const tag = safeText(item?.tag, 80).trim();
      if (tag) content.append(h("span", { class: "iui-timeline-tag", text: tag }));
      entry.append(content);
      list.append(entry);
    }
    section.append(list);
    el.append(section);
  },
);

type CalendarEvent = {
  date: string;
  title: string;
  time?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

defineBlock(
  "calendar",
  (
    el,
    props: {
      title?: string;
      sub?: string;
      month?: string;
      weekStart?: number;
      locale?: string;
      today?: string;
      select?: string;
      events?: CalendarEvent[];
    },
    ctx: Ctx,
  ) => {
    const section = h("section", { class: "iui-calendar" });
    const head = panelHead(props.title, props.sub);
    if (head) section.append(head);

    const monthMatch =
      typeof props.month === "string" ? /^(\d{4})-(\d{1,2})$/.exec(props.month) : null;
    const fallback = new Date();
    let year = fallback.getFullYear();
    let month = fallback.getMonth() + 1;
    if (monthMatch) {
      const y = Number(monthMatch[1]);
      const m = Number(monthMatch[2]);
      if (y >= 1900 && y <= 2200 && m >= 1 && m <= 12) {
        year = y;
        month = m;
      }
    }

    const locale = localeOf(props.locale);
    const weekStart = props.weekStart === 1 ? 1 : 0;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const leading = (firstWeekday - weekStart + 7) % 7;
    const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7;
    const monthKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;

    const monthLabel = (() => {
      try {
        return new Intl.DateTimeFormat(locale, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(Date.UTC(year, month - 1, 1)));
      } catch {
        return monthKey;
      }
    })();

    const weekdays = Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
        new Date(Date.UTC(2024, 0, 7 + ((weekStart + index) % 7))),
      ),
    );

    const events = new Map<string, CalendarEvent[]>();
    for (const raw of Array.isArray(props.events) ? props.events.slice(0, 200) : []) {
      const parsed = parseDateKey(raw?.date);
      if (!parsed || parsed.year !== year || parsed.month !== month) continue;
      const key = dateKey(parsed.year, parsed.month, parsed.day);
      const list = events.get(key) ?? [];
      list.push({
        date: key,
        title: safeText(raw?.title, 200) || "Event",
        time: safeText(raw?.time, 40).trim() || undefined,
        tone:
          raw?.tone === "success" ||
          raw?.tone === "warning" ||
          raw?.tone === "danger" ||
          raw?.tone === "neutral"
            ? raw.tone
            : "neutral",
      });
      events.set(key, list);
    }
    for (const list of events.values()) {
      list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    }

    const firstEvent = [...events.keys()].sort()[0];
    const requested = parseDateKey(props.select);
    let selected =
      requested && requested.year === year && requested.month === month
        ? dateKey(requested.year, requested.month, requested.day)
        : firstEvent ?? dateKey(year, month, 1);

    const monthHead = h("div", { class: "iui-calendar-month", text: monthLabel });
    const grid = h("div", { class: "iui-calendar-grid" });
    for (const day of weekdays) {
      grid.append(h("div", { class: "iui-calendar-weekday", text: day }));
    }

    const buttons = new Map<string, HTMLButtonElement>();
    for (let cell = 0; cell < cellCount; cell++) {
      const day = cell - leading + 1;
      if (day < 1 || day > daysInMonth) {
        grid.append(h("span", { class: "iui-calendar-day is-empty", "aria-hidden": "true" }));
        continue;
      }
      const key = dateKey(year, month, day);
      const dayEvents = events.get(key) ?? [];
      const button = h("button", {
        type: "button",
        class: "iui-calendar-day",
        "data-date": key,
        "aria-pressed": String(key === selected),
      });
      if (props.today === key) button.classList.add("is-today");
      const accessibleDate = (() => {
        try {
          return new Intl.DateTimeFormat(locale, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(Date.UTC(year, month - 1, day)));
        } catch {
          return key;
        }
      })();
      button.setAttribute(
        "aria-label",
        `${accessibleDate}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}`,
      );
      button.append(h("span", { class: "iui-calendar-num", text: String(day) }));
      if (dayEvents.length) {
        const dots = h("span", { class: "iui-calendar-dots", "aria-hidden": "true" });
        for (const event of dayEvents.slice(0, 3)) {
          dots.append(h("span", { class: "iui-calendar-dot", "data-tone": event.tone ?? "neutral" }));
        }
        button.append(dots);
      }
      button.addEventListener("click", () => selectDay(key, true));
      buttons.set(key, button);
      grid.append(button);
    }

    const details = h("div", { class: "iui-calendar-events", "aria-live": "polite" });

    const renderDetails = () => {
      details.replaceChildren();
      const parsed = parseDateKey(selected);
      const label = parsed
        ? (() => {
            try {
              return new Intl.DateTimeFormat(locale, {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
            } catch {
              return selected;
            }
          })()
        : selected;
      details.append(h("div", { class: "iui-calendar-events-head", text: label }));
      const list = events.get(selected) ?? [];
      if (!list.length) {
        details.append(h("div", { class: "iui-calendar-empty", text: "No events" }));
        return;
      }
      for (const event of list) {
        const row = h("div", { class: "iui-calendar-event" });
        if (event.time) row.append(h("span", { class: "iui-calendar-time", text: event.time }));
        row.append(h("span", { class: "iui-calendar-event-title", text: event.title }));
        details.append(row);
      }
    };

    const selectDay = (key: string, emit: boolean) => {
      if (!buttons.has(key)) return;
      selected = key;
      for (const [date, button] of buttons) {
        button.setAttribute("aria-pressed", String(date === key));
      }
      renderDetails();
      if (emit) {
        const list = events.get(key) ?? [];
        ctx.emit?.("select", {
          date: key,
          events: list.map((event) => event.title),
        });
      }
    };

    section.append(monthHead, grid, details);
    el.append(section);
    renderDetails();

    return {
      set(path: string, value: unknown) {
        if (path === "select" || path === "selected" || path === "value") {
          const parsed = parseDateKey(value);
          if (parsed) selectDay(dateKey(parsed.year, parsed.month, parsed.day), false);
        }
      },
    };
  },
);
