// OSCA flight deck: animated cockpit page for the iPhone (home screen web app).
// Main view (PFD): annunciator lamps, CPU/GPU engine gauges, per-core VU meter, LLM token rate,
// temperature, quota "fuel" and an EICAS-style message line. Second view (SYS): all Neo values compactly.
// Client code avoids backticks and "${" on purpose because it lives inside this template string.

export function cockpitHtml(nonce:string):string{return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#000000"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="OSCA">
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/cockpit-icon.png"><title>OSCA</title>
<style nonce="${nonce}">
:root{--bg:#000;--panel:#06090d;--line:#18212c;--white:#e9eef3;--dim:#5d6b7a;--green:#2bea6c;--amber:#ffb020;--red:#ff3b3b;--cyan:#33e0ff;--magenta:#ff4fd8;color-scheme:dark}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
html,body{margin:0;background:var(--bg);color:var(--white);font-family:-apple-system,"SF Pro Display","Helvetica Neue",Arial,sans-serif;-webkit-text-size-adjust:100%;overscroll-behavior:none}
body{padding:calc(env(safe-area-inset-top) + 6px) max(10px,env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 8px) max(10px,env(safe-area-inset-left));min-height:100vh}
body::after{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px);mix-blend-mode:screen}
.mono{font-family:"SF Mono",ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.deck{max-width:520px;margin:0 auto;display:grid;gap:8px}
@media (orientation:landscape) and (min-width:700px){.deck{max-width:1100px;grid-template-columns:1fr 1fr}.span{grid-column:1/-1}#eicasP{grid-column:auto}}
html.wall,html.wall body{height:100%;overflow:hidden}html.wall body{display:flex;align-items:center;justify-content:center;padding:0}html.wall body::after{background-size:100% 3px}html.wall .deck{width:1100px;max-width:none;margin:0}
header{display:flex;align-items:center;justify-content:space-between;padding:2px 2px 0}
.brand .bt{font-weight:800;letter-spacing:.22em;font-size:15px}.brand b{color:var(--cyan)}.brand .bs{font-size:8.5px;letter-spacing:.32em;color:#8a96a3;margin-top:3px;font-weight:600}
.hdr{display:flex;gap:10px;align-items:center;font-size:12px}
.link{display:flex;align-items:center;gap:6px;letter-spacing:.14em;font-weight:700;font-size:10px;color:var(--dim)}
.link i{width:7px;height:7px;border-radius:50%;background:var(--dim)}
.link.ok{color:var(--green)}.link.ok i{background:var(--green);box-shadow:0 0 8px var(--green);animation:blink 1s steps(2) infinite}
.link.stale{color:var(--amber)}.link.stale i{background:var(--amber)}.link.lost{color:var(--red)}.link.lost i{background:var(--red)}
@keyframes blink{50%{opacity:.35}}
.clock{color:var(--cyan);font-size:13px}
.panel{background:linear-gradient(180deg,#080c11,#04070a);border:1px solid var(--line);border-radius:10px;padding:8px;position:relative;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.ttl{position:absolute;top:6px;left:9px;font-size:9px;letter-spacing:.2em;color:var(--dim);font-weight:700}
.ann{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.lamp{border-radius:6px;padding:7px 4px 6px;text-align:center;background:#0b0f14;border:1px solid #1c2530;transition:all .4s}
.lamp .n{font-size:11px;font-weight:800;letter-spacing:.12em;color:#7c8896}
.lamp .s{font-size:9px;margin-top:3px;color:#56616d;letter-spacing:.08em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lamp.active{background:radial-gradient(ellipse at 50% 40%,rgba(43,234,108,.35),rgba(43,234,108,.08) 70%);border-color:rgba(43,234,108,.75);animation:breathe 2.4s ease-in-out infinite}
.lamp.active .n{color:#d9ffe6;text-shadow:0 0 8px var(--green)}.lamp.active .s{color:#9df5bd}
.lamp.unknown{border-color:rgba(255,176,32,.5)}.lamp.unknown .n{color:var(--amber)}
.lamp.off .n{color:#3a434d}
@keyframes breathe{0%,100%{box-shadow:0 0 6px rgba(43,234,108,.25),inset 0 0 10px rgba(43,234,108,.15)}50%{box-shadow:0 0 16px rgba(43,234,108,.6),inset 0 0 18px rgba(43,234,108,.3)}}
.llm{display:flex;align-items:center;gap:10px;margin-top:6px;padding:7px 9px;border-radius:6px;background:#0b0f14;border:1px solid #1c2530;transition:all .4s}
.llm .n{font-size:11px;font-weight:800;letter-spacing:.12em;color:#7c8896}
.llm .m{flex:1;font-size:12px;color:var(--cyan);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.llm .p{font-size:10px;font-weight:800;letter-spacing:.14em;padding:3px 7px;border-radius:4px;border:1px solid #2a3542;color:#7c8896}
.llm.loaded{border-color:rgba(43,234,108,.5)}.llm.loaded .n{color:var(--green)}
.llm .p.writing{color:#001b08;background:var(--green);border-color:var(--green);box-shadow:0 0 10px var(--green)}
.llm .p.reading{color:#00171c;background:var(--cyan);border-color:var(--cyan);box-shadow:0 0 10px var(--cyan)}
.eng{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding-top:14px}
canvas{display:block;width:100%}
.g{aspect-ratio:1/0.82}.vu{height:74px;margin-top:8px}.spark{height:40px;margin-top:2px}.inst{position:relative}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.inst{padding-top:16px}
.sub{display:flex;justify-content:space-between;font-size:10px;color:var(--dim);letter-spacing:.1em;margin-top:2px}
.sub b{color:var(--white);font-weight:600}
.fuel{display:grid;gap:7px;padding-top:16px}
.f{display:grid;grid-template-columns:78px 1fr 46px;align-items:center;gap:8px;font-size:11px}
.f .k{letter-spacing:.1em;color:#9aa6b2;font-weight:700}
.f .bar{height:12px;border-radius:2px;background:#0d1319;border:1px solid #202a35;position:relative;overflow:hidden}
.f .bar i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,rgba(43,234,108,.55),var(--green));box-shadow:0 0 8px rgba(43,234,108,.6);transition:width 1.2s cubic-bezier(.2,.8,.2,1)}
.f .bar u{position:absolute;top:0;bottom:0;width:1px;background:#34404c}
.f.caution .bar i{background:linear-gradient(90deg,rgba(255,176,32,.5),var(--amber));box-shadow:0 0 8px rgba(255,176,32,.6)}
.f.warning .bar i{background:linear-gradient(90deg,rgba(255,59,59,.5),var(--red));box-shadow:0 0 8px rgba(255,59,59,.7)}
.f .v{text-align:right;color:var(--white)}.f .r{grid-column:2/4;margin-top:-5px;font-size:9px;color:var(--dim);letter-spacing:.06em}
.eicas{min-height:52px;padding-top:18px;font-size:12px;font-weight:700;letter-spacing:.08em}
.eicas div{padding:2px 0}.eicas .caution{color:var(--amber)}.eicas .warning{color:var(--red);animation:blink .8s steps(2) infinite}
.eicas .normal{color:var(--green)}
.status{display:flex;gap:6px;position:absolute;top:5px;right:8px}
.chip{font-size:9px;letter-spacing:.14em;font-weight:800;padding:2px 6px;border-radius:3px;border:1px solid #2a3542;color:#56616d}
.chip.ok{color:var(--green);border-color:rgba(43,234,108,.45)}.chip.caution{color:#1b1200;background:var(--amber);border-color:var(--amber)}.chip.warning{color:#fff;background:var(--red);border-color:var(--red);animation:blink .8s steps(2) infinite}
nav{display:flex;gap:6px;margin-top:2px}
nav button,nav a{flex:1;text-align:center;text-decoration:none;font:800 11px/1 -apple-system,sans-serif;letter-spacing:.2em;padding:11px 0;border-radius:7px;background:#0b0f14;border:1px solid #1c2530;color:#7c8896}
nav .on{color:var(--cyan);border-color:rgba(51,224,255,.5);box-shadow:inset 0 0 12px rgba(51,224,255,.12)}
.pfd{display:contents}#sys{display:none}.sub.gap{margin-top:8px}.f .bar u{left:20%}
.sysg{padding-top:18px}
.sysr{display:grid;grid-template-columns:118px 1fr;gap:8px;padding:5px 0;border-bottom:1px solid #10161d;font-size:11px}
.sysr:last-child{border-bottom:0}.sysr .k{color:var(--cyan);letter-spacing:.08em;font-weight:700}.sysr .v{color:var(--white)}.sysr .v small{color:var(--dim);display:block;margin-top:1px}
.sysr.stale .k{color:var(--amber)}
.rec{display:flex;align-items:center;justify-content:flex-end;padding:6px 8px}.rec .ttl{position:static;flex:1}.rng{display:flex;gap:4px}.rng button{font:800 10px/1 -apple-system,sans-serif;letter-spacing:.12em;padding:7px 9px;border-radius:5px;background:#0b0f14;border:1px solid #1c2530;color:#7c8896}.rng button.on{color:#001b08;background:var(--green);border-color:var(--green);box-shadow:0 0 8px rgba(43,234,108,.6)}
.wlink{display:block;margin-top:12px;padding:11px;text-align:center;border-radius:7px;border:1px solid rgba(51,224,255,.5);color:var(--cyan);text-decoration:none;font-size:11px;font-weight:800;letter-spacing:.14em}
.hint{text-align:center;color:var(--dim);font-size:10px;letter-spacing:.12em;padding:4px}
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
  <div class="inst"><div class="ttl">LLM · OUTPUT</div><canvas class="g" id="gTps"></canvas><canvas class="spark" id="sTps"></canvas><div class="sub"><span id="tpsSub">LAST —</span><span><b class="mono" id="pre">—</b></span></div></div>
  <div class="inst"><div class="ttl">CHIP TEMP</div><canvas class="g" id="gTemp"></canvas><canvas class="spark" id="sTemp"></canvas><div class="sub gap"><span>THERMAL</span><b class="mono" id="therm">—</b></div><div class="sub"><span>AVG / HOT</span><b class="mono" id="tAvg">—</b></div><div class="sub"><span>SWAP</span><b class="mono" id="swap">—</b></div></div>
 </div></section>
 <section class="panel span rec"><div class="ttl">FLIGHT RECORDER</div><div class="rng" id="rng"><button data-r="live" class="on">1M</button><button data-r="1h">1H</button><button data-r="24h">24H</button><button data-r="7d">7D</button><button data-r="30d">30D</button></div></section>
 <section class="panel"><div class="ttl">FUEL · QUOTA REMAINING</div><div class="fuel">
  <div class="f" id="f-c5"><span class="k">CLAUDE 5H</span><span class="bar"><i></i><u></u></span><span class="v mono">—</span><span class="r mono">—</span></div>
  <div class="f" id="f-c7"><span class="k">CLAUDE 7D</span><span class="bar"><i></i><u></u></span><span class="v mono">—</span><span class="r mono">—</span></div>
  <div class="f" id="f-x7"><span class="k">CODEX 7D</span><span class="bar"><i></i><u></u></span><span class="v mono">—</span><span class="r mono">—</span></div>
 </div></section>
 <section class="panel span" id="eicasP"><div class="ttl">EICAS</div><div class="status"><span class="chip" id="cTemp">TEMP</span><span class="chip" id="cSwap">SWAP</span></div><div class="eicas mono" id="eicas"><div class="normal">ALL SYSTEMS NORMAL</div></div></section>
 </div>
 <div id="sys" class="span"><section class="panel"><div class="ttl" id="sysT">SYSTEM STATUS</div><div class="sysg" id="sysG"><div class="hint">LOADING…</div></div><a class="wlink" href="/widget">WIDGET FÜR SPERRBILDSCHIRM EINRICHTEN ›</a></section></div>
 <nav class="span"><button class="on" id="bPfd">PFD</button><button id="bSys">SYS</button><a href="/">NEO</a></nav>
</div>
<script nonce="${nonce}">
"use strict";
var C={green:"#2bea6c",amber:"#ffb020",red:"#ff3b3b",cyan:"#33e0ff",white:"#e9eef3",dim:"#5d6b7a",magenta:"#ff4fd8"};
var $=function(id){return document.getElementById(id);};
var data=null,lastFrame=0,boot=performance.now();
var anim={cpu:0,gpu:0,tps:0,temp:30};
var cores=[],peaks=[],peakT=[];
var HIST=240,hist={cpu:[],gpu:[],tps:[],temp:[]};
function lerp(a,b,k){return a+(b-a)*k;}
function zone(v,c,w){return v>=w?C.red:v>=c?C.amber:C.green;}
var ZOOM=1;
function fit(cv){var r=cv.getBoundingClientRect(),ratio=cv.offsetWidth?r.width/cv.offsetWidth:1,d=(window.devicePixelRatio||1)*ZOOM/(ratio||1),w=Math.round(r.width*d),h=Math.round(r.height*d);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}var x=cv.getContext("2d");x.setTransform(d,0,0,d,0,0);return {x:x,w:r.width,h:r.height};}
function gauge(cv,o){
 var g=fit(cv),x=g.x,w=g.w,h=g.h;x.clearRect(0,0,w,h);
 var cx=w/2,cy=h*0.56,R=Math.min(w*0.42,h*0.5),a0=Math.PI*0.75,a1=Math.PI*2.25;
 function ang(v){return a0+(a1-a0)*Math.max(0,Math.min(1,(v-o.min)/(o.max-o.min)));}
 x.lineCap="butt";
 x.beginPath();x.arc(cx,cy,R,a0,a1);x.strokeStyle="#1a232d";x.lineWidth=R*0.13;x.stroke();
 var v=o.value===null?o.min:o.value,col=o.value===null?C.dim:o.color||zone(v,o.caution,o.warning);
 var grad=x.createLinearGradient(cx-R,cy,cx+R,cy);grad.addColorStop(0,"rgba(233,238,243,.05)");grad.addColorStop(1,"rgba(233,238,243,.16)");
 x.beginPath();x.moveTo(cx,cy);x.arc(cx,cy,R*0.93,a0,ang(v));x.closePath();x.fillStyle=grad;x.fill();
 if(o.caution!=null){x.beginPath();x.arc(cx,cy,R,ang(o.caution),ang(o.warning));x.strokeStyle=C.amber;x.lineWidth=R*0.07;x.stroke();}
 if(o.warning!=null){x.beginPath();x.arc(cx,cy,R,ang(o.warning),a1);x.strokeStyle=C.red;x.lineWidth=R*0.07;x.stroke();}
 x.save();x.shadowColor=col;x.shadowBlur=10;x.beginPath();x.arc(cx,cy,R,a0,ang(v));x.strokeStyle=col;x.globalAlpha=.9;x.lineWidth=R*0.045;x.stroke();x.restore();
 for(var i=0;i<=10;i++){var t=a0+(a1-a0)*i/10,big=i%2===0;x.beginPath();x.moveTo(cx+Math.cos(t)*(R*0.80),cy+Math.sin(t)*(R*0.80));x.lineTo(cx+Math.cos(t)*(R*(big?0.70:0.75)),cy+Math.sin(t)*(R*(big?0.70:0.75)));x.strokeStyle="#c9d2db";x.lineWidth=big?1.6:1;x.stroke();
  if(big&&o.labels){x.fillStyle="#7f8b97";x.font="600 "+Math.max(8,R*0.13)+"px -apple-system,sans-serif";x.textAlign="center";x.textBaseline="middle";x.fillText(String(Math.round(o.min+(o.max-o.min)*i/10)),cx+Math.cos(t)*R*0.56,cy+Math.sin(t)*R*0.56);}}
 var na=ang(v);x.save();x.shadowColor="rgba(255,255,255,.8)";x.shadowBlur=8;x.beginPath();x.moveTo(cx+Math.cos(na+Math.PI/2)*R*0.035,cy+Math.sin(na+Math.PI/2)*R*0.035);x.lineTo(cx+Math.cos(na)*R*0.97,cy+Math.sin(na)*R*0.97);x.lineTo(cx+Math.cos(na-Math.PI/2)*R*0.035,cy+Math.sin(na-Math.PI/2)*R*0.035);x.closePath();x.fillStyle="#fff";x.fill();x.restore();
 x.beginPath();x.arc(cx,cy,R*0.07,0,Math.PI*2);x.fillStyle="#1a232d";x.fill();x.strokeStyle="#c9d2db";x.lineWidth=1;x.stroke();
 var bw=R*1.16,bh=R*0.38,bx=cx-bw/2,by=cy+R*0.30;
 x.fillStyle="#000";x.strokeStyle=o.value===null?"#2a3542":col;x.lineWidth=1.2;x.beginPath();if(x.roundRect)x.roundRect(bx,by,bw,bh,3);else x.rect(bx,by,bw,bh);x.fill();x.stroke();
 x.fillStyle=o.value===null?C.dim:col;x.font="600 "+(bh*0.68)+"px 'SF Mono',ui-monospace,Menlo,monospace";x.textBaseline="middle";if(o.unit){x.textAlign="right";x.fillText(o.text,bx+bw*0.72,by+bh*0.54);x.fillStyle=C.dim;x.font="700 "+Math.max(8,bh*0.30)+"px -apple-system,sans-serif";x.textAlign="left";x.fillText(o.unit,bx+bw*0.76,by+bh*0.56);}else{x.textAlign="center";x.fillText(o.text,cx,by+bh*0.54);}
 x.fillStyle="#e9eef3";x.font="800 "+Math.max(11,R*0.19)+"px -apple-system,sans-serif";x.textAlign="left";x.textBaseline="top";x.fillText(o.label,2,2);
}
function vu(cv,now,dt){
 var g=fit(cv),x=g.x,w=g.w,h=g.h;x.clearRect(0,0,w,h);var n=cores.length||18,gap=3,bw=(w-gap*(n-1))/n,seg=14,sh=(h-seg)/seg;
 for(var i=0;i<n;i++){var v=cores[i]||0;
  if(v>=peaks[i]||!peaks[i]){peaks[i]=v;peakT[i]=now;}else if(now-peakT[i]>900){peaks[i]=Math.max(v,peaks[i]-dt*0.06);}
  var lit=Math.round(v/100*seg);
  for(var s=0;s<seg;s++){var pct=(s+1)/seg*100,col=pct>90?C.red:pct>70?C.amber:C.green,on=s<lit,y=h-(s+1)*(sh+1);
   x.fillStyle=on?col:"rgba(255,255,255,.045)";if(on){x.shadowColor=col;x.shadowBlur=6;}else x.shadowBlur=0;x.fillRect(i*(bw+gap),y,bw,sh);}
  x.shadowBlur=0;var ps=Math.min(seg-1,Math.max(0,Math.round(peaks[i]/100*seg)-1));if(peaks[i]>3){var pc=(ps+1)/seg*100;x.fillStyle=pc>90?C.red:pc>70?C.amber:C.white;x.fillRect(i*(bw+gap),h-(ps+1)*(sh+1),bw,Math.max(1.5,sh*0.45));}
 }
}
function spark(cv,arr,min,max,color,auto){
 var g=fit(cv),x=g.x,w=g.w,h=g.h;x.clearRect(0,0,w,h);var vals=arr.filter(function(v){return v!=null;});if(auto)max=Math.max(max,Math.max.apply(null,vals.concat([0]))*1.15);
 x.strokeStyle="rgba(255,255,255,.06)";x.lineWidth=1;for(var k=1;k<4;k++){x.beginPath();x.moveTo(0,h*k/4);x.lineTo(w,h*k/4);x.stroke();}
 if(vals.length<2)return;var n=range==="live"?HIST:arr.length,step=w/Math.max(1,n-1),y=function(v){return h-2-Math.max(0,Math.min(1,(v-min)/(max-min)))*(h-4);};
 var pts=[];for(var i=0;i<arr.length;i++)pts.push(arr[i]==null?null:[w-(arr.length-1-i)*step,y(arr[i])]);
 x.save();x.shadowColor=color;x.shadowBlur=8;x.strokeStyle=color;x.lineWidth=1.6;x.beginPath();var open=false;
 pts.forEach(function(p){if(!p){open=false;return;}if(!open){x.moveTo(p[0],p[1]);open=true;}else x.lineTo(p[0],p[1]);});x.stroke();x.restore();
 var gr=x.createLinearGradient(0,0,0,h);gr.addColorStop(0,color+"40");gr.addColorStop(1,color+"00");x.fillStyle=gr;
 var seg=[];pts.concat([null]).forEach(function(p){if(p){seg.push(p);return;}if(seg.length>1){x.beginPath();x.moveTo(seg[0][0],h);seg.forEach(function(q){x.lineTo(q[0],q[1]);});x.lineTo(seg[seg.length-1][0],h);x.closePath();x.fill();}seg=[];});
}
var range="live",recorded={cpu:[],gpu:[],tps:[],temp:[]},recTimer=null;
function loadRange(){if(range==="live")return;fetch("/api/cockpit/history?range="+range,{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(d){if(!d||!d.ok)return;var rec={cpu:[],gpu:[],tps:[],temp:[]},prev=null;
 d.points.forEach(function(p){if(prev!==null&&p[0]-prev>d.step*1.5){rec.cpu.push(null);rec.gpu.push(null);rec.tps.push(null);rec.temp.push(null);}prev=p[0];rec.cpu.push(p[1]);rec.gpu.push(p[2]);rec.tps.push(p[3]);rec.temp.push(p[4]);});recorded=rec;}).catch(function(){});}
function series(k){return range==="live"?hist[k]:recorded[k];}
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
 var l=f.llm;$("llm").className="llm"+(l.loaded?" loaded":"");$("llmM").textContent=l.loaded?"LOADED · "+l.model:"NO MODEL LOADED";
 var p=$("llmP");p.className="p "+l.phase;p.textContent=l.phase==="writing"?"WRITING":l.phase==="reading"?"READING "+(l.progress!=null?Math.round(l.progress*100)+"%":""):l.phase==="idle"?"IDLE":"—";
 $("tpsSub").textContent="LAST "+(l.lastTps!=null?l.lastTps.toFixed(1)+" T/S":"—");$("pre").textContent=l.prefillTps!=null?"IN "+Math.round(l.prefillTps)+" T/S":"—";
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
var lastT=performance.now(),lastHist=0;
function frame(now){
 var dt=Math.min(100,now-lastT);lastT=now;var k=1-Math.exp(-dt/140),kt=1-Math.exp(-dt/400);
 var sweep=Math.max(0,1-(now-boot)/1800),sv=sweep>0?Math.sin(Math.min(1,(now-boot)/900)*Math.PI/2)*(sweep>0.5?1:sweep*2):0;
 var f=data,cpu=f&&f.live.cpu!=null?f.live.cpu:0,gpu=f&&f.live.gpu!=null?f.live.gpu:0,tps=f&&f.llm.tps!=null?f.llm.tps:0,temp=f&&f.temp.max!=null?f.temp.max:30;
 anim.cpu=lerp(anim.cpu,sweep>0?100*sv:cpu,k);anim.gpu=lerp(anim.gpu,sweep>0?100*sv:gpu,k);anim.tps=lerp(anim.tps,sweep>0?40*sv:tps,kt);anim.temp=lerp(anim.temp,sweep>0?30+80*sv:temp,kt);
 if(now-lastHist>250){lastHist=now;if(f){var add=function(k,v){if(v==null)return;hist[k].push(v);if(hist[k].length>HIST)hist[k].shift();};add("cpu",f.live.cpu);add("gpu",f.live.gpu);add("tps",f.llm.phase==="writing"&&f.llm.tps!=null?f.llm.tps:0);add("temp",f.temp.max);}}
 if(!$("pfd").hidden){
  gauge($("gCpu"),{min:0,max:100,caution:70,warning:90,value:f&&f.live.cpu!=null||sweep>0?anim.cpu:null,text:f&&f.live.cpu!=null?anim.cpu.toFixed(1):"—",label:"CPU",unit:"%",labels:true});
  gauge($("gGpu"),{min:0,max:100,color:C.green,value:f&&f.live.gpu!=null||sweep>0?anim.gpu:null,text:f&&f.live.gpu!=null?anim.gpu.toFixed(0):"—",label:"GPU",unit:"%",labels:true});
  gauge($("gTps"),{min:0,max:40,value:anim.tps,color:f&&f.llm.phase==="writing"?C.cyan:f&&f.llm.phase==="reading"?C.magenta:C.dim,text:f&&f.llm.phase==="writing"&&f.llm.tps!=null?anim.tps.toFixed(1):f&&f.llm.phase==="reading"?"READ":"IDLE",label:"OUT",unit:"T/S",labels:true});
  gauge($("gTemp"),{min:30,max:110,caution:85,warning:95,value:f&&f.temp.max!=null||sweep>0?anim.temp:null,text:f&&f.temp.max!=null?anim.temp.toFixed(1):"—",label:"CHIP",unit:"°C",labels:true});
  vu($("vu"),now,dt);spark($("sCpu"),series("cpu"),0,100,C.green,false);spark($("sGpu"),series("gpu"),0,100,C.green,false);spark($("sTps"),series("tps"),0,25,C.cyan,true);spark($("sTemp"),series("temp"),30,110,C.green,false);
 }
 var age=Date.now()-lastFrame,ln=$("link");ln.className="link "+(age<2500?"ok":age<10000?"stale":"lost");$("linkT").textContent=age<2500?"DATA LINK":age<10000?"STALE":"NO LINK";
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(function(){var d=new Date();$("clock").textContent=pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());},250);
var es=null,poll=null;
function startPoll(){if(poll)return;poll=setInterval(function(){fetch("/api/cockpit",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(f){if(f&&f.ok)apply(f);}).catch(function(){});},1000);}
function connect(){if(!window.EventSource){startPoll();return;}es=new EventSource("/api/cockpit/stream");es.onmessage=function(ev){try{apply(JSON.parse(ev.data));if(poll){clearInterval(poll);poll=null;}}catch(e){}};es.onerror=function(){startPoll();};}
connect();
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"){boot=performance.now();if(!es||es.readyState===2){if(es)es.close();connect();}lock();}});
var wl=null;function lock(){if(!("wakeLock" in navigator))return;navigator.wakeLock.request("screen").then(function(l){wl=l;}).catch(function(){});}
lock();document.addEventListener("click",function(){if(!wl||wl.released)lock();});
function sysView(){fetch("/api/mobile",{cache:"no-store"}).then(function(r){return r.json();}).then(function(m){var g=$("sysG");g.textContent="";if(!m.ok){g.innerHTML="<div class=hint>NEO OFFLINE</div>";return;}
 m.pages.forEach(function(pg){var h=document.createElement("div");h.className="hint";h.style.textAlign="left";h.style.color="#ff4fd8";h.style.paddingTop="10px";h.textContent=pg.name;g.appendChild(h);
  pg.tiles.forEach(function(t){var r=document.createElement("div");r.className="sysr"+(t.quality==="stale"||t.quality==="unavailable"?" stale":"");var k=document.createElement("div");k.className="k";k.textContent=t.title;var v=document.createElement("div");v.className="v mono";
   var txt=t.quota?t.quota.windows.map(function(w){return w.label+" "+(w.remaining==null?"—":Math.round(w.remaining)+"%");}).join(" · "):t.lines.join(" · ");v.textContent=txt;var s=document.createElement("small");s.textContent=t.footer;v.appendChild(s);r.appendChild(k);r.appendChild(v);g.appendChild(r);});});
 $("sysT").textContent="SYSTEM STATUS · v"+m.version;wall();}).catch(function(){});}
var sysTimer=null;
Array.prototype.forEach.call(document.querySelectorAll("#rng button"),function(b){b.onclick=function(){range=b.getAttribute("data-r");Array.prototype.forEach.call(document.querySelectorAll("#rng button"),function(o){o.className=o===b?"on":"";});recorded={cpu:[],gpu:[],tps:[],temp:[]};clearInterval(recTimer);if(range!=="live"){loadRange();recTimer=setInterval(loadRange,30000);}};});
$("bSys").onclick=function(){$("pfd").hidden=true;$("pfd").style.display="none";$("sys").style.display="block";$("bSys").className="on";$("bPfd").className="";sysView();sysTimer=setInterval(sysView,5000);wall();};
$("bPfd").onclick=function(){$("pfd").hidden=false;$("pfd").style.display="";$("sys").style.display="none";$("bPfd").className="on";$("bSys").className="";clearInterval(sysTimer);boot=performance.now();wall();};
// Big-screen mode (e.g. Mac Studio display): scale the whole deck to fill the window, re-rendering canvases at full resolution.
function wall(){var dk=document.querySelector(".deck"),on=window.innerWidth>=1300&&window.innerWidth>window.innerHeight;document.documentElement.classList.toggle("wall",on);dk.style.zoom="";ZOOM=1;if(!on)return;
 var h=dk.offsetHeight||1;ZOOM=Math.max(0.5,Math.min(window.innerWidth*0.98/1100,window.innerHeight*0.97/h));dk.style.zoom=String(ZOOM);}
var wallT=null;window.addEventListener("resize",function(){clearTimeout(wallT);wallT=setTimeout(wall,120);});wall();setTimeout(wall,600);
</script></body></html>`;}
