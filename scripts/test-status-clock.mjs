// Fake-clock behaviour test for the live status block (CDP, headless). Mocks fetch + Date + setInterval; real endpoints are never used.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/opt/hako/bin/google-chrome";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer((q, r) => { let f = path.join(root, "dist", decodeURIComponent(q.url.split("?")[0])); if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": mime[path.extname(f)] || "application/octet-stream" }); r.end(readFileSync(f)); }).listen(0);
const base = "http://127.0.0.1:" + server.address().port + "/";
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=" + port, "--user-data-dir=" + mkdtempSync(path.join(tmpdir(), "hf-clk-")), "about:blank"], { stdio: "ignore" });
let wsUrl; for (let i = 0; i < 60 && !wsUrl; i++) { try { wsUrl = (await (await fetch("http://127.0.0.1:" + port + "/json")).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {} if (!wsUrl) await new Promise((r) => setTimeout(r, 250)); }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
// 2026-10-12 11:35 UTC = 7:35 AM EDT. Shift 1:00 PM-10:00 PM EDT today; Lily's shift in feed must be ignored.
const START = Date.parse("2026-10-12T11:35:00Z");
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
  const RD = Date; window.__off = 0; window.__reqs = []; window.__hidden = false; window.__timers = [];
  class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(${START} + window.__off); } static now() { return ${START} + window.__off; } }
  window.Date = FD;
  const si = window.setInterval.bind(window); window.setInterval = (f, ms, ...a) => { if (ms === 30000) window.__timers.push(f); return si(f, ms, ...a); };
  Object.defineProperty(document, "hidden", { get: () => window.__hidden });
  window.__spotify = { spotify: { track: "Track One", artist: "A; B", isPlaying: true, url: "https://open.spotify.com/track/1" } };
  window.__discord = { data: { discord_status: "online", activities: [{ name: "Overwatch 2", type: 0, details: "<img src=x onerror=alert(1)>" }] } };
  const j = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
  window.fetch = (u) => { u = String(u); window.__reqs.push(u);
    if (u.includes("/schedule/events")) return Promise.resolve(j({ events: [
      { summary: "Lily's Shift", start: "2026-10-12T08:00:00", end: "2026-10-12T20:00:00", source: "lily" },
      { summary: "Dylan's Shift", start: "2026-10-12T13:00:00", end: "2026-10-12T22:00:00", source: "walmart" }] }));
    if (u.includes("/spotify/")) return Promise.resolve(j(window.__spotify));
    if (u.includes("lanyard")) return Promise.resolve(j(window.__discord));
    return Promise.reject(new Error("unexpected " + u)); };
})()` });
await send("Page.navigate", { url: base }); await new Promise((r) => setTimeout(r, 1500));
const st = () => ev(`JSON.stringify({ work: document.querySelector("[data-work-status]").textContent, workHidden: document.querySelector("[data-work-chip]").hidden, sp: document.querySelector("[data-spotify-status]").textContent, spHidden: document.querySelector("[data-spotify-chip]").hidden, spHref: document.querySelector("[data-spotify-status]").getAttribute("href"), dc: document.querySelector("[data-discord-status]").textContent, dcHidden: document.querySelector("[data-discord-chip]").hidden, imgs: document.querySelectorAll(".statusline img").length, n: window.__reqs.length, timers: window.__timers.length })`).then(JSON.parse);
const tick = async () => { await ev("window.__timers.forEach((f) => f())"); await new Promise((r) => setTimeout(r, 400)); };
const adv = (ms) => ev("window.__off += " + ms);
const log = []; const ok = (name, v) => { log.push("ok " + name); return v; };
let s = await st();
assert.equal(s.work, "Working in 5h 25m."); ok("initial uses Dylan only (Lily 8-8 ignored)");
assert.equal(s.spHidden, false); assert.equal(s.spHref, "https://open.spotify.com/track/1"); assert.equal(s.dcHidden, false); assert.equal(s.imgs, 0); assert.equal(s.dc, "Overwatch 2 - <img src=x onerror=alert(1)>"); ok("spotify+discord shown, discord text inert");
assert.equal(s.timers, 1, "one 30s interval"); const n0 = s.n;
await adv(30000); await tick(); s = await st(); assert.equal(s.work, "Working in 5h 25m."); assert.equal(s.n, n0 + 2, "tick fetched spotify+discord only"); ok("30s later: schedule not refetched, countdown unchanged inside same minute");
await adv(60000); await tick(); s = await st(); assert.equal(s.work, "Working in 5h 24m."); assert.equal(s.n, n0 + 4); ok("a minute later countdown ticks without schedule fetch");
await adv(5 * 3600e3 + 24 * 60e3); await tick(); s = await st(); assert.ok(s.work.startsWith("Working for another 9"), s.work); ok("crossing shift start flips to 'Working for another' from cache: " + s.work);
await adv(9 * 3600e3 - 10 * 60e3); await tick(); s = await st(); assert.equal(s.work, "Working for another 10 minutes."); await adv(11 * 60e3); await tick(); s = await st(); assert.ok(/Off for the day|Working in|Working tomorrow/.test(s.work), s.work); ok("past shift end: " + s.work);
const nHidden = s.n; await ev("window.__hidden = true"); await adv(600000); await tick(); s = await st(); assert.equal(s.n, nHidden); ok("hidden: no fetches from tick");
await ev("window.__spotify = { spotify: { track: 'x', artist: 'y', isPlaying: false } }; window.__discord = { data: { discord_status: 'idle', activities: [] } }; window.__hidden = false; document.dispatchEvent(new Event('visibilitychange'))"); await new Promise((r) => setTimeout(r, 500)); s = await st();
assert.equal(s.n, nHidden + 3, "visible fetched all three"); assert.equal(s.spHidden, true); assert.equal(s.dcHidden, true); assert.equal(s.sp, ""); ok("visible: refetch all 3; idle spotify + idle discord hidden, no stale text");
await ev("window.__spotify = { spotify: { track: 'New Song', artist: 'Z', isPlaying: true } }; window.__discord = { data: { discord_status: 'offline', activities: [] } }"); await adv(31000); await tick(); s = await st(); assert.equal(s.sp, "New Song by Z"); assert.equal(s.spHref, null); assert.equal(s.dcHidden, true); ok("track change + offline discord reflected without reload");
console.log(log.join("\n")); console.log("clock test passed");
ws.close(); chrome.kill(); server.close(); process.exit(0);
