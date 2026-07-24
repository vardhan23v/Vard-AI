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

async function dragChip(page: Page, dx: number) {
  await page.getByTestId("dnd-chip").first().scrollIntoViewIfNeeded();
  // Step 1: dispatch pointerdown on the chip.
  const start = await page.evaluate(() => {
    const chip = document.querySelector(
      '[data-testid="dnd-chip"]',
    ) as HTMLElement | null;
    if (!chip) throw new Error("chip not found");
    const rect = chip.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    chip.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: cx,
        clientY: cy,
      }),
    );
    return { cx, cy };
  });
  // Step 2: wait until React commits `data-dragging="true"` and attaches
  // its window pointermove/up listeners.
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="dnd-chip"]')
        ?.getAttribute("data-dragging") === "true",
  );
  // Step 3: dispatch pointermoves and pointerup on window.
  await page.evaluate(
    ({ cx, cy, delta }) => {
      const base = {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
      };
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            ...base,
            buttons: 1,
            clientX: cx + (delta * i) / steps,
            clientY: cy,
          }),
        );
      }
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          ...base,
          buttons: 0,
          clientX: cx + delta,
          clientY: cy,
        }),
      );
    },
    { cx: start.cx, cy: start.cy, delta: dx },
  );
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
    await dragChip(page, 120);
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

    await dragChip(page, 120);
    await expect(page.getByTestId("dnd-container")).toHaveAttribute(
      "data-slot-active",
      "b",
    );
    const droppedMs = await transitionMs(page, '[data-testid="dnd-chip"]');
    expect(droppedMs, "post-drop settle should animate").toBeGreaterThan(50);
  });
});