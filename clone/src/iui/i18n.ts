import type { Units } from "./contracts";

export interface LocaleContext {
  locale: string;
  timeZone: string;
  currency?: string;
  units?: Units;
}

export interface ResolvedLocaleContext extends LocaleContext {
  /** true when a fallback was used instead of a host-provided value */
  assumed: boolean;
}

const DEFAULT_LOCALE = "en-US";
const DEFAULT_TIME_ZONE = "UTC";

function safeLocale(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return Intl.getCanonicalLocales(raw)[0] ?? null;
  } catch {
    return null;
  }
}

function safeTimeZone(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}

function safeCurrency(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^[A-Za-z]{3}$/.test(raw)) return null;
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: raw.toUpperCase() });
    return raw.toUpperCase();
  } catch {
    return null;
  }
}

/**
 * Resolve an answer-level locale context. Callers must expose `assumed` so the
 * UI can say that a fallback was used instead of silently using en-US/UTC.
 */
export function resolveLocaleContext(input: Partial<LocaleContext> = {}): ResolvedLocaleContext {
  const locale = safeLocale(input.locale);
  const timeZone = safeTimeZone(input.timeZone);
  const currency = safeCurrency(input.currency);
  return {
    locale: locale ?? DEFAULT_LOCALE,
    timeZone: timeZone ?? DEFAULT_TIME_ZONE,
    ...(currency ? { currency } : {}),
    ...(input.units === "metric" || input.units === "imperial" ? { units: input.units } : {}),
    assumed: !locale || !timeZone,
  };
}

export function formatNumber(
  value: number,
  locale: LocaleContext,
  options: Intl.NumberFormatOptions = {},
): string {
  try {
    return new Intl.NumberFormat(locale.locale, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatCurrency(
  value: number,
  locale: LocaleContext,
  currency = locale.currency ?? "USD",
  options: Intl.NumberFormatOptions = {},
): string {
  try {
    return new Intl.NumberFormat(locale.locale, {
      style: "currency",
      currency,
      ...options,
    }).format(value);
  } catch {
    return String(value);
  }
}

export function formatDate(
  value: string | number | Date,
  locale: LocaleContext,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat(locale.locale, {
      timeZone: locale.timeZone,
      ...options,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

type MessageKey =
  | "assistantResponse"
  | "close"
  | "enlarge"
  | "openImage"
  | "chart"
  | "chartData"
  | "noChartData"
  | "noMetrics"
  | "noTimeline"
  | "noCalendarEvents"
  | "event"
  | "eventCountOne"
  | "eventCountMany"
  | "noMatrixData"
  | "comparisonMatrix"
  | "bestValue"
  | "fewerPeople"
  | "morePeople"
  | "interactiveMap"
  | "chooseRouteDays"
  | "resetMapView"
  | "closeDetails"
  | "confirmAction"
  | "confirm"
  | "cancel"
  | "actionRunning"
  | "actionSucceeded"
  | "actionFailed"
  | "actionUnknown"
  | "actionCancelled"
  | "actionExpired"
  | "actionNeedsConfirmation"
  | "showCode"
  | "refresh"
  | "languageAssumed";

const EN: Record<MessageKey, string> = {
  assistantResponse: "Assistant response",
  close: "Close",
  enlarge: "Enlarge",
  openImage: "Open image",
  chart: "Chart",
  chartData: "Chart data",
  noChartData: "No chart data",
  noMetrics: "No metrics",
  noTimeline: "No timeline entries",
  noCalendarEvents: "No events",
  event: "Event",
  eventCountOne: "{count} event",
  eventCountMany: "{count} events",
  noMatrixData: "No matrix data",
  comparisonMatrix: "Comparison matrix",
  bestValue: "Best value",
  fewerPeople: "Fewer people",
  morePeople: "More people",
  interactiveMap: "Interactive map",
  chooseRouteDays: "Choose route days",
  resetMapView: "Reset map view",
  closeDetails: "Close details",
  confirmAction: "Confirm this action?",
  confirm: "Confirm",
  cancel: "Cancel",
  actionRunning: "Working…",
  actionSucceeded: "Done",
  actionFailed: "Failed",
  actionUnknown: "Result not confirmed yet",
  actionCancelled: "Cancelled",
  actionExpired: "Expired",
  actionNeedsConfirmation: "Confirmation required",
  showCode: "Show code",
  refresh: "Refresh",
  languageAssumed: "Language and time zone were assumed by the host",
};

const ZH: Partial<Record<MessageKey, string>> = {
  assistantResponse: "助手回答",
  close: "关闭",
  enlarge: "放大",
  openImage: "打开图片",
  chart: "图表",
  chartData: "图表数据",
  noChartData: "暂无图表数据",
  noMetrics: "暂无指标",
  noTimeline: "暂无时间线",
  noCalendarEvents: "暂无日程",
  event: "日程",
  eventCountOne: "{count} 个日程",
  eventCountMany: "{count} 个日程",
  noMatrixData: "暂无对比数据",
  comparisonMatrix: "对比矩阵",
  bestValue: "最佳值",
  fewerPeople: "减少人数",
  morePeople: "增加人数",
  interactiveMap: "互动地图",
  chooseRouteDays: "选择路线天数",
  resetMapView: "重置地图",
  closeDetails: "关闭详情",
  confirmAction: "确认执行此操作？",
  confirm: "确认",
  cancel: "取消",
  actionRunning: "处理中…",
  actionSucceeded: "已完成",
  actionFailed: "失败",
  actionUnknown: "结果待确认",
  actionCancelled: "已取消",
  actionExpired: "已过期",
  actionNeedsConfirmation: "需要确认",
  showCode: "显示代码",
  refresh: "刷新",
  languageAssumed: "语言与时区由宿主推定",
};

const MESSAGES: Record<string, Partial<Record<MessageKey, string>>> = {
  en: EN,
  zh: ZH,
};

/** Translate SDK chrome with a language-region fallback (zh-CN → zh → en). */
export function translate(
  locale: LocaleContext | string,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const tag = typeof locale === "string" ? locale : locale.locale;
  const language = tag.toLowerCase().split("-")[0];
  const template = MESSAGES[language]?.[key] ?? EN[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] === undefined ? `{${name}}` : String(params[name]),
  );
}

/** Language-aware formatting bound to one answer. */
export function createI18n(input: Partial<LocaleContext> = {}) {
  const context = resolveLocaleContext(input);
  return {
    ...context,
    t: (key: MessageKey, params?: Record<string, string | number>) =>
      translate(context, key, params),
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, context, options),
    money: (value: number, currency?: string, options?: Intl.NumberFormatOptions) =>
      formatCurrency(value, context, currency, options),
    date: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
      formatDate(value, context, options),
  };
}

export type I18n = ReturnType<typeof createI18n>;
