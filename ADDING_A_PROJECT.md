# Adding a project

Four steps. Should take about fifteen minutes once you have your images.

---

## 1. Drop your media into `assets/raw/`

Put whatever you have in there — photos, renders, FEA screenshots, `.stl` files, and an
`.mp4` if you have a motion study. Any file format Pillow can open works.

Name the files sensibly, because the filename becomes the web filename. `heat-exchanger-cad.png`
becomes `assets/img/heat-exchanger-cad.webp`. Spaces become dashes and everything is
lowercased.

## 2. Run the asset build

```bash
python tools/build_assets.py
```

That converts every image to WebP at two sizes — a full-size one capped at 1600 px and a
`-thumb` version at 480 px — copies your STLs into `assets/models/`, and copies any video
into `assets/video/`. It prints a size report at the end so you can see what you added.

You need Pillow once: `pip install pillow`.

> The script also rebuilds the capstone images from the original PowerPoint decks and the
> `Documents/CP` folder. If those aren't on the machine it just prints them as missing and
> carries on — your new files still get built.

## 3. Copy the page template

```bash
cp projects/_TEMPLATE.html projects/heat-exchanger.html
```

Open it and work through the `REPLACE` comments. Delete any section you don't need — the
requirements table, the 3D viewer, and the gallery are all optional.

Two things not to skip:

- **Alt text on every image.** It's how the page reads to a screen reader and to Google.
- **The "honest part" callout at the bottom.** What fell short and what you'd change. It
  is the single most credible thing on a project page, and hiring engineers notice when
  it's missing.

## 4. Add one entry to `data/projects.js`

```js
{
  slug: 'heat-exchanger',
  title: 'Shell-and-Tube Heat Exchanger',
  kicker: 'Coursework · MEEG 3013',
  year: '2026',
  tags: ['MATLAB', 'Thermal', 'CFD'],
  summary: 'One or two sentences in plain language. Lead with the result.',
  metrics: [
    { value: '94', unit: '% efficiency' },
    { value: '2.1', unit: 'kW recovered' },
  ],
  cover: 'assets/img/heat-exchanger-cad.webp',
  alt: 'Cutaway render of the shell-and-tube heat exchanger',
  href: 'projects/heat-exchanger.html',
  featured: false,
},
```

That's it. The card appears on the home page, the tag filter picks up any new tags
automatically, and the prev/next links at the foot of every case study re-thread
themselves. You do not need to touch `index.html`.

Set `featured: true` to put it in the wide hero card slot. Only one project should have it.

---

## Checking your work

```bash
python -m http.server 8080
```

Then open <http://localhost:8080/>. Things worth a look before you push:

- The new card shows up, and its image isn't stretched
- The page reads correctly at phone width
- Both light and dark themes look right (the toggle is top-right)
- The browser console is clean

## Publishing

```bash
git add -A && git commit -m "Add heat exchanger project" && git push
```

GitHub Pages redeploys in about a minute.

---

## Notes

**Ordering.** Cards sort featured-first, then in the order they appear in the array. Move
an object up or down to reorder.

**Images that are mostly text** — BOM tables, drawing sheets — need to stay legible, so
give them a full-width `figure` rather than dropping them in the gallery grid.

**STL files** need to be small. Anything over about 500 KB will make the page crawl on a
phone. Export from SolidWorks at coarse resolution; the viewer only needs the silhouette
to read correctly, not a manufacturing-grade mesh.

**Video** is optional and lazy-loaded. Drop an `.mp4` in `assets/raw/`, run the build, and
reference it with a normal `<video controls preload="none" poster="...">` tag. Keep it
under about 10 MB.
