/**
 * DeepSeek Harness host half.
 *
 * Registers the model-facing `render_iui` tool and a short system-prompt
 * section. The tool validates and sanitizes every op with the same core
 * validator used by the MCP and AI SDK adapters. The validated list is carried
 * in presentation metadata so replay can recover it without parsing prose.
 */
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { Context } from "@deepseek-ai/cordis";
import {
  BLOCK_TYPES,
  IUI_TOOL_NAME,
  iuiToolDescription,
  validateOps,
} from "@intelligent-ui/core/agent";

export const name = "intelligent-ui";

/** Services this plugin needs before `apply` runs. */
export const inject = ["tools", "systemPrompt"];

const DESCRIPTION = iuiToolDescription({ name: IUI_TOOL_NAME });

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
  },
} as const;

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: "tool:render-iui",
    order: ctx.systemPrompt.getSectionOrder("TOOLS_SDK"),
    text: [
      "When a request is better answered as an interface than as prose — a comparison, plan, chart, dashboard, form, itinerary, quiz, or small interactive tool — call `render_iui` with the complete ordered IUI-1 op list.",
      "Use only the block types in the tool description. Keep prose in `md` ops, give components unique ids, and end with `{\"t\":\"done\"}`.",
      "The host renders the interface inline. When the user interacts, the next user message begins with `[iui-action]`; block interactions carry the block id and a payload, while a suggestion chip or form CTA arrives as `{\"action\":\"prompt\",\"payload\":{\"text\":\"…\"}}`. Update the affected component with another `render_iui` call.",
    ].join(" "),
  });

  ctx.tools.register(
    defineTool({
      name: IUI_TOOL_NAME,
      description: DESCRIPTION,
      parameters: {
        ops: {
          type: "array",
          required: true,
          items: { type: "json" },
          description:
            "Complete, ordered IUI-1 ops for this assistant turn. Start with content ops, then comp ops, then ask, then done.",
        },
      },
      output: {
        schema: OUTPUT,
        render(_args: unknown, value: { ops: unknown[]; issues?: unknown[] }) {
          const count = value.ops.length;
          const issues = value.issues ?? [];
          if (issues.length > 0) {
            const details = issues
              .slice(0, 8)
              .map((issue) => {
                if (issue && typeof issue === "object" && "path" in issue && "message" in issue) {
                  return `${String((issue as { path: unknown }).path)}: ${String((issue as { message: unknown }).message)}`;
                }
                return String(issue);
              })
              .join("; ");
            return [
              {
                type: "text",
                text: `Rendered ${count} valid op(s) with ${issues.length} issue(s): ${details}`,
              },
            ];
          }
          return [{ type: "text", text: `Rendered ${count} IUI op(s).` }];
        },
        presentationMeta(_args: unknown, value: { ops: unknown[]; issues?: unknown[] }) {
          return value;
        },
      },
      presentCall() {
        return { card: "generic", title: "Rendering interface", kind: "other" };
      },
      async execute(args: { ops: unknown[] }) {
        const result = validateOps(args.ops, { blocks: BLOCK_TYPES });
        return { ops: result.ops as unknown[], issues: result.issues as unknown[] };
      },
    }),
  );
}
