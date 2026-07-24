import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies that the Reduced Motion setting (Settings → Brand panel)
 * neutralizes animations for modals, toasts, dropdowns, and route
 * transitions, and that turning it off restores motion.
 */

const parseMs = (v: string): number => {
  // getComputedStyle returns comma-separated list; pick the max.
  return Math.max(
    ...v.split(",").map((s) => {
      const t = s.trim();
      if (t.endsWith("ms")) return parseFloat(t);
      if (t.endsWith("s")) return parseFloat(t) * 1000;
      return 0;
    }),
  );
};

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

async function clickButton(page: Page, text: string) {
  const btn = page.locator("button", { hasText: text }).first();
  await expect(btn).toBeVisible();
  await btn.scrollIntoViewIfNeeded();
  // Give hydration a beat so React onClick handlers are attached.
  await page.waitForTimeout(300);
  await btn.click();
}

test.describe("reduced-motion preview", () => {
  test("Always on neutralizes modals, toasts, dropdowns, and route transitions", async ({
    page,
  }) => {
    await seedReducedMotion(page, "on");
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "on");

    // Route transition: navigate and inspect the wrapper.
    await page.goto("/");
    await page.goto("/settings");
    const routeMs = await animMs(page, ".route-transition");
    expect(routeMs, "route transition animation should be neutralized").toBeLessThan(5);

    // Dropdown: opens into a portal; content matches [data-state=open][role=menu].
    await clickButton(page, "Open menu");
    const menu = page.locator('[role="menu"][data-state="open"]').first();
    await expect(menu).toBeVisible();
    const menuMs = await animMs(page, '[role="menu"][data-state="open"]');
    expect(menuMs, "dropdown open animation should be neutralized").toBeLessThan(5);
    await page.keyboard.press("Escape");

    // Modal: Radix dialog content in portal.
    await clickButton(page, "Open dialog");
    const dialog = page.locator('[role="dialog"][data-state="open"]').first();
    await expect(dialog).toBeVisible();
    const dialogMs = await animMs(page, '[role="dialog"][data-state="open"]');
    expect(dialogMs, "dialog open animation should be neutralized").toBeLessThan(5);
    await page.keyboard.press("Escape");

    // Toast: fire the live sonner toast via Replay in the preview panel.
    const replay = page.locator("button", { hasText: "Replay" }).last();
    await replay.scrollIntoViewIfNeeded();
    await replay.click();
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible({ timeout: 5000 });
    const toastMs = await animMs(page, "[data-sonner-toast]");
    expect(toastMs, "sonner toast animation should be neutralized").toBeLessThan(5);
  });

  test("Always off restores animations", async ({ page }) => {
    await seedReducedMotion(page, "off");
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "off");

    await clickButton(page, "Open dialog");
    await expect(page.locator('[role="dialog"][data-state="open"]').first()).toBeVisible();
    const dialogMs = await animMs(page, '[role="dialog"][data-state="open"]');
    expect(dialogMs, "dialog animation should run normally when motion is on").toBeGreaterThan(50);
    await page.keyboard.press("Escape");

    await page.goto("/");
    await page.goto("/settings");
    const routeMs = await animMs(page, ".route-transition");
    expect(routeMs, "route transition should animate when motion is on").toBeGreaterThan(50);
  });

  test("Preview 'Reduced' tile neutralizes its scoped animations", async ({ page }) => {
    await seedReducedMotion(page, "off");
    await page.goto("/settings");
    // Scoped preview: [data-motion-preview="reduced"] children have ~0ms animation.
    const scopedMs = await animMs(
      page,
      '[data-motion-preview="reduced"] .animate-in',
    );
    expect(scopedMs).toBeLessThan(5);
  });
});