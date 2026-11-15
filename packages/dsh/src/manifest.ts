import type { HostCapabilityManifest } from "@intelligent-ui/core";

/**
 * Capabilities the DSH adapter is allowed to expose to the model.
 *
 * The list is deliberately small and contains only read-only or reversible
 * actions. DSH verifies travel-pass signatures in the host controller and can
 * read issuer feeds; it has no Wallet writer, notification channel, or calendar
 * writer in the web profile, so those capabilities stay false. A reversible
 * action must opt into confirmation; the client checks this flag before sending
 * the action back to the session.
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
    canVerifyPass: true,
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
      name: "show_code",
      description: "Open the scannable code for a travel pass when the host allows presentation.",
      risk: "read",
      requiresConfirmation: false,
      idempotent: true,
      compensation: "none",
      timeoutMs: 5_000,
      argsSchema: {
        type: "object",
        properties: {
          credentialId: { type: "string", minLength: 1, maxLength: 160 },
        },
        required: ["credentialId"],
        additionalProperties: false,
      },
    },
    {
      name: "refresh",
      description: "Refresh a travel pass from its issuer and re-verify the signature.",
      risk: "read",
      requiresConfirmation: false,
      idempotent: true,
      compensation: "none",
      timeoutMs: 15_000,
      argsSchema: {
        type: "object",
        properties: {
          credentialId: { type: "string", minLength: 1, maxLength: 160 },
        },
        required: ["credentialId"],
        additionalProperties: false,
      },
    },
    {
      name: "request_verification",
      description: "Ask the host to verify a travel pass signature and freshness again.",
      risk: "read",
      requiresConfirmation: false,
      idempotent: true,
      compensation: "none",
      timeoutMs: 15_000,
      argsSchema: {
        type: "object",
        properties: {
          credentialId: { type: "string", minLength: 1, maxLength: 160 },
        },
        required: ["credentialId"],
        additionalProperties: false,
      },
    },
    {
      name: "open_issuer_link",
      description: "Open the issuer's https information page in the user's browser.",
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
