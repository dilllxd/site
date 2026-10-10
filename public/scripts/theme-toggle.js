const root = document.documentElement;
const toggle = document.querySelector("[data-theme-toggle]");
const label = document.querySelector("[data-theme-toggle-label]");

function syncLabel(theme) {
  if (label) label.textContent = theme === "light" ? "Dark mode" : "Light mode";
  toggle?.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  try { localStorage.setItem("theme", theme); } catch {}
  syncLabel(theme);
  document.querySelector('meta[data-theme-color]')?.setAttribute('content', theme === 'dark' ? '#16130f' : '#f4efe4');
}

syncLabel(root.dataset.theme || "light");

toggle?.addEventListener("click", () => {
  applyTheme(root.dataset.theme === "light" ? "dark" : "light");
});
