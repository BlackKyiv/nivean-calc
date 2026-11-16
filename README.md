# Nivean Calculator

A small web calculator for the base-13 numbers and units of the **Niveans**, a species from the
[Iso Wars](https://isowars.miraheze.org/wiki/Niveans) universe.

- **Numbers**: decimal ⇄ base 13, drawn with Nivean numeral glyphs, with a place-value breakdown.
- **Calculator**: + − × ÷ and brackets, entered in base 13 (glyph keypad) or base 10, result in both.
- **Units**: length (procul, ampliprocul), time (Nivean day, aeta, Nivean year) and angle (pars,
  compass directions) to and from Earth units. Values can be typed in base 10 or 13.

Plain HTML/CSS/JS (ES modules), no build step and no dependencies.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

(ES modules don't load from `file://`, so use a local server.)

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (the files sit at the repo root).
2. Repository → **Settings → Pages** → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/` after a minute.

Note: GitHub Pages on a free account needs a **public** repository.

## Assumptions

The wiki gives approximate values, so some are chosen here (editable in the app, under Units → Assumptions):

| Value | Default | Why |
|---|---|---|
| 1 procul | 9.9 m | "a bit less than 10 m"; 2197 procul "around 22 km" implies ~10.0 m |
| 1 Nivean day | 11 h | stated; the wiki's "aeta ≈ 91 Earth days" would imply 12 h |

Fan-made; Iso Wars and the Niveans belong to their creators.
