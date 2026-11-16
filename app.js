import { DIGITS, NAMES, glyphSVG, glyphString } from "./glyphs.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const store = {
  get(k, d) { try { const v = localStorage.getItem("nivean:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("nivean:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

/* ---------- base conversion ---------- */

// Parse "−1A.3" in the given base. Returns NaN if invalid.
export function parseBase(str, base) {
  let s = String(str).trim().replace(/\s+/g, "").replace(/−/g, "-").replace(/,/g, ".").toUpperCase();
  if (!s) return NaN;
  let sign = 1;
  if (s[0] === "-") { sign = -1; s = s.slice(1); } else if (s[0] === "+") s = s.slice(1);
  const parts = s.split(".");
  if (parts.length > 2 || (parts[0] === "" && (parts[1] ?? "") === "")) return NaN;
  const [ip, fp = ""] = parts;
  let v = 0;
  for (const ch of ip) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) return NaN;
    v = v * base + d;
  }
  let scale = 1 / base;
  for (const ch of fp) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) return NaN;
    v += d * scale;
    scale /= base;
  }
  return sign * v;
}

// Format a number in a base. Returns { text, approx } (approx = digits were cut off).
export function fmtBase(x, base, maxFrac = 6) {
  if (!Number.isFinite(x)) return { text: Number.isNaN(x) ? "—" : (x > 0 ? "∞" : "−∞"), approx: false };
  const neg = x < 0;
  const a = Math.abs(x);
  // keep a * base^frac within the exact integer range
  let frac = maxFrac;
  while (frac > 0 && a * base ** frac > 2 ** 52) frac--;
  const unit = base ** frac;
  const scaled = Math.round(a * unit);
  const approx = Math.abs(scaled - a * unit) > Math.max(1e-6, a * unit * 4e-16);
  let ip = Math.floor(scaled / unit);
  let fp = scaled - ip * unit;
  let is = "";
  if (ip === 0) is = "0";
  while (ip > 0) {
    const d = ip % base;
    is = DIGITS[d] + is;
    ip = (ip - d) / base;
  }
  // fp is an integer < base^frac: its base digits, left-padded, are the fraction digits
  let fs = "";
  for (let i = 0; i < frac; i++) {
    const d = fp % base;
    fs = DIGITS[d] + fs;
    fp = (fp - d) / base;
  }
  fs = fs.replace(/0+$/, "");
  const zero = is === "0" && !fs;
  const text = (neg && !zero ? "-" : "") + is + (fs ? "." + fs : "");
  return { text, approx: approx || (zero && a !== 0) };
}

const fmtShow = (x, base, maxFrac) => {
  const r = fmtBase(x, base, maxFrac);
  return (r.approx ? "≈ " : "") + r.text.replace("-", "−");
};

// Group integer digits for readability in base 10 (1 234 567).
const group10 = (t) => t.replace(/(?<=^(?:≈ )?)−?\d+/, (m) => m.replace(/\B(?=(\d{3})+(?!\d))/g, " "));

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

const DEFAULTS = { procul: 9.9, day: 11 };
const settings = { ...DEFAULTS, ...store.get("settings", {}) };

// Each unit: id, name, note, size in the category's base unit (m, s, °).
function unitDefs() {
  const P = settings.procul, D = settings.day * 3600;
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
      { id: "aeta", name: "aeta", nivean: true, note: "182 Nivean days", size: 182 * D },
      { id: "nyear", name: "Nivean year", nivean: true, note: "1274 Nivean days", size: 1274 * D },
      { id: "min", name: "minute", size: 60 },
      { id: "h", name: "hour", size: 3600 },
      { id: "eday", name: "Earth day", size: 86400 },
      { id: "eyear", name: "Earth year", note: "365.2425 days", size: 365.2425 * 86400 },
    ],
    angle: [
      { id: "pars", name: "pars", nivean: true, size: 360 / 1352 },
      { id: "dir", name: "compass direction", nivean: true, note: "⅛ circle = 169 pars", size: 45 },
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
  const v = parseBase(raw, base);
  const bad = raw.trim() !== "" && Number.isNaN(v);
  $("#unit-err").hidden = !bad;
  $("#unit-err").textContent = bad ? (base === 13 ? "Base 13 uses only 0–9, A, B, C." : "Not a decimal number.") : "";
  $("#unit-in-glyphs").innerHTML = Number.isFinite(v) ? glyphString(fmtBase(v, 13, 6).text) : "";
  const from = defs.find((u) => u.id === $("#unit-from").value) || defs[0];
  const baseVal = Number.isFinite(v) ? v * from.size : NaN;
  $("#unit-results tbody").innerHTML = defs
    .map((u) => {
      const x = baseVal / u.size;
      const ok = Number.isFinite(x);
      const tri = ok ? fmtBase(x, 13, 4) : { text: "—" };
      return `<tr class="${u.id === from.id ? "from" : ""}${u.nivean ? " niv" : ""}">
        <th>${u.name}${u.nivean ? ' <span class="star" title="Nivean unit">✦</span>' : ""}${u.note ? `<small>${u.note}</small>` : ""}</th>
        <td class="num"><span class="nw">${ok ? group10(fmtShow(x, 10, 5)) : "—"}</span></td>
        <td class="num tri"><span class="nw">${ok ? fmtShow(x, 13, 4) : "—"}</span>${ok && tri.text.length <= 9 ? `<div class="mini-glyphs">${glyphString(tri.text)}</div>` : ""}</td>
      </tr>`;
    })
    .join("");
  // compass for angles
  const wrap = $("#compass-wrap");
  wrap.hidden = unitState.cat !== "angle" || !Number.isFinite(baseVal);
  if (!wrap.hidden) drawCompass(baseVal);
}

function drawCompass(deg) {
  const pars = (((deg / (360 / 1352)) % 1352) + 1352) % 1352;
  let s = `<circle r="100" class="c-ring"/>`;
  for (let i = 0; i < 104; i++) {
    const a = (i * 13 * 360) / 1352;
    const major = i % 13 === 0;
    const r1 = major ? 80 : 92;
    const rad = ((a - 90) * Math.PI) / 180;
    s += `<line x1="${(r1 * Math.cos(rad)).toFixed(2)}" y1="${(r1 * Math.sin(rad)).toFixed(2)}" x2="${(100 * Math.cos(rad)).toFixed(2)}" y2="${(100 * Math.sin(rad)).toFixed(2)}" class="${major ? "c-major" : "c-minor"}"/>`;
    if (major) {
      const n = i / 13 + 1;
      const lr = ((a + 22.5 - 90) * Math.PI) / 180;
      s += `<text x="${(66 * Math.cos(lr)).toFixed(2)}" y="${(66 * Math.sin(lr)).toFixed(2)}" class="c-label">${n}</text>`;
    }
  }
  const na = ((pars * 360) / 1352 - 90) * (Math.PI / 180);
  s += `<line x1="0" y1="0" x2="${(88 * Math.cos(na)).toFixed(2)}" y2="${(88 * Math.sin(na)).toFixed(2)}" class="c-needle"/><circle r="4" class="c-hub"/>`;
  $("#compass").innerHTML = s;
  const dir = Math.floor(pars / 169 + 1e-9) + 1;
  const into = pars - (dir - 1) * 169;
  $("#compass-text").innerHTML = `Bearing <b>${fmtShow(pars, 10, 3)}</b> pars (<b>${fmtShow(pars, 13, 3)}</b> in base 13): direction <b>${Math.min(dir, 8)}</b> + ${fmtShow(into, 10, 3)} pars. Each direction spans 169 pars = 100 in base 13, small ticks every 13 pars.`;
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
  const v = parseBase($("#unit-val").value, oldBase);
  if (Number.isFinite(v)) $("#unit-val").value = fmtBase(v, +e.target.value, 8).text;
  unitRender();
});
$("#unit-val").addEventListener("input", unitRender);

function applySettingsInputs() {
  $("#set-procul").value = settings.procul;
  $("#set-day").value = settings.day;
}
for (const [id, key] of [["#set-procul", "procul"], ["#set-day", "day"]]) {
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

/* ---------- init ---------- */

applySettingsInputs();
fromDec();
buildCalcPad();
calcRender();
fillUnitSelect();
unitRender();
showTab(location.hash.slice(1) || store.get("tab", "numbers"));
