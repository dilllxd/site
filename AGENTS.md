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
- `--tags="personal, astro"`
- `--reading-time="4 min read"`
- `--alt="Accessible alt text"`
- `--caption="Photo caption"`
- `--location="South Carolina"`

## Agent Expectations

- After creating or editing content, run `npm run build`.
- Do not edit `dist/`.
- Keep content frontmatter valid for `src/content.config.ts`.
- For photos, prefer copying the source image into `public/images/photos/` through the scaffold command instead of referencing arbitrary local paths.
- For the lowest-friction photo workflow, prefer `npm run publish:photo`.
- For the lowest-friction posts workflow, prefer `npm run publish:post`.
