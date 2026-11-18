// Vard AI site: copy buttons, latest release version, and a quiet star field.

// Copy buttons
document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const el = document.querySelector(btn.getAttribute("data-copy"));
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.textContent.trim());
      btn.textContent = "Copied";
      btn.setAttribute("data-done", "");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.removeAttribute("data-done");
      }, 1600);
    } catch {
      // Clipboard blocked: select the text so it can be copied by hand.
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
});

// Latest release version (falls back to the version in the HTML).
fetch("https://api.github.com/repos/vardhan23v/Vard-AI/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
  .then((r) => (r.ok ? r.json() : null))
  .then((rel) => {
    if (!rel?.tag_name) return;
    document.querySelectorAll("[data-version]").forEach((el) => (el.textContent = rel.tag_name));
  })
  .catch(() => {});

// Star field behind the hero. Static when reduced motion is on.
(() => {
  const canvas = document.querySelector(".stars");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const light = window.matchMedia("(prefers-color-scheme: light)");
  let stars = [];
  let raf = 0;

  // Seeded random so the sky looks the same on every visit.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed = 7;
    const count = Math.round((width * height) / 9000);
    stars = Array.from({ length: count }, () => ({
      x: rand() * width,
      y: rand() * height,
      r: rand() * 1.3 + 0.3,
      gold: rand() < 0.18,
      phase: rand() * Math.PI * 2,
      speed: 0.4 + rand() * 0.8,
    }));
    draw(0);
  }

  function draw(t) {
    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    const dim = light.matches ? 0.35 : 1;
    for (const s of stars) {
      const tw = reduce.matches ? 0.8 : 0.55 + 0.45 * Math.sin(t / 1000 * s.speed + s.phase);
      ctx.globalAlpha = tw * dim;
      ctx.fillStyle = s.gold ? "#c2b75d" : light.matches ? "#3a4670" : "#cfcfbb";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(t) {
    draw(t);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduce.matches || document.hidden) draw(0);
    else raf = requestAnimationFrame(loop);
  }

  size();
  start();
  window.addEventListener("resize", () => {
    size();
    start();
  });
  reduce.addEventListener("change", start);
  light.addEventListener("change", () => draw(0));
  document.addEventListener("visibilitychange", start);
})();
