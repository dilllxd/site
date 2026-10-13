import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    excerpt: z.string(),
    readingTime: z.string(),
    featured: z.boolean().default(false),
  }),
});

const photos = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/photos" }),
  schema: z
    .object({
      title: z.string(),
      date: z.date(),
      image: z.string(),
      alt: z.string(),
      caption: z.string(),
      location: z.string().optional(),
      // Equatorial J2000 (ICRS) coordinates of the frame centre, in decimal degrees.
      // ra: right ascension, 0 <= ra < 360 (hours x 15). dec: declination, -90..90 (south negative).
      ra: z.number().min(0).lt(360).optional(),
      dec: z.number().min(-90).max(90).optional(),
    })
    .refine((d) => (d.ra === undefined) === (d.dec === undefined), {
      message: "ra and dec must be given together (decimal degrees, J2000)",
      path: ["ra"],
    }),
});

export const collections = { posts, photos };
