/// <reference lib="dom" />
/**
 * DOM measurements for responsive checks. Findings always come from measured values in the
 * real page (element boxes, scroll sizes, computed styles), never from the viewport size alone.
 */
import type { Page } from "playwright-core";
import type { Finding } from "./schema";

interface Raw {
  kind: Finding["kind"];
  severity: Finding["severity"];
  message: string;
  selector: string;
  evidence: string;
}

/** Runs in the page. Kept self-contained (no closures). */
function measure(args: { touch: boolean; width: number }): Raw[] {
  const { touch } = args;
  const out: Raw[] = [];
  // Mobile emulation can widen the layout viewport to fit oversized content, so compare against
  // the CSS width that was set, not window.innerWidth.
  const W = Math.min(window.innerWidth, args.width);
  const H = window.innerHeight;
  const sel = (el: Element): string => {
    const parts: string[] = [];
    for (let e: Element | null = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      let p = e.tagName.toLowerCase();
      if (e.id) {
        parts.unshift(`${p}#${e.id}`);
        break;
      }
      const cls = [...e.classList].filter((c) => c.length < 30).slice(0, 2);
      if (cls.length) p += `.${cls.join(".")}`;
      parts.unshift(p);
    }
    return parts.join(" > ");
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const docW = document.documentElement.scrollWidth;
  if (docW > W + 1) {
    const offenders: { el: Element; right: number }[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 && r.left < W && getComputedStyle(el).position !== "fixed") offenders.push({ el, right: r.right });
    }
    // Report the outermost offenders only.
    const top = offenders.filter((o) => !offenders.some((p) => p.el !== o.el && p.el.contains(o.el))).slice(0, 5);
    out.push({
      kind: "horizontal_overflow",
      severity: "high",
      message: `The page scrolls sideways: it is ${docW}px wide in a ${W}px viewport.`,
      selector: top[0] ? sel(top[0].el) : "html",
      evidence: `document.scrollWidth=${docW} > viewport width=${W}${top.length ? `; widest: ${top.map((o) => `${sel(o.el)} right=${Math.round(o.right)}px`).join(", ")}` : ""}`,
    });
  }
  let clipped = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (clipped >= 8 || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const hiddenX = cs.overflowX === "hidden" || cs.overflowX === "clip";
    const text = (el as HTMLElement).innerText?.trim() ?? "";
    if (!text || el.children.length > 3) continue;
    if (hiddenX && el.scrollWidth > el.clientWidth + 2) {
      clipped++;
      out.push({
        kind: "clipped_text",
        severity: cs.textOverflow === "ellipsis" ? "low" : "medium",
        message: `Text is cut off${cs.textOverflow === "ellipsis" ? " (with an ellipsis)" : ""}: "${text.slice(0, 60)}"`,
        selector: sel(el),
        evidence: `scrollWidth=${el.scrollWidth} > clientWidth=${el.clientWidth}, overflow-x=${cs.overflowX}`,
      });
    }
  }
  const interactive = document.querySelectorAll("a[href], button, [role=button], input:not([type=hidden]), select, textarea, [role=link], [role=tab]");
  let small = 0;
  for (const el of interactive) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H * 3) continue;
    if (r.right > W + 1 || r.left < -1) {
      out.push({ kind: "offscreen", severity: "medium", message: `A control is partly outside the screen: "${((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40)}"`, selector: sel(el), evidence: `left=${Math.round(r.left)} right=${Math.round(r.right)} viewport=${W}` });
      continue;
    }
    if (touch && small < 6 && (r.width < 24 || r.height < 24) && el.tagName !== "INPUT") {
      small++;
      out.push({ kind: "small_target", severity: "low", message: `Small tap target: "${((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40)}"`, selector: sel(el), evidence: `${Math.round(r.width)}×${Math.round(r.height)}px (minimum 24×24)` });
    }
    if (r.top >= 0 && r.bottom <= H && r.width > 4 && r.height > 4) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
        const hcs = getComputedStyle(hit);
        if (hcs.pointerEvents !== "none")
          out.push({ kind: "overlap", severity: "medium", message: `A control is covered by another element: "${((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40)}"`, selector: sel(el), evidence: `elementFromPoint(${Math.round(cx)},${Math.round(cy)}) is ${sel(hit)}` });
      }
    }
  }
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea")) {
    if (!visible(el)) continue;
    const id = el.getAttribute("id");
    const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.closest("label") || el.getAttribute("title");
    if (!labelled)
      out.push({ kind: "unlabeled_field", severity: "medium", message: `A form field has no label${el.getAttribute("placeholder") ? ` (only a placeholder: "${el.getAttribute("placeholder")}")` : ""}`, selector: sel(el), evidence: `<${el.tagName.toLowerCase()} type=${el.getAttribute("type") ?? "text"}> without label, aria-label or aria-labelledby` });
  }
  for (const img of document.querySelectorAll("img")) {
    if (img.complete && img.naturalWidth === 0 && visible(img)) out.push({ kind: "broken_image", severity: "medium", message: "An image failed to load", selector: sel(img), evidence: `naturalWidth=0, src=${(img.currentSrc || img.src).slice(0, 120)}` });
  }
  // Navigation: links in nav/header containers that can't be seen at this viewport. Links placed
  // straight in a <header> count too. Only reported when (almost) no navigation link is visible and
  // no toggle related to the hidden links is visible (aria-controls pointing at them, or an
  // aria-expanded / menu button in the same header or nav).
  const label = (el: Element) => ((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.getAttribute("title") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
  const whyHidden = (el: Element): string | null => {
    if (!el.getClientRects().length) return "not rendered (display:none on it or an ancestor)";
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.visibility === "collapse") return `visibility:${cs.visibility}`;
    for (let e: Element | null = el; e; e = e.parentElement) if (Number(getComputedStyle(e).opacity) <= 0.05) return `opacity:${getComputedStyle(e).opacity}${e === el ? "" : ` on ${sel(e)}`}`;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return `${Math.round(r.width)}×${Math.round(r.height)}px`;
    if (r.right <= 0 || r.left >= W) return `off-screen (left=${Math.round(r.left)} right=${Math.round(r.right)} viewport=${W})`;
    if (r.bottom <= 0) return `off-screen (top=${Math.round(r.top)} bottom=${Math.round(r.bottom)})`;
    return null;
  };
  const NAV = "nav, [role=navigation], header, [role=banner]";
  const navLinks = [...document.querySelectorAll("a[href]")].filter((a) => a.closest(NAV));
  const hiddenNavLinks = new Set<Element>();
  if (navLinks.length) {
    const shown: Element[] = [];
    const hidden: { el: Element; why: string }[] = [];
    for (const a of navLinks) {
      const why = whyHidden(a);
      if (why) hidden.push({ el: a, why });
      else shown.push(a);
    }
    if (hidden.length && shown.length <= 1) {
      // Group hidden links by their closest container; report the biggest group.
      const groups = new Map<Element, { el: Element; why: string }[]>();
      for (const h of hidden) {
        const c = h.el.closest(NAV)!;
        groups.set(c, [...(groups.get(c) ?? []), h]);
      }
      const [container, links] = [...groups].sort((a, b) => b[1].length - a[1].length)[0];
      const scope = container.closest("header, [role=banner]") ?? container.closest("nav, [role=navigation]") ?? container;
      const related = [...document.querySelectorAll("button, [role=button], summary")].find((b) => {
        if (whyHidden(b)) return false;
        const ids = (b.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean);
        for (const id of ids) {
          const t = document.getElementById(id);
          if (t && (t === container || t.contains(container) || container.contains(t))) return true;
        }
        if (!scope.contains(b)) return false;
        return b.getAttribute("aria-expanded") !== null || b.tagName === "SUMMARY" || /menu|nav/i.test(b.getAttribute("aria-label") ?? (b as HTMLElement).innerText ?? "");
      });
      if (!related) {
        for (const h of hidden) hiddenNavLinks.add(h.el);
        out.push({
          kind: "hidden_navigation",
          severity: "high",
          message: `The navigation is hidden and there's no visible menu button to open it (${links.length} link${links.length === 1 ? "" : "s"}, e.g. "${label(links[0].el)}")`,
          selector: sel(container),
          evidence: `${hidden.length} navigation link(s) hidden, ${shown.length} visible; ${links
            .slice(0, 3)
            .map((l) => `${sel(l.el)}: ${l.why}`)
            .join("; ")}; no visible button with aria-controls pointing at it, or with aria-expanded or a menu label inside ${sel(scope)}`,
        });
      }
    }
  }
  // Controls collapsed to zero size by layout (not display:none / visibility:hidden / hidden / aria-hidden).
  let zero = 0;
  for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea")) {
    if (zero >= 6 || hiddenNavLinks.has(el)) continue;
    if (!el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.visibility === "collapse") continue;
    if (el.closest("[hidden], [aria-hidden=true], [inert]")) continue;
    zero++;
    const named = !!((el as HTMLElement).innerText?.trim() || el.getAttribute("aria-label"));
    out.push({
      kind: "zero_size_control",
      severity: named || el.tagName !== "A" ? "medium" : "low",
      message: `A control has no size, so it can't be seen or used: "${label(el)}"`,
      selector: sel(el),
      evidence: `${Math.round(r.width)}×${Math.round(r.height)}px at left=${Math.round(r.left)} top=${Math.round(r.top)}; display=${cs.display}, visibility=${cs.visibility}, width=${cs.width}, height=${cs.height}, overflow=${cs.overflow}`,
    });
  }
  return out;
}

export async function measurePage(page: Page, viewport: string, touch: boolean, width?: number): Promise<Finding[]> {
  const raw = (await page.evaluate(measure, { touch, width: width ?? page.viewportSize()?.width ?? 10_000 })) as Raw[];
  return raw.map((r) => ({ ...r, viewport }));
}

/** A compact, model-friendly description of the page (accessibility snapshot, trimmed). */
export async function pageSnapshot(page: Page, maxChars = 8_000): Promise<string> {
  let aria = "";
  try {
    aria = await page.locator("body").ariaSnapshot({ timeout: 5_000 });
  } catch {
    aria = (await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")).slice(0, maxChars);
  }
  return aria.length > maxChars ? `${aria.slice(0, maxChars)}\n… (truncated; ${aria.length} chars)` : aria;
}
