import { App } from "@modelcontextprotocol/ext-apps";
import type { Op } from "@intelligent-ui/core";
import { createIuiHost, formatAction, type IuiHost, type IuiHostAction } from "@intelligent-ui/adapter";
import { iuiThemeFromHost, iuiTokensFromHost } from "../theme";
import "@intelligent-ui/core/styles.css";
import "./app.css";

const app = new App(
  { name: "Intelligent UI", version: "0.2.2" },
  {},
  { autoResize: true },
);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root missing");
const root: HTMLElement = rootElement;

let status: HTMLDivElement | null = null;
let host: IuiHost;

function setStatus(text: string, tone: "info" | "error" = "info") {
  if (!status) {
    status = document.createElement("div");
    status.className = "iui-app-status";
    root.insertBefore(status, root.firstChild);
  }
  status.textContent = text;
  status.dataset.tone = tone;
  status.hidden = false;
}

function clearStatus() {
  if (status) status.hidden = true;
}

function opsFromValue(value: unknown): Op[] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.ops)) return record.ops as Op[];
  const structured = record.structuredContent;
  if (structured && typeof structured === "object" && Array.isArray((structured as Record<string, unknown>).ops)) {
    return (structured as { ops: Op[] }).ops;
  }
  return null;
}

function showOps(ops: Op[] | null) {
  if (!ops?.length) return false;
  clearStatus();
  host.show(ops);
  return true;
}

async function sendText(text: string, wantsTurn: boolean) {
  const capabilities = app.getHostCapabilities();
  try {
    if (wantsTurn && capabilities?.message) {
      await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
      return;
    }
    if (capabilities?.updateModelContext) {
      await app.updateModelContext({ content: [{ type: "text", text }] });
      return;
    }
    if (capabilities?.message) {
      await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
    }
  } catch (error) {
    console.error("[iui] failed to send action", error);
  }
}

async function onAction(action: IuiHostAction) {
  if (action.kind === "prompt") {
    await sendText(action.text, true);
    return;
  }
  const capabilities = app.getHostCapabilities();
  if (capabilities?.updateModelContext) {
    try {
      await app.updateModelContext({
        content: [{ type: "text", text: formatAction(action) }],
        structuredContent: action.envelope as unknown as Record<string, unknown>,
      });
      return;
    } catch (error) {
      console.error("[iui] updateModelContext failed", error);
    }
  }
  await sendText(formatAction(action), false);
}

function applyHostContext() {
  const context = app.getHostContext();
  host.setTheme(iuiThemeFromHost(context));
  host.setTokens(iuiTokensFromHost(context));
  document.documentElement.style.colorScheme = context?.theme === "dark" ? "dark" : "light";
}

app.ontoolinput = (params) => {
  showOps(opsFromValue(params.arguments));
};

app.ontoolresult = (params) => {
  if (params.isError) {
    host.reset();
    const message = params.content
      ?.filter((item) => item.type === "text")
      .map((item) => ("text" in item ? item.text : ""))
      .join("\n");
    setStatus(message || "Intelligent UI could not render this result.", "error");
    return;
  }
  if (!showOps(opsFromValue(params))) {
    setStatus("No Intelligent UI blocks in this result.");
  }
};

app.ontoolcancelled = (params) => {
  host.reset();
  setStatus(params.reason ? `Cancelled: ${params.reason}` : "Cancelled.", "error");
};

app.onhostcontextchanged = () => {
  applyHostContext();
};

app.onteardown = async () => {
  host.destroy();
  return {};
};

setStatus("Preparing interface…");
host = createIuiHost({
  container: root,
  theme: "auto",
  scroll: "none",
  animate: true,
  sanitize: true,
  actionPolicy: "agent",
  onAction,
});

try {
  await app.connect();
  applyHostContext();
} catch (error) {
  console.error("[iui] MCP Apps connect failed", error);
  setStatus("This interface must be opened inside an MCP Apps host.", "error");
}
