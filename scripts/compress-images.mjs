import { glob, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const photoDir = process.argv[2] || "public/images/photos";

async function compressPng(filePath) {
  const original = await readFile(filePath);
  const optimized = await sharp(original)
    .png({ quality: 80, compressionLevel: 9, effort: 10 })
    .toBuffer();

  if (optimized.length < original.length) {
    await writeFile(filePath, optimized);
    const saved = ((1 - optimized.length / original.length) * 100).toFixed(1);
    console.log(
      `OK ${filePath}: ${(original.length / 1024 / 1024).toFixed(1)}MB -> ${(optimized.length / 1024 / 1024).toFixed(1)}MB (${saved}% smaller)`,
    );
  } else {
    console.log(`= ${filePath}: already optimized (${(original.length / 1024 / 1024).toFixed(1)}MB)`);
  }
}

for await (const file of glob(`${photoDir}/**/*.png`)) {
  await compressPng(file);
}

console.log("Done.");
