// Headless-Chrome regression for the home page: no scroll, nothing clipped, portrait visible and centred.
// Usage: CHROME=/path/to/chrome node scripts/test-home-fit.mjs [baseUrl]   (serves dist itself when no URL is given)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/opt/hako/bin/google-chrome";
if (!existsSync(CHROME)) { console.log("SKIP: no chrome at", CHROME); process.exit(0); }
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
let base = process.argv[2], server;
if (!base) {
  server = createServer((q, r) => {
    let f = path.join(root, "dist", decodeURIComponent(q.url.split("?")[0])); if (!f.startsWith(path.join(root, "dist"))) { r.writeHead(403); return r.end(); }
    if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!existsSync(f)) { r.writeHead(404); return r.end("nf"); }
    r.writeHead(200, { "content-type": mime[path.extname(f)] || "application/octet-stream" }); r.end(readFileSync(f));
  }).listen(0); base = "http://127.0.0.1:" + server.address().port + "/";
}
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars=false", "--remote-debugging-port=" + port, "--user-data-dir=" + mkdtempSync(path.join(tmpdir(), "hf-")), "about:blank"], { stdio: "ignore" });
let wsUrl; for (let i = 0; i < 60 && !wsUrl; i++) { try { wsUrl = (await (await fetch("http://127.0.0.1:" + port + "/json")).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {} if (!wsUrl) await new Promise((r) => setTimeout(r, 250)); }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
const sizes = [[1366, 657], [1280, 600], [390, 664], [360, 640], [280, 653], [844, 390], [768, 820], [1440, 900], [2560, 1080], [390, 560], [320, 480], [1024, 500], [667, 375], [320, 568], [1920, 1080], [3440, 1440], [1280, 720]];
const measure = (extra) => `(async () => {
  for (let i = 0; i < 40 && !document.querySelector('[data-ap-canvas]'); i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 700));
  const vw = innerWidth, vh = innerHeight, de = document.documentElement;
  const out = { vw, vh, scrollH: de.scrollHeight, scrollW: de.scrollWidth, bodyScrollH: document.body.scrollHeight, clipped: [] };
  const sel = ".site-header, .site-header *, .home-main, .home-main *:not(canvas):not(.ap-fit):not(.ap-fit *):not(.ap-set):not(.ap-set *):not([hidden]):not(.sr-only)";
  for (const el of document.querySelectorAll(sel)) {
    if (!el.getClientRects().length) continue; const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) out.clipped.push((el.className || el.tagName) + ":" + [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)).join(","));
  }
  const c = document.querySelector("[data-ap-canvas]"), cr = c.getBoundingClientRect(), fig = document.querySelector("[data-ascii-portrait]"), fr = fig.getBoundingClientRect();
  out.canvas = [cr.left, cr.top, cr.width, cr.height].map((v) => Math.round(v * 10) / 10); out.figTop = Math.round(fr.top * 10) / 10;
  out.js = fig.classList.contains("ap-js"); out.choice = fig.dataset.portraitChoice;
  const hm = document.querySelector(".home-main").getBoundingClientRect(); out.homeBottom = Math.round(hm.bottom);
  const ap = fig.__ap; if (ap) { const e = ap.extent(), k = cr.width / ap.dw; out.gapL = Math.round(e.left * k * 10) / 10; out.gapR = Math.round((ap.dw - e.right) * k * 10) / 10; out.shift = Math.round(ap.shift() * 10) / 10; }
  ${extra || ""}
  return out; })()`;
let fails = 0; const rows = [];
for (const palette of ["ink", "paper", "amber"]) for (const choice of ["peek", "loaf"]) for (const [w, h] of sizes) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  await send("Page.navigate", { url: base + "?p=" + choice }); await new Promise((r) => setTimeout(r, 400));
  await ev("(() => { localStorage.setItem('palette', '" + palette + "'); })()"); await send("Page.navigate", { url: base + "?p=" + choice }); await new Promise((r) => setTimeout(r, 500));
  let o; for (let k = 0; k < 4; k++) { try { o = await ev(measure()); break; } catch (e) { if (k === 3) throw e; await send('Page.navigate', { url: base + '?p=' + choice }); await new Promise((r) => setTimeout(r, 1200)); } }
  const bad = [];
  const pop = await ev("(async()=>{const b=document.querySelector('[data-cmd-open]');if(!b)return null;b.click();await new Promise(r=>setTimeout(r,250));const c=document.querySelector('[data-cmd]');const r=c.getBoundingClientRect();const o={l:r.left,t:r.top,r:r.right,b:r.bottom,hidden:c.hidden};b.click?.();const l=document.querySelector('.cmd-list').getBoundingClientRect();o.lt=l.top;o.lb=l.bottom;c.hidden=true;return o})()");
  if (pop && !pop.hidden && (pop.t < -0.5 || pop.l < -0.5 || pop.r > w + 0.5 || pop.b > h + 0.5)) bad.push("popover outside " + [pop.l, pop.t, pop.r, pop.b].map(Math.round).join(","));
  if (o.scrollH > o.vh) bad.push("scrollH " + o.scrollH + ">" + o.vh);
  if (o.scrollW > o.vw) bad.push("scrollW " + o.scrollW + ">" + o.vw);
  if (o.clipped.length) bad.push("clipped " + o.clipped.slice(0, 3).join(" | "));
  if (!(o.canvas[3] >= 40)) bad.push("portrait too small " + o.canvas[3]);
  if (!o.js) bad.push("canvas not live");
  if (o.gapL != null && Math.abs(o.gapL - o.gapR) > (choice === "peek" ? 0.06 * o.canvas[2] : 0.012 * o.canvas[2] + 1)) bad.push("gaps " + o.gapL + "/" + o.gapR);
  if (bad.length) fails++;
  rows.push(palette + " " + choice + " " + w + "x" + h + " canvas " + o.canvas.join("x") + " top " + o.figTop + " gaps " + o.gapL + "/" + o.gapR + " scroll " + o.scrollH + "/" + o.vh + (bad.length ? "  FAIL " + bad.join("; ") : ""));
}
console.log(rows.join("\n")); console.log(fails ? "FAILED " + fails : "all fit");
ws.close(); chrome.kill(); server?.close(); process.exit(fails ? 1 : 0);
