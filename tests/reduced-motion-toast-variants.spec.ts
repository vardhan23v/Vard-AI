import { test, expect, type Page } from "@playwright/test";

/**
 * The Preview Reduced Motion screen renders success/error/loading toast
 * variants inside [data-motion-preview]. This test confirms that under
 * the "reduced" scope those tiles (and their inner spinner) are
 * motion-free, while the "full" scope still animates.
 */

const parseMs = (v: string): number =>
  Math.max(
    ...v.split(",").map((s) => {
      const t = s.trim();
      if (t.endsWith("ms")) return parseFloat(t);
      if (t.endsWith("s")) return parseFloat(t) * 1000;
      return 0;
    }),
  );

async function maxMotionMs(page: Page, selector: string): Promise<number> {
  const value = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return "";
    const cs = getComputedStyle(el as Element);
    return `${cs.animationDuration}|${cs.transitionDuration}`;
  }, selector);
  const [anim, trans] = value.split("|");
  return Math.max(parseMs(anim || "0s"), parseMs(trans || "0s"));
}

const MOTION_KEY = "vard-motion";
async function seedMotion(page: Page, mode: "on" | "off") {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
      } catch {}
    },
    {
      key: MOTION_KEY,
      value: JSON.stringify({
        duration: 450,
        easing: "smooth",
        enabled: true,
        reducedMotion: mode,
        preset: "lift",
      }),
    },
  );
}

async function switchPreview(page: Page, mode: "reduced" | "full") {
  const label = mode === "reduced" ? "Reduced" : "Full";
  const btn = page.getByRole("button", { name: new RegExp(`^${label}$`) }).first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true });
  await expect(page.locator("[data-motion-preview]").first()).toHaveAttribute(
    "data-motion-preview",
    mode,
  );
}

test.describe("reduced-motion — toast variant tiles", () => {
  test.beforeEach(async ({ page }) => {
    await seedMotion(page, "off");
    await page.goto("/settings");
    await page.waitForFunction(
      () => !!document.querySelector('[data-testid="toast-variants-tile"]'),
    );
    await page.waitForTimeout(400);
  });

  test("success/error/loading tiles are motion-free in the reduced preview", async ({
    page,
  }) => {
    await switchPreview(page, "reduced");

    for (const id of [
      "toast-variant-success",
      "toast-variant-error",
      "toast-variant-loading",
    ]) {
      const ms = await maxMotionMs(page, `[data-testid="${id}"]`);
      expect(ms, `${id} should be motion-free under reduced preview`).toBeLessThan(5);
    }

    // The loading spinner (animate-spin) must also be neutralized.
    const spinnerMs = await maxMotionMs(
      page,
      '[data-testid="toast-variant-loading-spinner"]',
    );
    expect(spinnerMs, "loading spinner should stop under reduced preview").toBeLessThan(5);
  });

  test("tiles animate normally in the full preview", async ({ page }) => {
    await switchPreview(page, "full");

    const successMs = await maxMotionMs(
      page,
      '[data-testid="toast-variant-success"]',
    );
    expect(successMs, "success tile should animate in full preview").toBeGreaterThan(50);

    // Spinner should keep spinning (non-zero animation-duration).
    const spinnerMs = await maxMotionMs(
      page,
      '[data-testid="toast-variant-loading-spinner"]',
    );
    expect(spinnerMs, "loading spinner should spin in full preview").toBeGreaterThan(50);
  });
});