// Captures déterministes du panneau Projets (banc #navbench) + contrôles QA.
// Usage: node capture_nav.cjs <baseUrl> <outDir> <prefix>
const path = require("path");
const { webkit } = require(path.join(process.env.GALLERY_NM, "@playwright/test"));

const [,, baseUrl, outDir, prefix] = process.argv;

(async () => {
  const browser = await webkit.launch();
  const shots = [
    ["1512-dark", 1512, 883, "#navbench"],
    ["800-dark", 800, 600, "#navbench"],
    ["1512-light", 1512, 883, "#navbench-light"],
    ["800-unscoped", 800, 600, "#navbench-unscoped"],
    ["800-empty", 800, 600, "#navbench-empty"],
    ["w220", 520, 760, "#navbench-w220"],
    ["w180", 520, 760, "#navbench-w180"],
  ];
  for (const [name, width, height, hash] of shots) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(baseUrl + "/" + hash, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${prefix}-${name}.png` });
    await page.close();
  }

  // états interactifs + contrôle layout-shift au hover
  const page = await browser.newPage({ viewport: { width: 1512, height: 883 } });
  await page.goto(baseUrl + "/#navbench", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const rowSel = ".pnav-row, .sidebar li:not(.thread-recency-label)";
  const row = page.locator(rowSel).nth(0);
  const titleBefore = await page.locator(`${rowSel} .title`).nth(0).boundingBox();
  const rowBefore = await row.boundingBox();
  await row.hover();
  await page.waitForTimeout(250);
  const titleAfter = await page.locator(`${rowSel} .title`).nth(0).boundingBox();
  const rowAfter = await row.boundingBox();
  const same = (a, b) => a && b && ["x","y","width","height"].every(k => Math.abs(a[k]-b[k]) < 0.5);
  console.log("QA hover: titre stable =", same(titleBefore, titleAfter), "| ligne stable =", same(rowBefore, rowAfter));
  await page.screenshot({ path: `${outDir}/${prefix}-hover-row.png` });

  // menu overflow du header (si présent — nouveau panneau seulement)
  const ov = page.locator('[aria-label="Actions du projet"]');
  if (await ov.count()) {
    await ov.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${prefix}-overflow-menu.png` });
    await page.keyboard.press("Escape");
  }
  await page.close();

  // reduced motion : plus aucune animation sur l'arc, tokens motion à 0
  const rm = await browser.newPage({ viewport: { width: 800, height: 600 }, reducedMotion: "reduce" });
  await rm.goto(baseUrl + "/#navbench", { waitUntil: "networkidle" });
  await rm.waitForTimeout(400);
  const rmCheck = await rm.evaluate(() => {
    const arc = document.querySelector(".arc");
    const cs = arc ? getComputedStyle(arc) : null;
    return {
      arcAnimation: cs ? cs.animationName : "(pas d'arc)",
      motionFast: getComputedStyle(document.documentElement).getPropertyValue("--motion-fast").trim(),
    };
  });
  console.log("QA reduced-motion:", JSON.stringify(rmCheck));
  await rm.close();

  await browser.close();
  console.log("captures OK →", outDir, "prefix", prefix);
})().catch((e) => { console.error(e); process.exit(1); });
