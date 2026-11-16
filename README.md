# Nivean Calculator

A small web calculator for the base-13 numbers and units of the **Niveans**, a species from the
[Iso Wars](https://isowars.miraheze.org/wiki/Niveans) universe.

**Live: https://blackkyiv.github.io/nivean-calc/**

Nivean numbers are written right to left (most significant digit on the right) with mirror-image
glyphs; the app does the same by default, with a switch for left-to-right chart forms.

- **Numbers**: decimal ⇄ base 13, drawn with Nivean numeral glyphs, with a place-value breakdown.
- **Calculator**: + − × ÷ and brackets, entered in base 13 (glyph keypad) or base 10, result in both.
- **Read image**: reads Nivean numerals from a photo, scan or screenshot (file, paste, drag-and-drop),
  entirely in the browser. Adaptive threshold → connected components → glyph grouping → thinning →
  chamfer matching against two template sets (the app's redrawn glyphs at three stroke widths, and the
  13 glyphs cut from the wiki's numeral chart, `templates-wiki.js`). Unsure reads are flagged and every
  digit can be corrected by tapping it; an area can be selected to ignore clutter.
- **Units**: length (procul, ampliprocul), time (Nivean day, aeta, Nivean year) and angle (pars,
  compass directions) to and from Earth units. Values can be typed in base 10 or 13.

Plain HTML/CSS/JS (ES modules), no build step and no dependencies.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

(ES modules don't load from `file://`, so use a local server.)

## Deploy

GitHub Pages serves the `main` branch root, so pushing to `main` publishes (about a minute).

## Assumptions

The wiki gives approximate values, so some are chosen here (editable in the app, under Units → Assumptions):

| Value | Default | Why |
|---|---|---|
| 1 procul | 9.9 m | "a bit less than 10 m"; 2197 procul "around 22 km" implies ~10.0 m |
| 1 Nivean day | 11 h | stated; the wiki's "aeta ≈ 91 Earth days" would imply 12 h |

Fan-made; Iso Wars and the Niveans belong to their creators.
