import type { HostCapabilityManifest } from "@intelligent-ui/core";

/**
 * Capabilities the DSH adapter is allowed to expose to the model.
 *
 * The list is deliberately small and contains only read-only or reversible
 * actions. DSH has no wallet, pass-verification, notification, or calendar
 * writer in the web profile, so those capabilities stay false and their
 * actions are not declared. A reversible action must opt into confirmation;
 * the client checks this flag before sending the action back to the session.
 */
export const DSH_MANIFEST: HostCapabilityManifest = {
  schemaVersion: "1.0",
  hostId: "dsh",
  hostVersion: "0.2.2",
  locale: "en-US",
  timeZone: "UTC",
  capabilities: {
    canNotify: false,
    canPersist: true,
    canOpenWallet: false,
    canVerifyPass: false,
    canWriteCalendar: false,
    canDeepLink: true,
  },
  actions: [
    {
      name: "copy_text",
      description: "Copy the selected text to the clipboard.",
      risk: "read",
      requiresConfirmation: false,
      idempotent: true,
      compensation: "none",
      timeoutMs: 5_000,
      argsSchema: {
        type: "object",
        properties: {
          text: { type: "string", minLength: 1, maxLength: 20_000 },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
    {
      name: "open_link",
      description: "Open an https link in the user's browser.",
      risk: "read",
      requiresConfirmation: false,
      idempotent: true,
      compensation: "none",
      timeoutMs: 5_000,
      argsSchema: {
        type: "object",
        properties: {
          url: { type: "string", pattern: "^https://" },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
    {
      name: "save_note",
      description: "Save the selected summary as a note in the current workspace.",
      risk: "reversible",
      requiresConfirmation: true,
      idempotent: true,
      compensation: "reversible",
      timeoutMs: 15_000,
      argsSchema: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          body: { type: "string", minLength: 1, maxLength: 20_000 },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
    },
  ],
};

/** The only risk levels DSH may declare. */
export const DSH_ALLOWED_RISKS = new Set(["read", "reversible"]);

export function dshAction(name: string) {
  return DSH_MANIFEST.actions.find((action) => action.name === name) ?? null;
}
