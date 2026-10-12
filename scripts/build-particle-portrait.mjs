// Build-time particle layout for the home portrait canvas. Usage:
//   ASCII_PORTRAIT_SOURCE=/path/original.jpeg ASCII_PORTRAIT_MASK=/path/mask.png npm run build:particles
// Neither the photo nor the cutout is copied into the repo. Output (src/data/portrait-particles.json) has only
// per-particle position, tone (0-255) and a 4-bit-per-channel colour. Background cells (mask alpha) emit nothing.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(await readFile(path.join(root, "scripts/ascii-portrait.config.json"), "utf8"));
const P = { designW: 480, cellW: 4.2, cellH: 6.3, pad: 6, alpha: 0.45, ...(cfg.particles || {}) };
const source = process.env.ASCII_PORTRAIT_SOURCE, maskPath = process.env.ASCII_PORTRAIT_MASK;
if (!source || !maskPath) { console.error("Set ASCII_PORTRAIT_SOURCE and ASCII_PORTRAIT_MASK"); process.exit(1); }

const up = await sharp(source).rotate().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = up.info;
const maskRaw = await sharp(maskPath).resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer();
const rgb = await sharp(up.data).removeAlpha().raw().toBuffer();
const grey = await sharp(up.data).greyscale().raw().toBuffer();

// offline face/fur lift: CLAHE on the subject only (background filled with subject median), blended with original
const subj = []; for (let i = 0; i < grey.length; i += 7) if (maskRaw[i] > 160) subj.push(grey[i]);
subj.sort((a, b) => a - b); const fill = subj[subj.length >> 1];
const filled = Buffer.from(grey); for (let i = 0; i < filled.length; i++) { const a = maskRaw[i] / 255; filled[i] = Math.round(grey[i] * a + fill * (1 - a)); }
const cl = Buffer.from(await sharp(filled, { raw: { width: W, height: H, channels: 1 } }).clahe({ width: cfg.clahe.tile, height: cfg.clahe.tile, maxSlope: cfg.clahe.slope }).greyscale().raw().toBuffer());
for (let i = 0; i < cl.length; i++) cl[i] = Math.round(grey[i] * (1 - cfg.clahe.mix) + cl[i] * cfg.clahe.mix);

// tight bbox of the mask
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (maskRaw[y * W + x] > 160) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
const padPx = Math.round(P.pad / P.designW * (x1 - x0));
x0 = Math.max(0, x0 - padPx); y0 = Math.max(0, y0 - padPx); x1 = Math.min(W - 1, x1 + padPx); y1 = Math.min(H - 1, y1 + padPx);
const region = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
const scale = P.designW / region.width; // one uniform scale: no squish
const designH = Math.round(region.height * scale);
const cols = Math.floor(P.designW / P.cellW), rows = Math.floor(designH / P.cellH);
const SS = 4;
const rs = (buf, ch, k) => sharp(buf, { raw: { width: W, height: H, channels: ch } }).extract(region).resize(cols * SS, rows * SS, { fit: "fill", kernel: k })[ch === 1 ? "greyscale" : "removeAlpha"]().raw().toBuffer();
const [tb, mb, cb] = await Promise.all([rs(cl, 1, "lanczos3"), rs(maskRaw, 1, "cubic"), rs(rgb, 3, "lanczos3")]);
const toLin = (v) => Math.pow(v / 255, 2.2), toGam = (v) => 255 * Math.pow(v, 1 / 2.2);
const N = cols * rows, lum = new Float32Array(N), alpha = new Float32Array(N), col = new Float32Array(N * 3);
const iw = cols * SS;
for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
  let s = 0, a = 0, r = 0, g = 0, b = 0;
  for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const k = (y * SS + j) * iw + x * SS + i; s += toLin(tb[k]); a += mb[k] / 255; r += cb[k * 3]; g += cb[k * 3 + 1]; b += cb[k * 3 + 2]; }
  const n = y * cols + x, q = SS * SS; lum[n] = toGam(s / q) / 255; alpha[n] = a / q; col[n * 3] = r / q; col[n * 3 + 1] = g / q; col[n * 3 + 2] = b / q;
}
const inSub = (n) => alpha[n] >= P.alpha;
// masked unsharp on subject cells only (no halo from the cut edge)
const R = cfg.detail.radius, blur = new Float32Array(N);
for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
  let s = 0, w = 0;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const yy = y + j, xx = x + i; if (yy < 0 || xx < 0 || yy >= rows || xx >= cols) continue; const q = yy * cols + xx; if (!inSub(q)) continue; s += lum[q]; w++; }
  blur[y * cols + x] = w ? s / w : lum[y * cols + x];
}
for (let n = 0; n < N; n++) lum[n] += cfg.detail.amount * (lum[n] - blur[n]);
const sorted = Float32Array.from(lum.filter((_, n) => inSub(n))).sort();
const lo = sorted[Math.floor(sorted.length * cfg.stretch[0])], hi = sorted[Math.floor(sorted.length * cfg.stretch[1])];
const gamma = P.gamma ?? 1.15;
const xs = [], ys = [], ts = [];
let cs = "";
const hex = (v) => Math.max(0, Math.min(15, Math.round(v / 17))).toString(16);
for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
  const n = y * cols + x; if (!inSub(n)) continue;
  const ox = (region.left + (x + 0.5) / cols * region.width) / W, oy = (region.top + (y + 0.5) / rows * region.height) / H;
  const gm = ox >= 0.44 && oy >= 0.5 ? gamma * cfg.catLift : gamma; // lift the dark cat
  const u = Math.pow(Math.min(1, Math.max(0, (lum[n] - lo) / (hi - lo))), gm);
  const t = u * (1 - cfg.sCurve) + u * u * (3 - 2 * u) * cfg.sCurve;
  xs.push(Math.round(((x + 0.5) * P.cellW) * 10) / 10); ys.push(Math.round(((y + 0.5) * P.cellH) * 10) / 10);
  ts.push(Math.round(t * 255));
  // boost chroma slightly so tinting reads, keep source lightness out of it (renderer uses tone for lightness)
  const r = col[n * 3], g = col[n * 3 + 1], b = col[n * 3 + 2], m = (r + g + b) / 3, k = 1.6;
  cs += hex(m + (r - m) * k) + hex(m + (g - m) * k) + hex(m + (b - m) * k);
}
const out = { w: P.designW, h: Math.round(rows * P.cellH), cellW: P.cellW, cellH: P.cellH, n: xs.length, x: xs, y: ys, t: ts, c: cs };
await writeFile(path.join(root, "src/data/portrait-particles.json"), JSON.stringify(out) + "\n");
console.log("particles", out.n, "grid", cols + "x" + rows, "design", out.w + "x" + out.h);
if (process.argv.includes("--proof")) {
  const px = Buffer.alloc(cols * rows); for (let i = 0; i < xs.length; i++) px[Math.floor(ys[i] / P.cellH) * cols + Math.floor(xs[i] / P.cellW)] = 30 + ts[i] * 0.88;
  await sharp(px, { raw: { width: cols, height: rows, channels: 1 } }).resize(cols * 6, rows * 6, { kernel: "nearest" }).png().toFile("/tmp/particles-tone.png");
}
