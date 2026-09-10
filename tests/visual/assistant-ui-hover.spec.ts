import { test, expect } from "@playwright/test";

test("official message hover does not dispatch before tap mount on reload", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 760, height: 850 });
  await page.goto("/#assistant-ui");

  const group = page.locator('[data-slot="tool-group-trigger"]');
  await expect(group).toHaveText("15 tool calls");
  await group.click();
  await page.getByLabel("Scénario").selectOption("done");
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await group.click();

  // Keep the pointer over the trigger. Chromium delivers mouseenter to the
  // newly mounted node during reload, which is the production race we guard.
  await page.reload();
  await expect(page.locator('[data-slot="tool-group-trigger"]')).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(pageErrors).toEqual([]);
});
