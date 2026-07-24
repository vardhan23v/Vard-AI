import { test } from "@playwright/test";
test("dbg", async ({ page }) => {
  await page.addInitScript(({ k, v }) => { try { localStorage.setItem(k, v); } catch {} },
    { k: "vard-motion", v: JSON.stringify({ duration:450, easing:"smooth", enabled:true, reducedMotion:"off", preset:"lift" }) });
  await page.goto("/settings");
  await page.waitForFunction(() => !!document.querySelector('[data-testid="toast-variants-tile"]'));
  await page.waitForTimeout(500);
  const attrs = await page.$$eval("[data-motion-preview]", els => els.map(e => e.getAttribute("data-motion-preview")));
  console.log("preview attrs:", JSON.stringify(attrs));
  const cs = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="toast-variant-success"]');
    return el ? getComputedStyle(el).animationDuration + " / trans:" + getComputedStyle(el).transitionDuration : "no el";
  });
  console.log("success computed:", cs);
  const spin = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="toast-variant-loading-spinner"]');
    return el ? getComputedStyle(el).animationDuration : "no";
  });
  console.log("spinner anim:", spin);
});
