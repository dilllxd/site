# Agent Notes

This repo is a static Astro personal site. Content is file-based.

## Content Locations

- Posts: `src/content/posts/*.md`
- Photos metadata: `src/content/photos/*.md`
- Photo image files: `public/images/photos/*`

## Preferred Content Workflow

Use the scaffold commands before hand-writing new entries:

- `npm run new:post -- "Title"`
- `npm run new:photo -- "Title" "C:\path\to\image.png"`
- `npm run publish:post`
- `npm run publish:photo`

Useful optional flags:

- `--slug=my-custom-slug`
- `--date=2026-04-25`
- `--excerpt="Short summary"`
- `--reading-time="4 min read"`
- `--alt="Accessible alt text"`
- `--caption="Photo caption"`
- `--location="South Carolina"`
- `--ra=97.98 --dec=4.94` (J2000 decimal degrees of the frame centre; RA 0 to <360, which is hours x 15; Dec -90 to 90)

## Photo sky coordinates

Every photo needs `ra` and `dec` frontmatter (J2000/ICRS, decimal degrees) to appear on the /photos sky globe. Without them the photo is still listed and viewable, just not plotted. Get coordinates from SIMBAD (simbad.cds.unistra.fr) for the object centre. Nothing else is needed: markers, overlap grouping, and the list are all built from the collection. Targets closer than 1.5 degrees share one region marker and keep their own true coordinates.

## Agent Expectations

- After creating or editing content, run `npm run build`.
- Do not edit `dist/`.
- Keep content frontmatter valid for `src/content.config.ts`.
- For photos, the scaffold command compresses PNGs automatically with `sharp`. Prefer using `npm run publish:photo` or `npm run new:photo` instead of manually copying files.
- For the lowest-friction photo workflow, prefer `npm run publish:photo`.
- For the lowest-friction posts workflow, prefer `npm run publish:post`.
- To re-compress existing photos, run `node scripts/compress-images.mjs`.
