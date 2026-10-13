// Compact on-disk format for the particle JSON: x/y become delta-coded integers (value*10, all inputs have one decimal),
// the edge alpha array becomes run-length pairs. unpack() restores the exact original arrays (division by 10 yields the same
// doubles as the original literals). The browser decoder in AsciiPortrait.astro mirrors this.
export function pack(d) {
  if (d.xd) return d;
  const delta = (arr) => { let p = 0; return arr.map((v) => { const q = Math.round(v * 10); if (Math.abs(q / 10 - v) > 1e-9) throw new Error("not a 0.1 multiple: " + v); const r = q - p; p = q; return r; }); };
  const { x, y, a, ...rest } = d;
  const out = { ...rest, xd: delta(x), yd: delta(y) };
  if (a) { const rl = []; for (const v of a) { if (rl.length && rl[rl.length - 2] === v) rl[rl.length - 1]++; else rl.push(v, 1); } out.ar = rl; }
  return out;
}
export function unpack(d) {
  if (!d.xd) return d;
  const acc = (arr) => { let p = 0; return arr.map((v) => (p += v) / 10); };
  const { xd, yd, ar, ...rest } = d;
  const out = { ...rest, x: acc(xd), y: acc(yd) };
  if (ar) { out.a = []; for (let i = 0; i < ar.length; i += 2) for (let j = 0; j < ar[i + 1]; j++) out.a.push(ar[i]); }
  return out;
}
