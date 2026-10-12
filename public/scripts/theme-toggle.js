const root = document.documentElement;
const toggle = document.querySelector("[data-theme-toggle]");
const label = document.querySelector("[data-theme-toggle-label]");
const PALETTES = ["ink", "paper", "amber"];
const isHome = document.body.classList.contains("home");
const COLORS = { ink: "#151513", paper: "#ece6d6", amber: "#100c07" };

function syncLabel(theme) {
  if (label) label.textContent = theme === "light" ? "Dark mode" : "Light mode";
  toggle?.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

function applyPalette(palette, save = true) {
  if (!PALETTES.includes(palette)) return;
  const theme = palette === "paper" ? "light" : "dark";
  root.dataset.palette = palette;
  root.dataset.theme = theme;
  if (save) {
    try {
      localStorage.setItem("palette", palette);
      localStorage.setItem("theme", theme);
    } catch {}
  }
  syncLabel(theme);
  const color = isHome ? COLORS[palette] : theme === "dark" ? "#0c0e0f" : "#e7e5de";
  document.querySelector('meta[data-theme-color]')?.setAttribute("content", color);
  document.querySelectorAll("[data-palette-choice]").forEach((el) => {
    el.setAttribute("aria-pressed", el.dataset.paletteChoice === palette ? "true" : "false");
  });
  document.dispatchEvent(new CustomEvent("palette-changed", { detail: { palette } }));
}

syncLabel(root.dataset.theme || "light");
applyPalette(root.dataset.palette || (root.dataset.theme === "dark" ? "ink" : "paper"), false);

toggle?.addEventListener("click", () => {
  applyPalette(root.dataset.theme === "light" ? "ink" : "paper");
});
document.addEventListener("set-palette", (e) => applyPalette(e.detail?.palette));
