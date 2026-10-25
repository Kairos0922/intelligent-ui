import { defineConfig } from "vite";

/**
 * Node half: the cordis plugin that registers `render_iui`.
 *
 * DSH supplies the host packages; keep `@deepseek-ai/*` and the
 * `@intelligent-ui/*` dependencies external so one profile shares one copy of
 * the protocol and the plugin can be hot-reloaded without duplicating core.
 */
export default defineConfig({
  build: {
    outDir: "lib",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    sourcemap: false,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: (id) => id.startsWith("@deepseek-ai/") || id.startsWith("@intelligent-ui/"),
    },
  },
});
