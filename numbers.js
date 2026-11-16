import { DIGITS } from "./glyphs.js";

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

export const fmtShow = (x, base, maxFrac) => {
  const r = fmtBase(x, base, maxFrac);
  return (r.approx ? "≈ " : "") + r.text.replace("-", "−");
};

// Group integer digits for readability in base 10 (1 234 567).
export const group10 = (t) => t.replace(/(?<=^(?:≈ )?)−?\d+/, (m) => m.replace(/\B(?=(\d{3})+(?!\d))/g, " "));
