// home palettes (ink/paper/amber); home-only, the shared theme toggle is untouched
const PALETTES = ["ink", "paper", "amber"];
const root = document.documentElement;
function applyPalette(p, save = true) {
  if (!PALETTES.includes(p)) return;
  root.dataset.palette = p;
  if (save) { try { localStorage.setItem("palette", p); } catch {} }
  document.querySelector('meta[data-theme-color]')?.setAttribute("content", { ink: "#151513", paper: "#ece6d6", amber: "#100c07" }[p]);
  document.querySelectorAll("[data-palette-choice]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.paletteChoice === p ? "true" : "false"));
  document.dispatchEvent(new CustomEvent("palette-changed", { detail: { palette: p } }));
}
document.addEventListener("set-palette", (e) => applyPalette(e.detail?.palette));
applyPalette(root.dataset.palette, false);
const form = document.querySelector("[data-cmd]");
const input = form?.querySelector("input");
const list = form?.querySelector(".cmd-list");
const opener = document.querySelector("[data-cmd-open]");
const COMMANDS = [
  { id: "theme-ink", label: "theme ink", hint: "charcoal and cream", run: () => setPalette("ink") },
  { id: "theme-paper", label: "theme paper", hint: "light", run: () => setPalette("paper") },
  { id: "theme-amber", label: "theme amber", hint: "phosphor", run: () => setPalette("amber") },
  { id: "photos", label: "photos", hint: "open the sky globe", run: () => { location.href = "/photos/"; } },
];
let shown = [];
let active = 0;
let returnFocus = null;

function setPalette(palette) {
  document.dispatchEvent(new CustomEvent("set-palette", { detail: { palette } }));
}

function modalOpen() {
  return !!document.querySelector('dialog[open], [aria-modal="true"]:not([hidden]), .photo-preview:not([hidden])');
}
function typing(el) {
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

function render() {
  const q = input.value.trim().toLowerCase().replace(/^:/, "");
  shown = COMMANDS.filter((c) => c.label.includes(q) || q.split(/\s+/).every((w) => c.label.includes(w)));
  if (active >= shown.length) active = 0;
  list.replaceChildren(
    ...shown.map((c, i) => {
      const li = document.createElement("li");
      li.id = "cmd-opt-" + c.id;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === active ? "true" : "false");
      li.innerHTML = "<b></b><span></span>";
      li.firstChild.textContent = c.label;
      li.lastChild.textContent = c.hint;
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", () => run(c));
      return li;
    }),
  );
  if (shown[active]) input.setAttribute("aria-activedescendant", "cmd-opt-" + shown[active].id);
  else input.removeAttribute("aria-activedescendant");
}

function open() {
  if (!form || !form.hidden) return;
  returnFocus = document.activeElement;
  form.hidden = false;
  opener?.setAttribute("aria-expanded", "true");
  input.value = "";
  active = 0;
  render();
  input.focus();
}
function close(restore = true) {
  if (!form || form.hidden) return;
  form.hidden = true;
  opener?.setAttribute("aria-expanded", "false");
  if (restore && returnFocus && document.contains(returnFocus)) returnFocus.focus();
  else if (restore) opener?.focus();
  returnFocus = null;
}
function run(cmd) {
  close();
  cmd.run();
}

opener?.addEventListener("click", () => (form.hidden ? open() : close()));
input?.addEventListener("input", () => { active = 0; render(); });
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const cmd = shown[active];
  if (cmd) run(cmd);
});
input?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); close(); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!shown.length) return;
    active = (active + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
    render();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== ":" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if (typing(e.target) || modalOpen()) return;
  e.preventDefault();
  open();
});
document.addEventListener("click", (e) => {
  if (form && !form.hidden && !form.contains(e.target) && !opener?.contains(e.target)) close(false);
});
document.querySelectorAll("[data-palette-choice]").forEach((b) => {
  b.addEventListener("click", () => setPalette(b.dataset.paletteChoice));
  b.setAttribute("aria-pressed", b.dataset.paletteChoice === document.documentElement.dataset.palette ? "true" : "false");
});
