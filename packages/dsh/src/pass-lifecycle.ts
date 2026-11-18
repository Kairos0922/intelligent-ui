/** Host-side lifecycle boundaries that must wipe sealed pass state. */
export interface PassLifecycleContext {
  effect(callback: () => void | (() => void), label?: string): void;
  on(
    name: string,
    listener: (...args: unknown[]) => void,
    options?: { global?: boolean },
  ): () => void;
}

/** DSH's signed-out account state, as delivered by `account-ui/change`. */
export function isSignedOutAccountState(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const view = (value as { view?: unknown }).view;
  if (!view || typeof view !== "object") return false;
  return (view as { status?: unknown }).status === "signed-out";
}

/**
 * Clear sealed pass state when the hosted account signs out or a session is
 * disposed. Both are account boundaries on DSH: the account stream is the
 * normal sign-out path, while session disposal covers deployments that expose
 * it. One shared pass store is cleared at either boundary.
 */
export function installPassLifecycleCleanup(
  ctx: PassLifecycleContext,
  clear: () => Promise<void>,
): void {
  const wipe = () => {
    void clear().catch(() => {});
  };
  ctx.effect(
    () =>
      ctx.on(
        "account-ui/change",
        (...args: unknown[]) => {
          if (isSignedOutAccountState(args[0])) wipe();
        },
        { global: true },
      ),
    "intelligent-ui: clear pass state on account sign-out",
  );
  ctx.effect(
    () => ctx.on("session/disposed", wipe, { global: true }),
    "intelligent-ui: clear pass state on session disposal",
  );
}
