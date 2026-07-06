# Congress of Independent Unions — Website

Redesigned website for the Congress of Independent Unions (CIU), Alton, Illinois.
Est. 1958 — [ciu1958.org](https://www.ciu1958.org).

Dark blueprint/wireframe design: animated freight-yard hero with a crimson gantry
crane, a wireframe US network map, and the union's story, pillars, and contact info.
Plain HTML/CSS/JS — no build step, no framework.

## Structure

| Path | What it is |
| --- | --- |
| `index.html`, `css/`, `js/`, `assets/` | The site itself |
| `original-site-backup/` | Archive of the previous ciu1958.org site (see its README) |
| `serve.js` | Tiny Node static server for local preview only (not used in hosting) |

## Local preview

```
node serve.js
# → http://localhost:5580
```

## Hosting (GitHub Pages)

The site is static with fully relative paths, so it works from the repo root on
GitHub Pages (Settings → Pages → Deploy from branch → `main`, `/ (root)`).
`.nojekyll` is included so Pages serves files as-is.
