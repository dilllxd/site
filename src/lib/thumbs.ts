import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";

// Every file under public/images/photos is discovered here, so new photos need no code change. The originals stay in
// public/ untouched (the viewer and "full size" links use them); only these resized AVIF/WebP derivatives load in the grid.
const originals = import.meta.glob<{ default: ImageMetadata }>("/public/images/photos/*.{png,jpg,jpeg,webp}");

const WIDTHS = [240, 360, 480, 720, 960];

export type Thumb = { avif: string; webp: string; src: string; width: number; height: number };

const cache = new Map<string, Promise<Thumb | undefined>>();

/** Responsive thumbnails for a content entry's `image` field (e.g. "/images/photos/m65.png"). Undefined when it is not a local photo. */
export function getThumb(image: string): Promise<Thumb | undefined> {
  let pending = cache.get(image);
  if (!pending) {
    const load = originals["/public" + image];
    pending = load
      ? load().then(async (m) => {
          const src = m.default;
          const widths = WIDTHS.filter((w) => w < src.width);
          if (!widths.length || widths[widths.length - 1] < Math.min(src.width, WIDTHS[WIDTHS.length - 1])) widths.push(Math.min(src.width, WIDTHS[WIDTHS.length - 1]));
          const [avif, webp] = await Promise.all(
            (["avif", "webp"] as const).map((format) => getImage({ src, widths, format, width: widths[widths.length - 1] })),
          );
          return { avif: avif.srcSet.attribute, webp: webp.srcSet.attribute, src: webp.src, width: src.width, height: src.height };
        })
      : Promise.resolve(undefined);
    cache.set(image, pending);
  }
  return pending;
}
