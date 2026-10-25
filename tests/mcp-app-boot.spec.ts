import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Smoke test for the built MCP App bundle: it must evaluate, mount #root, and
 * fail gracefully when there is no MCP Apps host on the other side of the
 * iframe (instead of throwing an uncaught error).
 */
test("MCP app bundle boots and degrades without a host", async ({ page }) => {
  const htmlPath = fileURLToPath(new URL("../packages/mcp-apps/dist/app.html", import.meta.url));
  const html = readFileSync(htmlPath, "utf8");

  const uncaught: string[] = [];
  page.on("pageerror", (error) => uncaught.push(String(error)));

  await page.route("http://iui.test/app.html", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  await page.goto("http://iui.test/app.html");

  await expect(page.locator("#root")).toHaveCount(1);

  // Give connect() time to fail on its own; a host is absent by design.
  await page.waitForTimeout(2_000);
  expect(uncaught).toEqual([]);

  // The app stays usable: either the graceful status row or an empty root.
  const status = page.locator(".iui-app-status");
  const statusCount = await status.count();
  if (statusCount > 0) {
    await expect(status).toContainText(/MCP Apps|host/i);
  }
});
