// Captures déterministes du fil de chat + composer (banc #chatbench, plan 020).
// Usage: GALLERY_NM=<path node_modules galerie> node capture_chatbench.cjs <baseUrl> <outDir> <prefix>
const path = require("path");
const { webkit } = require(path.join(process.env.GALLERY_NM, "@playwright/test"));

const [,, baseUrl, outDir, prefix] = process.argv;

(async () => {
  const browser = await webkit.launch();
  const shots = [
    ["rich-1512-dark", 1512, 883, "#chatbench"],
    ["rich-1512-light", 1512, 883, "#chatbench-light"],
    ["rich-1280-dark", 1280, 800, "#chatbench"],
    ["rich-800-dark", 800, 600, "#chatbench"],
    ["running-1280-dark", 1280, 800, "#chatbench-running"],
    ["error-800-dark", 800, 600, "#chatbench-error"],
    ["contexts-1512-dark", 1512, 883, "#chatbench-contexts"],
    ["markdown-1512-dark", 1512, 883, "#chatbench-markdown"],
  ];
  for (const [name, width, height, hash] of shots) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(baseUrl + "/" + hash, { waitUntil: "networkidle" });
    await page.waitForTimeout(hash.includes("markdown") ? 1500 : 600); // mermaid lazy
    await page.screenshot({ path: `${outDir}/${prefix}-${name}.png` });
    await page.close();
  }

  // popover modèle ouvert (nouvelle maison de l'effort) + pli d'activité déplié
  const page = await browser.newPage({ viewport: { width: 1512, height: 883 } });
  await page.goto(baseUrl + "/#chatbench", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const fold = page.locator(".turn-fold");
  if (await fold.count()) {
    await fold.first().click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/${prefix}-activity-open.png` });
    await fold.first().click();
  }
  const mpBtn = page.locator(".model-pick .mp-btn").first();
  if (await mpBtn.count()) {
    await mpBtn.click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/${prefix}-model-menu.png` });
  }
  await page.close();
  await browser.close();
  console.log("captures OK →", outDir, "prefix", prefix);
})().catch((e) => { console.error(e); process.exit(1); });
