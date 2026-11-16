// Visual parser: finds Nivean numerals in an image and reads them.
// Pipeline: grayscale → adaptive threshold → connected components → group parts
// into glyphs → lines → normalise + thin each glyph → chamfer-match against templates.
// No dependencies; everything runs on ImageData in the browser.

import { glyphSVG } from "./glyphs.js";
import { WIKI_TEMPLATES } from "./templates-wiki.js";

export const N = 40; // normalised glyph size (N×N)
const MAX_SIDE = 1400; // images are downscaled to this for speed

/* ---------- image → binary ---------- */

export function imageToGray(img, crop) {
  const sx = crop ? crop.x : 0, sy = crop ? crop.y : 0;
  const sw = crop ? crop.w : img.naturalWidth || img.width;
  const sh = crop ? crop.h : img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; // transparent PNGs: treat as white paper
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  return { w, h, g, scale, ox: sx, oy: sy };
}

// Adaptive threshold (local mean via integral image). ink: "auto" | "dark" | "light".
export function binarize({ w, h, g }, ink = "auto") {
  let sum = 0;
  for (let i = 0; i < g.length; i++) sum += g[i];
  const dark = ink === "dark" || (ink === "auto" && sum / g.length >= 110);
  const v = dark ? g : g.map((x) => 255 - x);
  const W = w + 1;
  const ii = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += v[y * w + x];
      ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 12));
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const mean = (ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0]) / ((y1 - y0) * (x1 - x0));
      const p = v[y * w + x];
      m[y * w + x] = mean - p > Math.max(18, mean * 0.14) ? 1 : 0;
    }
  }
  return { mask: m, dark };
}

/* ---------- components ---------- */

function components(mask, w, h) {
  const lab = new Int32Array(w * h);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || lab[start]) continue;
    const id = comps.length + 1;
    let sp = 0, area = 0;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    stack[sp++] = start;
    lab[start] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; }
        }
      }
    }
    comps.push({ id, x0, y0, x1, y1, area });
  }
  return { lab, comps };
}

const contains = (a, b) => a.x0 <= b.x0 && a.y0 <= b.y0 && a.x1 >= b.x1 && a.y1 >= b.y1;
const gapX = (a, b) => Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) - 1);
const gapY = (a, b) => Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1) - 1);
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

// Merge parts of the same glyph (union-find on bounding-box proximity).
function groupParts(comps, tol) {
  const parent = comps.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < comps.length; i++)
    for (let j = i + 1; j < comps.length; j++)
      if (gapX(comps[i], comps[j]) <= tol && gapY(comps[i], comps[j]) <= tol) parent[find(i)] = find(j);
  const groups = new Map();
  comps.forEach((c, i) => {
    const r = find(i);
    const g = groups.get(r) || { parts: [], x0: Infinity, y0: Infinity, x1: -1, y1: -1, area: 0 };
    g.parts.push(c);
    g.x0 = Math.min(g.x0, c.x0); g.y0 = Math.min(g.y0, c.y0);
    g.x1 = Math.max(g.x1, c.x1); g.y1 = Math.max(g.y1, c.y1);
    g.area += c.area;
    groups.set(r, g);
  });
  return [...groups.values()];
}

// Second pass: join nearby pieces of one glyph (the circles and square of a 6, a 3 drawn as two
// circles), closest pairs first. A merge must still look like a single glyph, so two glyphs
// written close together (or a glyph next to a logo) stay apart. Specks join only when touching.
function mergeShapes(groups) {
  const H = (g) => g.y1 - g.y0 + 1, Wd = (g) => g.x1 - g.x0 + 1;
  const pairs = [];
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j];
      const big = Math.max(H(a), H(b), Wd(a), Wd(b));
      const tiny = (g) => Wd(g) < 0.3 * big && H(g) < 0.3 * big;
      const gap = Math.max(gapX(a, b), gapY(a, b));
      if (gap <= (tiny(a) || tiny(b) ? Math.max(1, 0.04 * big) : 0.15 * big)) pairs.push([gap, i, j]);
    }
  pairs.sort((p, q) => p[0] - q[0]);
  const parent = groups.map((_, i) => i);
  const bb = groups.map((g) => ({ x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1 }));
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [, i, j] of pairs) {
    const ra = find(i), rb = find(j);
    if (ra === rb) continue;
    const a = bb[ra], b = bb[rb];
    const m = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
    if (Wd(m) > 1.3 * H(m)) continue;
    parent[ra] = rb;
    bb[rb] = m;
  }
  const out = new Map();
  groups.forEach((g, i) => {
    const r = find(i);
    const o = out.get(r) || { parts: [], x0: Infinity, y0: Infinity, x1: -1, y1: -1, area: 0 };
    o.parts.push(...g.parts);
    o.x0 = Math.min(o.x0, g.x0); o.y0 = Math.min(o.y0, g.y0);
    o.x1 = Math.max(o.x1, g.x1); o.y1 = Math.max(o.y1, g.y1);
    o.area += g.area;
    out.set(r, o);
  });
  return [...out.values()];
}

/* ---------- normalise / thin / match ---------- */

// Crop a glyph's own pixels, fit into N×N keeping aspect ratio (max-pooling when shrinking).
function normalise(lab, w, g) {
  const ids = new Set(g.parts.map((p) => p.id));
  const bw = g.x1 - g.x0 + 1, bh = g.y1 - g.y0 + 1;
  const inner = N - 4;
  const s = inner / Math.max(bw, bh);
  const tw = Math.max(1, Math.round(bw * s)), th = Math.max(1, Math.round(bh * s));
  const ox = (N - tw) >> 1, oy = (N - th) >> 1;
  const out = new Uint8Array(N * N);
  for (let ty = 0; ty < th; ty++) {
    const sy0 = g.y0 + Math.floor(ty / s), sy1 = Math.max(sy0 + 1, g.y0 + Math.floor((ty + 1) / s));
    for (let tx = 0; tx < tw; tx++) {
      const sx0 = g.x0 + Math.floor(tx / s), sx1 = Math.max(sx0 + 1, g.x0 + Math.floor((tx + 1) / s));
      let hit = 0;
      for (let y = sy0; y < sy1 && !hit; y++) for (let x = sx0; x < sx1; x++) if (ids.has(lab[y * w + x])) { hit = 1; break; }
      out[(oy + ty) * N + ox + tx] = hit;
    }
  }
  return out;
}

// Zhang–Suen thinning → 1-px skeleton, so stroke width doesn't matter.
function thin(src) {
  const m = src.slice();
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : m[y * N + x]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const del = [];
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          if (!m[y * N + x]) continue;
          const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const b = p.reduce((a, c) => a + c, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
          if (a !== 1) continue;
          if (pass === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          del.push(y * N + x);
        }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
  return m;
}

// Chamfer (3-4) distance transform, in pixels.
function distance(m) {
  const INF = 1e6, d = new Float32Array(N * N);
  for (let i = 0; i < d.length; i++) d[i] = m[i] ? 0 : INF;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = d[y * N + x];
      if (x > 0) v = Math.min(v, d[y * N + x - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[(y - 1) * N + x] + 3);
        if (x > 0) v = Math.min(v, d[(y - 1) * N + x - 1] + 4);
        if (x < N - 1) v = Math.min(v, d[(y - 1) * N + x + 1] + 4);
      }
      d[y * N + x] = v;
    }
  for (let y = N - 1; y >= 0; y--)
    for (let x = N - 1; x >= 0; x--) {
      let v = d[y * N + x];
      if (x < N - 1) v = Math.min(v, d[y * N + x + 1] + 3);
      if (y < N - 1) {
        v = Math.min(v, d[(y + 1) * N + x] + 3);
        if (x < N - 1) v = Math.min(v, d[(y + 1) * N + x + 1] + 4);
        if (x > 0) v = Math.min(v, d[(y + 1) * N + x - 1] + 4);
      }
      d[y * N + x] = v;
    }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

function prep(mask) {
  const sk = thin(mask);
  const pts = [];
  for (let i = 0; i < sk.length; i++) if (sk[i]) pts.push(i);
  return { sk, pts, dt: distance(sk) };
}

// Symmetric chamfer distance plus a penalty for strokes with no counterpart at all
// (a missing slash or corner square is small on average but decisive).
// above these a mark is not taken for a digit (logos, letters); calibrated on synthetic tests
const REJECT_SHAPE = 2.9, REJECT_SCORE = 4.0;
const MIN_H = 10; // px (after downscaling): smaller marks are noise
const CAP = 8, MISS = 2.5, MISS_W = 6;
function oneWay(pts, dt) {
  if (!pts.length) return { sq: CAP * CAP, miss: 1 };
  let s = 0, miss = 0;
  for (const i of pts) { const v = Math.min(CAP, dt[i]); s += v * v; if (v > MISS) miss++; }
  return { sq: s / pts.length, miss: miss / pts.length };
}
const dist = (a, b) => {
  const x = oneWay(a.pts, b.dt), y = oneWay(b.pts, a.dt);
  const shape = Math.sqrt((x.sq + y.sq) / 2);
  return { score: shape + MISS_W * Math.max(x.miss, y.miss), shape };
};

/* ---------- templates ---------- */

let TEMPLATES = null;

function unpack(hex) {
  const m = new Uint8Array(N * N);
  for (let i = 0; i < m.length; i++) m[i] = (parseInt(hex[i >> 2], 16) >> (3 - (i & 3))) & 1;
  return m;
}
export function pack(m) {
  let s = "";
  for (let i = 0; i < m.length; i += 4) s += ((m[i] << 3) | (m[i + 1] << 2) | (m[i + 2] << 1) | m[i + 3]).toString(16);
  return s;
}

async function svgTemplate(d, stroke) {
  const svg = glyphSVG(d)
    .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" ')
    .replace(/currentColor/g, "#000")
    .replace('stroke-width="2.2"', `stroke-width="${stroke}"`);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const gray = imageToGray(img);
  const { mask } = binarize(gray, "dark");
  const { lab, comps } = components(mask, gray.w, gray.h);
  const all = groupParts(comps, Infinity)[0];
  return normalise(lab, gray.w, all);
}

export async function loadTemplates() {
  if (TEMPLATES) return TEMPLATES;
  const list = [];
  const add = (d, src, m) => {
    list.push({ d, src, ...prep(m) });
    list.push({ d, src: src + "-mirrored", mirrored: true, ...prep(mirror(m)) }); // right-to-left texts mirror glyphs
  };
  // thin and thick renderings: very bold strokes fill small holes, which changes the skeleton
  for (let d = 0; d < 13; d++) for (const sw of [2.2, 4, 5.5]) add(d, "svg" + sw, await svgTemplate(d, sw));
  WIKI_TEMPLATES.forEach((hex, d) => hex && add(d, "wiki", unpack(hex)));
  TEMPLATES = list;
  return list;
}

function mirror(m) {
  const o = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) o[y * N + x] = m[y * N + N - 1 - x];
  return o;
}

function classify(norm) {
  const g = prep(norm);
  const best = new Map();
  for (const t of TEMPLATES) {
    const r = dist(g, t);
    if (!best.has(t.d) || r.score < best.get(t.d).score) best.set(t.d, { ...r, mirrored: !!t.mirrored });
  }
  return [...best.entries()].map(([d, r]) => ({ d, ...r })).sort((a, b) => a.score - b.score);
}

/* ---------- main ---------- */

// Returns { lines: [{ glyphs: [...] }], mask, w, h, scale, ox, oy, dark }.
// Glyphs are in visual order, left to right.
// A glyph is { kind: "digit" | "point" | "minus", box, norm, candidates, unsure, reject }
// (reject = looks like no Nivean digit, e.g. part of a logo; kept so the user can include it).
export function parseImage(img, { crop = null, ink = "auto" } = {}) {
  if (!TEMPLATES) throw new Error("templates not loaded");
  const gray = imageToGray(img, crop);
  const { w, h } = gray;
  const { mask, dark } = binarize(gray, ink);
  let { lab, comps } = components(mask, w, h);

  const minArea = Math.max(6, (w * h) / 60000);
  comps = comps.filter((c) => c.area >= minArea);
  // drop frames/grids: big sparse components that enclose several others (e.g. a table)
  comps = comps.filter((c) => {
    const fill = c.area / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1));
    const inside = comps.filter((o) => o !== c && contains(c, o)).length;
    return !(fill < 0.12 && inside >= 3);
  });

  let groups = mergeShapes(groupParts(comps, 1));

  // lines: cluster by vertical overlap with each line's first member (its band does not grow,
  // so a tall logo can't chain several lines together), top to bottom
  groups.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const lines = [];
  for (const g of groups) {
    const gh = g.y1 - g.y0 + 1;
    const line = lines.find((l) => {
      const ov = Math.min(l.y1, g.y1) - Math.max(l.y0, g.y0);
      return ov > 0.4 * Math.min(gh, l.y1 - l.y0 + 1) && Math.abs(g.y0 + g.y1 - l.y0 - l.y1) / 2 < 0.6 * (l.y1 - l.y0 + 1);
    });
    if (line) line.items.push(g);
    else lines.push({ items: [g], y0: g.y0, y1: g.y1 });
  }
  // tiny marks (points) may sit just below a line: attach them to the nearest line above
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    const big = Math.max(...l.items.map((g) => g.y1 - g.y0 + 1));
    const above = lines.find((o) => o !== l && o.y1 >= l.y0 - big * 2 && o.y0 < l.y0);
    if (above && l.items.every((g) => g.y1 - g.y0 + 1 < (above.y1 - above.y0) * 0.3)) {
      above.items.push(...l.items);
      lines.splice(i, 1);
    }
  }

  let out = [];
  for (const l of lines) {
    const lh = median(l.items.map((g) => g.y1 - g.y0 + 1).filter((v, _, a) => v >= Math.max(...a) * 0.5));
    const items = l.items.sort((a, b) => a.x0 - b.x0);
    const glyphs = [];
    for (const g of items) {
      const gw = g.x1 - g.x0 + 1, gh = g.y1 - g.y0 + 1;
      const box = { x: g.x0, y: g.y0, w: gw, h: gh, lh };
      if (gw < lh * 0.3 && gh < lh * 0.3) {
        // a dot: radix point if it sits in the lower half, else ignore as noise
        if (g.y0 > l.y0 + (l.y1 - l.y0) * 0.35) glyphs.push({ kind: "point", box });
        continue;
      }
      if (gh < lh * 0.3 && gw > gh * 2.5) { glyphs.push({ kind: "minus", box }); continue; }
      if (gh < lh * 0.4 && gw < lh * 0.4) continue; // too small to be a digit
      const norm = normalise(lab, w, g);
      const candidates = classify(norm);
      const [a, b] = candidates;
      const reject = a.shape > REJECT_SHAPE || a.score > REJECT_SCORE;
      const unsure = !reject && (a.score > 3.0 || b.score - a.score < 0.5);
      glyphs.push({ kind: "digit", box, norm, candidates, unsure, reject });
    }
    const good = (x) => x && x.kind === "digit" && !x.reject;
    const digits = glyphs.filter(good);
    // a point must sit between two digits; a minus at either end of the number
    const kept = glyphs.filter((x, i) => {
      if (x.kind === "point") return glyphs.slice(0, i).some(good) && glyphs.slice(i + 1).some(good);
      if (x.kind === "minus") return !glyphs.slice(0, i).some(good) || !glyphs.slice(i + 1).some(good);
      return true;
    });
    if (lh < MIN_H) continue;
    // split the line into separate numbers at gaps that are wide both absolutely and
    // compared with the usual spacing on this line
    const gaps = kept.slice(1).map((x, i) => x.box.x - (kept[i].box.x + kept[i].box.w));
    const usual = median(gaps);
    const runs = [[]];
    kept.forEach((x, i) => {
      if (i && gaps[i - 1] > 1.4 * lh && gaps[i - 1] > 3 * usual) runs.push([]);
      runs.at(-1).push(x);
    });
    for (const run of runs) {
      const ds = run.filter(good);
      // a run where nothing looks like a Nivean digit is probably ordinary text: skip it
      if (ds.length && median(ds.map((x) => x.candidates[0].shape)) <= 2.4) out.push({ glyphs: run, sure: ds.some((x) => !x.unsure) });
    }
  }
  // stray marks: drop numbers made only of unsure guesses when the picture has a confident one
  if (out.some((r) => r.sure)) out = out.filter((r) => r.sure);
  return { lines: out, mask, w, h, scale: gray.scale, ox: gray.ox, oy: gray.oy, dark };
}

// Normalised N×N glyphs of every digit-sized group, for building templates (dev use).
export function extractNorms(img, opts) {
  return parseImage(img, opts).lines.map((l) => l.glyphs.filter((g) => g.kind === "digit").map((g) => pack(g.norm)));
}
