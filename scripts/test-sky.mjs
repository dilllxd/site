// Edge tests for src/lib/sky.ts. Run: node scripts/test-sky.mjs (Node 22.18+ strips types natively)
import assert from "node:assert/strict";
import { formatRa, formatDec, raDecToVector, groupTargets } from "../src/lib/sky.ts";

assert.equal(formatRa(0), "00h 00m 00.0s");
assert.equal(formatRa(90), "06h 00m 00.0s");
assert.equal(formatRa(180), "12h 00m 00.0s");
assert.equal(formatRa(270), "18h 00m 00.0s");
// near 360 must wrap to 0h, never 24h or 60s
assert.equal(formatRa(359.9999999), "00h 00m 00.0s");
assert.equal(formatRa(359.99999), "00h 00m 00.0s");
assert.equal(formatRa(360), "00h 00m 00.0s");
assert.equal(formatRa(359.99), "23h 59m 57.6s");
assert.equal(formatDec(0), "+00\u00b0 00\u2032 00\u2033");
assert.equal(formatDec(90), "+90\u00b0 00\u2032 00\u2033");
assert.equal(formatDec(-90), "-90\u00b0 00\u2032 00\u2033");
assert.equal(formatDec(-0.00001), "+00\u00b0 00\u2032 00\u2033");

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
let v = raDecToVector(0, 0); close(v[0], 1); close(v[1], 0); close(v[2], 0);
v = raDecToVector(90, 0); close(v[0], 0); close(v[2], -1);
v = raDecToVector(180, 0); close(v[0], -1);
v = raDecToVector(270, 0); close(v[2], 1);
v = raDecToVector(123, 90); close(v[1], 1); close(v[0], 0);
v = raDecToVector(0, -90); close(v[1], -1);
// 359.9999 and 0 are neighbours
const g = groupTargets([{ id: "a", title: "a", ra: 359.9999, dec: 10 }, { id: "b", title: "b", ra: 0.0001, dec: 10 }]);
assert.equal(g.length, 1);
assert.equal(groupTargets([{ id: "a", title: "a", ra: 0, dec: 0 }, { id: "b", title: "b", ra: 180, dec: 0 }]).length, 2);
console.log("sky tests passed");
