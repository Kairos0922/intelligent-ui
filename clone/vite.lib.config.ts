import { defineConfig } from "vite";

/**
 * Library build for the embeddable SDK.
 *
 *   npm run build:lib
 *
 * Emits dist-lib/index.js (runtime), dist-lib/agent.js (model-facing helpers),
 * dist-lib/intelligent-ui.css and declaration files under dist-lib/types.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    minify: false,
    lib: {
      entry: {
        index: "src/sdk/index.ts",
        agent: "src/sdk/agent.ts",
      },
      formats: ["es"],
      fileName: (_format, entry) => `${entry}.js`,
      cssFileName: "intelligent-ui",
    },
  },
});
