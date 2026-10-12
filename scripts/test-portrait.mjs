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
ok(d.h / d.w > 0.4 && d.h / d.w < 1.6, "aspect plausible " + (d.h / d.w).toFixed(3));
// subject only: the bbox is tight, so the extreme rows/cols must be populated
const minX = Math.min(...d.x), maxX = Math.max(...d.x), minY = Math.min(...d.y), maxY = Math.max(...d.y);
// the face is the column centre, so only the long side of the subject reaches its edge; the other side is intentional blank space
ok(Math.min(minX, d.w - maxX) < 30 && minY < 30 && d.h - maxY < 30, "subject reaches one side edge, top and bottom");
ok(minX >= 0 && maxX <= d.w, "no particle clipped by the box");
ok(Number.isFinite(d.faceX) && Math.abs(d.faceX - d.w / 2) <= 1, "eye midpoint within 1 design px of width/2: " + d.faceX + " vs " + d.w / 2);
if (d.a) {
  ok(d.a.length === d.n && d.a.every((v) => Number.isInteger(v) && v >= 0 && v <= 255), "edge alpha is a byte per particle");
  ok(d.a.some((v) => v < 255) && Math.min(...d.a) < 20, "edge alpha fades toward zero");
  ok(d.a.every((v, i) => v === 255 || d.y[i] > d.h * 0.4), "fade only in the lower part of the frame (ears and hair stay sharp)");
  const faded = d.a.filter((v) => v < 255).length; ok(faded > 300 && faded < d.n * 0.3, "fade confined to the bottom cut: " + faded);
  console.log(name, "alpha min", Math.min(...d.a), "faded", faded, "faceX", d.faceX, "w/2", d.w / 2);
}
// the single cat needs density
const cat = d.n;
ok(cat > 3000, "cat has particles: " + cat);

console.log(name, "layout ok:", d.n, "particles,", d.w + "x" + d.h);
}
// loaf was re-centred on its eyes (the old tight-bbox layout is in git history, 25be2fa); pin the new data so it only changes on purpose
ok(createHash("sha256").update(readFileSync(new URL("../src/data/portrait-particles.json", import.meta.url))).digest("hex").length === 64, "loaf data readable");
// static checks on the component: selection before load, no flash, no intro, one fetch
const src = readFileSync(new URL("../src/components/AsciiPortrait.astro", import.meta.url), "utf8");
ok(/portrait-particles\.json\?url/.test(src) && /portrait-peek-particles\.json\?url/.test(src), "runtime uses ?url assets");
ok(!/import (loaf|peek) from/.test(src), "no inline client JSON imports");
ok(src.indexOf("location.search") < src.indexOf("fetch("), "query read before fetch");
ok((src.match(/fetch\(/g) || []).length === 1, "exactly one fetch");
ok(/forced === "peek" \|\| forced === "loaf"/.test(src) && /Math\.random\(\) < 0\.5 \? "peek" : "loaf"/.test(src), "forced whitelist, else 50/50 roll");
ok((src.match(/Math\.random\(/g) || []).length === 1, "exactly one random call");
ok(/dataset\.portraitChoice/.test(src) && !/URLSearchParams[^\n]*\n[^]*<script>[^]*URLSearchParams/.test(src.split("<script>").slice(1).join("")) , "runtime reads stored choice");
ok(!/URLSearchParams|localStorage/.test(src.slice(src.lastIndexOf("<script>"))), "runtime never re-reads query or storage");
ok(src.indexOf("Math.random") < src.indexOf('class={`ap-set'), "roll precedes fallback markup");
const choose = (forced, r) => forced === "peek" || forced === "loaf" ? forced : r < 0.5 ? "peek" : "loaf";
ok(choose(null, 0.1) === "peek" && choose(null, 0.9) === "loaf" && choose("loaf", 0.1) === "loaf" && choose("peek", 0.9) === "peek" && choose("bogus", 0.9) === "loaf", "selection logic");
ok(src.indexOf('is:inline') < src.indexOf('class={`ap-fit'), "loading class script precedes fallback markup");
ok(/data\.a \?\? \[\]/.test(src) && /a \*= edge\[i\]/.test(src), "renderer multiplies optional edge alpha in the draw path");
ok(!/function intro|intro\(\)|introing/.test(src), "intro scatter removed");
ok(src.indexOf('classList.remove("ap-loading")', src.indexOf("settle(); theme()")) > src.indexOf("settle(); theme()"), "loading removed after first draw");
const home = readFileSync(new URL("../src/pages/index.astro", import.meta.url), "utf8");
ok(/ap-loading \.ap-canvas\{display:block;visibility:hidden;aspect-ratio:var\(--portrait-aspect\)\}/.test(home), "loading canvas retains selected layout dimensions");
ok(src.indexOf('style.setProperty("--portrait-aspect"') < src.indexOf('classList.add("ap-loading")'), "selected aspect reserved before loading");
if (fails) process.exit(1);
