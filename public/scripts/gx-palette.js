// theme-only helper for pages without the gallery grid (photo detail): palette buttons + reveal JS-only controls
const root = document.documentElement;
const mark = (p) => document.querySelectorAll("[data-palette-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.paletteChoice === p)));
document.querySelectorAll("[data-palette-choice]").forEach((b) => b.addEventListener("click", () => {
  root.dataset.palette = b.dataset.paletteChoice;
  try { localStorage.setItem("palette", b.dataset.paletteChoice); } catch {}
  mark(b.dataset.paletteChoice);
}));
mark(root.dataset.palette);
document.querySelectorAll("[data-js-only]").forEach((e) => e.removeAttribute("hidden"));
