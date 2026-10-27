import { defineConfig } from "vite";

/**
 * Node half: the cordis plugin that registers `render_iui`.
 *
 * DSH supplies the host packages; keep `@deepseek-ai/*` external. Bundle the
 * IUI packages so one tarball installs into a clean profile without a registry
 * copy of core or adapter.
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
      external: (id) => id.startsWith("@deepseek-ai/"),
    },
  },
});
