import { getCollection } from "astro:content";
import { siteConfig } from "../data/site";

export const prerender = true;

function formatUrl(path: string, lastmod?: string) {
  return [
    "<url>",
    `  <loc>${new URL(path, siteConfig.siteUrl).toString()}</loc>`,
    lastmod ? `  <lastmod>${lastmod}</lastmod>` : "",
    "</url>",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function GET() {
  const photos = await getCollection("photos");

  const staticUrls = [
    formatUrl("/"),
    formatUrl("/photos/"),
  ];

  const photoUrls = photos.map((photo) =>
    formatUrl(`/photos/${photo.id}/`, photo.data.date.toISOString()),
  );

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticUrls,
    ...photoUrls,
    "</urlset>",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
