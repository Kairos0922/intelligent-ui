import { readFile, writeFile, rm } from "node:fs/promises";

const bundle = await readFile("lib/client.bundle.cjs", "utf8");
const wrapped = `window.__ModuleLoader__.load({
\tid: "@intelligent-ui/dsh",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${bundle}
\t\treturn module.exports;
\t}
});
`;
await writeFile("lib/client.js", wrapped);
await rm("lib/client.bundle.cjs", { force: true });
