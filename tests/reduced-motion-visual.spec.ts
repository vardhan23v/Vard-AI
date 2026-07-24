import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression: capture the MotionShowcase grid in both the "reduced"
 * and "full" preview modes and diff against baseline snapshots. Baselines
 * are generated on the first run (or via `--update-snapshots`); subsequent
 * runs fail if either scope drifts visually.
 *
 * We freeze animations at their end-state before capturing so screenshots
 * are deterministic — the diff reflects layout/styling, not timing.
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
  // Send every running animation to its final frame + pause it. This
  // removes non-determinism from spinners, entry keyframes, shimmers,
  // and CSS transitions so pixel diffs are meaningful.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        caret-color: transparent !important;
      }
    `,
  });
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

test.describe("reduced-motion — visual regression (MotionShowcase)", () => {
  test.beforeEach(async ({ page }) => {
    await seedMotion(page);
    await page.goto("/settings");
    await page.waitForFunction(
      () => !!document.querySelector('[data-testid="motion-showcase-grid"]'),
    );
    // Let entry animations dispatch, then freeze them at end-state.
    await page.waitForTimeout(600);
  });

  test("MotionShowcase — reduced preview matches baseline", async ({ page }) => {
    await switchPreview(page, "reduced");
    await page.waitForTimeout(400);
    await freezeAnimations(page);
    const grid = page.getByTestId("motion-showcase-grid");
    await grid.scrollIntoViewIfNeeded();
    await expect(grid).toHaveScreenshot("motion-showcase-reduced.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("MotionShowcase — full preview matches baseline", async ({ page }) => {
    await switchPreview(page, "full");
    await page.waitForTimeout(400);
    await freezeAnimations(page);
    const grid = page.getByTestId("motion-showcase-grid");
    await grid.scrollIntoViewIfNeeded();
    await expect(grid).toHaveScreenshot("motion-showcase-full.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("reduced vs full previews render visibly different pixels", async ({
    page,
  }) => {
    const grid = page.getByTestId("motion-showcase-grid");

    await switchPreview(page, "reduced");
    await page.waitForTimeout(400);
    await freezeAnimations(page);
    const reducedShot = await grid.screenshot();

    await switchPreview(page, "full");
    await page.waitForTimeout(400);
    await freezeAnimations(page);
    const fullShot = await grid.screenshot();

    // The two scopes must be byte-different: reduced neutralizes animations
    // that leave motion-frozen residue in the full scope (spinner angle,
    // route/toast entry transforms held mid-flight after freeze).
    expect(
      reducedShot.equals(fullShot),
      "reduced and full previews should not produce identical pixels",
    ).toBe(false);
  });
});
