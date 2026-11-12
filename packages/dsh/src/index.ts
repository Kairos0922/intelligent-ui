import { defineTool } from "@deepseek-ai/dsh-tools";
import type { Context } from "@deepseek-ai/cordis";
import {
  BLOCK_TYPES,
  IUI_TOOL_NAME,
  iuiSystemPrompt,
  iuiToolDescription,
  validateAnswerOps,
} from "@intelligent-ui/core/agent";
import { DSH_MANIFEST } from "./manifest.js";

export { DSH_ALLOWED_RISKS, DSH_MANIFEST, dshAction } from "./manifest.js";

export const name = "intelligent-ui";

/** Services this plugin needs before `apply` runs. */
export const inject = ["tools", "systemPrompt"];

const DESCRIPTION = iuiToolDescription({
  name: IUI_TOOL_NAME,
  capabilities: DSH_MANIFEST,
  answerEnvelope: true,
});

const DSH_RULES = [
  "The DSH web host renders the tool result inline. After the user interacts, the next user message begins with `[iui-action]`; block interactions carry the block id and a payload, while a suggestion chip or form CTA arrives as `{\"action\":\"prompt\",\"payload\":{\"text\":\"…\"}}`. Resend the complete interface with a new `render_iui` call and stable block ids.",
  "Only propose actions declared in the host capability manifest. The host confirms every reversible action before sending it back to the session; never invent an action or describe an irreversible operation.",
  "A request for an interface, dashboard, comparison, plan, chart, form, itinerary, or interactive tool is answered by calling `render_iui` immediately. Do not call `working_directory`, `read`, `glob`, `grep`, shell, or other tools first; they are unnecessary for a self-contained interface answer.",
  "Host runtime-context and time-context messages are metadata, not user requests. Ignore their contents when deciding what to answer; the last actual human message is the task.",
  "Every `render_iui` call replaces the previous interface. When the user interacts, resend the complete interface with the same block ids, including unchanged blocks. Never send patch or delta ops such as `{\"t\":\"set\"}`.",
].join(" ");

const SYSTEM_PROMPT = [
  iuiSystemPrompt({
    mode: "tool",
    productName: "DeepSeek Harness",
    capabilities: DSH_MANIFEST,
    answerEnvelope: true,
  }),
  "## DSH host rules",
  "",
  DSH_RULES,
].join("\n\n");

const OUTPUT = {
  type: "object",
  additionalProperties: false,
  properties: {
    ops: {
      type: "array",
      required: true,
      items: { type: "json" },
      description: "Validated, sanitized IUI-1 ops in display order.",
    },
    issues: {
      type: "array",
      items: { type: "json" },
      description: "Validation issues; the valid ops still render.",
    },
    envelope: {
      type: "json",
      description: "The validated Answer Envelope, or null in legacy mode.",
    },
    legacy: {
      type: "boolean",
      description: "True when the model did not send an Answer Envelope.",
    },
  },
} as const;

interface IuiToolValue {
  ops: unknown[];
  issues?: unknown[];
  envelope?: unknown;
  legacy?: boolean;
}

function issueDetails(issues: unknown[]): string {
  return issues
    .slice(0, 8)
    .map((issue) => {
      if (issue && typeof issue === "object" && "path" in issue && "message" in issue) {
        return `${String((issue as { path: unknown }).path)}: ${String((issue as { message: unknown }).message)}`;
      }
      return String(issue);
    })
    .join("; ");
}

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: "tool:render-iui",
    order: ctx.systemPrompt.getSectionOrder("TOOLS_SDK"),
    text: SYSTEM_PROMPT,
  });

  ctx.tools.register(
    defineTool({
      name: IUI_TOOL_NAME,
      description: DESCRIPTION,
      parameters: {
        ops: {
          // Heterogeneous JSON objects. Do not add an `items` schema: some
          // OpenAI-compatible local models (notably Qwen 2.5 via Ollama) drop
          // the tool call entirely when an array parameter has nested items.
          type: "array",
          required: true,
          description:
            "Complete, ordered IUI-1 ops for this assistant turn. Start with one answer op, then content ops, then comp ops, then ask, then done. Each entry is a JSON object in the IUI-1 wire format described above.",
        },
      },
      output: {
        schema: OUTPUT,
        render(_args: unknown, value: IuiToolValue) {
          const count = value.ops.length;
          const issues = value.issues ?? [];
          const mode = value.legacy ? "legacy mode" : "an answer envelope";
          if (issues.length > 0) {
            const recovery =
              count === 0
                ? " No interface was rendered. Resend the complete interface as a new render_iui call; do not send patch or delta ops."
                : " The valid ops were rendered; resend the complete interface if the requested change is missing.";
            return [
              {
                type: "text",
                text: `Rendered ${count} valid op(s) with ${issues.length} issue(s) in ${mode}: ${issueDetails(issues)}.${recovery}`,
              },
            ];
          }
          return [{ type: "text", text: `Rendered ${count} IUI op(s) in ${mode}.` }];
        },
        presentationMeta(_args: unknown, value: IuiToolValue) {
          return value;
        },
      },
      presentCall() {
        return { card: "generic", title: "Rendering interface", kind: "other" };
      },
      async execute(args: { ops: unknown[] }): Promise<IuiToolValue> {
        const result = validateAnswerOps(args.ops, {
          blocks: BLOCK_TYPES,
          capabilities: DSH_MANIFEST,
        });
        return {
          ops: result.ops as unknown[],
          issues: result.issues as unknown[],
          envelope: result.envelope,
          legacy: result.legacy,
        };
      },
    }),
  );
}
