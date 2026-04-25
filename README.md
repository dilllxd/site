# Dylan's Website

Static Astro personal site built for GitHub Pages.

## Local Development

Install dependencies and start the dev server:

```powershell
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

For a production-style preview:

```powershell
npm run build
npm run preview
```

## Content Workflow

This site is file-based. Content lives in:

- `src/content/posts/*.md`
- `src/content/photos/*.md`
- `public/images/photos/*`

Scaffold new content with:

```powershell
npm run new:post -- "Title"
npm run new:photo -- "Title" "C:\path\to\image.png"
```

For the lowest-friction guided flow:

```powershell
npm run publish:post
npm run publish:photo
```

Optional flags:

- `--slug=my-custom-slug`
- `--date=2026-04-25`
- `--excerpt="Short summary"`
- `--reading-time="4 min read"`
- `--alt="Accessible alt text"`
- `--caption="Photo caption"`
- `--location="South Carolina"`

`publish:photo` will copy the source image into `public/images/photos/`, optimize it as a PNG, and create the matching frontmatter file in `src/content/photos/`.

## Deployment

The site builds to static output and is designed for GitHub Pages. Deploys run through the workflows in `.github/workflows/`.
