// Minifies the hand-written browser scripts in src/scripts into public/scripts (same file names, ES modules, no bundling).
import { build } from "esbuild";
import { readdirSync } from "node:fs";
const entries = readdirSync(new URL("../src/scripts/", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => "src/scripts/" + f);
await build({ entryPoints: entries, outdir: "public/scripts", minify: true, format: "esm", target: "es2020", legalComments: "none", logLevel: "warning" });
console.log("minified", entries.length, "scripts");
