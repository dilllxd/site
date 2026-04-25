import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import sharp from "sharp";

const [, , type, title, ...rest] = process.argv;
const interactive = rest.includes("--interactive");

let resolvedTitle = title;

if (!type || (!resolvedTitle && !interactive)) {
  console.error('Usage: npm run new:<type> -- "Title" [image-path] [--key=value]');
  process.exit(1);
}

const rootDir = process.cwd();
const optionEntries = rest
  .filter((value) => value.startsWith("--"))
  .map((value) => {
    const [rawKey, ...rawValue] = value.slice(2).split("=");
    return [rawKey, rawValue.join("=")];
  });
const options = Object.fromEntries(optionEntries);
const positionalArgs = rest.filter((value) => !value.startsWith("--"));
let rl = null;

if (interactive) {
  rl = createInterface({ input, output });
}

if (!resolvedTitle) {
  resolvedTitle = await promptValue(rl, "Title");
}

const explicitSlug = options.slug?.trim();
const slug = explicitSlug || slugify(resolvedTitle);
const date = options.date?.trim() || new Date().toISOString().slice(0, 10);

if (!slug) {
  console.error("Unable to create a slug for this content.");
  process.exit(1);
}

const writers = {
  post: createPost,
  photo: createPhoto,
};

const writer = writers[type];

if (!writer) {
  console.error(`Unknown content type "${type}". Use post or photo.`);
  process.exit(1);
}

await writer({
  rootDir,
  title: resolvedTitle,
  slug,
  date,
  options,
  positionalArgs,
  rl,
});

await rl?.close();

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeYaml(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function writeMarkdownFile(filePath, contents) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, contents, { flag: "wx" });
  console.log(`Created ${filePath}`);
}

async function createPost({ rootDir, title, slug, date, options, rl }) {
  const excerpt =
    options.excerpt?.trim() ||
    (rl ? await promptValue(rl, "Excerpt", "Add a short summary for this post.") : "Add a short summary for this post.");
  const readingTime =
    options["reading-time"]?.trim() ||
    (rl ? await promptValue(rl, "Reading time", "3 min read") : "3 min read");
  const featuredInput =
    options.featured?.trim() ||
    (rl ? await promptValue(rl, "Featured? (y/N)", "n", { required: false }) : "n");
  const featured = /^(true|yes|y|1)$/i.test(featuredInput) ? "true" : "false";
  const filePath = path.join(rootDir, "src", "content", "posts", `${slug}.md`);
  const contents = `---
title: ${escapeYaml(title)}
date: ${date}
excerpt: ${escapeYaml(excerpt)}
readingTime: ${escapeYaml(readingTime)}
featured: ${featured}
---

Start writing here.
`;

  await writeMarkdownFile(filePath, contents);
}

async function createPhoto({ rootDir, title, slug, date, options, positionalArgs, rl }) {
  const imageArg = positionalArgs[0];
  let imagePath = options.image?.trim() || "";
  let sourceImagePath = imageArg;

  if (!sourceImagePath && rl) {
    sourceImagePath = await promptValue(rl, "Source image path");
  }

  if (sourceImagePath) {
    if (sourceImagePath.startsWith("/")) {
      imagePath = sourceImagePath;
    } else {
      const destinationFile = `${slug}.png`;
      const destinationPath = path.join(rootDir, "public", "images", "photos", destinationFile);
      await ensureDir(path.dirname(destinationPath));
      const sourceBuffer = await readFile(sourceImagePath);
      const optimized = await sharp(sourceBuffer)
        .png({ quality: 80, compressionLevel: 9, effort: 10 })
        .toBuffer();
      await writeFile(destinationPath, optimized);
      const saved = ((1 - optimized.length / sourceBuffer.length) * 100).toFixed(1);
      imagePath = `/images/photos/${destinationFile}`;
      console.log(`Compressed image to ${destinationPath} (${saved}% smaller)`);
    }
  }

  if (!imagePath) {
    imagePath = `/images/photos/${slug}.png`;
  }

  const alt =
    options.alt?.trim() ||
    (rl ? await promptValue(rl, "Alt text", `Describe ${title}.`) : `Describe ${title}.`);
  const caption =
    options.caption?.trim() ||
    (rl ? await promptValue(rl, "Caption", "Add a caption for this photo.") : "Add a caption for this photo.");
  const location =
    options.location?.trim() ||
    (rl ? await promptValue(rl, "Location (optional)", "", { required: false }) : "");
  const locationLine = location
    ? `location: ${escapeYaml(location)}\n`
    : "";
  const filePath = path.join(rootDir, "src", "content", "photos", `${slug}.md`);
  const contents = `---
title: ${escapeYaml(title)}
date: ${date}
image: ${escapeYaml(imagePath)}
alt: ${escapeYaml(alt)}
caption: ${escapeYaml(caption)}
${locationLine}---
`;

  await writeMarkdownFile(filePath, contents);
}

async function promptValue(rl, label, fallback = "", { required = true } = {}) {
  if (!rl) {
    return fallback;
  }

  while (true) {
    const suffix = fallback ? ` [${fallback}]` : "";
    const answer = (await rl.question(`${label}${suffix}: `)).trim();

    if (answer) {
      return answer;
    }

    if (fallback) {
      return fallback;
    }

    if (!required) {
      return "";
    }
  }
}
