// OSCA flight deck: animated cockpit page for the iPhone (home screen web app).
// Main view (PFD): annunciator lamps, CPU/GPU engine gauges, per-core VU meter, LLM token rate,
// temperature, quota "fuel" and an EICAS-style message line. Second view (SYS): all Neo values compactly.
// Client code avoids backticks and "${" on purpose because it lives inside this template string.

import colors from "./system-color-map.json" with { type: "json" };

const palette = colors.palette;
export { palette as cockpitPalette };
const color = (token: string): string => palette[token as keyof typeof palette];
const resolve = (entries: Record<string, string>) =>
 Object.fromEntries(Object.entries(entries).map(([id, token]) => [id, color(token)]));

const status = resolve(colors.status);
const agents = resolve(colors.agents);
const runtimes = resolve(colors.runtimes);
const components = resolve(colors.components);
const telemetry = resolve(colors.flightDeck.telemetry);
const modelColors = Object.values(colors.models).flatMap(({ color: token, aliases }) =>
 aliases.map(alias => [alias.toLowerCase(), color(token)]));

const cssPalette = Object.entries(palette).map(([name, value]) => `--${name}:${value}`).join(";");
const agentStyles = Object.entries(colors.flightDeck.agents).map(([lamp, agent]) =>
 `#l-${lamp}{--actor:${agents[agent]}}`).join("\n");
const systemStyles = Object.entries({
 ...agents, ...runtimes, ...components,
 ...Object.fromEntries(Object.entries(colors.flightDeck.systemTiles).map(([tile, owner]) =>
  [tile, agents[owner] ?? runtimes[owner]]))
}).map(([module, value]) => `.sysr[data-component="${module}"]{--component:${value}}`).join("\n");
const canvasColors = {
 ...palette,
 red: status.error, green: status.success, amber: status.warning, cyan: status.info,
 input: telemetry.input, output: telemetry.output, cpu: components.cpu, gpu: components.gpu, chip: components.chip
};

export function cockpitHtml(nonce:string):string{return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="${palette.bg}"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="OSCA">
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/cockpit-icon.png"><title>OSCA</title>
<style nonce="${nonce}">
:root{${cssPalette};--accent:var(--yellow);--ok:${status.success};--warn:${status.warning};--error:${status.error};--info:${status.info};--input:${telemetry.input};--output:${telemetry.output};color-scheme:dark}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
html,body{margin:0;background:var(--bg);color:var(--white);font-family:-apple-system,"SF Pro Display","Helvetica Neue",Arial,sans-serif;-webkit-text-size-adjust:100%;overscroll-behavior:none}
body{padding:calc(env(safe-area-inset-top) + 6px) max(10px,env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 8px) max(10px,env(safe-area-inset-left));min-height:100vh}
body::after{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,color-mix(in srgb,var(--white) 1.8%,transparent) 0 1px,transparent 1px 3px);mix-blend-mode:screen}
.mono{font-family:"SF Mono",ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.deck{max-width:520px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
@media (orientation:landscape) and (min-width:700px){.deck{max-width:1100px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.span{grid-column:1/-1}}
html.wall,html.wall body{height:100%;overflow:hidden}html.wall body{display:flex;align-items:center;justify-content:center;padding:0}html.wall body::after{background-size:100% 3px}html.wall .deck{width:1100px;max-width:none;margin:0}
header{display:flex;align-items:center;justify-content:space-between;padding:2px 2px 0}
.brand .bt{font-weight:800;letter-spacing:.22em;font-size:15px}.brand b{color:var(--accent)}.brand .bs{font-size:8.5px;letter-spacing:.32em;color:var(--dim);margin-top:3px;font-weight:600}
.hdr{display:flex;gap:10px;align-items:center;font-size:12px}
.link{display:flex;align-items:center;gap:6px;letter-spacing:.14em;font-weight:700;font-size:10px;color:var(--dim)}
.link i{width:7px;height:7px;border-radius:50%;background:var(--dim)}
.link.ok{color:var(--ok)}.link.ok i{background:var(--ok);box-shadow:0 0 8px var(--ok);animation:blink 1s steps(2) infinite}
.link.stale{color:var(--warn)}.link.stale i{background:var(--warn)}.link.lost{color:var(--error)}.link.lost i{background:var(--error)}
@keyframes blink{50%{opacity:.35}}
.clock{color:var(--info);font-size:13px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px;position:relative;box-shadow:inset 0 1px 0 color-mix(in srgb,var(--white) 3%,transparent)}
.ttl{position:absolute;top:6px;left:9px;font-size:9px;letter-spacing:.2em;color:var(--dim);font-weight:700}
.ann{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.lamp{border-radius:6px;padding:7px 4px 6px;text-align:center;background:var(--surface);border:1px solid var(--line);transition:all .4s}
.lamp .n{font-size:11px;font-weight:800;letter-spacing:.12em;color:var(--actor)}
.lamp .s{font-size:9px;margin-top:3px;color:var(--dim);letter-spacing:.08em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lamp.active{background:color-mix(in srgb,var(--actor) 8%,var(--surface));border-color:var(--actor);animation:breathe 2.4s ease-in-out infinite}
.lamp.active .n{text-shadow:0 0 8px var(--actor)}.lamp.active .s{color:var(--white)}
.lamp.unknown{border-color:color-mix(in srgb,var(--warn) 50%,transparent)}.lamp.unknown .s{color:var(--warn)}
#l-hermes.off .s{color:var(--error)}
${agentStyles}
@keyframes breathe{0%,100%{box-shadow:0 0 6px color-mix(in srgb,var(--actor) 25%,transparent),inset 0 0 10px color-mix(in srgb,var(--actor) 15%,transparent)}50%{box-shadow:0 0 16px color-mix(in srgb,var(--actor) 60%,transparent),inset 0 0 18px color-mix(in srgb,var(--actor) 30%,transparent)}}
.llm{display:flex;align-items:center;gap:10px;margin-top:6px;padding:7px 9px;border-radius:6px;background:var(--surface);border:1px solid var(--line);transition:all .4s}
.llm .n{font-size:11px;font-weight:800;letter-spacing:.12em;color:var(--dim)}
.llm .m{flex:1;min-width:0;font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.llm .p{font-size:10px;font-weight:800;letter-spacing:.14em;padding:3px 7px;border-radius:4px;border:1px solid var(--line);color:var(--dim)}
.llm.loaded{border-color:color-mix(in srgb,var(--info) 50%,transparent)}.llm.loaded .n{color:var(--info)}
.llm .p.writing{color:var(--bg);background:var(--accent);border-color:var(--accent);box-shadow:0 0 10px var(--accent)}
.llm .p.reading{color:var(--bg);background:var(--info);border-color:var(--info);box-shadow:0 0 10px var(--info)}
.eng{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding-top:14px}
canvas{display:block;width:100%}
.g{aspect-ratio:1/0.82}.vu{height:74px;margin-top:8px}.spark{height:40px;margin-top:2px}.inst{position:relative}
.row2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.inst{padding-top:16px}
.sub[hidden]{display:none}
.sub.rates{flex-direction:column;align-items:flex-start;gap:1px}
.sub{display:flex;justify-content:space-between;font-size:10px;color:var(--dim);letter-spacing:.1em;margin-top:2px}
.sub b{color:var(--white);font-weight:600}
.fuel{display:grid;gap:7px;padding-top:16px}
.f{display:grid;grid-template-columns:78px 1fr 46px;align-items:center;gap:8px;font-size:11px}
.f .k{letter-spacing:.1em;color:var(--dim);font-weight:700}
.f .bar{height:12px;border-radius:2px;background:var(--surface);border:1px solid var(--line);position:relative;overflow:hidden}
.f .bar i{position:absolute;inset:0 auto 0 0;background:var(--fuel,var(--accent));box-shadow:0 0 8px color-mix(in srgb,var(--fuel,var(--accent)) 60%,transparent);transition:width 1.2s cubic-bezier(.2,.8,.2,1)}
.f .bar u{position:absolute;top:0;bottom:0;width:1px;background:var(--dim)}
.f.caution .bar i{--fuel:var(--warn)}
.f.warning .bar i{--fuel:var(--error)}
#f-c5,#f-c7{--fuel:${agents.claude}}#f-x7{--fuel:${agents.codex}}
.f .v{text-align:right;color:var(--white)}.f .r{grid-column:2/4;margin-top:-5px;font-size:9px;color:var(--dim);letter-spacing:.06em}
.eicas{min-height:52px;padding-top:18px;font-size:12px;font-weight:700;letter-spacing:.08em}
.eicas div{padding:2px 0}.eicas .caution{color:var(--warn)}.eicas .warning{color:var(--error);animation:alert-text .8s steps(2) infinite}
.eicas .normal{color:var(--ok)}
.status{display:flex;gap:6px;position:absolute;top:5px;right:8px}
.chip{font-size:9px;letter-spacing:.14em;font-weight:800;padding:2px 6px;border-radius:3px;border:1px solid var(--line);color:var(--dim)}
.chip.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 45%,transparent)}.chip.caution{color:var(--bg);background:var(--warn);border-color:var(--warn)}.chip.warning{color:var(--bg);background:var(--error);border-color:var(--error);animation:alert-chip .8s steps(2) infinite}
nav{display:flex;gap:6px;margin-top:2px}
nav button,nav a{flex:1;text-align:center;text-decoration:none;font:800 11px/1 -apple-system,sans-serif;letter-spacing:.2em;padding:11px 0;border-radius:7px;background:var(--surface);border:1px solid var(--dim);color:var(--dim)}
nav .on{color:var(--accent);border-color:var(--accent);box-shadow:inset 0 0 12px color-mix(in srgb,var(--accent) 12%,transparent)}
.pfd{display:contents}#sys{display:none}.sub.gap{margin-top:8px}.f .bar u{left:20%}
.sysg{padding-top:18px}
.sysr{display:grid;grid-template-columns:118px 1fr;gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:11px}
.sysr:last-child{border-bottom:0}.sysr .k{color:var(--component,var(--dim));letter-spacing:.08em;font-weight:700}.sysr .v{color:var(--white)}.sysr .v small{color:var(--dim);display:block;margin-top:1px}
.sysr.stale .k{color:var(--warn)}
.rec{display:flex;align-items:center;justify-content:flex-end;padding:6px 8px}.rec .ttl{position:static;flex:1}.rng{display:flex;gap:4px}.rng button{font:800 10px/1 -apple-system,sans-serif;letter-spacing:.12em;padding:7px 9px;border-radius:5px;background:var(--surface);border:1px solid var(--dim);color:var(--dim)}.rng button.on{color:var(--bg);background:var(--accent);border-color:var(--accent);box-shadow:0 0 8px color-mix(in srgb,var(--accent) 50%,transparent)}
.wlink{display:block;margin-top:12px;padding:11px;text-align:center;border-radius:7px;border:1px solid var(--info);color:var(--info);text-decoration:none;font-size:11px;font-weight:800;letter-spacing:.14em}
.sub.peak{margin-top:4px}.sub span{white-space:nowrap}.sub.peak b{color:var(--output)}.sub.peak span+span b{color:var(--input)}
.trng{display:flex;gap:4px;margin:20px 0 0;flex-wrap:wrap}.trng button{flex:1}.trng button{font:800 9px/1 -apple-system,sans-serif;letter-spacing:.1em;padding:5px 7px;border-radius:4px;background:var(--surface);border:1px solid var(--dim);color:var(--dim)}.trng button.on{color:var(--bg);background:var(--accent);border-color:var(--accent);box-shadow:0 0 8px color-mix(in srgb,var(--accent) 50%,transparent)}
.tot{padding-top:10px;display:grid;gap:4px}.odo{display:flex;align-items:center;gap:10px}.odo .k{width:34px;font-size:11px;font-weight:800;letter-spacing:.12em}.odo .k.in{color:var(--input)}.odo .k.out{color:var(--output)}
.digits{display:flex;gap:2px;align-items:flex-end}.dg{width:.74em;height:1.25em;overflow:hidden;border-radius:3px;border:1px solid var(--line);background:var(--surface);font:600 22px "SF Mono",ui-monospace,Menlo,monospace;color:var(--white);box-shadow:inset 0 2px 4px color-mix(in srgb,var(--bg) 80%,transparent)}
.dg .col{display:block;transition:transform 1.1s cubic-bezier(.2,.8,.2,1)}.dg .col span{display:block;height:1.25em;line-height:1.25em;text-align:center}.dg.lead{color:var(--dim)}.dg.last{color:var(--accent)}
.sep{font:600 18px "SF Mono",ui-monospace,monospace;color:var(--dim);width:.35em;text-align:center}.odx{font-size:10px;color:var(--dim);letter-spacing:.06em;padding-left:44px;margin-bottom:5px}.odx b{color:var(--white);font-weight:600}
.hint{text-align:center;color:var(--dim);font-size:10px;letter-spacing:.12em;padding:4px}
@keyframes alert-text{50%{color:var(--white)}}
@keyframes alert-chip{50%{color:var(--error);background:var(--bg)}}
nav :focus-visible,.rng button:focus-visible,.trng button:focus-visible,.wlink:focus-visible{outline-color:var(--accent)}
${systemStyles}
</style></head><body>
<div class="deck">
 <header class="span"><div class="brand"><div class="bt">OSCA <b>FLIGHT DECK</b></div><div class="bs">OPERATING SYSTEM · CORE · AGENT</div></div><div class="hdr"><div class="link lost" id="link"><i></i><span id="linkT">NO LINK</span></div><div class="clock mono" id="clock">--:--:--</div></div></header>
 <div id="pfd" class="pfd">
 <section class="panel span"><div class="ann">
  <div class="lamp unknown" id="l-claude"><div class="n">CLAUDE</div><div class="s" id="s-claude">—</div></div>
  <div class="lamp unknown" id="l-codex"><div class="n">CODEX</div><div class="s" id="s-codex">—</div></div>
  <div class="lamp unknown" id="l-hermes"><div class="n">HERMES</div><div class="s" id="s-hermes">—</div></div>
  <div class="lamp unknown" id="l-orca"><div class="n">ORCA·PI</div><div class="s" id="s-orca">—</div></div>
 </div>
 <div class="llm" id="llm"><div class="n">LLM</div><div class="m mono" id="llmM">NO MODEL</div><div class="p" id="llmP">IDLE</div></div></section>
 <section class="panel"><div class="ttl">ENGINES</div><div class="status"><span class="chip" id="loadChip">LOAD</span></div>
  <div class="eng"><div><canvas class="g" id="gCpu"></canvas><canvas class="spark" id="sCpu"></canvas></div><div><canvas class="g" id="gGpu"></canvas><canvas class="spark" id="sGpu"></canvas></div></div>
  <canvas class="vu" id="vu"></canvas><div class="sub"><span>CPU CORES</span><span><b class="mono" id="coreN">—</b></span></div></section>
 <section class="panel"><div class="row2">
  <div class="inst"><div class="ttl">LLM · IN / OUT</div><canvas class="g" id="gTps"></canvas><div class="sub rates"><b class="mono" id="strataRate">STRATA —</b><span class="mono" id="ollamaRate">OLLAMA —</span><span class="mono" id="inklingRate">INKLING —</span></div><canvas class="spark" id="sTps"></canvas><div class="sub" id="lastRates" hidden><span id="tpsSub" hidden></span><b class="mono" id="pre" hidden></b></div><div class="sub peak"><span>PEAK OUT <b class="mono" id="pkOut">—</b></span><span>PEAK IN <b class="mono" id="pkIn">—</b></span></div><div class="sub"><span id="pkR">PEAK T/S · LAST MINUTE</span></div></div>
  <div class="inst"><div class="ttl">CHIP TEMP</div><canvas class="g" id="gTemp"></canvas><canvas class="spark" id="sTemp"></canvas><div class="sub gap"><span>THERMAL</span><b class="mono" id="therm">—</b></div><div class="sub"><span>AVG / HOT</span><b class="mono" id="tAvg">—</b></div><div class="sub"><span>SWAP</span><b class="mono" id="swap">—</b></div></div>
 </div></section>
 <section class="panel span rec"><div class="ttl">FLIGHT RECORDER</div><div class="rng" id="rng"><button data-r="live" class="on">1M</button><button data-r="1h">1H</button><button data-r="24h">24H</button><button data-r="7d">7D</button><button data-r="30d">30D</button></div></section>
 <section class="panel"><div class="ttl">FUEL · QUOTA REMAINING</div><div class="fuel">
  <div class="f" id="f-c5"><span class="k">CLAUDE 5H</span><span class="bar"><i></i><u></u></span><span class="v mono">—</span><span class="r mono">—</span></div>
  <div class="f" id="f-c7"><span class="k">CLAUDE 7D</span><span class="bar"><i></i><u></u></span><span class="v mono">—</span><span class="r mono">—</span></div>
  <div class="f" id="f-x7"><span class="k">CODEX 7D</span><span class="bar"><i></i><u></u></span><span class="v mono">—</span><span class="r mono">—</span></div>
 </div></section>
 <section class="panel" id="totP"><div class="ttl" id="totT">TOKEN TOTALIZER</div><div class="trng" id="trng"><button data-t="h1">1H</button><button data-t="h24">24H</button><button data-t="month">MONTH</button><button data-t="year">YEAR</button><button data-t="total" class="on">TOTAL</button></div>
  <div class="tot"><div class="odo"><span class="k in">IN</span><div class="digits" id="oIn"></div></div><div class="odx mono" id="oInAll">INCL. CACHE —</div>
  <div class="odo"><span class="k out">OUT</span><div class="digits" id="oOut"></div></div><div class="odx mono" id="oReq">— REQUESTS</div></div></section>
 <section class="panel span" id="eicasP"><div class="ttl">EICAS</div><div class="status"><span class="chip" id="cTemp">TEMP</span><span class="chip" id="cSwap">SWAP</span></div><div class="eicas mono" id="eicas"><div class="normal">ALL SYSTEMS NORMAL</div></div></section>
 </div>
 <div id="sys" class="span"><section class="panel"><div class="ttl" id="sysT">SYSTEM STATUS</div><div class="sysg" id="sysG"><div class="hint">LOADING…</div></div><a class="wlink" href="/widget">WIDGET FÜR SPERRBILDSCHIRM EINRICHTEN ›</a></section></div>
 <nav class="span"><button class="on" id="bPfd">PFD</button><button id="bSys">SYS</button><a href="/">NEO</a></nav>
</div>
<script nonce="${nonce}">
"use strict";
var C=${JSON.stringify(canvasColors)},engineColors=${JSON.stringify(runtimes)},modelColors=new Map(${JSON.stringify(modelColors)});
function tint(color,opacity){return color+Math.round(opacity*255).toString(16).padStart(2,"0");}
var $=function(id){return document.getElementById(id);};
var data=null,lastFrame=0,boot=performance.now();
var anim={cpu:0,gpu:0,tps:0,temp:30,split:0,strataSplit:0,inklingSplit:0};
var strataScale={input:2000,output:200},ollamaScale={input:1000,output:40};
var cores=[],peaks=[],peakT=[];
function lerp(a,b,k){return a+(b-a)*k;}
function zone(v,c,w){return v>=w?C.red:v>=c?C.amber:C.green;}
var ZOOM=1;
function fit(cv){var r=cv.getBoundingClientRect(),ratio=cv.offsetWidth?r.width/cv.offsetWidth:1,d=(window.devicePixelRatio||1)*ZOOM/(ratio||1),w=Math.round(r.width*d),h=Math.round(r.height*d);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}var x=cv.getContext("2d");x.setTransform(d,0,0,d,0,0);return {x:x,w:r.width,h:r.height};}
function gauge(cv,o){
 var g=fit(cv),x=g.x,w=g.w,h=g.h;x.clearRect(0,0,w,h);
 var cx=w/2,cy=h*0.6,R=Math.min(w*0.41,h*0.46),a0=Math.PI*0.75,a1=Math.PI*2.25;
 function ang(v){return a0+(a1-a0)*Math.max(0,Math.min(1,(v-o.min)/(o.max-o.min)));}
 x.lineCap="butt";
 x.beginPath();x.arc(cx,cy,R,a0,a1);x.strokeStyle=C.line;x.lineWidth=R*0.13;x.stroke();
 var v=o.value===null?o.min:o.value,col=o.value===null?C.dim:o.color||zone(v,o.caution,o.warning);
 var grad=x.createLinearGradient(cx-R,cy,cx+R,cy);grad.addColorStop(0,tint(C.white,.05));grad.addColorStop(1,tint(C.white,.16));
 x.beginPath();x.moveTo(cx,cy);x.arc(cx,cy,R*0.93,a0,ang(v));x.closePath();x.fillStyle=grad;x.fill();
 if(o.caution!=null){x.beginPath();x.arc(cx,cy,R,ang(o.caution),ang(o.warning));x.strokeStyle=C.amber;x.lineWidth=R*0.07;x.stroke();}
 if(o.warning!=null){x.beginPath();x.arc(cx,cy,R,ang(o.warning),a1);x.strokeStyle=C.red;x.lineWidth=R*0.07;x.stroke();}
 x.save();x.shadowColor=col;x.shadowBlur=10;x.beginPath();x.arc(cx,cy,R,a0,ang(v));x.strokeStyle=col;x.globalAlpha=.9;x.lineWidth=R*0.045;x.stroke();x.restore();
 for(var i=0;i<=10;i++){var t=a0+(a1-a0)*i/10,big=i%2===0;x.beginPath();x.moveTo(cx+Math.cos(t)*(R*0.80),cy+Math.sin(t)*(R*0.80));x.lineTo(cx+Math.cos(t)*(R*(big?0.70:0.75)),cy+Math.sin(t)*(R*(big?0.70:0.75)));x.strokeStyle=C.dim;x.lineWidth=big?1.6:1;x.stroke();
  if(big&&o.labels){x.fillStyle=C.dim;x.font="600 "+Math.max(8,R*0.13)+"px -apple-system,sans-serif";x.textAlign="center";x.textBaseline="middle";x.fillText(String(Math.round(o.min+(o.max-o.min)*i/10)),cx+Math.cos(t)*R*0.56,cy+Math.sin(t)*R*0.56);}}
 var na=ang(v);x.save();x.shadowColor=tint(C.white,.8);x.shadowBlur=8;x.beginPath();x.moveTo(cx+Math.cos(na+Math.PI/2)*R*0.035,cy+Math.sin(na+Math.PI/2)*R*0.035);x.lineTo(cx+Math.cos(na)*R*0.97,cy+Math.sin(na)*R*0.97);x.lineTo(cx+Math.cos(na-Math.PI/2)*R*0.035,cy+Math.sin(na-Math.PI/2)*R*0.035);x.closePath();x.fillStyle=C.white;x.fill();x.restore();
 x.beginPath();x.arc(cx,cy,R*0.07,0,Math.PI*2);x.fillStyle=C.line;x.fill();x.strokeStyle=C.dim;x.lineWidth=1;x.stroke();
 var bw=R*1.16,bh=R*0.38,bx=cx-bw/2,by=cy+R*0.30;
 x.fillStyle=C.bg;x.strokeStyle=o.value===null?C.line:col;x.lineWidth=1.2;x.beginPath();if(x.roundRect)x.roundRect(bx,by,bw,bh,3);else x.rect(bx,by,bw,bh);x.fill();x.stroke();
 x.fillStyle=o.value===null?C.dim:col;x.font="600 "+(bh*0.68)+"px 'SF Mono',ui-monospace,Menlo,monospace";x.textBaseline="middle";if(o.unit){x.textAlign="right";x.fillText(o.text,bx+bw*0.72,by+bh*0.54);x.fillStyle=C.dim;x.font="700 "+Math.max(8,bh*0.30)+"px -apple-system,sans-serif";x.textAlign="left";x.fillText(o.unit,bx+bw*0.76,by+bh*0.56);}else{x.textAlign="center";x.fillText(o.text,cx,by+bh*0.54);}
 x.fillStyle=C.white;x.font="800 "+Math.max(10,R*0.16)+"px -apple-system,sans-serif";x.textAlign="left";x.textBaseline="top";x.fillText(o.label,2,1);
}
function isGenerating(llm){return !!llm&&(llm.phase==="reading"||llm.phase==="writing");}
function throughput(llm){
 if(!isGenerating(llm))return {direction:"",text:"IDLE",measured:false};
 var input=llm.phase==="reading",rate=input?llm.prefillTps:llm.tps;
 return {direction:input?"IN":"OUT",text:rate==null?"—":input?String(Math.round(rate)):rate.toFixed(1),measured:rate!=null};
}
// The big centre readout follows the engine that is working right now: Strata, then Inkling, then Ollama. A held engine
// keeps the display for 3 s before a different one takes over, so two busy engines cannot make it flicker.
var center={key:"",since:0};
function pickCenter(f,now){
 var s=f?{strata:f.strata,inkling:f.inkling,ollama:f.llm}:{},order=["strata","inkling","ollama"],want="";
 for(var i=0;i<order.length;i++){if(isGenerating(s[order[i]])){want=order[i];break;}}
 if(want!==center.key){
  if(want&&center.key&&isGenerating(s[center.key])&&now-center.since<3000)want=center.key;
  else center={key:want,since:now};
 }
 return {key:want,state:want?s[want]:null};
}
function needlePosition(llm,scale){
 if(!isGenerating(llm))return 0;
 return llm.phase==="reading"?-Math.min(1,(llm.prefillTps||0)/scale.input):Math.min(1,(llm.tps||0)/scale.output);
}
// Strata on the outer scale, Ollama and Inkling on the inner scale. Input left, output right.
function splitGauge(cv,o){
 var g=fit(cv),x=g.x,w=g.w,h=g.h;x.clearRect(0,0,w,h);
 var cx=w/2,cy=h*0.6,R=Math.min(w*0.41,h*0.46),a0=Math.PI*0.75,a1=Math.PI*2.25,mid=(a0+a1)/2,half=(a1-a0)/2;
 function ang(p){return mid+Math.max(-1,Math.min(1,p))*half;}
 x.beginPath();x.arc(cx,cy,R,a0,a1);x.strokeStyle=C.line;x.lineWidth=R*0.13;x.stroke();
 x.beginPath();x.arc(cx,cy,R,a0,mid);x.strokeStyle=tint(C.input,.35);x.lineWidth=R*0.05;x.stroke();
 x.beginPath();x.arc(cx,cy,R,mid,a1);x.strokeStyle=tint(C.output,.35);x.lineWidth=R*0.05;x.stroke();
 var p=o.strata,col=o.direction?engineColors[o.primary]:C.dim,na=ang(p);
 var grad=x.createLinearGradient(cx-R,cy,cx+R,cy);grad.addColorStop(0,tint(C.input,.14));grad.addColorStop(0.5,tint(C.white,.04));grad.addColorStop(1,tint(C.output,.14));
 x.beginPath();x.moveTo(cx,cy);if(p<0)x.arc(cx,cy,R*0.93,na,mid);else x.arc(cx,cy,R*0.93,mid,na);x.closePath();x.fillStyle=grad;x.fill();
 x.save();x.shadowColor=engineColors.strata;x.shadowBlur=10;x.beginPath();if(p<0)x.arc(cx,cy,R,na,mid);else x.arc(cx,cy,R,mid,na);x.strokeStyle=engineColors.strata;x.lineWidth=R*0.045;x.stroke();x.restore();
 var labels=["2k","1k","0","100","200"];
 for(var i=0;i<=8;i++){var q=-1+i/4,t=ang(q),big=i%2===0;x.beginPath();x.moveTo(cx+Math.cos(t)*R*0.80,cy+Math.sin(t)*R*0.80);x.lineTo(cx+Math.cos(t)*R*(big?0.70:0.75),cy+Math.sin(t)*R*(big?0.70:0.75));x.strokeStyle=q===0?C.white:C.dim;x.lineWidth=q===0?2.2:big?1.6:1;x.stroke();
  if(big){var lt=ang(q===-1?-0.74:q===1?0.74:q);x.fillStyle=engineColors.strata;x.font="700 "+Math.max(8,R*0.12)+"px -apple-system,sans-serif";x.textAlign="center";x.textBaseline="middle";x.fillText(labels[i/2],cx+Math.cos(lt)*R*0.67,cy+Math.sin(lt)*R*0.67);}}
 x.save();x.shadowColor=engineColors.strata;x.shadowBlur=8;x.beginPath();x.moveTo(cx+Math.cos(na+Math.PI/2)*R*0.035,cy+Math.sin(na+Math.PI/2)*R*0.035);x.lineTo(cx+Math.cos(na)*R*0.97,cy+Math.sin(na)*R*0.97);x.lineTo(cx+Math.cos(na-Math.PI/2)*R*0.035,cy+Math.sin(na-Math.PI/2)*R*0.035);x.closePath();x.fillStyle=engineColors.strata;x.fill();x.restore();
 x.beginPath();x.arc(cx,cy,R*0.07,0,Math.PI*2);x.fillStyle=C.line;x.fill();x.strokeStyle=C.dim;x.lineWidth=1;x.stroke();
 var inner=R*0.52,sa=ang(o.ollama);
 x.beginPath();x.arc(cx,cy,inner,a0,a1);x.strokeStyle=engineColors.ollama;x.lineWidth=1.4;x.stroke();
 x.font="700 "+Math.max(8,R*0.12)+"px -apple-system,sans-serif";x.textAlign="center";x.textBaseline="middle";x.fillStyle=engineColors.ollama;
 for(var j=-2;j<=2;j++){
  var tick=j/2,at=ang(tick),cos=Math.cos(at),sin=Math.sin(at);
  x.beginPath();x.moveTo(cx+cos*inner,cy+sin*inner);x.lineTo(cx+cos*R*0.48,cy+sin*R*0.48);x.stroke();
  if(j!==0){
   var value=Math.abs(tick)*(j<0?ollamaScale.input:ollamaScale.output);
   var labelAngle=ang(j===-2?-0.85:j===2?0.85:tick);
   x.fillText(value>=1000?value/1000+"k":String(value),cx+Math.cos(labelAngle)*R*0.42,cy+Math.sin(labelAngle)*R*0.42);
  }
 }
 // A small tangential gap keeps the Ollama needle visible when both are at zero.
 var gap=Math.max(4,R*0.075),sx=cx-Math.sin(sa)*gap,sy=cy+Math.cos(sa)*gap;
 x.beginPath();x.moveTo(sx,sy);x.lineTo(sx+Math.cos(sa)*inner,sy+Math.sin(sa)*inner);
 x.strokeStyle=engineColors.ollama;x.lineWidth=Math.max(2,R*0.04);x.stroke();
 if(o.inklingAvailable){
  var ia=ang(o.inkling);
  x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+Math.cos(ia)*inner,cy+Math.sin(ia)*inner);
  x.strokeStyle=engineColors.inkling;x.lineWidth=Math.max(2,R*0.03);x.stroke();
 }
 var bw=R*1.34,bh=R*0.38,bx=cx-bw/2,by=cy+R*0.30;x.fillStyle=C.bg;x.strokeStyle=col;x.lineWidth=1.2;x.beginPath();if(x.roundRect)x.roundRect(bx,by,bw,bh,3);else x.rect(bx,by,bw,bh);x.fill();x.stroke();
 x.fillStyle=col;x.textBaseline="middle";x.font="600 "+(bh*0.62)+"px 'SF Mono',ui-monospace,Menlo,monospace";
 if(!o.direction){x.textAlign="center";x.fillText("IDLE",cx,by+bh*0.54);}else{
  // IN/OUT tag on the left; the value is right-aligned and shrinks if needed so a clear gap always remains.
  var tagF="800 "+Math.max(8,bh*0.28)+"px -apple-system,sans-serif",valF=bh*0.62,right=bx+bw*0.74,tagX=bx+bw*0.06;x.save();x.font=tagF;x.textAlign="left";x.fillText(o.direction,tagX,by+bh*0.56);var tagEnd=tagX+x.measureText(o.direction).width+bh*0.30;x.restore();
  x.font="600 "+valF+"px 'SF Mono',ui-monospace,Menlo,monospace";var vw=x.measureText(o.text).width;if(right-vw<tagEnd){valF=valF*Math.max(0.6,(right-tagEnd)/vw);x.font="600 "+valF+"px 'SF Mono',ui-monospace,Menlo,monospace";}
  x.textAlign="right";x.fillText(o.text,right,by+bh*0.54);x.fillStyle=C.dim;x.font="700 "+Math.max(8,bh*0.30)+"px -apple-system,sans-serif";x.textAlign="left";if(o.measured)x.fillText("T/S",bx+bw*0.775,by+bh*0.56);}
 x.fillStyle=C.white;x.font="800 "+Math.max(10,R*0.16)+"px -apple-system,sans-serif";x.textAlign="left";x.textBaseline="top";x.fillText(o.label,2,1);
}
// Mirrored trend: output above the centre line, input below.
function spark2(cv,outArr,inArr){
 var g=fit(cv),x=g.x,w=g.w,h=g.h,mid=h/2;x.clearRect(0,0,w,h);
 x.strokeStyle=tint(C.white,.14);x.lineWidth=1;x.beginPath();x.moveTo(0,mid);x.lineTo(w,mid);x.stroke();
 var vo=outArr.filter(function(v){return v!=null;}),vi=inArr.filter(function(v){return v!=null;});
 var mo=Math.max(25,Math.max.apply(null,vo.concat([0]))*1.15),mi=Math.max(1000,Math.max.apply(null,vi.concat([0]))*1.1);
 function draw(arr,max,col,up){var n=range==="live"?60:arr.length,step=w/Math.max(1,n-1),open=false;if(arr.length<2)return;x.save();x.shadowColor=col;x.shadowBlur=6;x.strokeStyle=col;x.lineWidth=1.4;x.beginPath();
  for(var i=0;i<arr.length;i++){var v=arr[i];if(v==null){open=false;continue;}var px=w-(arr.length-1-i)*step,py=up?mid-1-(Math.min(v,max)/max)*(mid-2):mid+1+(Math.min(v,max)/max)*(mid-2);if(!open){x.moveTo(px,py);open=true;}else x.lineTo(px,py);}
  x.stroke();x.restore();}
 draw(outArr,mo,C.output,true);draw(inArr,mi,C.input,false);
}
// Mechanical odometer: one rolling column per digit, leading zeros dimmed, last digit in the accent color.
function odo(el,value,digits){
 var str=String(Math.max(0,Math.round(value||0)));while(str.length<digits)str="0"+str;var lead=str.length-String(Math.max(0,Math.round(value||0))).length;
 if(el.getAttribute("data-n")!==String(str.length)){el.textContent="";el.setAttribute("data-n",String(str.length));
  for(var i=0;i<str.length;i++){if(i>0&&(str.length-i)%3===0){var sp=document.createElement("span");sp.className="sep";sp.textContent=".";el.appendChild(sp);}
   var d=document.createElement("span");d.className="dg";var c=document.createElement("span");c.className="col";for(var k=0;k<10;k++){var e=document.createElement("span");e.textContent=String(k);c.appendChild(e);}d.appendChild(c);el.appendChild(d);}}
 var cells=el.querySelectorAll(".dg");for(var j=0;j<cells.length;j++){cells[j].className="dg"+(j<lead?" lead":"")+(j===cells.length-1?" last":"");cells[j].firstChild.style.transform="translateY(-"+(Number(str[j])*1.25)+"em)";}
}
var tokRange="total";
function totalizer(){var t=data&&data.tokens;if(!t){$("oInAll").textContent="LEDGER OFFLINE";odo($("oIn"),0,10);odo($("oOut"),0,10);return;}
 var r=t.ranges[tokRange];odo($("oIn"),r.inNew,10);odo($("oOut"),r.out,10);
 var d=t.init.split("-");$("totT").textContent="TOKEN TOTALIZER · SINCE "+d[2]+"."+d[1]+"."+d[0];
 $("oInAll").innerHTML="INCL. CACHE <b>"+r.inTotal.toLocaleString("de-DE")+"</b>";$("oReq").innerHTML="<b>"+r.requests.toLocaleString("de-DE")+"</b> REQUESTS · Ø/DAY IN <b>"+t.perDay.inNew.toLocaleString("de-DE")+"</b>";}
function vu(cv,now,dt){
 var g=fit(cv),x=g.x,w=g.w,h=g.h;x.clearRect(0,0,w,h);var n=cores.length||18,gap=3,bw=(w-gap*(n-1))/n,seg=14,sh=(h-seg)/seg;
 for(var i=0;i<n;i++){var v=cores[i]||0;
  if(v>=peaks[i]||!peaks[i]){peaks[i]=v;peakT[i]=now;}else if(now-peakT[i]>900){peaks[i]=Math.max(v,peaks[i]-dt*0.06);}
  var lit=Math.round(v/100*seg);
  for(var s=0;s<seg;s++){var pct=(s+1)/seg*100,col=pct>90?C.red:pct>70?C.amber:C.green,on=s<lit,y=h-(s+1)*(sh+1);
   x.fillStyle=on?col:tint(C.white,.045);if(on){x.shadowColor=col;x.shadowBlur=6;}else x.shadowBlur=0;x.fillRect(i*(bw+gap),y,bw,sh);}
  x.shadowBlur=0;var ps=Math.min(seg-1,Math.max(0,Math.round(peaks[i]/100*seg)-1));if(peaks[i]>3){var pc=(ps+1)/seg*100;x.fillStyle=pc>90?C.red:pc>70?C.amber:C.white;x.fillRect(i*(bw+gap),h-(ps+1)*(sh+1),bw,Math.max(1.5,sh*0.45));}
 }
}
function spark(cv,arr,min,max,color,auto){
 var g=fit(cv),x=g.x,w=g.w,h=g.h;x.clearRect(0,0,w,h);var vals=arr.filter(function(v){return v!=null;});if(auto)max=Math.max(max,Math.max.apply(null,vals.concat([0]))*1.15);
 x.strokeStyle=tint(C.white,.06);x.lineWidth=1;for(var k=1;k<4;k++){x.beginPath();x.moveTo(0,h*k/4);x.lineTo(w,h*k/4);x.stroke();}
 if(vals.length<2)return;var n=range==="live"?60:arr.length,step=w/Math.max(1,n-1),y=function(v){return h-2-Math.max(0,Math.min(1,(v-min)/(max-min)))*(h-4);};
 var pts=[];for(var i=0;i<arr.length;i++)pts.push(arr[i]==null?null:[w-(arr.length-1-i)*step,y(arr[i])]);
 x.save();x.shadowColor=color;x.shadowBlur=8;x.strokeStyle=color;x.lineWidth=1.6;x.beginPath();var open=false;
 pts.forEach(function(p){if(!p){open=false;return;}if(!open){x.moveTo(p[0],p[1]);open=true;}else x.lineTo(p[0],p[1]);});x.stroke();x.restore();
 var gr=x.createLinearGradient(0,0,0,h);gr.addColorStop(0,color+"40");gr.addColorStop(1,color+"00");x.fillStyle=gr;
 var seg=[];pts.concat([null]).forEach(function(p){if(p){seg.push(p);return;}if(seg.length>1){x.beginPath();x.moveTo(seg[0][0],h);seg.forEach(function(q){x.lineTo(q[0],q[1]);});x.lineTo(seg[seg.length-1][0],h);x.closePath();x.fill();}seg=[];});
}
function emptySeries(){return {cpu:[],gpu:[],tps:[],temp:[],tin:[]};}
var range="live",recorded=emptySeries(),recTimer=null,recPeak={out:null,in:null},rangeRequest=0;
function loadRange(){
 var selected=range,request=++rangeRequest;
 fetch("/api/cockpit/history?range="+(selected==="live"?"1m":selected),{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(d){
  if(!d||!d.ok||request!==rangeRequest)return;
  var rec=emptySeries(),prev=null;
  d.points.forEach(function(p){
   if(prev!==null){for(var missing=prev+d.step;missing<p[0];missing+=d.step){rec.cpu.push(null);rec.gpu.push(null);rec.tps.push(null);rec.temp.push(null);rec.tin.push(null);}}
   prev=p[0];rec.cpu.push(p[1]);rec.gpu.push(p[2]);rec.tps.push(p[3]);rec.temp.push(p[4]);rec.tin.push(p[5]??null);
  });
  recorded=rec;recPeak=d.peak||{out:null,in:null};updatePeaks();updateLastRates(d.last);
 }).catch(function(){});
}
function scheduleRange(){clearInterval(recTimer);loadRange();recTimer=setInterval(loadRange,range==="live"?2000:30000);}
function updateLastRates(last){
 var out=last?.out,input=last?.in;
 $("lastRates").hidden=out==null&&input==null;
 $("tpsSub").hidden=out==null;$("pre").hidden=input==null;
 if(out!=null)$("tpsSub").textContent="LAST OUT "+out.toFixed(1);
 if(input!=null)$("pre").textContent="LAST IN "+Math.round(input).toLocaleString("de-DE");
}
function updatePeaks(){
 var po=recPeak.out,pi=recPeak.in;
 $("pkOut").textContent=po!=null&&po>0?po.toFixed(1):"—";$("pkIn").textContent=pi!=null&&pi>0?Math.round(pi).toLocaleString("de-DE"):"—";
 $("pkR").textContent="PEAK T/S · "+({live:"LAST MINUTE","1h":"LAST HOUR","24h":"LAST 24 H","7d":"LAST 7 DAYS","30d":"LAST 30 DAYS"})[range];
}
function series(k){return recorded[k];}
function setLamp(id,lamp,sub){var el=$("l-"+id);el.className="lamp "+lamp;$("s-"+id).textContent=sub;}
function pad(n){return (n<10?"0":"")+n;}
function when(ms){if(!ms)return "—";var d=new Date(ms);return "R "+pad(d.getDate())+"."+pad(d.getMonth()+1)+". "+pad(d.getHours())+":"+pad(d.getMinutes());}
function fuel(id,w){var el=$(id),r=w.remaining;el.className="f"+(r===null?"":r<=10?" warning":r<=20?" caution":"");el.querySelector("i").style.width=(r===null?0:Math.max(0,Math.min(100,r)))+"%";el.querySelector(".v").textContent=r===null?"—":Math.round(r)+"%";el.querySelector(".r").textContent=when(w.reset);}
function chip(id,label,level){var el=$(id);el.className="chip "+(level||"");el.textContent=label;}
function apply(f){
 data=f;lastFrame=Date.now();var a=f.agents;
 setLamp("claude",a.claude.lamp,a.claude.working?a.claude.working+" WORKING":a.claude.open+" OPEN");
 setLamp("codex",a.codex.lamp,a.codex.working?a.codex.working+" WORKING":a.codex.partial?"PARTIAL":"IDLE");
 setLamp("hermes",a.hermes.lamp,a.hermes.lamp==="active"?"WORKING":a.hermes.lamp==="off"?"STOPPED":a.hermes.whatsapp==="connected"?"WA ✓":"IDLE");
 setLamp("orca",a.orca.lamp,a.orca.lamp==="off"?"CLOSED":"PI "+a.orca.piActive+"/"+a.orca.pi+" · "+a.orca.active+"/"+a.orca.terminals);
 var l=f.llm,st=f.strata,ink=f.inkling,stActive=isGenerating(st),inkActive=!stActive&&!isGenerating(l)&&isGenerating(ink),shown=stActive?st:inkActive?ink:l;
 var names=(l.engines||[]).map(function(e){return e.model;});
 $("llm").className="llm"+(stActive||inkActive||l.loaded?" loaded":"");
 var modelLine=$("llmM"),modelText=stActive?"STRATA · ACTIVE":inkActive?"INKLING · ACTIVE":l.loaded?"LOADED · "+(names.length?names.join(" · "):l.model):"NO MODEL LOADED";
 if(l.loaded&&!stActive&&!inkActive&&names.length>1){
  modelLine.style.color=C.white;
  if(modelLine.textContent!==modelText){
   modelLine.textContent="LOADED";
   names.forEach(function(name){
    var label=document.createElement("span");
    label.style.color=modelColors.get(name.toLowerCase())||C.white;
    label.textContent=name;
    modelLine.append(" · ",label);
   });
  }
 }else{
  modelLine.textContent=modelText;
  modelLine.style.color=stActive?engineColors.strata:inkActive?engineColors.inkling:l.loaded?(modelColors.get((names[0]||l.model||"").toLowerCase())||C.white):C.dim;
 }
 var p=$("llmP");p.className="p "+shown.phase;p.textContent=shown.phase==="writing"?"WRITING":shown.phase==="reading"?"READING "+(shown.progress!=null?Math.round(shown.progress*100)+"%":""):shown.phase==="idle"?"IDLE":"—";
 totalizer();
 var stRate=$("strataRate"),olRate=$("ollamaRate"),stFlow=throughput(st),olFlow=throughput(l);
 stRate.style.color=engineColors.strata;olRate.style.color=engineColors.ollama;
 stRate.textContent="STRATA "+(!st?"OFFLINE":stFlow.direction?stFlow.direction+" "+stFlow.text:"IDLE");
 olRate.textContent="OLLAMA "+(olFlow.direction?olFlow.direction+" "+olFlow.text:l.phase==="unknown"?"—":"IDLE");
 var inkFlow=throughput(ink),inkRate=$("inklingRate");inkRate.style.color=engineColors.inkling;
 inkRate.textContent="INKLING "+(!ink?"OFFLINE":inkFlow.direction?inkFlow.direction+" "+inkFlow.text:"IDLE");
 cores=f.live.cores||[];$("coreN").textContent=cores.length?cores.length+" × "+(f.live.cpu!=null?Math.round(f.live.cpu)+"%":"—"):"—";
 var t=f.temp;$("therm").textContent=(t.thermal||"—").toUpperCase();$("therm").style.color=t.thermal==="nominal"?C.green:t.thermal==="fair"?C.cyan:t.thermal==="serious"?C.amber:t.thermal==="critical"?C.red:C.dim;
 $("tAvg").textContent=(t.avg!=null?t.avg.toFixed(0):"—")+" / "+(t.hottest!=null?t.hottest.toFixed(0):"—")+" °C";
 var sw=f.memory.swapBytes;$("swap").textContent=sw==null?"—":sw<1048576?"0 MB":sw<1073741824?Math.round(sw/1048576)+" MB":(sw/1073741824).toFixed(1)+" GB";$("swap").style.color=f.memory.level==="ok"?C.green:f.memory.level==="caution"?C.amber:C.red;
 fuel("f-c5",f.quota.claude.h5);fuel("f-c7",f.quota.claude.d7);fuel("f-x7",f.quota.codex.d7);
 chip("cTemp","TEMP",t.level==="ok"?"ok":t.level);chip("cSwap","SWAP",f.memory.level==="ok"?"ok":f.memory.level);
 var cpu=f.live.cpu||0,gpu=f.live.gpu||0;chip("loadChip",cpu>=90?"CPU HIGH":gpu>=95?"FULL POWER":"NORMAL",cpu>=90?"caution":"ok");
 var e=$("eicas");e.textContent="";if(!f.alerts.length){var d=document.createElement("div");d.className="normal";d.textContent="ALL SYSTEMS NORMAL";e.appendChild(d);}
 f.alerts.slice(0,4).forEach(function(al){var d=document.createElement("div");d.className=al.level;d.textContent=(al.level==="warning"?"▲ ":"● ")+al.text;e.appendChild(d);});
}
var lastT=performance.now();
function frame(now){
 var dt=Math.min(100,now-lastT);lastT=now;var k=1-Math.exp(-dt/140),kt=1-Math.exp(-dt/400);
 var sweep=Math.max(0,1-(now-boot)/1800),sv=sweep>0?Math.sin(Math.min(1,(now-boot)/900)*Math.PI/2)*(sweep>0.5?1:sweep*2):0;
 var f=data,cpu=f&&f.live.cpu!=null?f.live.cpu:0,gpu=f&&f.live.gpu!=null?f.live.gpu:0,tps=f&&f.llm.tps!=null?f.llm.tps:0,temp=f&&f.temp.max!=null?f.temp.max:30;
 anim.cpu=lerp(anim.cpu,sweep>0?100*sv:cpu,k);anim.gpu=lerp(anim.gpu,sweep>0?100*sv:gpu,k);anim.tps=lerp(anim.tps,sweep>0?40*sv:tps,kt);anim.temp=lerp(anim.temp,sweep>0?30+80*sv:temp,kt);var split=needlePosition(f&&f.llm,ollamaScale);
 anim.split=lerp(anim.split,split,kt);
 anim.inklingSplit=lerp(anim.inklingSplit,needlePosition(f&&f.inkling,ollamaScale),kt);
 var st=f&&f.strata,stActive=isGenerating(st),ctr=pickCenter(f,now),display=throughput(ctr.state);
 var stSplit=needlePosition(st,strataScale);
 anim.strataSplit=lerp(anim.strataSplit,sweep>0&&!stActive?(sv*2-1)*(sweep>0.5?1:sweep*2):stSplit,kt);

 if(!$("pfd").hidden){
  gauge($("gCpu"),{min:0,max:100,caution:70,warning:90,value:f&&f.live.cpu!=null||sweep>0?anim.cpu:null,text:f&&f.live.cpu!=null?anim.cpu.toFixed(1):"—",label:"CPU",unit:"%",labels:true});
  gauge($("gGpu"),{min:0,max:100,color:C.gpu,value:f&&f.live.gpu!=null||sweep>0?anim.gpu:null,text:f&&f.live.gpu!=null?anim.gpu.toFixed(0):"—",label:"GPU",unit:"%",labels:true});
  splitGauge($("gTps"),{ollama:anim.split,inkling:anim.inklingSplit,inklingAvailable:!!(f&&f.inkling),strata:anim.strataSplit,primary:ctr.key||"ollama",
   label:"IN·OUT",text:display.text,direction:display.direction,measured:display.measured});
  gauge($("gTemp"),{min:30,max:110,caution:85,warning:95,value:f&&f.temp.max!=null||sweep>0?anim.temp:null,text:f&&f.temp.max!=null?anim.temp.toFixed(1):"—",label:"CHIP",unit:"°C",labels:true});
  vu($("vu"),now,dt);spark($("sCpu"),series("cpu"),0,100,C.cpu,false);spark($("sGpu"),series("gpu"),0,100,C.gpu,false);spark2($("sTps"),series("tps"),series("tin"));spark($("sTemp"),series("temp"),30,110,C.chip,false);
 }
 var age=Date.now()-lastFrame,ln=$("link");ln.className="link "+(age<2500?"ok":age<10000?"stale":"lost");$("linkT").textContent=age<2500?"DATA LINK":age<10000?"STALE":"NO LINK";
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(function(){var d=new Date();$("clock").textContent=pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());},250);
var es=null,poll=null;
function startPoll(){if(poll)return;poll=setInterval(function(){fetch("/api/cockpit",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(f){if(f&&f.ok)apply(f);}).catch(function(){});},1000);}
function connect(){if(!window.EventSource){startPoll();return;}es=new EventSource("/api/cockpit/stream");es.onmessage=function(ev){try{apply(JSON.parse(ev.data));if(poll){clearInterval(poll);poll=null;}}catch(e){}};es.onerror=function(){startPoll();};}
connect();scheduleRange();
window.addEventListener("pageshow",function(e){if(e.persisted)scheduleRange();});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"){boot=performance.now();if(!es||es.readyState===2){if(es)es.close();connect();}lock();scheduleRange();}else{clearInterval(recTimer);rangeRequest++;}});
var wl=null;function lock(){if(!("wakeLock" in navigator))return;navigator.wakeLock.request("screen").then(function(l){wl=l;}).catch(function(){});}
lock();document.addEventListener("click",function(){if(!wl||wl.released)lock();});
function sysView(){fetch("/api/mobile",{cache:"no-store"}).then(function(r){return r.json();}).then(function(m){var g=$("sysG");g.textContent="";if(!m.ok){g.innerHTML="<div class=hint>NEO OFFLINE</div>";return;}
 if(data&&data.tokens){var th=document.createElement("div");th.className="hint";th.style.textAlign="left";th.style.color=C.yellow;th.style.paddingTop="10px";th.textContent="TOKENS · SINCE "+data.tokens.init;g.appendChild(th);
  [["h1","LAST HOUR"],["h24","LAST 24 H"],["month","THIS MONTH"],["year","THIS YEAR"],["total","TOTAL"]].forEach(function(z){var r=data.tokens.ranges[z[0]],row=document.createElement("div");row.className="sysr";var k=document.createElement("div");k.className="k";k.textContent=z[1];var v=document.createElement("div");v.className="v mono";v.textContent="IN "+r.inNew.toLocaleString("de-DE")+" · OUT "+r.out.toLocaleString("de-DE");var sm=document.createElement("small");sm.textContent="incl. cache "+r.inTotal.toLocaleString("de-DE")+" · "+r.requests.toLocaleString("de-DE")+" requests";v.appendChild(sm);row.appendChild(k);row.appendChild(v);g.appendChild(row);});}
 m.pages.forEach(function(pg){var h=document.createElement("div");h.className="hint";h.style.textAlign="left";h.style.color=C.yellow;h.style.paddingTop="10px";h.textContent=pg.name;g.appendChild(h);
  pg.tiles.forEach(function(t){var r=document.createElement("div");r.className="sysr"+(t.quality==="stale"||t.quality==="unavailable"?" stale":"");r.setAttribute("data-component",t.module);var k=document.createElement("div");k.className="k";k.textContent=t.title;var v=document.createElement("div");v.className="v mono";
   var txt=t.quota?t.quota.windows.map(function(w){return w.label+" "+(w.remaining==null?"—":Math.round(w.remaining)+"%");}).join(" · "):t.lines.join(" · ");v.textContent=txt;var s=document.createElement("small");s.textContent=t.footer;v.appendChild(s);r.appendChild(k);r.appendChild(v);g.appendChild(r);});});
 $("sysT").textContent="SYSTEM STATUS · v"+m.version;wall();}).catch(function(){});}
var sysTimer=null;
Array.prototype.forEach.call(document.querySelectorAll("#trng button"),function(b){b.onclick=function(){tokRange=b.getAttribute("data-t");Array.prototype.forEach.call(document.querySelectorAll("#trng button"),function(o){o.className=o===b?"on":"";});totalizer();};});
Array.prototype.forEach.call(document.querySelectorAll("#rng button"),function(b){b.onclick=function(){range=b.getAttribute("data-r");Array.prototype.forEach.call(document.querySelectorAll("#rng button"),function(o){o.className=o===b?"on":"";});recorded=emptySeries();recPeak={out:null,in:null};updatePeaks();scheduleRange();};});
$("bSys").onclick=function(){$("pfd").hidden=true;$("pfd").style.display="none";$("sys").style.display="block";$("bSys").className="on";$("bPfd").className="";sysView();sysTimer=setInterval(sysView,5000);wall();};
$("bPfd").onclick=function(){$("pfd").hidden=false;$("pfd").style.display="";$("sys").style.display="none";$("bPfd").className="on";$("bSys").className="";clearInterval(sysTimer);boot=performance.now();wall();};
// Big-screen mode (e.g. Mac Studio display): scale the whole deck to fill the window, re-rendering canvases at full resolution.
function wall(){var dk=document.querySelector(".deck"),on=window.innerWidth>=1300&&window.innerWidth>window.innerHeight;document.documentElement.classList.toggle("wall",on);dk.style.zoom="";ZOOM=1;if(!on)return;
 var h=dk.offsetHeight||1;ZOOM=Math.max(0.5,Math.min(window.innerWidth*0.98/1100,window.innerHeight*0.97/h));dk.style.zoom=String(ZOOM);}
var wallT=null;window.addEventListener("resize",function(){clearTimeout(wallT);wallT=setTimeout(wall,120);});wall();setTimeout(wall,600);
</script></body></html>`;}
