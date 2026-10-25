/**
 * Minimal type surface for the DSH packages used by this adapter.
 *
 * DSH is a peer at runtime. Keeping the compile-time surface local avoids
 * pinning the whole client UI dependency closure as dev dependencies while
 * still giving the adapter real types to check against.
 */
declare module "@deepseek-ai/cordis" {
  export interface Context {
    effect(callback: () => void | (() => void), label?: string): void;
    slots: {
      inject(key: string, callback: () => unknown): void;
      register(options: Record<string, unknown>, component: unknown): () => void;
    };
    sessions: {
      binding(id: string):
        | {
            readonly session: {
              prompt(
                content: Array<{ type: "text"; text: string }>,
                mode: "queue" | "steer",
              ): Promise<{ ok: boolean; error?: { message: string } }>;
            };
          }
        | undefined;
    };
    tools: {
      register(tool: unknown): void;
    };
    systemPrompt: {
      section(section: { name: string; order: number; text: string }): void;
      getSectionOrder(name: string): number;
    };
  }
}

declare module "@deepseek-ai/dsh-tools" {
  export function defineTool(options: unknown): unknown;
}

declare module "*?raw" {
  const contents: string;
  export default contents;
}
