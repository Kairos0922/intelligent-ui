/* Give the declaration entry a module for its `import "../styles/sdk.css"`
   side effect. The runtime import only tells Vite to emit the stylesheet;
   consumers load it explicitly via `@intelligent-ui/core/styles.css`, so the
   declaration stub just keeps `tsc` happy in the consumer project. */
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist-lib/types/styles", { recursive: true });
await writeFile(
  "dist-lib/types/styles/sdk.css.d.ts",
  "/* declaration stub for the stylesheet side-effect import */\nexport {};\n",
);
