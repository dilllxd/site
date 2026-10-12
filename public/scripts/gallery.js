// photo gallery: palette buttons + accessible photo viewer. No dependencies.
const root = document.documentElement;
const PALS = ["ink", "paper", "amber"];
function setPalette(p) {
  root.dataset.palette = p;
  try { localStorage.setItem("palette", p); } catch {}
  document.querySelectorAll("[data-palette-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.paletteChoice === p)));
}
const palBox = document.querySelector("[data-gx-palette]");
if (palBox) {
  palBox.hidden = false;
  palBox.querySelectorAll("[data-palette-choice]").forEach((b) => b.addEventListener("click", () => setPalette(b.dataset.paletteChoice)));
  document.querySelectorAll("[data-palette-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.paletteChoice === root.dataset.palette)));
}

const gv = document.querySelector("[data-gv]");
const tiles = [...document.querySelectorAll("[data-gx-tile]")];
if (gv && tiles.length) {
  const q = (s) => gv.querySelector(s);
  const stage = q("[data-gv-stage]"), img = q("[data-gv-img]");
  const els = { name: q("[data-gv-name]"), title: q("[data-gv-title]"), meta: q("[data-gv-meta]"), cap: q("[data-gv-caption]"), page: q("[data-gv-page]"), full: q("[data-gv-full]") };
  const btn = { prev: q("[data-gv-prev]"), next: q("[data-gv-next]"), in: q("[data-gv-in]"), out: q("[data-gv-out]"), reset: q("[data-gv-reset]"), close: q("[data-gv-close]") };
  const MIN = 1, MAX = 5;
  let idx = 0, zoom = 1, px = 0, py = 0, open = false, opener = null;
  let drag = null, moved = false, lock = null;
  const pointers = new Map(); let pinch = null;

  const apply = () => {
    img.style.transform = "translate3d(" + px + "px," + py + "px,0) scale(" + zoom + ")";
    btn.reset.textContent = Math.round(zoom * 100) + "%";
    btn.out.disabled = zoom <= MIN; btn.in.disabled = zoom >= MAX;
    gv.classList.toggle("is-zoomed", zoom > 1);
  };
  const clamp = () => {
    const sr = stage.getBoundingClientRect();
    const mx = Math.max(0, (img.offsetWidth * zoom - sr.width) / 2), my = Math.max(0, (img.offsetHeight * zoom - sr.height) / 2);
    px = Math.min(mx, Math.max(-mx, px)); py = Math.min(my, Math.max(-my, py));
  };
  const setZoom = (z) => { zoom = Math.min(MAX, Math.max(MIN, z)); if (zoom === 1) { px = 0; py = 0; } else clamp(); apply(); };

  const show = (i) => {
    idx = (i + tiles.length) % tiles.length;
    const d = tiles[idx].dataset;
    img.alt = d.alt || "";
    img.removeAttribute("width"); img.removeAttribute("height");
    img.src = d.image;
    els.name.textContent = d.image.split("/").pop();
    els.title.textContent = d.title; els.meta.textContent = d.meta || ""; els.cap.textContent = d.caption || "";
    els.page.href = tiles[idx].getAttribute("href"); els.full.href = d.image;
    btn.prev.disabled = btn.next.disabled = tiles.length < 2;
    zoom = 1; px = 0; py = 0; apply();
  };

  const lockScroll = () => {
    const b = document.body;
    lock = { y: window.scrollY, x: window.scrollX, style: b.style.cssText };
    Object.assign(b.style, { position: "fixed", top: -lock.y + "px", left: -lock.x + "px", right: "0", width: "100%", overflow: "hidden" });
  };
  const unlockScroll = () => {
    if (!lock) return;
    document.body.style.cssText = lock.style;
    const h = root.style.scrollBehavior; root.style.scrollBehavior = "auto";
    window.scrollTo(lock.x, lock.y); root.style.scrollBehavior = h; lock = null;
  };

  const openAt = (i, from) => {
    if (open) return;
    opener = from; open = true;
    show(i); lockScroll(); gv.hidden = false;
    document.querySelector("main")?.setAttribute("inert", "");
    document.querySelector(".site-header")?.setAttribute("inert", "");
    btn.close.focus({ preventScroll: true });
  };
  const close = () => {
    if (!open) return;
    open = false; gv.hidden = true; pointers.clear(); drag = null; pinch = null;
    gv.classList.remove("is-panning");
    document.querySelector("main")?.removeAttribute("inert");
    document.querySelector(".site-header")?.removeAttribute("inert");
    unlockScroll();
    (opener || tiles[idx]).focus({ preventScroll: true });
  };

  tiles.forEach((t, i) => t.addEventListener("click", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); openAt(i, t);
  }));
  btn.close.addEventListener("click", close);
  btn.prev.addEventListener("click", () => show(idx - 1));
  btn.next.addEventListener("click", () => show(idx + 1));
  btn.in.addEventListener("click", () => setZoom(zoom + 0.5));
  btn.out.addEventListener("click", () => setZoom(zoom - 0.5));
  btn.reset.addEventListener("click", () => setZoom(1));
  gv.addEventListener("click", (e) => { if (e.target === gv) close(); });

  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowLeft" && zoom === 1) show(idx - 1);
    else if (e.key === "ArrowRight" && zoom === 1) show(idx + 1);
    else if (e.key === "+" || e.key === "=") setZoom(zoom + 0.5);
    else if (e.key === "-") setZoom(zoom - 0.5);
    else if (e.key === "0") setZoom(1);
    else if (e.key === "Tab") {
      const items = [...gv.querySelectorAll("button:not(:disabled), a[href]")];
      const first = items[0], last = items[items.length - 1];
      if (!gv.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  gv.addEventListener("touchmove", (e) => { if (!stage.contains(e.target) && !e.target.closest(".gv-info")) e.preventDefault(); }, { passive: false });

  stage.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
  const dist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pointers.size === 2) { pinch = { d: dist(), z: zoom }; drag = null; }
    else if (zoom > 1) { drag = { x: e.clientX - px, y: e.clientY - py }; gv.classList.add("is-panning"); }
  });
  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) { moved = true; setZoom(pinch.z * dist() / pinch.d); }
    else if (drag) { moved = true; px = e.clientX - drag.x; py = e.clientY - drag.y; clamp(); apply(); }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) { drag = null; gv.classList.remove("is-panning"); }
  };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  img.addEventListener("click", () => { if (moved) { moved = false; return; } setZoom(zoom > 1 ? 1 : 2); });
  window.addEventListener("resize", () => { if (open) { clamp(); apply(); } });
}
