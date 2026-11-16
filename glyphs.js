// Nivean numeral glyphs (base 13), redrawn as SVG from
// https://isowars.miraheze.org/wiki/File:Nivean_Numerals_(tridecimal).png
// Each glyph lives in a 40×40 box and uses currentColor.

const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const L = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const R = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;

const BODIES = [
  /* 0 */ L(8, 34, 32, 6),
  /* 1 */ C(20, 20, 13),
  /* 2 */ C(20, 20, 12) + L(6, 35, 34, 5),
  /* 3 */ C(20, 12, 7) + C(20, 27, 7),
  /* 4 */ L(5, 36, 35, 6) + L(5, 5, 26, 26) + C(20, 10, 5),
  /* 5 */ L(11, 4, 29, 4) + L(20, 4, 20, 37) + C(20, 24, 11),
  /* 6 */ C(12, 12, 7.5) + C(28, 12, 7.5) + C(12, 28, 7.5) + R(21, 21, 14, 14),
  /* 7 */ C(12, 12, 7.5) + C(28, 12, 7.5) + C(12, 28, 7.5) + R(21, 21, 14, 14) + L(3, 37, 36, 4),
  /* 8 */ C(20, 20, 13) + L(9, 9, 31, 31) + L(9, 31, 31, 9),
  /* 9 */ `<g stroke-width="3.2">${R(5, 5, 30, 30)}</g>` + R(12, 12, 16, 16),
  /* A */ C(22, 22, 12) + R(5, 5, 6, 6),
  /* B */ C(20, 20, 12) + R(5, 5, 6, 6) + R(29, 29, 6, 6),
  /* C */ C(20, 20, 12) + R(5, 5, 6, 6) + R(29, 5, 6, 6) + R(29, 29, 6, 6),
];

export const DIGITS = "0123456789ABC";
export const NAMES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

// On the page, mirroring for right-to-left writing is done in CSS (.g). `mirrored` bakes it
// into the SVG itself, for glyphs drawn outside the page (e.g. into a canvas).
export function glyphSVG(d, cls = "g", mirrored = false) {
  const body = mirrored ? `<g transform="matrix(-1 0 0 1 40 0)">${BODIES[d]}</g>` : BODIES[d];
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// Writing direction. Niveans write numbers right to left (most significant digit on the right)
// with mirror-image glyphs. "ltr" uses the wiki chart's glyph forms in European order.
let dir = "rtl";
export const glyphDir = () => dir;
export function setGlyphDir(d) {
  dir = d === "ltr" ? "ltr" : "rtl";
  document.documentElement.dataset.glyphDir = dir;
  document.dispatchEvent(new CustomEvent("glyphdir", { detail: dir }));
}

// Render a base-13 string ("-1A.3") as glyphs, in the current writing direction.
export function glyphString(s) {
  let out = "";
  let chars = [...s];
  if (dir === "rtl") chars = chars.reverse().map((c) => (c === "(" ? ")" : c === ")" ? "(" : c));
  for (const ch of chars) {
    const d = DIGITS.indexOf(ch.toUpperCase());
    if (d >= 0) out += glyphSVG(d);
    else if (ch === ".") out += `<span class="g-sep">.</span>`;
    else if (ch === "-") out += `<span class="g-sep">−</span>`;
    else if ("+−×÷()".includes(ch)) out += `<span class="g-op">${ch}</span>`;
  }
  return out;
}
