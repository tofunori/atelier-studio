import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 850 });
  await page.goto("/#assistant-ui");
});

test("official grouping keeps fifteen tools compact and preserves user disclosure", async ({ page }) => {
  const group = page.locator('[data-slot="tool-group-trigger"]');
  await expect(group).toHaveText("15 tool calls");
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-slot="tool-fallback-trigger"]')).toHaveCount(0);
  await group.click();
  await expect(page.locator('[data-slot="tool-fallback-trigger"]')).toHaveCount(15);
  await page.getByLabel("Scénario").selectOption("done");
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Les vérifications sont terminées. Les fichiers concordent", { exact: false })).toBeVisible();
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(group).toHaveAttribute("aria-expanded", "false");
});

test("official composer supports file input, removal and sending", async ({ page }) => {
  await page.getByLabel("Scénario").selectOption("empty");
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add Attachment", exact: true }).click();
  await (await fileChooser).setFiles({ name: "verification.txt", mimeType: "text/plain", buffer: Buffer.from("Test attachment") });
  await expect(page.getByRole("button", { name: "Document attachment", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove file", exact: true }).click();
  await expect(page.getByRole("button", { name: "Document attachment", exact: true })).toHaveCount(0);
  const secondChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add Attachment", exact: true }).click();
  await (await secondChooser).setFiles({ name: "verification.txt", mimeType: "text/plain", buffer: Buffer.from("Test attachment") });
  await expect(page.getByRole("button", { name: "Document attachment", exact: true })).toBeVisible();
  await page.getByLabel("Message input").fill("Vérifier ce document");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Message reçu dans le prototype. Aucun agent n’a été lancé.")).toBeVisible();
  await expect(page.getByLabel("Message input")).toHaveValue("");
});

test("reasoning effort element and model picker respond without native browser chrome", async ({ page }) => {
  await page.getByLabel("Reasoning Effort officiel").check();
  await page.getByRole("button", { name: "High", exact: true }).click();
  await expect(page.getByRole("button", { name: "High", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("progressbar", { name: "Thinking budget used" })).toHaveAttribute("aria-valuetext", "640 of 8,192");
  await page.locator('[data-slot="model-selector-trigger"]').click();
  await page.getByRole("option", { name: "Claude", exact: true }).click();
  await expect(page.locator('[data-slot="model-selector-trigger"]')).toHaveText("Claude");
  const trigger = page.locator('[data-slot="tool-group-trigger"]');
  expect(await trigger.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
});

test("anonymized captured Codex and Claude events render without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const scenario of ["codex-replay", "claude-replay"]) {
    await page.getByLabel("Scénario").selectOption(scenario);
    await expect(page.getByLabel("Message input")).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0);
    await expect(page.locator('[data-slot="aui_assistant-message-content"]')).not.toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("native host connects options, commands and the selected model", async ({ page }) => {
  await page.getByLabel("Scénario").selectOption("native-host");
  const input = page.getByLabel("Message input");
  await input.fill("/rev");
  await expect(page.getByRole("option", { name: /\/review/ })).toBeVisible();
  await input.press("Enter");
  await expect(input).toHaveValue("/review ");
  await expect(page.getByText("Message reçu dans le prototype. Aucun agent n’a été lancé.")).toHaveCount(0);
  await page.getByRole("button", { name: "Options du chat", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Mode de permission" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('[data-slot="model-selector-trigger"]').click();
  await page.getByRole("option", { name: /claude-fable-5-1/ }).click();
  await input.fill("Vérifie ce passage");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Envoi simulé" })).toContainText("claude-fable-5-1");
  await expect(page.getByText("Message reçu dans le prototype. Aucun agent n’a été lancé.")).toBeVisible();
});

test("native runtime accepts a queued message while a turn is running", async ({ page }) => {
  await page.getByLabel("Scénario").selectOption("native-host");
  await page.getByLabel("État du raccordement").selectOption("running");
  await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible();
  await page.getByLabel("Message input").fill("Vérifie aussi les légendes");
  await page.getByLabel("Message input").press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Envoi simulé" })).toContainText("queue");
  await expect(page.getByLabel("Message input")).toHaveValue("");
  await expect(page.locator('[data-slot="message-queue"]')).toContainText("Vérifie aussi les légendes");
  await page.getByRole("button", { name: "Modifier le message en attente", exact: true }).click();
  await expect(page.getByLabel("Message input")).toHaveValue("Vérifie aussi les légendes");
  await expect(page.locator('[data-slot="message-queue"]')).toHaveCount(0);
});

test("native runtime displays and answers a pending permission request", async ({ page }) => {
  await page.getByLabel("Scénario").selectOption("native-host");
  await page.getByLabel("État du raccordement").selectOption("approval");
  await expect(page.locator(".aui-tool-fallback-approval-prompt").filter({ hasText: "Autoriser la lecture du fichier ?" })).toBeVisible();
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Réponse simulée" })).toContainText('"allow":true');
  await expect(page.getByRole("button", { name: "Allow", exact: true })).toHaveCount(0);
});


test("native reasoning signals use the official disclosure without exposing internal markers", async ({ page }) => {
  await page.getByLabel("Scénario").selectOption("native-host");
  await page.getByLabel("État du raccordement").selectOption("thinking");
  await expect(page.locator('[data-slot="reasoning-root"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="reasoning-trigger-label"]')).toHaveClass(/shimmer/);
  await expect(page.locator('[data-slot="aui_assistant-message-indicator"]')).toHaveCount(0);
  await expect(page.getByText("__thinking", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-slot="tool-group-trigger-loader"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="tool-group-trigger"]')).toContainText("1 tool call");
  await page.getByLabel("État du raccordement").selectOption("idle");
  await expect(page.locator('[data-slot="reasoning-trigger-label"][class*="shimmer"]')).toHaveCount(0);
});


test("conversation map navigates actual runtime turns and hides in a narrow chat", async ({ page }) => {
  await page.getByLabel("Scénario").selectOption("empty");
  for (let i = 1; i <= 6; i++) {
    await page.getByLabel("Message input").fill(`Question de navigation ${i}`);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
  }
  const map = page.getByRole("navigation", { name: "Conversation map" });
  await expect(map).toBeVisible();
  await expect(map.locator('[data-slot="conversation-map-tick"]')).toHaveCount(6);
  await map.getByRole("button", { name: "Question de navigation 1", exact: true }).click();
  await expect(map.getByRole("button", { name: "Question de navigation 1", exact: true })).toHaveAttribute("aria-current", "true");
  await page.setViewportSize({ width: 390, height: 850 });
  await expect(map).not.toBeVisible();
});

test("official effort selection works with unavailable usage rather than a simulated budget", async ({ page }) => {
  await page.getByLabel("Scénario").selectOption("native-host");
  await page.getByRole("button", { name: "Options du chat", exact: true }).click();
  const effort = page.locator('[data-slot="reasoning-effort"]');
  await expect(effort).toContainText("Consommation indisponible");
  await expect(effort.getByRole("progressbar")).toHaveCount(0);
  await effort.getByRole("button", { name: "high", exact: true }).click();
  await expect(effort.getByRole("button", { name: "high", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.getByLabel("Message input").fill("Vérifie avec un effort élevé");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Envoi simulé" })).toContainText("high");
});
