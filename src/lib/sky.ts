/**
 * Celestial sphere maths shared by the build (grouping, text) and the browser (3D globe).
 *
 * Input is equatorial J2000 (ICRS) RA/Dec in decimal degrees.
 * Unit vector in the equatorial frame:  X = cos(dec) cos(ra), Y = cos(dec) sin(ra), Z = sin(dec)
 * Three.js is Y-up, so we map (X, Y, Z) -> (X, Z, -Y). That is a proper rotation (no mirroring):
 * +Y is the north celestial pole, +X is RA 0h on the equator, and RA increases counter-clockwise
 * when the globe is viewed from above the north pole. Viewed from outside, as on a physical globe,
 * the sky therefore appears mirrored compared with looking up from the ground.
 */
const RAD = Math.PI / 180;

export type Vec3 = [number, number, number];

export function raDecToVector(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * RAD;
  const dec = decDeg * RAD;
  const c = Math.cos(dec);
  return [c * Math.cos(ra), Math.sin(dec), -c * Math.sin(ra)];
}

export function angularSeparation(a: Vec3, b: Vec3): number {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) / RAD;
}

export function formatRa(raDeg: number): string {
  // Wrap before splitting so a value that rounds up to 24h becomes 00h 00m 00.0s.
  const day = 86400;
  const totalSec = ((Math.round((((raDeg % 360) + 360) % 360) / 15 * 3600 * 10) / 10) % day + day) % day;
  const h = Math.floor(totalSec / 3600) % 24;
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec - h * 3600 - m * 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${s.toFixed(1).padStart(4, "0")}s`;
}

export function formatDec(decDeg: number): string {
  const t = Math.round(Math.abs(decDeg) * 3600);
  const sign = decDeg < 0 && t > 0 ? "-" : "+";
  const d = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${sign}${String(d).padStart(2, "0")}\u00b0 ${String(m).padStart(2, "0")}\u2032 ${String(s).padStart(2, "0")}\u2033`;
}

export interface SkyTarget {
  id: string;
  title: string;
  ra: number;
  dec: number;
}

export interface SkyGroup {
  id: string;
  /** Mean direction of the members (normalised vector sum). The members keep their own true coordinates. */
  center: Vec3;
  members: SkyTarget[];
}

/** Single-link clustering: targets closer than `thresholdDeg` share one region marker. */
export function groupTargets(targets: SkyTarget[], thresholdDeg = 1.5): SkyGroup[] {
  const vecs = targets.map((t) => raDecToVector(t.ra, t.dec));
  const parent = targets.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < targets.length; i++)
    for (let j = i + 1; j < targets.length; j++)
      if (angularSeparation(vecs[i], vecs[j]) < thresholdDeg) parent[find(i)] = find(j);
  const buckets = new Map<number, number[]>();
  targets.forEach((_, i) => {
    const r = find(i);
    buckets.set(r, [...(buckets.get(r) ?? []), i]);
  });
  return [...buckets.values()].map((idx) => {
    const sum: Vec3 = [0, 0, 0];
    idx.forEach((i) => vecs[i].forEach((v, k) => (sum[k] += v)));
    const len = Math.hypot(...sum) || 1;
    return {
      id: idx.map((i) => targets[i].id).sort().join("+"),
      center: [sum[0] / len, sum[1] / len, sum[2] / len],
      members: idx.map((i) => targets[i]),
    };
  });
}
