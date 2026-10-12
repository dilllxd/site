// Build-time ASCII portrait generator. Usage:
//   ASCII_PORTRAIT_SOURCE=/path/to/original.jpeg npm run build:portrait
// The original photo is never copied into the repo; only the character grid is committed
// (src/data/ascii-portrait.json). Crop/size settings live in scripts/ascii-portrait.config.json.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(await readFile(path.join(root, "scripts/ascii-portrait.config.json"), "utf8"));
const arg = process.argv.find((a) => a.startsWith("--source="))?.slice(9);
const source = arg || process.env.ASCII_PORTRAIT_SOURCE;
if (!source) { console.error("Set ASCII_PORTRAIT_SOURCE or --source=<file>"); process.exit(1); }

const upright = await sharp(source).rotate().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = upright.info;
const c = cfg.crop;
const region = { left: Math.round(c.left * W), top: Math.round(c.top * H), width: Math.round(c.width * W), height: Math.round(c.height * H) };
const cols = cfg.cols;
// terminal cells are taller than wide, so sample fewer rows than a square-pixel resize would
const rows = Math.round((cols * region.height / region.width) * cfg.cellAspect);
const SS = 4; // supersample, then lanczos down to cell grid for sharp detail
let pipe = sharp(upright.data).extract(region).greyscale().normalise()
  .sharpen({ sigma: cfg.sharpen ?? 1 }).clahe({ width: cfg.clahe.width, height: cfg.clahe.height, maxSlope: cfg.clahe.maxSlope });
const { data: big, info: bigInfo } = await pipe.resize(cols * SS, rows * SS, { fit: "fill", kernel: "lanczos3" }).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
const CH = bigInfo.channels;
const lum = new Float32Array(cols * rows);
for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
  let s = 0;
  for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += big[((y * SS + j) * cols * SS + x * SS + i) * CH];
  let v = s / (SS * SS) / 255;
  v = Math.min(1, Math.max(0, (v - 0.5) * cfg.contrast + 0.5));
  lum[y * cols + x] = Math.pow(v, cfg.gamma);
}
// local tone: blend in (pixel - local mean) so dark fur and shadowed faces keep internal detail
const lt = cfg.localTone ?? 0;
if (lt > 0) {
  const R = cfg.localRadius ?? 6, mean = new Float32Array(lum.length);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, y - R); j <= Math.min(rows - 1, y + R); j++) for (let i = Math.max(0, x - R); i <= Math.min(cols - 1, x + R); i++) { s += lum[j * cols + i]; n++; }
    mean[y * cols + x] = s / n;
  }
  for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, lum[i] * (1 - lt) + (0.5 + (lum[i] - mean[i]) * 2.2) * lt));
}
// histogram-equalise (blended) so the whole glyph range is used, then stretch
const sorted = Float32Array.from(lum).sort();
const eq = cfg.equalize ?? 0;
for (let i = 0; i < lum.length; i++) {
  const v = lum[i];
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
  lum[i] = v * (1 - eq) + (lo / sorted.length) * eq;
}
const ramp = [...cfg.ramp];
const mk = (invert) => Array.from({ length: rows }, (_, y) => {
  let line = "";
  for (let x = 0; x < cols; x++) {
    const v = lum[y * cols + x];
    line += ramp[Math.min(ramp.length - 1, Math.floor((invert ? 1 - v : v) * ramp.length))];
  }
  return line;
});
// dark = light-on-dark themes (bright pixels get dense glyphs); light = dark-on-light themes
const out = { cols, rows, cellAspect: cfg.cellAspect, ramp: cfg.ramp, dark: mk(false), light: mk(true) };
await writeFile(path.join(root, cfg.output), JSON.stringify(out) + "\n");
console.log("wrote", cfg.output, cols + "x" + rows);
