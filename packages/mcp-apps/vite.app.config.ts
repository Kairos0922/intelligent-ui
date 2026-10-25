import { defineConfig } from "vite";

export default defineConfig({
  root: "src/app",
  base: "./",
  publicDir: false,
  build: {
    outDir: "../../dist/app",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "app.js",
        assetFileNames: "app.[ext]",
      },
    },
  },
});
