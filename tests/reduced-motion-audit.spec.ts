import { test, expect, type Page } from "@playwright/test";

/**
 * Motion audit: walk every descendant of the [data-motion-preview="reduced"]
 * scope on the Settings screen and fail if any element still has a
 * non-zero CSS animation-duration or transition-duration (especially one
 * involving `transform`). Also cross-check the Web Animations API for any
 * live animation whose target lives inside the scope.
 *
 * Reduced-motion CSS in this project collapses durations to 1e-06s
 * (~0.001ms). The audit uses a 5ms tolerance to accept that quantization
 * while still catching real motion (typical transitions are >=150ms).
 */

const MOTION_KEY = "vard-motion";
const TOLERANCE_MS = 5;

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
  const btn = page.getByTestId(`preview-mode-${mode}`);
  await btn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await btn.click();
  await expect(page.getByTestId("motion-showcase-grid")).toHaveAttribute(
    "data-motion-preview",
    mode,
  );
}

type Violation = {
  selector: string;
  tag: string;
  className: string;
  animationName: string;
  animationDurationMs: number;
  transitionProperty: string;
  transitionDurationMs: number;
  source: "css" | "web-animations-api";
};

async function auditReducedScope(page: Page): Promise<Violation[]> {
  return await page.evaluate((toleranceMs) => {
    const parseMs = (v: string): number =>
      Math.max(
        ...v.split(",").map((s) => {
          const t = s.trim();
          if (t.endsWith("ms")) return parseFloat(t);
          if (t.endsWith("s")) return parseFloat(t) * 1000;
          return 0;
        }),
      );

    const shortSelector = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
      const testid = el.getAttribute("data-testid");
      const cls = (el.getAttribute("class") || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join("");
      return `${tag}${id}${testid ? `[data-testid="${testid}"]` : ""}${cls}`;
    };

    const scope = document.querySelector(
      '[data-motion-preview="reduced"]',
    ) as HTMLElement | null;
    if (!scope) return [];

    const violations: Array<{
      selector: string;
      tag: string;
      className: string;
      animationName: string;
      animationDurationMs: number;
      transitionProperty: string;
      transitionDurationMs: number;
      source: "css" | "web-animations-api";
    }> = [];

    // 1) CSS-level audit: computed animation-duration + transition-duration.
    const nodes = scope.querySelectorAll<HTMLElement>("*");
    for (const el of Array.from(nodes)) {
      const cs = getComputedStyle(el);
      const animMs = parseMs(cs.animationDuration || "0s");
      const transMs = parseMs(cs.transitionDuration || "0s");
      const animName = cs.animationName || "none";
      const transProp = cs.transitionProperty || "all";

      // Only flag animations that actually target something (name !== "none")
      // or transitions that cover a motion-relevant property.
      const animViolates = animMs > toleranceMs && animName !== "none";
      const transViolates =
        transMs > toleranceMs &&
        /transform|all|opacity|top|left|right|bottom|translate|scale|rotate/i.test(
          transProp,
        );

      if (animViolates || transViolates) {
        violations.push({
          selector: shortSelector(el),
          tag: el.tagName.toLowerCase(),
          className: (el.getAttribute("class") || "").slice(0, 120),
          animationName: animName,
          animationDurationMs: animMs,
          transitionProperty: transProp,
          transitionDurationMs: transMs,
          source: "css",
        });
      }
    }

    // 2) Web Animations API audit: any live animation whose target lives
    // inside the reduced scope must also be neutralized.
    for (const a of document.getAnimations()) {
      const target = (a.effect as KeyframeEffect | null)?.target as
        | Element
        | null;
      if (!target || !scope.contains(target)) continue;
      const timing = a.effect?.getComputedTiming();
      const dur = Number(timing?.duration || 0);
      const iter = Number(timing?.iterations || 1);
      const total = isFinite(iter) ? dur * iter : dur; // infinite = spinner
      if (total > toleranceMs) {
        violations.push({
          selector: shortSelector(target),
          tag: target.tagName.toLowerCase(),
          className: (target.getAttribute("class") || "").slice(0, 120),
          animationName: (a as unknown as { animationName?: string }).animationName || "waapi",
          animationDurationMs: dur,
          transitionProperty: "-",
          transitionDurationMs: 0,
          source: "web-animations-api",
        });
      }
    }

    return violations;
  }, TOLERANCE_MS);
}

test.describe("reduced-motion — audit scan", () => {
  test.beforeEach(async ({ page }) => {
    await seedMotion(page, "off");
    await page.goto("/settings");
    await page.waitForFunction(
      () => !!document.querySelector('[data-testid="motion-showcase-grid"]'),
    );
    await page.waitForTimeout(400);
  });

  test("reduced preview scope has zero motion-bearing durations", async ({
    page,
  }) => {
    await switchPreview(page, "reduced");
    // Let any entry animations schedule + get neutralized.
    await page.waitForTimeout(500);

    const violations = await auditReducedScope(page);

    // Print offenders so a regression is diagnosable without re-running.
    if (violations.length) {
      console.log(
        "reduced-motion audit violations:\n" +
          JSON.stringify(violations, null, 2),
      );
    }
    expect(
      violations,
      `Reduced-motion scope must be motion-free. Offenders:\n${JSON.stringify(
        violations,
        null,
        2,
      )}`,
    ).toEqual([]);
  });

  test("full preview scope DOES contain motion (sanity check)", async ({
    page,
  }) => {
    // Same auditor pointed at the full scope should always find motion —
    // otherwise the reduced-scope check is meaningless.
    await switchPreview(page, "full");
    await page.waitForTimeout(500);

    const hasMotion = await page.evaluate((toleranceMs) => {
      const parseMs = (v: string): number =>
        Math.max(
          ...v.split(",").map((s) => {
            const t = s.trim();
            if (t.endsWith("ms")) return parseFloat(t);
            if (t.endsWith("s")) return parseFloat(t) * 1000;
            return 0;
          }),
        );
      const scope = document.querySelector('[data-motion-preview="full"]');
      if (!scope) return false;
      for (const el of Array.from(scope.querySelectorAll<HTMLElement>("*"))) {
        const cs = getComputedStyle(el);
        if (parseMs(cs.animationDuration || "0s") > toleranceMs) return true;
        if (parseMs(cs.transitionDuration || "0s") > toleranceMs) return true;
      }
      return false;
    }, TOLERANCE_MS);

    expect(hasMotion, "full preview should contain animated elements").toBe(true);
  });
});
