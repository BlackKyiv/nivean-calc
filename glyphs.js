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
  /* 4 */ L(6, 36, 34, 6) + L(8, 6, 33, 35) + C(22, 9, 5),
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

export function glyphSVG(d, cls = "g") {
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${BODIES[d]}</svg>`;
}

// Render a base-13 string ("-1A.3") as glyphs.
export function glyphString(s) {
  let out = "";
  for (const ch of s) {
    const d = DIGITS.indexOf(ch.toUpperCase());
    if (d >= 0) out += glyphSVG(d);
    else if (ch === ".") out += `<span class="g-sep">.</span>`;
    else if (ch === "-") out += `<span class="g-sep">−</span>`;
    else if ("+−×÷()".includes(ch)) out += `<span class="g-op">${ch}</span>`;
  }
  return out;
}
