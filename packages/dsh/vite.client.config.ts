import { defineConfig } from "vite";

/**
 * Browser half: a DSH client module.
 *
 * The bundle is CommonJS with React external, then wrapped in the
 * `window.__ModuleLoader__.load({ id, factory })` envelope by
 * scripts/postbuild.mjs. Core and the adapter are bundled: the toolview needs
 * them at runtime, and embedding them keeps the adapter to one package.
 *
 * The stylesheet is imported with `?raw` from the core build output and
 * embedded into the bundle, so the published package never reads another
 * package's files at runtime.
 */
export default defineConfig({
  build: {
    outDir: "lib",
    emptyOutDir: false,
    target: "es2022",
    minify: false,
    sourcemap: false,
    lib: {
      entry: "src/client.tsx",
      formats: ["cjs"],
      fileName: () => "client.bundle.cjs",
    },
    rollupOptions: {
      external: ["react", "react/jsx-runtime"],
    },
  },
});
