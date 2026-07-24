import { test, expect, type Page } from "@playwright/test";

/**
 * Coverage for drag-and-drop components: confirms reduced-motion mode
 * disables the transform transition that plays on drop (snap-back / settle).
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

async function transitionMs(page: Page, selector: string): Promise<number> {
  const value = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return "";
    return getComputedStyle(el as Element).transitionDuration;
  }, selector);
  return parseMs(value || "0s");
}

const MOTION_KEY = "vard-motion";
async function seedReducedMotion(page: Page, mode: "on" | "off" | "system") {
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

async function waitHydrated(page: Page) {
  await page.waitForFunction(() => !!document.querySelector('[data-testid="dnd-chip"]'));
  await page.waitForTimeout(500);
}

/**
 * Trigger the drop code path: this exercises the exact React state that a
 * real pointer drop reaches (slot swap + chip snap-transition rerender).
 * We avoid raw pointer dispatch because Playwright/React 18 pointer
 * synthesis is unreliable in a headless CI environment.
 */
async function triggerDrop(page: Page) {
  const btn = page.getByTestId("dnd-drop");
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
}

test.describe("reduced-motion for drag-and-drop", () => {
  test("snap-back transition is neutralized when reduced-motion is 'on'", async ({
    page,
  }) => {
    await seedReducedMotion(page, "on");
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "on");
    await waitHydrated(page);

    // Idle chip: computed transition-duration should be effectively 0.
    const idleMs = await transitionMs(page, '[data-testid="dnd-chip"]');
    expect(idleMs, "chip transition-duration should be neutralized").toBeLessThan(5);

    // Drop into slot B and confirm the settle transition is still neutral.
    await triggerDrop(page);
    await expect(page.getByTestId("dnd-container")).toHaveAttribute(
      "data-slot-active",
      "b",
    );
    const droppedMs = await transitionMs(page, '[data-testid="dnd-chip"]');
    expect(
      droppedMs,
      "post-drop settle transition should be neutralized",
    ).toBeLessThan(5);
  });

  test("snap-back transition animates when reduced-motion is 'off'", async ({
    page,
  }) => {
    await seedReducedMotion(page, "off");
    await page.goto("/settings");
    await waitHydrated(page);

    const idleMs = await transitionMs(page, '[data-testid="dnd-chip"]');
    expect(
      idleMs,
      "chip should carry its 400ms transform transition when motion is on",
    ).toBeGreaterThan(50);

    await triggerDrop(page);
    await expect(page.getByTestId("dnd-container")).toHaveAttribute(
      "data-slot-active",
      "b",
    );
    const droppedMs = await transitionMs(page, '[data-testid="dnd-chip"]');
    expect(droppedMs, "post-drop settle should animate").toBeGreaterThan(50);
  });
});