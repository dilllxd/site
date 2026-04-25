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
  schema: z.object({
    title: z.string(),
    date: z.date(),
    image: z.string(),
    alt: z.string(),
    caption: z.string(),
    location: z.string().optional(),
  }),
});

export const collections = { posts, photos };
