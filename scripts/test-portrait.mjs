// Layout checks for portrait-particles.json and portrait-peek-particles.json (run: npm run test:portrait)
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
let fails = 0;
const NAMES = ["portrait-particles", "portrait-peek-particles", "portrait-sun-particles", "portrait-couch-particles", "portrait-window-particles"];
const ok = (c, m) => { if (!c) { fails++; console.error("FAIL", m); } };
for (const name of ["portrait-particles", "portrait-peek-particles", "portrait-sun-particles", "portrait-couch-particles", "portrait-window-particles"]) {
const d = JSON.parse(readFileSync(new URL("../src/data/" + name + ".json", import.meta.url), "utf8"));
ok(d.n === d.x.length && d.n === d.y.length && d.n === d.t.length, "array lengths match n");
ok(d.c.length === d.n * 3 && /^[0-9a-f]+$/.test(d.c), "colour string is 3 hex digits per particle");
ok(d.n >= 15000 && d.n <= 30000, "particle count in range: " + d.n);
ok(d.x.every(Number.isFinite) && d.y.every(Number.isFinite) && d.t.every(Number.isFinite), "all values finite");
ok(d.x.every((v) => v >= 0 && v <= d.w) && d.y.every((v) => v >= 0 && v <= d.h), "positions inside the design box");
ok(d.t.every((v) => Number.isInteger(v) && v >= 0 && v <= 255), "tone is a byte");
// no particle on a cell twice, and nothing exists for blank (alpha 0) cells: only emitted cells are listed
const seen = new Set(d.x.map((x, i) => Math.floor(x / d.cellW) + ":" + Math.floor(d.y[i] / d.cellH)));
ok(seen.size === d.n, "one particle per cell");
// aspect is preserved (design box matches the mask bbox crop, never squished): h/w is the portrait ratio
ok(d.h / d.w > 0.4 && d.h / d.w < 1.6, "aspect plausible " + (d.h / d.w).toFixed(3));
// subject only: the bbox is tight, so the extreme rows/cols must be populated
const minX = Math.min(...d.x), maxX = Math.max(...d.x), minY = Math.min(...d.y), maxY = Math.max(...d.y);
// the face is the column centre, so only the long side of the subject reaches its edge; the other side is intentional blank space
ok(minX < 40 && d.w - maxX < 80 && minY < 30 && d.h - maxY < 30, "layout is cropped to the subject, small blank margins only");
ok(minX >= 0 && maxX <= d.w, "no particle clipped by the box");
const isPeek = name.includes("peek");
if (!isPeek) ok(d.cx === undefined && d.eyeX === undefined, "only peek has the eye nudge");
if (isPeek) if (d.cx != null) ok(Math.abs(d.cx - d.w / 2) < 12 && Number.isFinite(d.eyeX), "centre anchor is a small nudge from the box middle: cx " + d.cx + " eye " + d.eyeX);
if (!isPeek) ok(d.faceX === undefined, "no face-point requirement");
{ const cx = (minX + maxX) / 2; ok(Math.abs(cx - d.w / 2) <= d.w * 0.07, "data bbox roughly centred (runtime centres exact visible pixels): " + cx.toFixed(1) + " vs " + d.w / 2); }
if (d.a) {
  ok(d.a.length === d.n && d.a.every((v) => Number.isInteger(v) && v >= 0 && v <= 255), "edge alpha is a byte per particle");
  ok(d.a.some((v) => v < 255) && Math.min(...d.a) < 20, "edge alpha fades toward zero");
  ok(d.a.every((v, i) => v === 255 || d.y[i] > d.h * 0.4), "fade only in the lower part of the frame (ears and hair stay sharp)");
  const faded = d.a.filter((v) => v < 255).length; ok(faded > 300 && faded < d.n * 0.3, "fade confined to the bottom cut: " + faded);
  console.log(name, "alpha min", Math.min(...d.a), "faded", faded, "cx", d.cx);
}
// the single cat needs density
const cat = d.n;
ok(cat > 3000, "cat has particles: " + cat);

console.log(name, "layout ok:", d.n, "particles,", d.w + "x" + d.h);
}
for (const name of NAMES) { const d = JSON.parse(readFileSync(new URL("../src/data/" + name + ".json", import.meta.url), "utf8")); ok(d.cellW <= 2.4 && d.cellH <= 3.6 && Math.abs(d.cellH / d.cellW - 1.5) < 0.01, name + " dense pitch " + d.cellW + "x" + d.cellH); }
ok(/function recentre/.test(readFileSync(new URL("../src/components/AsciiPortrait.astro", import.meta.url), "utf8")), "renderer centres drawn extents");
// static checks on the component: selection before load, no flash, no intro, one fetch
const src = readFileSync(new URL("../src/components/AsciiPortrait.astro", import.meta.url), "utf8");
for (const n of NAMES) ok(src.includes(n + ".json?url"), "runtime uses ?url asset for " + n);
ok(!/import (loaf|peek|sun|couch|window) from/.test(src), "no inline client JSON imports");
ok(src.indexOf("location.search") < src.indexOf("fetch("), "query read before fetch");
// early inline fetch (one request), the module script reuses that promise; the other fetches are a defensive reuse fallback and the on-demand static grid
const inlineSrc = src.slice(src.indexOf("is:inline"), src.indexOf("</script>"));
ok((inlineSrc.match(/fetch\(/g) || []).length === 1, "inline script starts exactly one particle fetch");
ok(/window\.__apData \?\?/.test(src), "module script reuses the early fetch promise");
ok((src.match(/fetch\(/g) || []).length === 3 && (src.match(/fetch\(ascii\)/g) || []).length === 1, "static grid is fetched only on failure (ascii fetch inside staticFallback)");
ok(!/fetch\(/.test(src.slice(0, src.indexOf("<figure"))), "no fetch in frontmatter");
ok((src.match(/Math\.random\(/g) || []).length === 1, "exactly one random call");
ok(/portraitIds\.indexOf\(forced\) >= 0/.test(src) && /Math\.floor\(Math\.random\(\) \* portraitIds\.length\)/.test(src), "fixed whitelist, else floor(random*5)");
ok(/data-ids=\{idList\}/.test(src) && /id: "peek"[^]*id: "loaf"[^]*id: "sun"[^]*id: "couch"[^]*id: "window"/.test(src), "five ids in bin order");
ok(/dataset\.portraitChoice/.test(src.slice(src.lastIndexOf("<script>"))), "runtime reads stored choice");
ok(!/URLSearchParams|localStorage|Math\.random/.test(src.slice(src.lastIndexOf("<script>"))), "runtime never re-reads query, storage or random");
ok(src.indexOf("Math.random") < src.indexOf("<noscript>"), "roll precedes fallback markup");
ok(/<noscript>[^]*ap-set-sun[^]*<\/noscript>/.test(src) && !/<span class="ap-seg/.test(src.slice(0, src.indexOf("<script>"))), "no-JS fallback is one compact plain-text sun grid inside noscript");
// controlled selection: exact bins and names
const ids = ["peek", "loaf", "sun", "couch", "window"];
const choose = (forced, r) => ids.indexOf(forced) >= 0 ? forced : ids[Math.min(4, Math.floor(r * 5))];
[[0, "peek"], [0.2, "loaf"], [0.4, "sun"], [0.6, "couch"], [0.8, "window"], [0.999, "window"], [0.1999, "peek"], [0.7999, "couch"]].forEach(([r, n]) => ok(choose(null, r) === n && choose("bogus", r) === n && choose("__proto__", r) === n, "bin " + r + " -> " + n));
ids.forEach((n) => ok(choose(n, 0.5) === n && choose(n, 0) === n, "forced " + n));
ok(src.indexOf('is:inline') < src.indexOf('class={`ap-fit'), "loading class script precedes fallback markup");
ok(/data-portrait-choice="sun"/.test(src) && /const def = dims\.sun/.test(src), "no-JS default is sun with its own aspect");
ok(/data\.a \?\? \[\]/.test(src) && /a \*= edge\[i\]/.test(src), "renderer multiplies optional edge alpha in the draw path");
ok(!/function intro|intro\(\)|introing/.test(src), "intro scatter removed");
ok(src.indexOf('classList.remove("ap-loading")', src.indexOf("settle(); theme()")) > src.indexOf("settle(); theme()"), "loading removed after first draw");
const home = readFileSync(new URL("../src/pages/index.astro", import.meta.url), "utf8");
ok(/ap-loading \.ap-canvas\{display:block;visibility:hidden;aspect-ratio:var\(--portrait-aspect\)\}/.test(home), "loading canvas retains selected layout dimensions");
ok(src.indexOf('style.setProperty("--portrait-aspect"') < src.indexOf('classList.add("ap-loading")'), "selected aspect reserved before loading");
if (fails) process.exit(1);
