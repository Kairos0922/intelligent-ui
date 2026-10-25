import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "node20",
    sourcemap: false,
    lib: {
      entry: {
        server: "src/server.ts",
        cli: "src/cli.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "node:fs",
        "node:process",
        "@modelcontextprotocol/server",
        "@modelcontextprotocol/server/stdio",
        "@modelcontextprotocol/ext-apps/server",
        "zod",
        "@intelligent-ui/core",
        "@intelligent-ui/core/agent",
      ],
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
