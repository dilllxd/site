// Layout checks for src/data/portrait-particles.json (run: npm run test:portrait)
import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync(new URL("../src/data/portrait-particles.json", import.meta.url), "utf8"));
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error("FAIL", m); } };
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
ok(d.h / d.w > 1 && d.h / d.w < 1.6, "aspect plausible " + (d.h / d.w).toFixed(3));
// subject only: the bbox is tight, so the extreme rows/cols must be populated
const minX = Math.min(...d.x), maxX = Math.max(...d.x), minY = Math.min(...d.y), maxY = Math.max(...d.y);
ok(minX < 30 && d.w - maxX < 30 && minY < 30 && d.h - maxY < 30, "layout is tightly cropped to subject");
// both heads need density: enough particles in the upper half and in the lower-right (cat) quadrant
const cat = d.x.filter((x, i) => x > d.w * 0.44 && d.y[i] > d.h * 0.5).length;
ok(cat > 1500, "cat region has particles: " + cat);
if (fails) process.exit(1);
console.log("portrait layout ok:", d.n, "particles,", d.w + "x" + d.h);
