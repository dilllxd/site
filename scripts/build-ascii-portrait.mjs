// Build-time ASCII portrait generator. Usage:
//   ASCII_PORTRAIT_SOURCE=/path/to/original.jpeg npm run build:portrait
// The original photo is never copied into the repo; only the character grids are committed
// (src/data/ascii-portrait.json). Each variant (desktop, mobile) has its own crop, width and
// tone settings in scripts/ascii-portrait.config.json. Optional --proof=<dir> writes the
// cropped/toned source and a PNG raster of each grid for visual review.
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
const SS = 4;
// glyph ink bitmaps (Liberation Mono, 6x12 samples per cell), ordered by total ink for the hover effect
const GLYPH_CHARS = [" ", ...Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i))];
const glyphs = { gw: 6, gh: 12, list: [], bitmaps: [] };
{
  const esc = (c) => c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const all = [];
  for (const ch of GLYPH_CHARS) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="24"><rect width="100%" height="100%" fill="#000"/><text x="0" y="18" font-family="Liberation Mono, DejaVu Sans Mono, monospace" font-size="20" fill="#fff" xml:space="preserve">' + esc(ch) + "</text></svg>";
    const raw = await sharp(Buffer.from(svg)).greyscale().resize(glyphs.gw, glyphs.gh, { kernel: "lanczos3" }).raw().toBuffer();
    const bm = Float32Array.from(raw, (b) => b / 255);
    all.push({ ch, bm, ink: bm.reduce((a, b) => a + b, 0) });
  }
  all.sort((a, b) => a.ink - b.ink);
  for (const g of all) { glyphs.list.push(g.ch); glyphs.bitmaps.push(g.bm); }
} // supersample, then average down to the cell grid

async function proof(name, out, region) {
  const { cols, rows } = out;
  {
    const cw = 8, ch = 16, esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + cols * cw + '" height="' + rows * ch + '"><rect width="100%" height="100%" fill="#121211"/><g font-family="Liberation Mono, DejaVu Sans Mono, monospace" font-size="13" fill="#e8dfc8" xml:space="preserve">' +
      out.dark.map((l, y) => '<text x="0" y="' + (y * ch + 13) + '" textLength="' + cols * cw + '" lengthAdjust="spacing">' + esc(l) + "</text>").join("") + "</g></svg>";
    await sharp(Buffer.from(svg)).png().toFile(path.join(proofDir, name + "-ascii.png"));
    await sharp(upright.data).extract(region).resize({ width: 900 }).jpeg().toFile(path.join(proofDir, name + "-crop.jpg"));
  }
}

async function build(name, v) {
  const c = v.crop;
  const region = { left: Math.round(c.left * W), top: Math.round(c.top * H), width: Math.round(c.width * W), height: Math.round(c.height * H) };
  const cols = v.cols;
  // terminal cells are taller than wide, so sample fewer rows than a square-pixel resize would
  const rows = Math.round((cols * region.height / region.width) * cfg.cellAspect);
  // 1) crop + downsize, 2) lift shadows / compress highlights, 3) CLAHE, 4) unsharp
  let pipe = sharp(upright.data).extract(region).resize(cols * SS, rows * SS, { fit: "fill", kernel: "lanczos3" }).greyscale();
  if (v.shadowLift) pipe = pipe.gamma(v.shadowLift); // >1 brightens dark fur and shirt
  if (v.highlight) pipe = pipe.linear(v.highlight, 0); // <1 pulls back the sun flare
  pipe = pipe.normalise({ lower: 1, upper: 99 })
    .clahe({ width: Math.round(cols * SS / v.claheTiles), height: Math.round(rows * SS / v.claheTiles), maxSlope: v.claheSlope })
    .sharpen({ sigma: v.unsharpSigma, m1: v.unsharpFlat, m2: v.unsharpJagged });
  const { data: big, info } = await pipe.toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  // dim distracting bright background (monitors, TV) with soft-edged boxes given in full-image fractions
  for (const d of v.dim || []) {
    const bw = info.width, bh = info.height, ch0 = info.channels;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const fx = c.left + (x / bw) * c.width, fy = c.top + (y / bh) * c.height;
      const sx = Math.min(1, Math.max(0, Math.min(fx - d.x0, d.x1 - fx) / d.feather));
      const sy = Math.min(1, Math.max(0, Math.min(fy - d.y0, d.y1 - fy) / d.feather));
      const k = 1 - d.strength * sx * sy;
      for (let q = 0; q < ch0; q++) big[(y * bw + x) * ch0 + q] *= k;
    }
  }
  // regional gamma (soft-edged boxes in full-image fractions): >1 lifts dark fur, <1 pulls back flared skin
  for (const d of v.lift || []) {
    const bw = info.width, bh = info.height, ch0 = info.channels;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const fx = c.left + (x / bw) * c.width, fy = c.top + (y / bh) * c.height;
      const sx = Math.min(1, Math.max(0, Math.min(fx - d.x0, d.x1 - fx) / d.feather));
      const sy = Math.min(1, Math.max(0, Math.min(fy - d.y0, d.y1 - fy) / d.feather));
      const k = 1 + (d.gamma - 1) * sx * sy;
      for (let q = 0; q < ch0; q++) { const i = (y * bw + x) * ch0 + q; big[i] = 255 * Math.pow(big[i] / 255, 1 / k); }
    }
  }
  if (proofDir) await sharp(big, { raw: info }).png().toFile(path.join(proofDir, name + "-tone.png"));
  // shape matching: for each cell pick the glyph whose ink bitmap best matches the cell's pixels
  // (edges, eye outlines and muzzles survive far better than density-only mapping)
  const GW = glyphs.gw, GH = glyphs.gh;
  const { data: patch, info: pinfo } = await sharp(big, { raw: info }).resize(cols * GW, rows * GH, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  const PC = pinfo.channels;
  const tone = new Float32Array(cols * GW * rows * GH);
  for (let i = 0; i < tone.length; i++) {
    let t = patch[i * PC] / 255;
    t = Math.min(1, Math.max(0, (t - 0.5) * v.contrast + 0.5));
    tone[i] = Math.pow(t, v.gamma) * v.inkScale;
  }
  let lines = [];
  if (v.mode === "density") {
    // density mapping with local tone + blended equalisation, onto a fixed ink-ordered ramp
    const lum = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      let sum = 0;
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) sum += tone[(y * GH + j) * cols * GW + x * GW + i];
      lum[y * cols + x] = sum / (GW * GH) / v.inkScale;
    }
    if (v.localTone > 0) {
      const R = v.localRadius, mean = new Float32Array(lum.length);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        let a = 0, n = 0;
        for (let j = Math.max(0, y - R); j <= Math.min(rows - 1, y + R); j++) for (let i = Math.max(0, x - R); i <= Math.min(cols - 1, x + R); i++) { a += lum[j * cols + i]; n++; }
        mean[y * cols + x] = a / n;
      }
      for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, lum[i] * (1 - v.localTone) + (0.5 + (lum[i] - mean[i]) * v.localGain) * v.localTone));
    }
    const sorted = Float32Array.from(lum).sort();
    for (let i = 0; i < lum.length; i++) {
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < lum[i]) lo = m + 1; else hi = m; }
      lum[i] = lum[i] * (1 - v.equalize) + (lo / sorted.length) * v.equalize;
    }
    const ramp = [...cfg.ramp];
    const mk = (inv) => Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => {
      const t = lum[y * cols + x];
      return ramp[Math.min(ramp.length - 1, Math.floor((inv ? 1 - t : t) * ramp.length))];
    }).join(""));
    const outD = { cols, rows, dark: mk(false), light: mk(true) };
    if (proofDir) await proof(name, outD, region);
    return outD;
  }
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      let best = 0, bestD = Infinity;
      for (let g = 0; g < glyphs.list.length; g++) {
        const bm = glyphs.bitmaps[g];
        let d = 0;
        for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
          const e = tone[(y * GH + j) * cols * GW + x * GW + i] - bm[j * GW + i];
          d += e * e;
        }
        if (d < bestD) { bestD = d; best = g; }
      }
      line += glyphs.list[best];
    }
    lines.push(line);
  }
  // light themes: dark ink on pale paper, so match the inverted picture instead
  const linesLight = [];
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      let best = 0, bestD = Infinity;
      for (let g = 0; g < glyphs.list.length; g++) {
        const bm = glyphs.bitmaps[g];
        let d = 0;
        for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
          const e = v.inkScale - tone[(y * GH + j) * cols * GW + x * GW + i] - bm[j * GW + i];
          d += e * e;
        }
        if (d < bestD) { bestD = d; best = g; }
      }
      line += glyphs.list[best];
    }
    linesLight.push(line);
  }
  const out = { cols, rows, dark: lines, light: linesLight };
  if (proofDir) await proof(name, out, region);
  return out;
}

const variants = {};
for (const [name, v] of Object.entries(cfg.variants)) { variants[name] = await build(name, v); console.log(name, variants[name].cols + "x" + variants[name].rows); }
await writeFile(process.env.ASCII_OUT || path.join(root, cfg.output), JSON.stringify({ cellAspect: cfg.cellAspect, ramp: cfg.ramp, variants }) + "\n");
console.log("wrote", cfg.output);
