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
// STATUS=max|idle mocks the live endpoints (fetch override) so the widest status block / the empty block is tested deterministically
if (process.env.STATUS) {
  const mode = process.env.STATUS;
  const src = "(() => { const mode = " + JSON.stringify(mode) + "; const real = window.fetch.bind(window); const long = 'x'.repeat(0); const j = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });" +
   "window.fetch = (u, o) => { u = String(u); const now = Date.now(); const fmt = (t) => new Date(t - 4 * 3600e3).toISOString().slice(0, 19);" +
   "if (u.includes('/schedule/events')) return Promise.resolve(j({ events: mode === 'max' ? [{ summary: 'Dylan', source: 'walmart', start: fmt(now - 3600e3), end: fmt(now + 5.5 * 3600e3) }] : [] }));" +
   "if (u.includes('/spotify/now-playing')) return Promise.resolve(j({ spotify: mode === 'max' ? { track: 'An extremely long song title that keeps going and going well past any reasonable width ' + 'abcdefghij '.repeat(12), artist: 'Artist One; Artist Two; Artist Three', isPlaying: true, itemType: 'track', url: 'https://open.spotify.com/track/1' } : { track: 'a', artist: 'b', isPlaying: false } }));" +
   "if (u.includes('lanyard')) return Promise.resolve(j({ success: true, data: { discord_status: mode === 'max' ? 'online' : 'idle', activities: mode === 'max' ? [{ name: 'Some Very Long Game Name Edition', type: 0, details: 'In a very long match with a very long detail string ' + 'z'.repeat(80) }] : [] } }));" +
   "return real(u, o); }; })()";
  await send("Page.enable"); await send("Page.addScriptToEvaluateOnNewDocument", { source: src });
}
const sizes = [[390, 664], [1440, 900], [280, 653], [768, 820], [820, 1180], [1366, 657], [1280, 600], [390, 664], [360, 640], [280, 653], [844, 390], [768, 820], [1440, 900], [2560, 1080], [390, 560], [320, 480], [1024, 500], [667, 375], [320, 568], [1920, 1080], [3440, 1440], [1280, 720]];
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
  out.canvas = [cr.left, cr.top, cr.width, cr.height].map((v) => Math.round(v * 10) / 10); out.figTop = Math.round(fr.top * 10) / 10; out.slotCentreOffset = Math.abs((cr.top + cr.bottom - fr.top - fr.bottom) / 2);
  out.js = fig.classList.contains("ap-js"); out.choice = fig.dataset.portraitChoice;
  const hm = document.querySelector(".home-main").getBoundingClientRect(); out.homeBottom = Math.round(hm.bottom);
  const ap = fig.__ap; if (ap) { const e = ap.extent(), k = cr.width / ap.dw; out.gapL = Math.round(e.left * k * 10) / 10; out.gapR = Math.round((ap.dw - e.right) * k * 10) / 10; out.shift = Math.round(ap.shift() * 10) / 10; }
  { const hmr = document.querySelector('.home-main').getBoundingClientRect(), fe = document.querySelector('[data-ascii-portrait]').getBoundingClientRect();
    const col = { l: fe.left, r: fe.right }, cw = c.width, ch = c.height, ctx = c.getContext('2d'), id = ctx.getImageData(0, 0, c.width, c.height).data;
    const k = cr.width / c.width; out.alpha = {};
    for (const th of [8, 12]) { let mn = 1e9, mx = -1; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (id[(y * c.width + x) * 4 + 3] >= th) { if (x < mn) mn = x; if (x > mx) mx = x; } 
      const L = cr.left + mn * k, R = cr.left + (mx + 1) * k; out.alpha[th] = { gapL: Math.round((L - col.l) * 10) / 10, gapR: Math.round((col.r - R) * 10) / 10 }; }
    { let t0 = -1, b0 = -1; for (let y = 0; y < c.height && t0 < 0; y++) for (let x = 0; x < c.width; x++) if (id[(y * c.width + x) * 4 + 3] >= 12) { t0 = y; break; }
      for (let y = c.height - 1; y >= 0 && b0 < 0; y--) for (let x = 0; x < c.width; x++) if (id[(y * c.width + x) * 4 + 3] >= 12) { b0 = y; break; }
      out.vTop = Math.round(t0 * k * 10) / 10; out.vBot = Math.round((c.height - 1 - b0) * k * 10) / 10; out.figH = Math.round(fe.height * 10) / 10; }
    out.col = [Math.round(col.l * 10) / 10, Math.round(col.r * 10) / 10]; }
  ${extra || ""}
  return out; })()`;
const only = process.env.SIZES && process.env.SIZES.split(","); if (only) for (let i = sizes.length - 1; i >= 0; i--) if (!only.includes(sizes[i].join("x"))) sizes.splice(i, 1);
let fails = 0; const rows = [];
for (const palette of (process.env.PALETTES || "ink,paper,amber").split(",")) for (const choice of (process.env.CHOICES || "peek,loaf,sun,couch,window,nojs").split(",")) for (const [w, h] of sizes) {
  const nojs = choice === "nojs"; await send("Emulation.setScriptExecutionDisabled", { value: nojs });
  if (nojs) {
    // scripts are disabled: no timers in the page, so measure synchronously from node
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await send("Page.navigate", { url: base }); await new Promise((r) => setTimeout(r, 900));
    const g = await ev("(() => { const de = document.documentElement; const f = [...document.querySelectorAll('.ap-fit')].find((e) => e.getClientRects().length); const r = f.getBoundingClientRect(); const fg = document.querySelector('[data-ascii-portrait]'); const cs = getComputedStyle(fg); const clip = [...document.querySelectorAll('.site-header, .site-header *, .home-main *:not(canvas):not(.ap-fit):not(.ap-fit *):not(.ap-set):not(.ap-set *)')].filter((e) => { if (!e.getClientRects().length) return false; const b = e.getBoundingClientRect(); return b.width && (b.left < -0.5 || b.top < -0.5 || b.right > innerWidth + 0.5 || b.bottom > innerHeight + 0.5); }).length; return { l: r.left, t: r.top, r: r.right, b: r.bottom, choice: fg.dataset.portraitChoice, set: f.closest('.ap-set').className, sh: de.scrollHeight, sw: de.scrollWidth, vh: innerHeight, vw: innerWidth, clip, ar: cs.getPropertyValue('--ar'), vis: [...document.querySelectorAll('.ap-set')].filter((e) => e.getClientRects().length).length }; })()");
    const bad = [];
    if (g.choice !== "sun" || !/ap-set-sun/.test(g.set) || g.vis !== 1) bad.push("nojs not only sun " + g.set + " vis " + g.vis);
    if (g.l < -0.5 || g.r > w + 0.5 || g.b > h + 0.5 || g.b - g.t < 40) bad.push("nojs grid outside " + [g.l, g.t, g.r, g.b].map(Math.round).join(","));
    if (g.sh > g.vh || g.sw > g.vw) bad.push("nojs scroll " + g.sh + "/" + g.vh + " " + g.sw + "/" + g.vw);
    if (g.clip) bad.push("nojs clipped " + g.clip);
    if (bad.length) fails++;
    rows.push("nojs " + w + "x" + h + " grid " + [g.l, g.t, g.r, g.b].map(Math.round).join(",") + " ar " + g.ar + " scroll " + g.sh + "/" + g.vh + (bad.length ? "  FAIL " + bad.join("; ") : ""));
    continue;
  }
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  await send("Page.navigate", { url: base + "?p=" + choice }); await new Promise((r) => setTimeout(r, 400));
  await ev("(() => { localStorage.setItem('palette', '" + palette + "'); })()"); await send("Page.navigate", { url: base + "?p=" + choice }); await new Promise((r) => setTimeout(r, 500));
  let o; for (let k = 0; k < 4; k++) { try { o = await ev(measure()); break; } catch (e) { if (k === 3) throw e; await send('Page.navigate', { url: base + '?p=' + choice }); await new Promise((r) => setTimeout(r, 1200)); } }
  const bad = [];
  if (nojs) { const g = await ev("(() => { const f = [...document.querySelectorAll('.ap-fit')].find((e) => e.getClientRects().length); const r = f.getBoundingClientRect(); const fg = document.querySelector('[data-ascii-portrait]'); return { l: r.left, t: r.top, r: r.right, b: r.bottom, choice: fg.dataset.portraitChoice, set: f.closest('.ap-set').className }; })()"); if (g.choice !== "sun" || !/ap-set-sun/.test(g.set)) bad.push("nojs not sun " + g.set); if (g.l < -0.5 || g.r > w + 0.5 || g.b > h + 0.5 || g.b - g.t < 40) bad.push("nojs grid outside " + [g.l, g.t, g.r, g.b].map(Math.round).join(",")); o.nojsGrid = g; }
  const pop = await ev("(async()=>{const b=document.querySelector('[data-cmd-open]');if(!b)return null;b.click();await new Promise(r=>setTimeout(r,250));const c=document.querySelector('[data-cmd]');const r=c.getBoundingClientRect();const o={l:r.left,t:r.top,r:r.right,b:r.bottom,hidden:c.hidden};b.click?.();const l=document.querySelector('.cmd-list').getBoundingClientRect();o.lt=l.top;o.lb=l.bottom;c.hidden=true;return o})()");
  if (pop && !pop.hidden && (pop.t < -0.5 || pop.l < -0.5 || pop.r > w + 0.5 || pop.b > h + 0.5)) bad.push("popover outside " + [pop.l, pop.t, pop.r, pop.b].map(Math.round).join(","));
  if (process.env.STATUS && !nojs) { const st = await ev("(async()=>{await new Promise(r=>setTimeout(r,600));return [...document.querySelectorAll('.st-row')].map(e=>e.hidden?0:1).concat([document.querySelector('[data-work-chip]').hidden?0:1])})()"); const want = process.env.STATUS === "max" ? "1,1,1" : "0,0,1"; if (st.join() !== want) bad.push("status rows " + st.join() + " want " + want + " dbg " + await ev("JSON.stringify([window.fetch.toString().slice(0,40),document.hidden,document.querySelector(\"[data-spotify-status]\").textContent.length,document.querySelector(\"[data-spotify-chip]\").hidden,document.querySelector(\"[data-work-status]\").textContent])")); const g2 = await ev("(()=>{const de=document.documentElement;const r=document.querySelector('.statusline').getBoundingClientRect();return {sh:de.scrollHeight,vh:innerHeight,b:r.bottom}})()"); if (g2.sh > g2.vh || g2.b > g2.vh + 0.5) bad.push("status overflow " + JSON.stringify(g2)); o.scrollH = g2.sh; }
  if (o.scrollH > o.vh) bad.push("scrollH " + o.scrollH + ">" + o.vh);
  if (o.scrollW > o.vw) bad.push("scrollW " + o.scrollW + ">" + o.vw);
  if (o.clipped.length) bad.push("clipped " + o.clipped.slice(0, 3).join(" | "));
  if (!nojs && !(o.canvas[3] >= 40)) bad.push("portrait too small " + o.canvas[3]);
  if (!o.js && !nojs) bad.push("canvas not live");
  if (!nojs && o.choice !== choice) bad.push("choice " + o.choice);
  if (o.gapL != null && Math.abs(o.gapL - o.gapR) > (choice === "peek" ? 0.06 * o.canvas[2] : 0.012 * o.canvas[2] + 1)) bad.push("gaps " + o.gapL + "/" + o.gapR);
  if (!nojs && choice !== "peek" && Math.abs(o.alpha[12].gapL - o.alpha[12].gapR) > (choice === "loaf" ? 0.02 : 0.035) * o.canvas[2] + 1) bad.push("pixel bbox off-centre " + o.alpha[12].gapL + "/" + o.alpha[12].gapR);
  if (!nojs && o.slotCentreOffset > 2) bad.push("portrait not vertically centred: " + o.slotCentreOffset);
  if (!nojs && (o.vTop > 14 || o.vBot > 0.03 * o.canvas[3] + 6)) bad.push("blank rows in canvas top/bottom " + o.vTop + "/" + o.vBot);
  if (bad.length) fails++;
  rows.push(palette + " " + choice + " " + w + "x" + h + " canvas " + o.canvas.join("x") + " top " + o.figTop + " gaps " + o.gapL + "/" + o.gapR + " a8 " + o.alpha[8].gapL + "/" + o.alpha[8].gapR + " a12 " + o.alpha[12].gapL + "/" + o.alpha[12].gapR + " col " + o.col.join("-") + " fig " + o.figH + " vis " + o.vTop + "/" + o.vBot + " scroll " + o.scrollH + "/" + o.vh + (bad.length ? "  FAIL " + bad.join("; ") : ""));
}
console.log(rows.join("\n")); console.log(fails ? "FAILED " + fails : "all fit");
ws.close(); chrome.kill(); server?.close(); process.exit(fails ? 1 : 0);
