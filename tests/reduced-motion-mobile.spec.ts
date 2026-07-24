import { test, expect, type Page } from "@playwright/test";

/**
 * Coverage for reduced-motion behavior outside the desktop flows:
 *  - mobile viewport off-canvas menu (Radix Sheet)
 *  - nested UI: Popover containing an Accordion
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

async function animMs(page: Page, selector: string): Promise<number> {
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
  await page.waitForFunction(() => !!document.querySelector("[data-motion-preview]"));
  await page.waitForTimeout(500);
}

async function clickTestId(page: Page, id: string) {
  const btn = page.getByTestId(id);
  await expect(btn).toBeVisible();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
}

test.describe("reduced-motion on mobile off-canvas", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("sheet drawer respects reduced-motion when 'on'", async ({ page }) => {
    await seedReducedMotion(page, "on");
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "on");
    await waitHydrated(page);

    await clickTestId(page, "open-sheet");
    const sheet = page.locator('[data-testid="sheet-content"][data-state="open"]');
    await expect(sheet).toBeVisible();
    const ms = await animMs(page, '[data-testid="sheet-content"][data-state="open"]');
    expect(ms, "off-canvas sheet slide animation should be neutralized").toBeLessThan(5);

    // Overlay should also be still.
    const overlayMs = await animMs(
      page,
      '[data-radix-dialog-overlay][data-state="open"], [data-state="open"].bg-black\\/80',
    );
    expect(overlayMs).toBeLessThan(5);

    await page.keyboard.press("Escape");
  });

  test("sheet drawer animates when reduced-motion is 'off'", async ({ page }) => {
    await seedReducedMotion(page, "off");
    await page.goto("/settings");
    await waitHydrated(page);

    await clickTestId(page, "open-sheet");
    const sheet = page.locator('[data-testid="sheet-content"][data-state="open"]');
    await expect(sheet).toBeVisible();
    const ms = await animMs(page, '[data-testid="sheet-content"][data-state="open"]');
    expect(ms, "sheet should slide when motion is on").toBeGreaterThan(50);
  });
});

test.describe("reduced-motion on nested UI (popover + accordion)", () => {
  test("popover open + accordion expand are neutralized when 'on'", async ({ page }) => {
    await seedReducedMotion(page, "on");
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "on");
    await waitHydrated(page);

    await clickTestId(page, "open-popover");
    const pop = page.locator('[data-testid="popover-content"][data-state="open"]');
    await expect(pop).toBeVisible();
    const popMs = await animMs(page, '[data-testid="popover-content"][data-state="open"]');
    expect(popMs, "popover open animation should be neutralized").toBeLessThan(5);

    // Expand section B and check the collapsible content transition is neutral.
    await page.getByTestId("accordion-b-trigger").click();
    const content = page.locator('[data-testid="accordion-b-content"][data-state="open"]');
    await expect(content).toBeVisible();
    const accMs = await animMs(page, '[data-testid="accordion-b-content"][data-state="open"]');
    expect(accMs, "accordion expand animation should be neutralized").toBeLessThan(5);
  });

  test("popover + accordion animate normally when reduced-motion is 'off'", async ({
    page,
  }) => {
    await seedReducedMotion(page, "off");
    await page.goto("/settings");
    await waitHydrated(page);

    await clickTestId(page, "open-popover");
    const pop = page.locator('[data-testid="popover-content"][data-state="open"]');
    await expect(pop).toBeVisible();
    const popMs = await animMs(page, '[data-testid="popover-content"][data-state="open"]');
    expect(popMs, "popover should animate when motion is on").toBeGreaterThan(50);

    await page.getByTestId("accordion-b-trigger").click();
    const content = page.locator('[data-testid="accordion-b-content"][data-state="open"]');
    await expect(content).toBeVisible();
    const accMs = await animMs(page, '[data-testid="accordion-b-content"][data-state="open"]');
    expect(accMs, "accordion should animate when motion is on").toBeGreaterThan(50);
  });
});