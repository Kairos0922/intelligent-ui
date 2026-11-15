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
  | "codeUnavailable"
  | "refresh"
  | "boardingPass"
  | "flight"
  | "date"
  | "boarding"
  | "departs"
  | "gate"
  | "seat"
  | "group"
  | "terminal"
  | "passenger"
  | "verified"
  | "unverified"
  | "invalid"
  | "revoked"
  | "expired"
  | "snapshot"
  | "unknown"
  | "verify"
  | "addToWallet"
  | "done"
  | "checked"
  | "noAttestation"
  | "passUnverified"
  | "passRevoked"
  | "passInvalid"
  | "passStale"
  | "passUnknown"
  | "passExpired"
  | "passOffline"
  | "passOfflineDetail"
  | "passCodeUnsupported"
  | "gateChanged"
  | "interfaceUpdated"
  | "snapshotOutdated"
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
  codeUnavailable: "Code unavailable",
  refresh: "Refresh",
  boardingPass: "Boarding pass",
  flight: "Flight",
  date: "Date",
  boarding: "Boarding",
  departs: "Departs",
  gate: "Gate",
  seat: "Seat",
  group: "Group",
  terminal: "Terminal",
  passenger: "Passenger",
  verified: "Verified",
  unverified: "Unverified",
  invalid: "Invalid",
  revoked: "Revoked",
  expired: "Expired",
  snapshot: "Snapshot",
  unknown: "Unknown",
  verify: "Verify",
  addToWallet: "Add to Wallet",
  done: "Done",
  checked: "Checked",
  noAttestation: "No host attestation",
  passUnverified: "The issuer has not provided a verifiable status for this pass.",
  passRevoked: "This pass was revoked by the issuer. Do not present it.",
  passInvalid: "The pass signature or snapshot seal is invalid. Do not present it.",
  passStale: "Showing a saved snapshot. Refresh before boarding.",
  passUnknown: "The current pass status is unknown. Refresh before boarding.",
  passExpired: "This pass has expired. Do not present it.",
  passOffline: "This pass cannot be shown offline.",
  passOfflineDetail: "No sealed snapshot is available. Reconnect to load the pass.",
  passCodeUnsupported: "This pass uses a code format this host cannot render.",
  gateChanged: "Gate changed: {from} → {to}",
  interfaceUpdated: "The interface was updated from the issuer feed.",
  snapshotOutdated: "The saved snapshot is out of date.",
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
  codeUnavailable: "代码不可用",
  refresh: "刷新",
  boardingPass: "登机牌",
  flight: "航班",
  date: "日期",
  boarding: "登机",
  departs: "起飞",
  gate: "登机口",
  seat: "座位",
  group: "分组",
  terminal: "航站楼",
  passenger: "乘客",
  verified: "已验证",
  unverified: "未验证",
  invalid: "无效",
  revoked: "已撤销",
  expired: "已过期",
  snapshot: "快照",
  unknown: "未知",
  verify: "验证",
  addToWallet: "添加到 Wallet",
  done: "完成",
  checked: "校验于",
  noAttestation: "无宿主校验记录",
  passUnverified: "签发方尚未提供可验证的凭证状态。",
  passRevoked: "签发方已撤销此凭证，请勿出示。",
  passInvalid: "凭证签名或快照封印无效，请勿出示。",
  passStale: "当前显示保存的快照，登机前请刷新。",
  passUnknown: "当前凭证状态未知，登机前请刷新。",
  passExpired: "凭证已过期，请勿出示。",
  passOffline: "当前离线，无法出示此凭证。",
  passOfflineDetail: "没有可用的密封快照，请恢复网络后重试。",
  passCodeUnsupported: "此凭证的代码格式不受当前宿主支持。",
  gateChanged: "登机口已变更：{from} → {to}",
  interfaceUpdated: "界面已按签发方数据更新。",
  snapshotOutdated: "保存的快照已过时。",
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
