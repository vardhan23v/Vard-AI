import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression for the "Toast variants" tile in the MotionShowcase.
 *
 * Captures the tile (success / error / loading with spinner) in both
 * reduced and full preview scopes and diffs against baselines. Also
 * asserts the two scopes render byte-different pixels: any unintended
 * animation leaking into the reduced scope would either drift the
 * reduced baseline or collapse the reduced/full diff to identical.
 */

const MOTION_KEY = "vard-motion";

async function seedMotion(page: Page) {
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
        reducedMotion: "off",
        preset: "lift",
      }),
    },
  );
}

async function freezeAnimations(page: Page) {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try {
        a.currentTime =
          (a.effect?.getComputedTiming().endTime as number) ?? 1e6;
        a.pause();
      } catch {}
    }
  });
}

async function switchPreview(page: Page, mode: "reduced" | "full") {
  const btn = page.getByTestId(`preview-mode-${mode}`);
  await btn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await btn.click();
  await expect(page.getByTestId("motion-showcase-grid")).toHaveAttribute(
    "data-motion-preview",
    mode,
  );
}

test.describe("reduced-motion — visual regression (toast variants tile)", () => {
  test.beforeEach(async ({ page }) => {
    await seedMotion(page);
    await page.goto("/settings");
    await page.waitForFunction(
      () => !!document.querySelector('[data-testid="toast-variants-tile"]'),
    );
    await page.waitForTimeout(600);
  });

  test("toast variants tile — reduced preview matches baseline", async ({
    page,
  }) => {
    await switchPreview(page, "reduced");
    await page.waitForTimeout(400);
    await freezeAnimations(page);
    const tile = page.getByTestId("toast-variants-tile");
    await tile.scrollIntoViewIfNeeded();
    await expect(tile).toHaveScreenshot("toast-variants-reduced.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("toast variants tile — full preview matches baseline", async ({
    page,
  }) => {
    await switchPreview(page, "full");
    await page.waitForTimeout(400);
    await freezeAnimations(page);
    const tile = page.getByTestId("toast-variants-tile");
    await tile.scrollIntoViewIfNeeded();
    await expect(tile).toHaveScreenshot("toast-variants-full.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("toast variants tile — reduced vs full differ in pixels", async ({
    page,
  }) => {
    const tile = page.getByTestId("toast-variants-tile");

    await switchPreview(page, "reduced");
    await page.waitForTimeout(400);
    await freezeAnimations(page);
    const reducedShot = await tile.screenshot();

    await switchPreview(page, "full");
    await page.waitForTimeout(400);
    await freezeAnimations(page);
    const fullShot = await tile.screenshot();

    // The loading spinner is animated via a CSS transform loop under full
    // motion; under reduced motion the loop is neutralized. When frozen at
    // end-state the two scopes must produce visibly different bytes.
    expect(
      reducedShot.equals(fullShot),
      "reduced and full toast tiles should not produce identical pixels",
    ).toBe(false);
  });
});