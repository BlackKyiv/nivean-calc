import { DIGITS, NAMES, glyphSVG, glyphString, glyphDir, setGlyphDir } from "./glyphs.js";
import { parseBase, fmtBase, fmtShow, group10 } from "./numbers.js";
import { initRead } from "./read.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const store = {
  get(k, d) { try { const v = localStorage.getItem("nivean:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("nivean:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

/* ---------- tabs ---------- */

function showTab(name) {
  if (!$("#tab-" + name)) name = "numbers";
  $$(".tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  $$(".panel").forEach((p) => (p.hidden = p.id !== "tab-" + name));
  store.set("tab", name);
  if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
}
$$(".tabs [role=tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

$(".logo").innerHTML = glyphSVG(12);

/* ---------- writing direction ---------- */

const dirBtn = $("#dir-toggle");
function showDir() {
  const rtl = glyphDir() === "rtl";
  dirBtn.innerHTML = rtl
    ? '<span aria-hidden="true">⇠</span> <span class="long">Right to left</span><span class="short">RTL</span>'
    : '<span class="long">Left to right</span><span class="short">LTR</span> <span aria-hidden="true">⇢</span>';
  dirBtn.setAttribute("aria-label", "Glyph writing direction: " + (rtl ? "right to left" : "left to right"));
  dirBtn.title = "Order of Nivean glyphs (base-13 text stays left to right). Tap to switch.";
}
dirBtn.addEventListener("click", () => {
  setGlyphDir(glyphDir() === "rtl" ? "ltr" : "rtl");
  store.set("glyphDir", glyphDir());
});
document.addEventListener("glyphdir", () => {
  showDir();
  fromTri();
  calcRender();
  unitRender();
});

/* ---------- numbers tab ---------- */

const decIn = $("#num-dec");
const triIn = $("#num-tri");
const numErr = $("#num-err");

function renderNumber(v, triText) {
  $("#num-glyphs").innerHTML = Number.isFinite(v) ? glyphString(triText) : "";
  const bd = $("#num-breakdown");
  bd.innerHTML = "";
  if (!Number.isFinite(v)) return;
  const t = triText.replace("-", "");
  const [ip, fp = ""] = t.split(".");
  if (ip.length + fp.length > 14) return;
  const rows = [];
  [...ip].forEach((ch, i) => rows.push([ch, ip.length - 1 - i]));
  [...fp].forEach((ch, i) => rows.push([ch, -(i + 1)]));
  bd.innerHTML = rows
    .map(([ch, p]) => {
      const d = DIGITS.indexOf(ch);
      const place = 13 ** p;
      const placeTxt = p >= 0 ? group10(String(place)) : `1/${group10(String(13 ** -p))}`;
      return `<div class="bd-row${d === 0 ? " zero" : ""}"><dt>${glyphSVG(d)}<span>${ch}</span></dt>
        <dd>${NAMES[d]} × 13<sup>${p}</sup> <span class="muted">(${placeTxt})</span> = <b>${group10(fmtShow(d * place, 10, 8))}</b></dd></div>`;
    })
    .join("");
}

function fromDec() {
  const v = parseBase(decIn.value, 10);
  const bad = decIn.value.trim() !== "" && Number.isNaN(v);
  numErr.hidden = !bad;
  numErr.textContent = bad ? "Not a decimal number." : "";
  if (Number.isNaN(v)) { triIn.value = ""; renderNumber(NaN); return; }
  const r = fmtBase(v, 13, 8);
  triIn.value = r.text;
  renderNumber(v, r.text);
}
function fromTri() {
  const v = parseBase(triIn.value, 13);
  const bad = triIn.value.trim() !== "" && Number.isNaN(v);
  numErr.hidden = !bad;
  numErr.textContent = bad ? "Base 13 uses only 0–9, A, B, C (and one point)." : "";
  if (Number.isNaN(v)) { decIn.value = ""; renderNumber(NaN); return; }
  decIn.value = fmtBase(v, 10, 10).text;
  renderNumber(v, triIn.value.trim().toUpperCase().replace(/^\+/, ""));
}
decIn.addEventListener("input", fromDec);
triIn.addEventListener("input", fromTri);

// mini keypad that types into the base-13 field
{
  const pad = $("#num-pad");
  const keys = [...DIGITS].map((ch, d) => ({ k: ch, html: glyphSVG(d) + `<small>${ch}</small>`, label: NAMES[d] }));
  keys.push({ k: ".", html: "<b>.</b>", label: "point" }, { k: "-", html: "<b>±</b>", label: "sign" }, { k: "bs", html: "<b>⌫</b>", label: "delete" });
  pad.innerHTML = keys.map((x) => `<button data-k="${x.k}" aria-label="${x.label}">${x.html}</button>`).join("");
  pad.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const k = b.dataset.k;
    let s = triIn.value.trim();
    if (k === "bs") s = s.slice(0, -1);
    else if (k === "-") s = s.startsWith("-") ? s.slice(1) : "-" + s;
    else if (k === ".") { if (!s.includes(".")) s += s === "" || s === "-" ? "0." : "."; }
    else s = s === "0" ? k : s === "-0" ? "-" + k : s + k;
    triIn.value = s;
    fromTri();
  });
}

$("#digit-table").innerHTML = [...DIGITS]
  .map((ch, d) => `<div class="dt-cell">${glyphSVG(d)}<b>${ch}</b><span>${NAMES[d]}</span></div>`)
  .join("");

/* ---------- calculator ---------- */

const calc = { expr: "", mode: store.get("calcMode", 13), last: null, justEvaluated: false };
const OPS = "+−×÷";

function tokenize(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (DIGITS.includes(ch) || ch === ".") {
      let j = i;
      while (j < s.length && (DIGITS.includes(s[j]) || s[j] === ".")) j++;
      toks.push({ t: "num", v: s.slice(i, j) });
      i = j;
    } else { toks.push({ t: ch }); i++; }
  }
  return toks;
}

function evaluate(s, base) {
  const toks = tokenize(s);
  let p = 0;
  const peek = () => toks[p]?.t;
  const expr = () => {
    let v = term();
    while (peek() === "+" || peek() === "−") { const op = toks[p++].t; const r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  const term = () => {
    let v = factor();
    while (peek() === "×" || peek() === "÷") { const op = toks[p++].t; const r = factor(); v = op === "×" ? v * r : v / r; }
    return v;
  };
  const factor = () => {
    const t = peek();
    if (t === "−") { p++; return -factor(); }
    if (t === "+") { p++; return factor(); }
    if (t === "(") { p++; const v = expr(); if (peek() !== ")") throw 0; p++; return v; }
    if (t === "num") { const v = parseBase(toks[p++].v, base); if (Number.isNaN(v)) throw 0; return v; }
    throw 0;
  };
  const v = expr();
  if (p !== toks.length) throw 0;
  return v;
}

function calcRender() {
  const e = calc.expr;
  $("#calc-expr").textContent = e || "0";
  $("#calc-expr-glyphs").innerHTML = calc.mode === 13 ? glyphString(e) : "";
  let v = null;
  if (e) {
    // close open brackets for the live preview
    const open = (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length;
    try { v = evaluate(e + ")".repeat(Math.max(0, open)), calc.mode); } catch { v = null; }
  } else v = 0;
  if (v !== null) calc.last = v;
  const shown = v ?? calc.last ?? 0;
  const tri = fmtBase(shown, 13, 8);
  $("#calc-res-tri").textContent = fmtShow(shown, 13, 8);
  $("#calc-res-dec").textContent = group10(fmtShow(shown, 10, 10));
  $("#calc-res-glyphs").innerHTML = Number.isFinite(shown) ? glyphString(tri.text) : `<span class="g-op">${shown !== shown ? "?" : "∞"}</span>`;
  $(".screen").classList.toggle("stale", v === null);
}

function calcPress(k) {
  let e = calc.expr;
  const lastCh = e.slice(-1);
  const curNum = (e.match(/[0-9A-C.]+$/) || [""])[0];
  if (calc.justEvaluated && (DIGITS.includes(k) || k === ".")) e = "";
  calc.justEvaluated = false;
  if (k === "AC") e = "";
  else if (k === "bs") e = e.slice(0, -1);
  else if (k === "=") {
    try {
      const v = evaluate(e, calc.mode);
      if (Number.isFinite(v)) { e = fmtBase(v, calc.mode, 8).text.replace("-", "−"); calc.justEvaluated = true; }
    } catch { /* leave as is */ }
  } else if (OPS.includes(k)) {
    if (OPS.includes(lastCh) && !(k === "−" && lastCh !== "−")) e = e.slice(0, -1);
    if (e === "" && k !== "−") e = "0";
    e += k;
  } else if (k === ".") {
    if (!curNum.includes(".")) e += curNum ? "." : (lastCh === ")" ? "×0." : "0.");
  } else if (k === "(") {
    e += /[0-9A-C.)]$/.test(e) ? "×(" : "(";
  } else if (k === ")") {
    const open = (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length;
    if (open > 0 && /[0-9A-C.)]$/.test(e)) e += ")";
  } else if (DIGITS.includes(k)) {
    if (DIGITS.indexOf(k) >= calc.mode) return;
    if (lastCh === ")") e += "×";
    if (curNum === "0") e = e.slice(0, -1);
    e += k;
  }
  calc.expr = e;
  calcRender();
}

function buildCalcPad() {
  const D = (ch) => {
    const d = DIGITS.indexOf(ch);
    const off = d >= calc.mode;
    return `<button class="dig" data-k="${ch}" aria-label="${NAMES[d]}"${off ? " disabled" : ""}>${calc.mode === 13 ? glyphSVG(d) : ""}<span>${ch}</span></button>`;
  };
  const O = (k, label, cls = "op") => `<button class="${cls}" data-k="${k}" aria-label="${label}">${k === "bs" ? "⌫" : k}</button>`;
  $("#calc-pad").innerHTML = [
    O("AC", "clear", "fn"), O("(", "open bracket", "fn"), O(")", "close bracket", "fn"), O("bs", "delete", "fn"), O("÷", "divide"),
    D("9"), D("A"), D("B"), D("C"), O("×", "multiply"),
    D("5"), D("6"), D("7"), D("8"), O("−", "minus"),
    D("1"), D("2"), D("3"), D("4"), O("+", "plus"),
    D("0").replace('class="dig"', 'class="dig span2"'), O(".", "point", "dig"), O("=", "equals", "eq span2"),
  ].join("");
  $("#calc-pad").classList.toggle("dec", calc.mode === 10);
  $$(".calc .seg button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.mode === calc.mode)));
}

$("#calc-pad").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b && !b.disabled) calcPress(b.dataset.k);
});
$$(".calc .seg button").forEach((b) =>
  b.addEventListener("click", () => {
    const m = +b.dataset.mode;
    if (m === calc.mode) return;
    // carry the current value over into the new base
    const v = calc.last;
    calc.mode = m;
    store.set("calcMode", m);
    calc.expr = v && Number.isFinite(v) ? fmtBase(v, m, 8).text.replace("-", "−") : "";
    calc.justEvaluated = true;
    buildCalcPad();
    calcRender();
  })
);
document.addEventListener("keydown", (e) => {
  if ($("#tab-calc").hidden || e.target.matches("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  const map = { "+": "+", "-": "−", "*": "×", x: "×", "/": "÷", ":": "÷", "(": "(", ")": ")", ".": ".", ",": ".", Enter: "=", "=": "=", Backspace: "bs", Escape: "AC", Delete: "AC" };
  const k = map[e.key] ?? (DIGITS.includes(e.key.toUpperCase()) && e.key.length === 1 ? e.key.toUpperCase() : null);
  if (!k) return;
  e.preventDefault();
  calcPress(k);
});

/* ---------- units ---------- */

const DEFAULTS = { procul: 9.6, day: 11, year: 982 };
const settings = { ...DEFAULTS, ...store.get("settings", {}) };

/* Bearings. Pars are counted clockwise from North, 0–1351. Niveans travel by North or South
   plus an offset: positive pars clockwise, negative counterclockwise ("N +169" = NE). */
const FULL = 1352, QUARTER = 338, STEP = 169;
const NAMES8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const wrapPars = (p) => ((p % FULL) + FULL) % FULL;

// "N+169", "s -40", "S−A0" (number in the given base) → pars clockwise from North
function parseBearing(raw, base) {
  const m = String(raw).trim().replace(/−/g, "-").match(/^([NnSs])\s*([+-]?)\s*([0-9A-Ca-c.,]*)$/);
  if (!m) return NaN;
  const off = m[3] === "" ? 0 : parseBase(m[3], base);
  if (Number.isNaN(off)) return NaN;
  return wrapPars((m[1].toUpperCase() === "N" ? 0 : FULL / 2) + (m[2] === "-" ? -off : off));
}

// pars → { axis, off } using the nearer of the N and S axes (E/W are written from North)
function travelBearing(pars) {
  const p = wrapPars(pars);
  if (p <= QUARTER) return { axis: "N", off: p };
  if (p >= FULL - QUARTER) return { axis: "N", off: p - FULL };
  return { axis: "S", off: p - FULL / 2 };
}
function fmtBearing(pars, base) {
  const { axis, off } = travelBearing(pars);
  const r = fmtBase(Math.abs(off), base, 3);
  return `${r.approx ? "≈ " : ""}${axis} ${off < 0 ? "−" : "+"}${r.text}`;
}

// Each unit: id, name, note, size in the category's base unit (m, s, °).
function unitDefs() {
  const P = settings.procul, D = settings.day * 3600, Y = settings.year;
  const aetaDays = Y / 7;
  return {
    length: [
      { id: "procul", name: "procul", nivean: true, size: P },
      { id: "ampliprocul", name: "ampliprocul", nivean: true, note: "2197 procul", size: 2197 * P },
      { id: "m", name: "metre", size: 1 },
      { id: "km", name: "kilometre", size: 1000 },
      { id: "ft", name: "foot", size: 0.3048 },
      { id: "mi", name: "mile", size: 1609.344 },
    ],
    time: [
      { id: "nday", name: "Nivean day", nivean: true, size: D },
      { id: "aeta", name: "aeta", nivean: true, note: `⅐ year ≈ ${+aetaDays.toFixed(1)} Nivean days`, size: aetaDays * D },
      { id: "nyear", name: "Nivean year", nivean: true, note: `${Y} Nivean days`, size: Y * D },
      { id: "min", name: "minute", size: 60 },
      { id: "h", name: "hour", size: 3600 },
      { id: "eday", name: "Earth day", size: 86400 },
      { id: "eyear", name: "Earth year", note: "365.2425 days", size: 365.2425 * 86400 },
    ],
    angle: [
      { id: "bearing", name: "travel bearing", nivean: true, note: "N/S ± pars, e.g. N +169 = NE", size: 360 / 1352, bearing: true },
      { id: "pars", name: "pars", nivean: true, size: 360 / 1352 },
      { id: "dir", name: "cardinal step", nivean: true, note: "⅛ circle = 169 pars (N → NE)", size: 45 },
      { id: "turn", name: "full circle", nivean: true, note: "1352 pars", size: 360 },
      { id: "deg", name: "degree", size: 1 },
      { id: "rad", name: "radian", size: 180 / Math.PI },
    ],
  };
}

const unitState = { cat: store.get("unitCat", "length"), from: store.get("unitFrom", {}) };
const DEFAULT_FROM = { length: "procul", time: "nday", angle: "pars" };

function fillUnitSelect() {
  const defs = unitDefs()[unitState.cat];
  const sel = $("#unit-from");
  const cur = unitState.from[unitState.cat] || DEFAULT_FROM[unitState.cat];
  sel.innerHTML = defs.map((u) => `<option value="${u.id}"${u.id === cur ? " selected" : ""}>${u.name}${u.nivean ? " ✦" : ""}</option>`).join("");
  $$("#unit-cats button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === unitState.cat)));
}

function unitRender() {
  const defs = unitDefs()[unitState.cat];
  const base = +$("#unit-base").value;
  const raw = $("#unit-val").value;
  const from = defs.find((u) => u.id === $("#unit-from").value) || defs[0];
  const v = from.bearing ? parseBearing(raw, base) : parseBase(raw, base);
  const bad = raw.trim() !== "" && Number.isNaN(v);
  $("#unit-val").placeholder = from.bearing ? "e.g. N+169 or S-40" : "";
  $("#unit-val").inputMode = from.bearing ? "text" : "decimal";
  $("#unit-err").hidden = !bad;
  $("#unit-err").textContent = !bad ? "" : from.bearing
    ? "Write N or S, then + (clockwise) or − (counterclockwise) and the pars, e.g. N+169."
    : base === 13 ? "Base 13 uses only 0–9, A, B, C." : "Not a decimal number.";
  const shownIn = from.bearing ? Math.abs(travelBearing(v).off) : v;
  $("#unit-in-glyphs").innerHTML = Number.isFinite(v) ? glyphString(fmtBase(shownIn, 13, 6).text) : "";
  const baseVal = Number.isFinite(v) ? v * from.size : NaN;
  $("#unit-results tbody").innerHTML = defs
    .map((u) => {
      const x = baseVal / u.size;
      const ok = Number.isFinite(x);
      const tri = ok ? fmtBase(u.bearing ? Math.abs(travelBearing(x).off) : x, 13, 4) : { text: "—" };
      const show = (b, f) => (u.bearing ? fmtBearing(x, b) : fmtShow(x, b, f));
      return `<tr class="${u.id === from.id ? "from" : ""}${u.nivean ? " niv" : ""}">
        <th>${u.name}${u.nivean ? ' <span class="star" title="Nivean unit">✦</span>' : ""}${u.note ? `<small>${u.note}</small>` : ""}</th>
        <td class="num"><span class="nw">${ok ? group10(show(10, 5)) : "—"}</span></td>
        <td class="num tri"><span class="nw">${ok ? show(13, 4) : "—"}</span>${ok && tri.text.length <= 9 ? `<div class="mini-glyphs">${glyphString(tri.text)}</div>` : ""}</td>
      </tr>`;
    })
    .join("");
  // compass for angles
  const wrap = $("#compass-wrap");
  wrap.hidden = unitState.cat !== "angle" || !Number.isFinite(baseVal);
  if (!wrap.hidden) drawCompass(baseVal);
}

function drawCompass(deg) {
  const pars = wrapPars(deg / (360 / FULL));
  const pt = (r, p) => {
    const a = ((p * 360) / FULL - 90) * (Math.PI / 180);
    return [(r * Math.cos(a)).toFixed(2), (r * Math.sin(a)).toFixed(2)];
  };
  let s = `<circle r="100" class="c-ring"/>`;
  for (let i = 0; i < FULL / 13; i++) {
    const p = i * 13, major = p % STEP === 0;
    const [x1, y1] = pt(major ? 80 : 92, p), [x2, y2] = pt(100, p);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${major ? "c-major" : "c-minor"}"/>`;
    if (major) {
      const [lx, ly] = pt(64, p), name = NAMES8[p / STEP];
      s += `<text x="${lx}" y="${ly}" class="c-label${name.length === 1 ? " c-main" : ""}">${name}</text>`;
    }
  }
  const [nx, ny] = pt(88, pars);
  s += `<line x1="0" y1="0" x2="${nx}" y2="${ny}" class="c-needle"/><circle r="4" class="c-hub"/>`;
  $("#compass").innerHTML = s;
  const near = Math.round(pars / STEP) % 8;
  let diff = pars - near * STEP;
  if (diff > FULL / 2) diff -= FULL;
  const sign = (d) => (d < 0 ? "−" : "+");
  const dr = fmtBase(Math.abs(diff), 10, 3);
  const nearTxt = Math.abs(diff) < 0.0005 ? `exactly <b>${NAMES8[near]}</b>` : `${dr.approx ? "≈ " : ""}<b>${NAMES8[near]}</b> ${sign(diff)}${dr.text} pars`;
  const onAxis = NAMES8[near] === "N" || NAMES8[near] === "S";
  $("#compass-text").innerHTML = `Travel bearing <b>${fmtBearing(pars, 10)}</b> pars (base 13: <b>${fmtBearing(pars, 13)}</b>)${onAxis && Math.abs(diff) >= 0.0005 ? "" : ", " + nearTxt}. Bearing from North: ${fmtShow(pars, 10, 3)} pars clockwise. One cardinal step is 169 pars (100 in base 13); small ticks every 13 pars.`;
}

$$("#unit-cats button").forEach((b) =>
  b.addEventListener("click", () => {
    unitState.cat = b.dataset.cat;
    store.set("unitCat", unitState.cat);
    fillUnitSelect();
    unitRender();
  })
);
$("#unit-from").addEventListener("change", (e) => {
  unitState.from[unitState.cat] = e.target.value;
  store.set("unitFrom", unitState.from);
  unitRender();
});
$("#unit-base").addEventListener("change", (e) => {
  // keep the same quantity when switching how it is written
  const oldBase = +e.target.value === 13 ? 10 : 13;
  if ($("#unit-from").value === "bearing") {
    const p = parseBearing($("#unit-val").value, oldBase);
    if (Number.isFinite(p)) $("#unit-val").value = fmtBearing(p, +e.target.value).replace("≈ ", "");
  } else {
    const v = parseBase($("#unit-val").value, oldBase);
    if (Number.isFinite(v)) $("#unit-val").value = fmtBase(v, +e.target.value, 8).text;
  }
  unitRender();
});
$("#unit-val").addEventListener("input", unitRender);

function applySettingsInputs() {
  $("#set-procul").value = settings.procul;
  $("#set-day").value = settings.day;
  $("#set-year").value = settings.year;
}
for (const [id, key] of [["#set-procul", "procul"], ["#set-day", "day"], ["#set-year", "year"]]) {
  $(id).addEventListener("input", (e) => {
    const v = parseFloat(e.target.value.replace(",", "."));
    if (v > 0) { settings[key] = v; store.set("settings", settings); unitRender(); }
  });
}
$("#set-reset").addEventListener("click", () => {
  Object.assign(settings, DEFAULTS);
  store.set("settings", settings);
  applySettingsInputs();
  unitRender();
});

/* ---------- read image ---------- */

initRead({
  openInConverter(text) {
    triIn.value = text;
    fromTri();
    showTab("numbers");
    window.scrollTo({ top: 0, behavior: "smooth" });
  },
});

/* ---------- init ---------- */

applySettingsInputs();
setGlyphDir(store.get("glyphDir", "rtl"));
fromDec();
buildCalcPad();
calcRender();
fillUnitSelect();
unitRender();
showTab(location.hash.slice(1) || store.get("tab", "numbers"));
