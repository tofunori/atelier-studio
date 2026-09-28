import { test, expect } from "@playwright/test";

for (const reducedMotion of ["reduce", "no-preference"] as const) {
test.describe(`Narval keyboard with motion ${reducedMotion}`, () => {
test.use({ reducedMotion });

test("Narval overlay restores focus before hiding and consumes one Escape", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/#nvbench-w520");
  const row = page.locator(".narval-job-row").first();
  const close = page.locator(".narval-inspector-close");
  await expect(row).toBeVisible();
  await expect(close).toBeHidden(); // automatic selection must not open it
  await page.evaluate(() => {
    (window as any).__narvalGlobalEscape = 0;
    window.addEventListener("keydown", event => {
      if (event.key === "Escape") (window as any).__narvalGlobalEscape++;
    });
  });
  await row.click();
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(close).toBeHidden();
  await expect(row).toBeFocused();
  expect(await page.evaluate(() => (window as any).__narvalGlobalEscape)).toBe(0);
  await row.click();
  await close.click();
  await expect(row).toBeFocused();
  const recent = page.locator(".narval-run").first();
  await recent.click();
  await expect(recent).toHaveAttribute("aria-pressed", "true");
  await expect(recent).toHaveAttribute("data-state", "selected");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(recent).toBeFocused();
});

test("Narval wide inspector keeps list focus and adapts to a narrower pane", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/#nvbench-w1200");
  const row = page.locator(".narval-job-row").first();
  const close = page.locator(".narval-inspector-close");
  await expect(row).toBeVisible();
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(close).toBeHidden();
  await expect(row).toBeFocused();
  await page.locator(".narval-shell").evaluate(shell => {
    shell.parentElement!.style.width = "520px";
  });
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
});
});
}
