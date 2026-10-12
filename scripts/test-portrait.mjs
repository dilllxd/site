// Layout checks for portrait-particles.json and portrait-peek-particles.json (run: npm run test:portrait)
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error("FAIL", m); } };
for (const name of ["portrait-particles", "portrait-peek-particles"]) {
const d = JSON.parse(readFileSync(new URL("../src/data/" + name + ".json", import.meta.url), "utf8"));
ok(d.n === d.x.length && d.n === d.y.length && d.n === d.t.length, "array lengths match n");
ok(d.c.length === d.n * 3 && /^[0-9a-f]+$/.test(d.c), "colour string is 3 hex digits per particle");
ok(d.n >= 3000 && d.n <= 12000, "particle count in range: " + d.n);
ok(d.x.every(Number.isFinite) && d.y.every(Number.isFinite) && d.t.every(Number.isFinite), "all values finite");
ok(d.x.every((v) => v >= 0 && v <= d.w) && d.y.every((v) => v >= 0 && v <= d.h), "positions inside the design box");
ok(d.t.every((v) => Number.isInteger(v) && v >= 0 && v <= 255), "tone is a byte");
// no particle on a cell twice, and nothing exists for blank (alpha 0) cells: only emitted cells are listed
const seen = new Set(d.x.map((x, i) => Math.floor(x / d.cellW) + ":" + Math.floor(d.y[i] / d.cellH)));
ok(seen.size === d.n, "one particle per cell");
// aspect is preserved (design box matches the mask bbox crop, never squished): h/w is the portrait ratio
ok(d.h / d.w > 0.5 && d.h / d.w < 1.6, "aspect plausible " + (d.h / d.w).toFixed(3));
// subject only: the bbox is tight, so the extreme rows/cols must be populated
const minX = Math.min(...d.x), maxX = Math.max(...d.x), minY = Math.min(...d.y), maxY = Math.max(...d.y);
ok(minX < 30 && d.w - maxX < 30 && minY < 30 && d.h - maxY < 30, "layout is tightly cropped to subject");
// the single cat needs density
const cat = d.n;
ok(cat > 3000, "cat has particles: " + cat);

console.log(name, "layout ok:", d.n, "particles,", d.w + "x" + d.h);
}
// default loaf layout must stay byte-identical
ok(createHash("sha256").update(readFileSync(new URL("../src/data/portrait-particles.json", import.meta.url))).digest("hex") === "9c3b13553cfef15fe8852c2bf2ba9e12dafa99e9b17e6464bc4721b901d18e73", "default loaf layout byte parity");
// static checks on the component: selection before load, no flash, no intro, one fetch
const src = readFileSync(new URL("../src/components/AsciiPortrait.astro", import.meta.url), "utf8");
ok(/portrait-particles\.json\?url/.test(src) && /portrait-peek-particles\.json\?url/.test(src), "runtime uses ?url assets");
ok(!/import (loaf|peek) from/.test(src), "no inline client JSON imports");
ok(src.indexOf("location.search") < src.indexOf("fetch("), "query read before fetch");
ok((src.match(/fetch\(/g) || []).length === 1, "exactly one fetch");
ok(/get\("p"\) === "peek"/.test(src) && /isPeek \? peekUrl : loafUrl/.test(src), "whitelist: only p=peek picks peek");
ok(src.indexOf('is:inline') < src.indexOf('class={`ap-fit'), "loading class script precedes fallback markup");
ok(!/function intro|intro\(\)|introing/.test(src), "intro scatter removed");
ok(src.indexOf('classList.remove("ap-loading")', src.indexOf("settle(); theme()")) > src.indexOf("settle(); theme()"), "loading removed after first draw");
if (fails) process.exit(1);
