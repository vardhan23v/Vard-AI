import { test } from "@playwright/test";
test("dbg-seeded", async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch {}
  }, { key: "vard-motion", value: JSON.stringify({ duration: 450, easing: "smooth", enabled: true, reducedMotion: "off", preset: "lift" }) });
  await page.goto("/settings");
  await page.waitForTimeout(1500);
  const btn = page.getByTestId("dnd-drop");
  console.log("visible:", await btn.isVisible().catch(() => "err"));
  await btn.click({ trial: true }).then(() => console.log("trial ok")).catch(e => console.log("trial fail:", e.message.split("\n")[0]));
  await btn.click({ force: true });
  await page.waitForTimeout(400);
  console.log("slot:", await page.getByTestId("dnd-container").getAttribute("data-slot-active"));
});
