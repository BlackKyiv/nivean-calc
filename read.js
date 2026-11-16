// "Read image" tab: load a picture, find Nivean numerals, let the user fix guesses.
import { DIGITS, NAMES, glyphSVG, glyphString, glyphDir } from "./glyphs.js";
import { parseBase, fmtShow, group10 } from "./numbers.js";
import { loadTemplates, parseImage } from "./parser.js";

const $ = (s, el = document) => el.querySelector(s);

export function initRead({ openInConverter }) {
  const st = {
    img: null, // HTMLImageElement
    crop: null, // {x,y,w,h} in image pixels, or null = whole picture
    ink: "auto",
    view: "picture", // or "mask"
    selecting: false,
    drag: null,
    result: null,
    lines: [], // per line: [{ ch, glyph }]
  };
  const canvas = $("#read-canvas");
  const ctx = canvas.getContext("2d");
  const status = $("#read-status");
  let ready = null;
  const templates = () => (ready ||= loadTemplates());

  /* ----- loading pictures ----- */

  async function useImage(src, revoke) {
    status.textContent = "Loading picture…";
    const img = new Image();
    img.src = src;
    try { await img.decode(); }
    catch { status.textContent = "Couldn't open that picture. Try a PNG or JPEG."; return; }
    if (revoke) URL.revokeObjectURL(src);
    st.img = img;
    st.crop = null;
    $("#read-stage").hidden = false;
    run();
  }
  const useBlob = (blob) => blob && useImage(URL.createObjectURL(blob), true);

  $("#read-file").addEventListener("change", (e) => { useBlob(e.target.files[0]); e.target.value = ""; });
  $("#read-paste").addEventListener("click", async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) return useBlob(await item.getType(type));
      }
      status.textContent = "No picture on the clipboard.";
    } catch {
      status.textContent = "Clipboard not available here: use Choose picture, or press Ctrl/⌘+V.";
    }
  });
  document.addEventListener("paste", (e) => {
    if ($("#tab-read").hidden) return;
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/"));
    if (f) { e.preventDefault(); useBlob(f); }
  });
  const drop = $("#tab-read");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dragging"); });
  drop.addEventListener("dragleave", (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove("dragging"); });
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("dragging");
    useBlob([...e.dataTransfer.files].find((x) => x.type.startsWith("image/")));
  });
  $("#read-sample").addEventListener("click", async () => useImage(await makeSample()));

  /* ----- options ----- */

  $("#read-ink").addEventListener("change", (e) => { st.ink = e.target.value; run(); });
  $("#read-view").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    st.view = b.dataset.view;
    for (const x of $("#read-view").children) x.setAttribute("aria-pressed", String(x === b));
    draw();
  });
  const selBtn = $("#read-select");
  selBtn.addEventListener("click", () => {
    st.selecting = !st.selecting;
    selBtn.setAttribute("aria-pressed", String(st.selecting));
    canvas.classList.toggle("selecting", st.selecting);
    status.textContent = st.selecting ? "Drag a box around the numerals to read." : status.textContent;
  });
  $("#read-whole").addEventListener("click", () => { st.crop = null; run(); });

  /* ----- area selection ----- */

  const toImg = (e) => {
    const r = canvas.getBoundingClientRect();
    const k = st.img.naturalWidth / r.width;
    return {
      x: Math.min(st.img.naturalWidth, Math.max(0, (e.clientX - r.left) * k)),
      y: Math.min(st.img.naturalHeight, Math.max(0, (e.clientY - r.top) * k)),
    };
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (!st.selecting || !st.img) return;
    canvas.setPointerCapture(e.pointerId);
    const p = toImg(e);
    st.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!st.drag) return;
    const p = toImg(e);
    st.drag.x1 = p.x; st.drag.y1 = p.y;
    draw();
  });
  canvas.addEventListener("pointerup", () => {
    if (!st.drag) return;
    const d = st.drag;
    st.drag = null;
    const crop = { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) };
    if (crop.w > 8 && crop.h > 8) {
      st.crop = crop;
      st.selecting = false;
      selBtn.setAttribute("aria-pressed", "false");
      canvas.classList.remove("selecting");
      run();
    } else draw();
  });

  /* ----- recognition ----- */

  async function run() {
    if (!st.img) return;
    status.textContent = "Reading…";
    await templates();
    await new Promise((r) => setTimeout(r, 20)); // let the status paint
    const t0 = performance.now();
    try {
      st.result = parseImage(st.img, { crop: st.crop, ink: st.ink });
    } catch (err) {
      st.result = null;
      status.textContent = "Something went wrong: " + err.message;
      return;
    }
    const ms = Math.round(performance.now() - t0);
    st.lines = st.result.lines.map((l) =>
      l.glyphs.map((g) => ({ g, ch: g.kind === "digit" ? (g.reject ? "x" : DIGITS[g.candidates[0].d]) : g.kind === "point" ? "." : "-" }))
    );
    const n = st.lines.reduce((a, l) => a + l.filter((x) => x.g.kind === "digit").length, 0);
    const unsure = st.lines.reduce((a, l) => a + l.filter((x) => x.g.unsure).length, 0);
    status.textContent = n
      ? `Found ${n} digit${n === 1 ? "" : "s"} in ${st.lines.length} line${st.lines.length === 1 ? "" : "s"}` +
        (unsure ? `, ${unsure} unsure (amber): tap a digit to correct it.` : ". Tap a digit to correct it.") + ` (${ms} ms)`
      : `No Nivean numerals found${st.crop ? " in the selected area" : ""}. Try selecting the area, or switch Ink.`;
    draw();
    renderLines();
  }

  /* ----- drawing ----- */

  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function draw() {
    const img = st.img;
    if (!img) return;
    const W = img.naturalWidth, H = img.naturalHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || 600;
    const k = Math.min(1, (cw * dpr) / W);
    canvas.width = Math.round(W * k);
    canvas.height = Math.round(H * k);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.drawImage(img, 0, 0);
    const r = st.result;
    if (st.view === "mask" && r) {
      // what the parser sees: ink in black on white, inside the analysed area
      const m = new ImageData(r.w, r.h);
      for (let i = 0; i < r.mask.length; i++) {
        const v = r.mask[i] ? 0 : 255;
        m.data.set([v, v, v, 255], i * 4);
      }
      const c = document.createElement("canvas");
      c.width = r.w; c.height = r.h;
      c.getContext("2d").putImageData(m, 0, 0);
      ctx.drawImage(c, r.ox, r.oy, r.w / r.scale, r.h / r.scale);
    }
    const lw = 2 / k;
    if (st.crop) {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      const c = st.crop;
      ctx.fillRect(0, 0, W, c.y); ctx.fillRect(0, c.y + c.h, W, H - c.y - c.h);
      ctx.fillRect(0, c.y, c.x, c.h); ctx.fillRect(c.x + c.w, c.y, W - c.x - c.w, c.h);
    }
    if (r) {
      const ok = css("--accent") || "#2d6f9e", warn = css("--warn") || "#c98a00";
      ctx.font = `600 ${Math.round(14 / k)}px system-ui, sans-serif`;
      ctx.textBaseline = "bottom";
      st.lines.forEach((line) =>
        line.forEach(({ g, ch }) => {
          if (ch === "x") return;
          const b = mapBox(g.box);
          const col = g.unsure && ch === DIGITS[g.candidates?.[0]?.d] ? warn : ok;
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          ctx.strokeRect(b.x - 3 / k, b.y - 3 / k, b.w + 6 / k, b.h + 6 / k);
          const label = ch === "-" ? "−" : ch;
          const tw = ctx.measureText(label).width + 8 / k, th = 18 / k;
          ctx.fillStyle = col;
          ctx.fillRect(b.x - 3 / k, b.y - 3 / k - th, tw, th);
          ctx.fillStyle = "#fff";
          ctx.fillText(label, b.x + 1 / k, b.y - 5 / k);
        })
      );
    }
    if (st.drag) {
      const d = st.drag;
      ctx.setLineDash([6 / k, 4 / k]);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = lw;
      ctx.strokeRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      ctx.setLineDash([]);
    }
  }
  const mapBox = (b) => {
    const r = st.result;
    return { x: r.ox + b.x / r.scale, y: r.oy + b.y / r.scale, w: b.w / r.scale, h: b.h / r.scale };
  };
  window.addEventListener("resize", () => st.img && !$("#tab-read").hidden && draw());
  document.addEventListener("glyphdir", () => st.lines.length && renderLines());

  /* ----- results ----- */

  function thumb(g) {
    const b = mapBox(g.box);
    const pad = Math.max(b.w, b.h) * 0.12;
    const side = Math.max(b.w, b.h, (g.box.lh || 0) / st.result.scale) + pad * 2;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 64, 64);
    x.drawImage(st.img, b.x + b.w / 2 - side / 2, b.y + b.h / 2 - side / 2, side, side, 0, 0, 64, 64);
    return c.toDataURL();
  }

  function renderLines() {
    const box = $("#read-results");
    if (!st.lines.length) { box.innerHTML = ""; return; }
    box.innerHTML = st.lines
      .map((line, li) => `<div class="read-line" data-line="${li}">
        <div class="chips-head note">${glyphDir() === "rtl" ? "Picture order · read ⇠ from the right" : "Picture order · read from the left ⇢"}</div>
        <div class="chips">${line.map((x, gi) => chip(x, li, gi)).join("")}</div>
        <div class="read-value" id="read-val-${li}"></div>
      </div>`)
      .join("");
    st.lines.forEach((_, li) => renderValue(li));
  }

  function chip({ g, ch }, li, gi) {
    const opts = [...DIGITS].map((c, d) => {
      const rank = g.candidates ? g.candidates.findIndex((x) => x.d === d) : -1;
      const hint = rank === 0 ? " (best match)" : rank === 1 ? " (2nd guess)" : "";
      return `<option value="${c}"${c === ch ? " selected" : ""}>${c} · ${NAMES[d]}${hint}</option>`;
    });
    opts.push(`<option value="."${ch === "." ? " selected" : ""}>. point</option>`);
    opts.push(`<option value="-"${ch === "-" ? " selected" : ""}>− minus</option>`);
    opts.push(`<option value="x"${ch === "x" ? " selected" : ""}>ignore this</option>`);
    const d = DIGITS.indexOf(ch);
    const shown = d >= 0 ? glyphSVG(d) : `<span class="g-sep">${ch === "x" ? "×" : ch === "-" ? "−" : "."}</span>`;
    const changed = g.kind === "digit" && ch !== (g.reject ? "x" : DIGITS[g.candidates[0].d]);
    const cls = ["chip", g.unsure && !changed ? "unsure" : "", ch === "x" ? "ignored" : "", changed ? "fixed" : ""].join(" ");
    return `<label class="${cls}">
      <img src="${thumb(g)}" alt="">
      <span class="chip-read">${shown}${d >= 0 ? `<b>${ch}</b>` : ""}</span>
      <select data-li="${li}" data-gi="${gi}" aria-label="Glyph ${gi + 1}: read as ${ch}">${opts.join("")}</select>
    </label>`;
  }

  $("#read-results").addEventListener("change", (e) => {
    const s = e.target.closest("select");
    if (!s) return;
    const li = +s.dataset.li, gi = +s.dataset.gi;
    st.lines[li][gi].ch = s.value;
    const label = s.closest(".chip");
    label.outerHTML = chip(st.lines[li][gi], li, gi);
    renderValue(li);
    draw();
  });
  $("#read-results").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (b) openInConverter(b.dataset.open);
  });

  function renderValue(li) {
    // chips are in picture order (left to right); read them in the writing direction
    let chars = st.lines[li].map((x) => x.ch).filter((c) => c !== "x");
    if (glyphDir() === "rtl") chars = chars.reverse();
    const text = chars.join("").replace(/(?!^)-/g, "");
    const v = parseBase(text, 13);
    const el = $("#read-val-" + li);
    if (!text || Number.isNaN(v)) {
      el.innerHTML = `<span class="err">Not a valid number (${text || "empty"}). Check the points and signs.</span>`;
      return;
    }
    el.innerHTML = `<div class="rv-glyphs">${glyphString(text)}</div>
      <div class="rv-nums"><span><span class="tag">13</span>${text.replace("-", "−")}</span>
      <span><span class="tag">10</span><b>${group10(fmtShow(v, 10, 8))}</b></span></div>
      <button class="link" data-open="${text}">Open in converter →</button>`;
  }

  /* ----- sample picture ----- */

  async function makeSample() {
    const nums = [Math.floor(Math.random() * 28000) + 170, Math.floor(Math.random() * 2000) + 14 + 0.5];
    const [ip, fp = ""] = nums[1].toString(13).toUpperCase().split(".");
    const lines = [nums[0].toString(13).toUpperCase(), ip + (fp ? "." + fp.slice(0, 2) : "")];
    const size = 64, gap = 22;
    const W = Math.max(...lines.map((l) => l.length)) * (size + gap) + 80, H = lines.length * (size + 50) + 50;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const grd = x.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, "#f3efe4"); grd.addColorStop(1, "#d9d2c0");
    x.fillStyle = grd; x.fillRect(0, 0, W, H);
    x.translate(W / 2, H / 2); x.rotate(-0.025); x.translate(-W / 2, -H / 2);
    for (const [li, line] of lines.entries()) {
      let px = 40;
      const py = 40 + li * (size + 50);
      for (const ch of glyphDir() === "rtl" ? [...line].reverse() : line) {
        if (ch === ".") {
          x.fillStyle = "#2a2a35";
          x.beginPath(); x.arc(px + 4, py + size - 6, 5, 0, 7); x.fill();
          px += 24;
          continue;
        }
        const d = DIGITS.indexOf(ch);
        const svg = glyphSVG(d)
          .replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `)
          .replace(/currentColor/g, "#2a2a35")
          .replace(/(cx|cy|x1|y1|x2|y2)="([\d.]+)"/g, (m, k, v) => `${k}="${(+v + (Math.random() - 0.5) * 2).toFixed(1)}"`);
        const im = new Image();
        im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        await im.decode();
        x.drawImage(im, px, py, size, size);
        px += size + gap;
      }
    }
    return c.toDataURL("image/jpeg", 0.85);
  }
}
