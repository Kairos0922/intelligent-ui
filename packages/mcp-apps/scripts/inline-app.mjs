import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve(process.cwd(), "dist");
const appDir = resolve(dist, "app");
const htmlPath = resolve(appDir, "index.html");
const jsPath = resolve(appDir, "app.js");
const cssPath = resolve(appDir, "app.css");

let html = readFileSync(htmlPath, "utf8");
const js = readFileSync(jsPath, "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync(cssPath, "utf8");
const style = `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;

html = html
  .replace(/<link[^>]*rel=["']modulepreload["'][^>]*>/gi, "")
  .replace(/<link[^>]*href=["'][^"']*app\.css["'][^>]*>/gi, () => style)
  .replace(/<script[^>]*src=["'][^"']*app\.js["'][^>]*><\/script>/gi, () => `<script type="module">${js}</script>`);

if (/<script[^>]+src=/i.test(html) || /<link[^>]+href=/i.test(html)) {
  throw new Error("app.html still references external assets");
}

writeFileSync(resolve(dist, "app.html"), html, "utf8");
rmSync(appDir, { recursive: true, force: true });
console.log(`app.html ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB (single file)`);
