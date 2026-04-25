import { readFileSync, writeFileSync } from "node:fs";
import toIco from "to-ico";

const base = "favicon-temp/favicon-1,favicon-2,favicon-3";
const files = [1,2,3,4,5].map(n => readFileSync(`${base}/favicon-${n}.png`));
const buf = await toIco(files);
writeFileSync("public/favicon.ico", buf);
console.log("Created public/favicon.ico");
