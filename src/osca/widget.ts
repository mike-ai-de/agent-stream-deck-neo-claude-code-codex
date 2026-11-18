// Scriptable widget for the OSCA cockpit (static snapshot; iOS refreshes widgets every few minutes).
// The mobile service serves it at /widget.js with its own address filled in, and a copy page at /widget.
// Supports Lock Screen (accessoryCircular, accessoryRectangular, accessoryInline) and Home Screen (small, medium, large).
// Widget parameter for the circular size: "temp" (default), "gpu", "cpu" or "tps".
// The script below avoids backticks and "${" because it lives inside a template string.

export function widgetScript(base:string):string{return `// OSCA – Operating System · Core · Agent
// Scriptable widget. Lock Screen: circular / rectangular / inline. Home Screen: small / medium / large.
// Circular widget parameter: temp (default), gpu, cpu, tps. Requires Tailscale on this iPhone.
const BASE = ${JSON.stringify(base)};
const C = { bg: new Color("#000000"), panel: new Color("#0b0f14"), green: new Color("#2bea6c"), amber: new Color("#ffb020"), red: new Color("#ff3b3b"), cyan: new Color("#33e0ff"), white: new Color("#e9eef3"), dim: new Color("#5d6b7a") };
const fam = config.widgetFamily || "medium";
const lock = fam.indexOf("accessory") === 0;

async function load() {
  const r = new Request(BASE + "/api/cockpit"); r.timeoutInterval = 8;
  try { const d = await r.loadJSON(); return d && d.ok ? d : null; } catch (e) { return null; }
}
function pct(v) { return v == null ? "—" : Math.round(v) + "%"; }
function deg(v) { return v == null ? "—" : Math.round(v) + "°"; }
function levelColor(l) { return l === "warning" ? C.red : l === "caution" ? C.amber : C.green; }
function lampColor(l) { return l === "active" ? C.green : l === "unknown" ? C.amber : C.dim; }
function swapText(b) { return b == null ? "—" : b < 1048576 ? "0" : b < 1073741824 ? Math.round(b / 1048576) + "M" : (b / 1073741824).toFixed(1) + "G"; }
function lamps(d) { const a = d.agents; return [["C", a.claude.lamp], ["X", a.codex.lamp], ["H", a.hermes.lamp], ["O", a.orca.lamp], ["L", d.llm.lamp]]; }
function compact(n) { return n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n); }
function alertText(d) { return d.alerts.length ? d.alerts[0].text : "ALL SYSTEMS NORMAL"; }
function alertLevel(d) { return d.alerts.length ? d.alerts[0].level : "ok"; }

function gaugeImage(value, min, max, label, text, color, mono) {
  const s = 120, dc = new DrawContext(); dc.size = new Size(s, s); dc.opaque = false; dc.respectScreenScale = true;
  const cx = s / 2, cy = s / 2 + 4, R = 46, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  function arc(from, to, col, w) { const p = new Path(), n = 40; for (let i = 0; i <= n; i++) { const t = from + (to - from) * i / n; const pt = new Point(cx + Math.cos(t) * R, cy + Math.sin(t) * R); if (i === 0) p.move(pt); else p.addLine(pt); } dc.addPath(p); dc.setStrokeColor(col); dc.setLineWidth(w); dc.strokePath(); }
  const f = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  arc(a0, a1, mono ? new Color("#ffffff", 0.25) : new Color("#1a232d"), 9);
  if (f > 0) arc(a0, a0 + (a1 - a0) * f, mono ? Color.white() : color, 9);
  dc.setTextAlignedCenter(); dc.setTextColor(mono ? Color.white() : C.white);
  dc.setFont(Font.boldMonospacedSystemFont(30)); dc.drawTextInRect(text, new Rect(0, cy - 24, s, 36));
  dc.setFont(Font.heavySystemFont(13)); dc.setTextColor(mono ? new Color("#ffffff", 0.8) : C.dim); dc.drawTextInRect(label, new Rect(0, cy + 14, s, 18));
  return dc.getImage();
}
function barImage(value, w, h, color) {
  const dc = new DrawContext(); dc.size = new Size(w, h); dc.opaque = false; dc.respectScreenScale = true;
  const bg = new Path(); bg.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2); dc.addPath(bg); dc.setFillColor(new Color("#1a232d")); dc.fillPath();
  const f = value == null ? 0 : Math.max(0, Math.min(1, value / 100));
  if (f > 0) { const p = new Path(); p.addRoundedRect(new Rect(0, 0, Math.max(h, w * f), h), h / 2, h / 2); dc.addPath(p); dc.setFillColor(color); dc.fillPath(); }
  return dc.getImage();
}
function text(stack, s, size, color, weight) { const t = stack.addText(s); t.font = weight === "mono" ? Font.boldMonospacedSystemFont(size) : weight === "heavy" ? Font.heavySystemFont(size) : Font.semiboldSystemFont(size); t.textColor = color; t.lineLimit = 1; t.minimumScaleFactor = 0.6; return t; }
function lampRow(stack, d, size, mono) {
  const row = stack.addStack(); row.centerAlignContent(); row.spacing = size * 0.45;
  lamps(d).forEach(function (l) { const on = l[1] === "active"; const t = text(row, (on ? "●" : "○") + l[0], size, mono ? (on ? Color.white() : new Color("#ffffff", 0.55)) : lampColor(l[1]), "heavy"); });
  return row;
}
function metricRow(stack, label, value, valueText, color, width) {
  const r = stack.addStack(); r.centerAlignContent(); r.spacing = 6;
  text(r, label, 11, C.dim, "heavy").font = Font.heavySystemFont(11);
  const img = r.addImage(barImage(value, width, 7, color)); img.imageSize = new Size(width, 7);
  text(r, valueText, 11, C.white, "mono");
}

function build(d) {
  const w = new ListWidget(); w.url = BASE + "/cockpit"; w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  if (!lock) { w.backgroundColor = C.bg; w.setPadding(12, 14, 12, 14); }
  if (!d) {
    if (fam === "accessoryInline") { w.addText("OSCA · NO LINK"); return w; }
    if (lock) w.addAccessoryWidgetBackground = true;
    text(w, "OSCA", lock ? 13 : 16, lock ? Color.white() : C.cyan, "heavy"); text(w, "NO LINK", lock ? 12 : 13, lock ? Color.white() : C.amber, "heavy");
    if (!lock) text(w, "Tailscale aktiv?", 11, C.dim);
    return w;
  }
  const t = d.temp, live = d.live, llm = d.llm;
  if (fam === "accessoryInline") {
    const busy = lamps(d).filter(function (l) { return l[1] === "active"; }).map(function (l) { return l[0]; }).join("");
    w.addText("OSCA " + (busy || "–") + " · GPU " + pct(live.gpu) + " · " + deg(t.max) + (d.alerts.length ? " ⚠" : ""));
    return w;
  }
  if (fam === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const p = (args.widgetParameter || "temp").toLowerCase();
    const img = p === "gpu" ? gaugeImage(live.gpu, 0, 100, "GPU", pct(live.gpu).replace("%", ""), C.green, true)
      : p === "cpu" ? gaugeImage(live.cpu, 0, 100, "CPU", pct(live.cpu).replace("%", ""), C.green, true)
      : p === "tps" ? (llm.phase === "reading" && llm.prefillTps != null ? gaugeImage(llm.prefillTps, 0, 1000, "IN T/S", String(Math.round(llm.prefillTps)), C.cyan, true)
        : gaugeImage(llm.phase === "writing" ? llm.tps : 0, 0, 40, "OUT T/S", llm.phase === "writing" && llm.tps != null ? llm.tps.toFixed(0) : "–", C.cyan, true))
      : gaugeImage(t.max, 30, 110, "CHIP", t.max == null ? "–" : Math.round(t.max) + "°", levelColor(t.level), true);
    w.addImage(img).centerAlignImage();
    return w;
  }
  if (fam === "accessoryRectangular") {
    w.addAccessoryWidgetBackground = true; w.setPadding(4, 8, 4, 8);
    const top = w.addStack(); top.centerAlignContent(); text(top, "OSCA", 12, Color.white(), "heavy"); top.addSpacer(); lampRow(top, d, 11, true);
    text(w, "CPU " + pct(live.cpu) + "  GPU " + pct(live.gpu), 13, Color.white(), "mono");
    const warn = d.alerts.length ? "⚠ " + alertText(d) : "CHIP " + deg(t.max) + " · SWAP " + swapText(d.memory.swapBytes) + (llm.phase === "writing" && llm.tps != null ? " · " + llm.tps.toFixed(0) + " T/S" : "");
    text(w, warn, 11, Color.white(), "heavy");
    return w;
  }
  // Home Screen
  const head = w.addStack(); head.centerAlignContent();
  text(head, "OSCA", 15, C.cyan, "heavy"); head.addSpacer(); lampRow(head, d, fam === "small" ? 10 : 12, false);
  if (fam !== "small") { const sub = w.addText("OPERATING SYSTEM · CORE · AGENT"); sub.font = Font.semiboldSystemFont(8); sub.textColor = C.dim; }
  w.addSpacer(6);
  const bw = fam === "small" ? 62 : 150;
  metricRow(w, "CPU ", live.cpu, pct(live.cpu), levelColor(live.cpu >= 90 ? "warning" : live.cpu >= 70 ? "caution" : "ok"), bw); w.addSpacer(4);
  metricRow(w, "GPU ", live.gpu, pct(live.gpu), C.green, bw); w.addSpacer(4);
  metricRow(w, "CHIP", t.max == null ? null : (t.max - 30) / 80 * 100, deg(t.max), levelColor(t.level), bw);
  w.addSpacer(6);
  if (fam !== "small") {
    const l = w.addStack(); l.centerAlignContent(); l.spacing = 6;
    text(l, "LLM", 11, llm.loaded ? C.green : C.dim, "heavy");
    text(l, llm.loaded ? llm.model : "NO MODEL", 11, C.cyan, "mono");
    l.addSpacer();
    text(l, llm.phase === "writing" && llm.tps != null ? llm.tps.toFixed(1) + " T/S" : llm.phase.toUpperCase(), 11, llm.phase === "writing" ? C.green : C.dim, "mono");
    w.addSpacer(4);
    const q = w.addStack(); q.spacing = 10;
    [["CL 5H", d.quota.claude.h5], ["CL 7D", d.quota.claude.d7], ["CX 7D", d.quota.codex.d7]].forEach(function (x) { const r = x[1].remaining; text(q, x[0] + " " + pct(r), 10, r == null ? C.dim : r <= 10 ? C.red : r <= 20 ? C.amber : C.white, "mono"); });
    w.addSpacer(4);
    if (d.tokens) { const tt = d.tokens.ranges.total; text(w, "TOKENS IN " + compact(tt.inNew) + " · OUT " + compact(tt.out) + " · 24H " + compact(d.tokens.ranges.h24.inNew) + "/" + compact(d.tokens.ranges.h24.out), 10, C.cyan, "mono"); w.addSpacer(4); }
  }
  text(w, (d.alerts.length ? "⚠ " : "") + alertText(d) + (fam === "small" ? "" : " · SWAP " + swapText(d.memory.swapBytes)), fam === "small" ? 9 : 10, levelColor(alertLevel(d)), "heavy");
  return w;
}

const data = await load();
const widget = build(data);
if (config.runsInWidget) Script.setWidget(widget); else await widget.presentMedium();
Script.complete();
`;}

export function widgetPage(nonce:string,script:string):string{
 const esc=script.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
 return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>OSCA Widget</title>
<style nonce="${nonce}">body{margin:0;background:#000;color:#e9eef3;font:15px -apple-system,sans-serif;padding:calc(env(safe-area-inset-top) + 14px) 16px 30px}h1{font-size:18px;letter-spacing:.18em;margin:0 0 4px}h1 b{color:#33e0ff}.s{font-size:10px;letter-spacing:.3em;color:#8a96a3;margin-bottom:16px}ol{padding-left:20px;line-height:1.5;color:#c9d2db}button{width:100%;margin:12px 0;padding:14px;border:0;border-radius:10px;background:#2bea6c;color:#001b08;font:800 15px -apple-system,sans-serif;letter-spacing:.1em}pre{white-space:pre-wrap;word-break:break-all;font:11px ui-monospace,Menlo,monospace;background:#0b0f14;border:1px solid #1c2530;border-radius:10px;padding:12px;max-height:40vh;overflow:auto;color:#9aa6b2}a{color:#33e0ff}</style></head><body>
<h1>OSCA <b>WIDGET</b></h1><div class="s">OPERATING SYSTEM · CORE · AGENT</div>
<button id="copy">SKRIPT KOPIEREN</button>
<ol><li>App <b>Scriptable</b> aus dem App Store laden.</li><li>Skript kopieren, in Scriptable mit <b>+</b> ein neues Skript anlegen, einfügen und „OSCA“ nennen.</li><li>Sperrbildschirm lange drücken → <b>Anpassen</b> → Widgets → Scriptable → Größe wählen → Script „OSCA“. Rund: Parameter <b>temp</b>, <b>gpu</b>, <b>cpu</b> oder <b>tps</b>.</li><li>Für den Home-Bildschirm genauso: klein, mittel oder groß.</li></ol>
<pre id="code">${esc}</pre><p><a href="/cockpit">‹ Zurück zum Cockpit</a></p>
<script nonce="${nonce}">document.getElementById("copy").onclick=function(){var b=this;navigator.clipboard.writeText(document.getElementById("code").textContent).then(function(){b.textContent="KOPIERT ✓";},function(){b.textContent="BITTE MANUELL MARKIEREN";});};</script>
</body></html>`;}
