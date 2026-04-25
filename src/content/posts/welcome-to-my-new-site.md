---
title: Welcome to My New Site
date: 2025-12-29
excerpt: A fresh personal site built with Astro, living on GitHub Pages, and packed with live widgets and a smooth content workflow.
readingTime: 4 min read
featured: true
---

This site has been through a few iterations. What started as a vague idea of "I want a personal website" turned into a full rebuild — and honestly, most of it was written by AI (shoutout to the [pi coding agent](https://github.com/mariozechner/pi-coding-agent) specifically). The result is an Astro-powered site living on GitHub Pages, with just enough custom plumbing to make it feel like mine.

## What's Actually Running Here

- **Astro** for static site generation
- **GitHub Pages** for hosting (free, simple, works)
- **Custom APIs** for work schedule and activity data
- **Lanyard** for live Discord and Spotify presence
- **A handful of npm scripts** that scaffold new content so I don't have to copy-paste frontmatter

No servers in a closet this time. Just a repo, a build step, and GitHub doing the hosting.

## The Stack

### Content Workflow

I have a set of scaffold commands that do the boring stuff for me:

```bash
npm run new:note -- "Random thought"
npm run new:post -- "Something longer"
npm run new:photo -- "Title" "/path/to/image.png"
```

Then `npm run publish:note`, `npm run publish:post`, or `npm run publish:photo` to finalize. It beats manually creating markdown files with the right frontmatter every time.

Photos get copied into `public/images/photos/`, metadata lives in `src/content/photos/`, and everything is file-based. Notes and posts work the same way — content is just markdown in a folder.

### Live Widgets

The homepage has a few live data sources:

- **Discord status** — pulled from Lanyard, shows whether I'm online and what I'm up to
- **Spotify** — also via Lanyard, shows the current track when I'm listening to something
- **Work schedule** — hits a custom API to figure out if I'm at work, off for the day, or clocking in soon

These update in real time (or close enough to it) without me touching the site.

### Photo Viewer

Click any photo and you get a lightbox-style viewer with zoom controls, panning, and a full-size link. It works on desktop; on mobile it gracefully falls back to the normal photo page. The whole thing is built into the site — no external libraries for the viewer.

### Dark / Light Theme

There's a theme toggle in the header. It respects your system preference by default, but you can override it. The color scheme is intentionally low-contrast and easy on the eyes in both modes.

## Why This Setup?

It's low-maintenance. I write content, run a publish command, push to GitHub, and the site rebuilds. The live widgets mean the homepage doesn't go stale. The photo viewer means I can actually show off images without sending people to external hosts.

And since it's all file-based, there's no database to manage, no CMS to log into, and no platform deciding what my feed should look like.

## Wrapping Up

Real posts will show up eventually — probably a mix of project write-ups, astrophotography logs, and whatever else feels worth documenting.

If you're reading this, thanks for stopping by. Feel free to poke around the site.

*Like this post? Let me know!*
