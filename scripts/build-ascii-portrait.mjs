// Build-time ASCII portrait generator. Usage:
//   ASCII_PORTRAIT_SOURCE=/path/to/original.jpeg npm run build:portrait [-- --proof=/tmp/dir]
// The original photo is never copied into the repo; only the character/opacity grids are committed
// (src/data/ascii-portrait.json).
// Algorithm: crop, average each cell in LINEAR light, normalise by a gentle 1-99 percentile stretch,
// apply one mild global gamma (no CLAHE, no local equalisation, no sharpening), then represent each
// cell's tone as glyph ink (measured from the real font) times one of 16 opacity levels. The proof
// writes the sampled grayscale grid (8x nearest upscale) so the tone data can be checked before any glyphs.
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(await readFile(process.env.ASCII_CFG || path.join(root, "scripts/ascii-portrait.config.json"), "utf8"));
const arg = (k) => process.argv.find((a) => a.startsWith("--" + k + "="))?.slice(k.length + 3);
const source = arg("source") || process.env.ASCII_PORTRAIT_SOURCE;
const proofDir = arg("proof");
if (!source) { console.error("Set ASCII_PORTRAIT_SOURCE or --source=<file>"); process.exit(1); }
if (proofDir) await mkdir(proofDir, { recursive: true });

const upright = await sharp(source).rotate().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = upright.info;
const LEVELS = cfg.levels;

// measured ink coverage of each ramp glyph (Liberation Mono), normalised so the densest glyph is 1
const esc = (c) => c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inkOf = [];
for (const ch of cfg.ramp) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="24"><rect width="100%" height="100%" fill="#000"/><text x="0" y="18" font-family="Liberation Mono, DejaVu Sans Mono, monospace" font-size="20" fill="#fff" xml:space="preserve">' + esc(ch) + "</text></svg>";
  const raw = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer();
  inkOf.push(raw.reduce((a, b) => a + b, 0) / raw.length / 255);
}
const maxInk = Math.max(...inkOf);
const ink = inkOf.map((v) => v / maxInk);
console.log("glyph ink", cfg.ramp.split("").map((c, i) => c + ":" + ink[i].toFixed(2)).join(" "));

const toLin = (v) => Math.pow(v / 255, 2.2);
const toGam = (v) => 255 * Math.pow(v, 1 / 2.2);

// tone t in 0..1 -> {glyph index, opacity level 0..LEVELS-1}; ink * opacity approximates t
function represent(t) {
  if (t <= 0.02) return { g: 0, o: 0 };
  let g = 1;
  while (g < ink.length - 1 && ink[g] < t) g++; // lightest glyph whose full ink reaches t
  const op = Math.min(1, t / ink[g]);
  return { g, o: Math.max(0, Math.min(LEVELS - 1, Math.round(op * LEVELS) - 1)) };
}

async function build(name, v) {
  const c = v.crop;
  const region = { left: Math.round(c.left * W), top: Math.round(c.top * H), width: Math.round(c.width * W), height: Math.round(c.height * H) };
  const cols = v.cols;
  const rows = Math.round((cols * region.height / region.width) * cfg.cellAspect);
  const SS = 4;
  const { data: big, info } = await sharp(upright.data).extract(region).resize(cols * SS, rows * SS, { fit: "fill", kernel: "lanczos3" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  // linear-light average per cell
  const lum = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    let s = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += toLin(big[(y * SS + j) * info.width + x * SS + i]);
    lum[y * cols + x] = toGam(s / (SS * SS)) / 255; // back to display space for percentile work
  }
  const sorted = Float32Array.from(lum).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.floor(sorted.length * 0.99)];
  const tone = Float32Array.from(lum, (x) => Math.pow(Math.min(1, Math.max(0, (x - lo) / (hi - lo))), v.gamma));
  if (proofDir) {
    const px = Buffer.from(Array.from(tone, (t) => Math.round(t * 255)));
    await sharp(px, { raw: { width: cols, height: rows, channels: 1 } }).resize(cols * 8, rows * 8, { kernel: "nearest" }).png().toFile(path.join(proofDir, name + "-gray8x.png"));
  }
  const mk = (inv) => {
    const chars = [], lv = [];
    for (let y = 0; y < rows; y++) {
      let a = "", b = "";
      for (let x = 0; x < cols; x++) {
        const t = tone[y * cols + x];
        const r = represent(inv ? 1 - t : t);
        a += cfg.ramp[r.g]; b += r.o.toString(16);
      }
      chars.push(a); lv.push(b);
    }
    return { chars, lv };
  };
  const out = { cols, rows, dark: mk(false), light: mk(true) };
  if (proofDir) {
    // raster of the actual glyph+opacity grid on the dark palette
    const cw = 8, ch = 16;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + cols * cw + '" height="' + rows * ch + '"><rect width="100%" height="100%" fill="#151513"/><g font-family="Liberation Mono, DejaVu Sans Mono, monospace" font-size="13" fill="#e4dcc8" xml:space="preserve">' +
      out.dark.chars.map((l, y) => [...l].map((chh, x) => chh === " " ? "" : '<text x="' + x * cw + '" y="' + (y * ch + 13) + '" opacity="' + ((parseInt(out.dark.lv[y][x], 16) + 1) / LEVELS).toFixed(3) + '">' + esc(chh) + "</text>").join("")).join("") + "</g></svg>";
    await sharp(Buffer.from(svg)).png().toFile(path.join(proofDir, name + "-ascii.png"));
  }
  return out;
}

const variants = {};
for (const [name, v] of Object.entries(cfg.variants)) { variants[name] = await build(name, v); console.log(name, variants[name].cols + "x" + variants[name].rows); }
await writeFile(process.env.ASCII_OUT || path.join(root, cfg.output), JSON.stringify({ cellAspect: cfg.cellAspect, ramp: cfg.ramp, levels: LEVELS, variants }) + "\n");
console.log("wrote", cfg.output);
