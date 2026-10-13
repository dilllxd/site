// Packs src/data/portrait-*-particles.json in place (idempotent) and proves unpack(pack(d)) deep-equals the original.
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { pack, unpack } from "./particle-pack.mjs";
for (const n of ["portrait-particles", "portrait-peek-particles", "portrait-sun-particles", "portrait-couch-particles", "portrait-window-particles"]) {
  const f = new URL("../src/data/" + n + ".json", import.meta.url);
  const d = JSON.parse(readFileSync(f, "utf8"));
  if (d.xd) { console.log(n, "already packed"); continue; }
  const p = pack(d);
  assert.deepEqual(unpack(JSON.parse(JSON.stringify(p))), d);
  writeFileSync(f, JSON.stringify(p) + "\n");
  console.log(n, "packed", JSON.stringify(d).length, "->", JSON.stringify(p).length);
}
