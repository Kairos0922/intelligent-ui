import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __selftest: {
      pass: number;
      fail: number;
      total: number;
      results: Array<{ name: string; ok: boolean; detail: string }>;
    };
  }
}

test("core SDK browser self-test passes", async ({ page }) => {
  await page.goto("/sdk-selftest.html");
  await page.waitForFunction(
    () => {
      const result = window.__selftest;
      return !!result && result.total > 0 && result.pass + result.fail === result.total;
    },
    undefined,
    { timeout: 20_000 },
  );

  const result = await page.evaluate(() => window.__selftest);
  console.log(`SDK self-test: ${result.pass}/${result.total} passed`);
  for (const item of result.results) {
    if (!item.ok) console.log(`FAIL ${item.name}: ${item.detail}`);
  }

  expect(result.fail).toBe(0);
  expect(result.total).toBe(25);
});
