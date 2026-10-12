// Build-time particle layout for the home portrait canvas. Usage:
//   ASCII_PORTRAIT_SOURCE=/path/original.jpeg ASCII_PORTRAIT_MASK=/path/mask.png npm run build:particles
// Neither the photo nor the cutout is copied into the repo. Output (src/data/portrait-particles.json) has only
// per-particle position, tone (0-255) and a 4-bit-per-channel colour. Background cells (mask alpha) emit nothing.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(await readFile(process.env.ASCII_CFG ? path.resolve(root, process.env.ASCII_CFG) : path.join(root, "scripts/ascii-portrait.config.json"), "utf8"));
const P = { designW: 480, cellW: 4.2, cellH: 6.3, pad: 6, alpha: 0.45, ...(cfg.particles || {}) };
// optional face centring: ASCII_PORTRAIT_FACE_X is the eye-midpoint column in upright source pixels (measured, not the bbox centre).
// ASCII_PORTRAIT_FEATHER (design px, default 0 = off) fades only the diagonal bottom cut of the mask; see the alpha pass below.
// ASCII_PITCH=2.4x3.6 overrides the cell pitch (design px). Glyph size follows cellW in the renderer; the unsharp radius is rescaled so detail stays the same physical size.
if (process.env.ASCII_PITCH) { const [pw, ph] = process.env.ASCII_PITCH.split("x").map(Number); P.cellW = pw; P.cellH = ph; }
const faceX = process.env.ASCII_PORTRAIT_FACE_X ? Number(process.env.ASCII_PORTRAIT_FACE_X) : null;
// ASCII_PORTRAIT_EYE_X (+ optional ASCII_PORTRAIT_NUDGE, default 0.25): keep the tight bbox layout and only record a centre anchor 'cx' for the
// visible particles: their bbox centre nudged that fraction of the way toward the eye midpoint. The renderer centres the drawn extents on cx.
const eyeX = process.env.ASCII_PORTRAIT_EYE_X ? Number(process.env.ASCII_PORTRAIT_EYE_X) : null;
const nudge = Number(process.env.ASCII_PORTRAIT_NUDGE ?? 0.25);
const featherPx = Number(process.env.ASCII_PORTRAIT_FEATHER || 0);
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
const scale = P.designW / region.width; // one uniform scale: no squish (pitch and detail stay as the tight crop had them)
let designW = P.designW;
if (faceX != null) {
  // symmetric extents about the eye midpoint: the region may run past the photo edge (blank, masked) so the face is the column centre
  const half = Math.ceil(Math.max(faceX - x0, x1 - faceX));
  region.left = Math.round(faceX) - half; region.width = 2 * half;
  designW = region.width * scale;
}
const designH = Math.round(region.height * scale);
// pad every source plane so a region past the photo edge is blank instead of an error
const padL = Math.max(0, -region.left), padR = Math.max(0, region.left + region.width - W);
const ext = (buf, ch, bg) => padL || padR ? sharp(buf, { raw: { width: W, height: H, channels: ch } }).extend({ left: padL, right: padR, background: bg }).toColourspace(ch === 1 ? "b-w" : "srgb").raw().toBuffer() : Promise.resolve(buf);
const EW = W + padL + padR;
const exRegion = { left: region.left + padL, top: region.top, width: region.width, height: region.height };
const cols = Math.floor(designW / P.cellW), rows = Math.floor(designH / P.cellH);
const SS = 4;
const rs = async (buf0, ch, k, bg) => sharp(await ext(buf0, ch, bg), { raw: { width: EW, height: H, channels: ch } }).extract(exRegion).resize(cols * SS, rows * SS, { fit: "fill", kernel: k })[ch === 1 ? "greyscale" : "removeAlpha"]().raw().toBuffer();
const [tb, mb, cb] = await Promise.all([rs(cl, 1, "lanczos3", "#000"), rs(maskRaw, 1, "cubic", "#000"), rs(rgb, 3, "lanczos3", "#000")]);
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
const R = Math.max(1, Math.round(cfg.detail.radius * (cfg.particles?.cellW ?? 3.4) / P.cellW)), blur = new Float32Array(N);
for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
  let s = 0, w = 0;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const yy = y + j, xx = x + i; if (yy < 0 || xx < 0 || yy >= rows || xx >= cols) continue; const q = yy * cols + xx; if (!inSub(q)) continue; s += lum[q]; w++; }
  blur[y * cols + x] = w ? s / w : lum[y * cols + x];
}
for (let n = 0; n < N; n++) lum[n] += cfg.detail.amount * (lum[n] - blur[n]);
const sorted = Float32Array.from(lum.filter((_, n) => inSub(n))).sort();
const lo = sorted[Math.floor(sorted.length * cfg.stretch[0])], hi = sorted[Math.floor(sorted.length * cfg.stretch[1])];
const gamma = P.gamma ?? 1.15;
// bottom-cut feather: per column, the lowest subject cell is where the photo's occluder (tub) cuts the cat. Particles within
// featherPx of that edge fade with a smoothstep, but only in the lower part of the frame (y > 55%) so ears and hair keep sharp natural edges.
const bottomRow = new Int16Array(cols).fill(-1);
for (let x = 0; x < cols; x++) for (let y = rows - 1; y >= 0; y--) if (inSub(y * cols + x)) { bottomRow[x] = y; break; }
const featherRows = featherPx / P.cellH, gateRow = rows * 0.55;
const edgeAlpha = (x, y) => {
  if (!(featherRows > 0) || bottomRow[x] < gateRow) return 255;
  const d = bottomRow[x] - y + 0.5, u = Math.min(1, Math.max(0, d / featherRows));
  // strength ramps in over the next 8% of the height below the gate, so no step appears where a column crosses it
  const k = Math.min(1, (bottomRow[x] - gateRow) / (rows * 0.08)), w = k * k * (3 - 2 * k);
  return Math.round(255 * (1 - w * (1 - u * u * (3 - 2 * u))));
};
const xs = [], ys = [], ts = [], as = [];
let cs = "";
const hex = (v) => Math.max(0, Math.min(15, Math.round(v / 17))).toString(16);
for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
  const n = y * cols + x; if (!inSub(n)) continue;
  const ox = (region.left + (x + 0.5) / cols * region.width) / W, oy = (region.top + (y + 0.5) / rows * region.height) / H;
  const gm = gamma * cfg.catLift; // lift the dark cat
  const u = Math.pow(Math.min(1, Math.max(0, (lum[n] - lo) / (hi - lo))), gm);
  const t = u * (1 - cfg.sCurve) + u * u * (3 - 2 * u) * cfg.sCurve;
  xs.push(Math.round(((x + 0.5) * P.cellW) * 10) / 10); ys.push(Math.round(((y + 0.5) * P.cellH) * 10) / 10);
  ts.push(Math.round(t * 255));
  as.push(edgeAlpha(x, y));
  // boost chroma slightly so tinting reads, keep source lightness out of it (renderer uses tone for lightness)
  const r = col[n * 3], g = col[n * 3 + 1], b = col[n * 3 + 2], m = (r + g + b) / 3, k = 1.6;
  cs += hex(m + (r - m) * k) + hex(m + (g - m) * k) + hex(m + (b - m) * k);
}
const out = { w: faceX != null ? Math.round(cols * P.cellW * 10) / 10 : P.designW, h: Math.round(rows * P.cellH), cellW: P.cellW, cellH: P.cellH, n: xs.length, x: xs, y: ys, t: ts, c: cs };
if (as.some((v) => v < 255)) out.a = as;
if (eyeX != null) {
  const f = cols * P.cellW / region.width, mn = Math.min(...xs), mx = Math.max(...xs), pc = (mn + mx) / 2, ex = (eyeX - region.left) * f;
  out.eyeX = Math.round(ex * 10) / 10; out.cx = Math.round((pc + nudge * (ex - pc)) * 10) / 10;
  console.log("particle bbox x", mn, mx, "centre", pc, "eye", out.eyeX, "eye-centre delta", (ex - pc).toFixed(1), "cx", out.cx, "nudge", nudge);
}
if (faceX != null) out.faceX = Math.round((faceX - region.left) / region.width * cols * P.cellW * 10) / 10;
console.log("region", JSON.stringify(region), "frac", JSON.stringify({ left: region.left / W, top: region.top / H, width: region.width / W, height: region.height / H }), "faceX", out.faceX, "w/2", out.w / 2, "fade min/count", Math.min(...as), as.filter((v) => v < 255).length);
await writeFile(path.join(root, process.env.ASCII_PORTRAIT_OUT || "src/data/portrait-particles.json"), JSON.stringify(out) + "\n");
console.log("particles", out.n, "grid", cols + "x" + rows, "design", out.w + "x" + out.h);
if (process.argv.includes("--proof")) {
  const px = Buffer.alloc(cols * rows); for (let i = 0; i < xs.length; i++) px[Math.floor(ys[i] / P.cellH) * cols + Math.floor(xs[i] / P.cellW)] = 30 + ts[i] * 0.88 * as[i] / 255;
  if (faceX != null) for (let y = 0; y < rows; y += 2) px[y * cols + Math.floor(out.w / 2 / P.cellW)] = 255;
  await sharp(px, { raw: { width: cols, height: rows, channels: 1 } }).resize(cols * 6, rows * 6, { kernel: "nearest" }).png().toFile((process.env.ASCII_PORTRAIT_OUT ? "/tmp/particles-tone-peek.png" : "/tmp/particles-tone.png"));
}
