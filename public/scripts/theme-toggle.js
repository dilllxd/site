const root = document.documentElement;
const toggle = document.querySelector("[data-theme-toggle]");
const label = document.querySelector("[data-theme-toggle-label]");

function syncLabel(theme) {
  if (!label) return;
  label.textContent = theme === "light" ? "Dark mode" : "Light mode";
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  syncLabel(theme);
}

syncLabel(root.dataset.theme || "dark");

toggle?.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "light" ? "dark" : "light";
  applyTheme(nextTheme);
});
