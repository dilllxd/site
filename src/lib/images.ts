import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const cache = new Map<string, Promise<[number, number] | undefined>>();

/** Width/height of a local image under public/. Undefined for external URLs or missing files. */
export function getImageSize(src: string): Promise<[number, number] | undefined> {
  if (!src.startsWith("/") || src.startsWith("//")) return Promise.resolve(undefined);
  let pending = cache.get(src);
  if (!pending) {
    const file = path.join(process.cwd(), "public", decodeURIComponent(src.split(/[?#]/)[0]));
    pending = existsSync(file)
      ? sharp(file)
          .metadata()
          .then((m) => (m.width && m.height ? ([m.width, m.height] as [number, number]) : undefined))
          .catch(() => undefined)
      : Promise.resolve(undefined);
    cache.set(src, pending);
  }
  return pending;
}

/** Map of collection entry id to [width, height], read at build time from each entry's `image`. */
export async function photoDims(
  photos: { id: string; data: { image: string } }[],
): Promise<Record<string, [number, number] | undefined>> {
  const sizes = await Promise.all(photos.map((p) => getImageSize(p.data.image)));
  return Object.fromEntries(photos.map((p, i) => [p.id, sizes[i]]));
}
