import http from "node:http";import {randomBytes} from "node:crypto";import sharp from "sharp";
import {PAGES,PAGE_NAMES,counts,type Snapshot,type Quality} from "./model.js";import {tile} from "./view.js";import {quotaStale} from "./quota.js";import {fetchJson} from "./io.js";
import {History,modules} from "./history.js";
import {CockpitHub} from "./cockpit.js";import {cockpitHtml,cockpitPalette} from "./cockpit-page.js";import {RANGES} from "./recorder.js";import {widgetPage,widgetScript} from "./widget.js";

// Read-only mobile status page. Runs as its own process next to the HID service, reads 127.0.0.1:9463/api/status
// and passes on only what the Neo keys show: no session IDs, paths, PIDs or hashes.

export interface MobileQuota {windows:{label:string;remaining:number|null;reset:number|null}[];stale:boolean;measured:boolean}
export interface MobileTile {module:string;title:string;lines:string[];footer:string;color:string;quality:Quality|string;quota?:MobileQuota}
export interface MobileView {ok:true;version:string;at:number;device:{connected:boolean;visiblePage:number|null};summary:{open:number;work:number;needs:number;complete:boolean};pages:{name:string;tiles:MobileTile[]}[]}

export function mobileView(status:any,now=Date.now()):MobileView{
 const s=status?.snapshot as Snapshot;if(!s||typeof s!=="object")throw new Error("Status without snapshot");
 const quota=(module:string):MobileQuota|undefined=>{if(module!=="claudeQuota"&&module!=="codexQuota")return undefined;const q=module==="claudeQuota"?s.claudeQuota:s.codexQuota;return {windows:["5h","7d"].map(label=>{const w=q.windows.find(x=>x.label===label);return {label,remaining:w?.remaining??null,reset:w?.reset??null};}),stale:quotaStale(q,now),measured:q.measuredAt>0};};
 const pages=PAGES.map((modules,i)=>({name:PAGE_NAMES[i],tiles:modules.map(m=>{const t=tile(s,m);const q=quota(m);return {module:t.module,title:t.title,lines:t.lines,footer:t.footer,color:t.color,quality:t.quality,...(q?{quota:q}:{})};})}));
 const c=counts(s);const hw=status?.hardware;const page=Number.isInteger(hw?.visiblePage)?hw.visiblePage:null;
 return {ok:true,version:String(status?.software?.version||"?"),at:typeof s.at==="number"?s.at:now,device:{connected:hw?.connected===true,visiblePage:page},summary:{open:c.open,work:c.work,needs:c.needs,complete:c.complete},pages};
}

// Loopback or a Tailscale MagicDNS name (tailscale serve keeps the original Host header).
export function allowedHost(host:string|undefined,port:number):boolean{if(!host)return false;return host===`127.0.0.1:${port}`||host===`localhost:${port}`||/^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net(:\d{1,5})?$/i.test(host);}

const ICON=`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#050a12"/>${[0,1,2,3,4,5,6,7].map(i=>`<rect x="${18+(i%4)*38}" y="${40+Math.floor(i/4)*38}" width="30" height="30" rx="6" fill="#101a29" stroke="${["#63d7e5","#72e6af","#72e6af","#63d7e5","#63d7e5","#63d7e5","#ffbc66","#96a4ba"][i]}" stroke-opacity=".8" stroke-width="2"/>`).join("")}<rect x="48" y="124" width="84" height="18" rx="5" fill="#0b1321" stroke="#63d7e5" stroke-opacity=".5"/></svg>`;

const COCKPIT_ICON=`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="${cockpitPalette.bg}"/><circle cx="90" cy="96" r="58" fill="none" stroke="${cockpitPalette.line}" stroke-width="12"/><path d="M48.99 137.01A58 58 0 1 1 131.01 137.01" fill="none" stroke="${cockpitPalette.green}" stroke-width="5" stroke-dasharray="230 400"/><path d="M131.01 137.01A58 58 0 0 0 146 96" fill="none" stroke="${cockpitPalette.red}" stroke-width="6"/><line x1="90" y1="96" x2="130" y2="62" stroke="${cockpitPalette.white}" stroke-width="5" stroke-linecap="round"/><circle cx="90" cy="96" r="7" fill="${cockpitPalette.white}"/><text x="90" y="158" font-family="Helvetica,Arial" font-weight="800" font-size="20" fill="${cockpitPalette.yellow}" text-anchor="middle" letter-spacing="3">OSCA</text></svg>`;

export function mobileHtml(nonce:string,deleteToken="",deck=false):string{return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#050a12"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="OSCA Neo"><link rel="apple-touch-icon" href="/icon.png"><title>OSCA Neo</title>
<style nonce="${nonce}">
:root{--cyan:#63d7e5;--green:#72e6af;--amber:#ffbc66;--red:#ff7c88;--gray:#96a4ba;--key:#101a29;--bg:#050a12;color-scheme:dark}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:#ecf1fa;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;-webkit-text-size-adjust:100%}
body{padding:calc(env(safe-area-inset-top) + 10px) 0 calc(env(safe-area-inset-bottom) + 14px)}
header{max-width:792px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px max(16px,env(safe-area-inset-right)) 12px max(16px,env(safe-area-inset-left))}
.back{color:var(--cyan);text-decoration:none;font-size:13px;font-weight:800;letter-spacing:.12em;padding:7px 11px;border-radius:999px;background:#0b1321;border:1px solid rgba(99,215,229,.45)}header h1{flex:1}
h1{margin:0;font-size:20px;font-weight:800;letter-spacing:.02em}h1 span{color:var(--cyan)}
.pill{display:flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;background:#0b1321;border:1px solid #1d2b3f;font-size:12px;font-weight:700;letter-spacing:.06em;white-space:nowrap}
.dot{width:8px;height:8px;border-radius:50%;background:var(--gray)}
.pill.live .dot{background:var(--green);box-shadow:0 0 8px var(--green)}.pill.warn .dot{background:var(--amber)}.pill.down .dot{background:var(--red)}
nav{display:flex;gap:6px;max-width:760px;width:calc(100% - 32px);margin:0 auto 12px;padding:4px;background:#0b1321;border:1px solid #1a2739;border-radius:12px}
nav button{flex:1;position:relative;border:0;border-radius:9px;padding:9px 4px;background:none;color:#a8b8cd;font:800 13px/1 inherit;letter-spacing:.08em}
nav button.on{background:var(--key);color:var(--cyan);box-shadow:inset 0 0 0 1px rgba(99,215,229,.45)}
nav button.device::after{content:"";position:absolute;top:6px;right:8px;width:6px;height:6px;border-radius:50%;background:var(--green)}
.pages{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain}.pages::-webkit-scrollbar{display:none}
.page{flex:0 0 100%;scroll-snap-align:start;padding:0 max(16px,env(safe-area-inset-left))}
.deck{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:760px;margin:0 auto}
@media (min-width:600px){.deck{grid-template-columns:repeat(4,minmax(0,1fr))}}
.key{container-type:inline-size;min-width:0;aspect-ratio:1;position:relative;font-family:Arial,Helvetica,sans-serif;border-radius:13.5%;background:var(--key);border:1px solid color-mix(in srgb,var(--c) 55%,transparent);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden}
.key.stale{border-color:color-mix(in srgb,var(--amber) 55%,transparent)}
.key .t{position:absolute;top:7.5%;left:4%;right:4%;font-size:10.2cqi;font-weight:800;color:#ecf1fa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.key .f{position:absolute;bottom:4.5%;left:4%;right:4%;font-size:7cqi;color:#acbad0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.02em}
.key .ls{display:flex;flex-direction:column;gap:3.5cqi;padding-top:6cqi;width:96%}
.key .l{font-weight:800;color:var(--c);line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.key .l.s{font-size:16.5cqi}.key .l.m{font-size:11.5cqi}.key .l.x{font-size:9.9cqi}
.key .st{position:absolute;top:24%;font-size:7.3cqi;color:var(--amber);font-weight:700}
.key.q{justify-content:flex-start;align-items:stretch;text-align:left;padding:17% 8.3% 0}
.q .row{margin-top:4cqi}.q .cap{font-size:9.9cqi;font-weight:700;color:var(--cyan)}
.q .bar{height:4.2cqi;border-radius:3cqi;background:#293849;margin:2.5cqi 0 1.8cqi;overflow:hidden}.q .bar i{display:block;height:100%;border-radius:3cqi;background:var(--cyan)}
.q.old .bar i{background:var(--amber)}.q .r{font-size:6.8cqi;color:#c3cddd}
.q .t,.q .f{text-align:center}
.info{max-width:520px;margin:16px auto 0;padding:12px 16px 10px;border-radius:12px;background:#0b1321;border:1px solid #16243a}
.info .top{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;font-weight:800;color:var(--cyan)}.info .top b{font-size:11px;font-weight:700}
.info .sum{margin:9px 0 6px;text-align:center;font-size:clamp(14px,4.4vw,17px);font-weight:800;letter-spacing:.02em}
.info .nav{display:flex;justify-content:space-between;font-size:11px;color:#a8b8cd}.info .nav button{border:0;background:none;color:inherit;font:inherit;padding:6px 2px;letter-spacing:.06em}
footer{margin:18px max(16px,env(safe-area-inset-left)) 0;text-align:center;font-size:11.5px;line-height:1.5;color:#6f7f96}
.banner{display:none;margin:0 max(16px,env(safe-area-inset-left)) 12px;padding:10px 12px;border-radius:10px;font-size:13px;font-weight:600;background:rgba(255,124,136,.12);color:var(--red);border:1px solid rgba(255,124,136,.35)}
.banner.on{display:block}.banner.amber{background:rgba(255,188,102,.1);color:var(--amber);border-color:rgba(255,188,102,.35)}
.key{cursor:pointer}.pages[hidden],nav[hidden]{display:none}.detail{max-width:760px;margin:0 auto;padding:0 16px}.detail[hidden]{display:none}.detail button{background:#102336;color:#dffaff;border:1px solid #315468;border-radius:9px;padding:10px;margin:4px}.detail .danger{border-color:#a44b52;color:#ffb7bb}.detail .panel{background:#0b1321;border:1px solid #24384c;border-radius:14px;padding:16px}.detail svg{width:100%;height:180px;background:#101a29;border-radius:8px}.detail .entry{border-top:1px solid #263749;padding:10px 0;font-size:14px}.detail .muted{color:#a8b8cd;font-size:13px}
</style></head><body>
<header>${deck?`<a class="back" href="/cockpit">‹ DECK</a>`:""}<h1>OSCA <span>Neo</span></h1><div class="pill" id="pill"><i class="dot"></i><span id="state">LÄDT …</span></div></header>
<div class="banner" id="banner"></div>
<nav id="tabs"></nav>
<div class="pages" id="pages"></div>
<section class="detail" id="detail" hidden></section>
<footer id="foot">Nur lesend · Werte wie am Stream Deck Neo</footer>
<script nonce="${nonce}">
"use strict";
const NAMES=["AGENTS","LOCAL","OPS"],$=id=>document.getElementById(id),deleteToken=${JSON.stringify(deleteToken)};let data=null,lastOk=0,current=0,timer=null,failed=false,selected=null,range=24;
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const short=(s,n)=>s.length>n?s.slice(0,n-1)+"…":s;
const when=t=>new Date(t).toLocaleString("de-DE",{timeZone:"Europe/Berlin",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).replace(",","");
const clock=t=>new Date(t).toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit",second:"2-digit"});
function key(t){
 const k=el("div","key"+(t.quality==="stale"?" stale":""));k.tabIndex=0;k.setAttribute("role","button");k.setAttribute("aria-label",t.title+" Verlauf öffnen");k.onclick=()=>openDetail(t);k.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDetail(t);}};k.style.setProperty("--c",t.color);k.append(el("div","t",t.title));
 if(t.quota){k.classList.add("q");if(t.quota.stale)k.classList.add("old");for(const w of t.quota.windows){const r=el("div","row");r.append(el("div","cap",w.label+" "+(w.remaining===null?"REST —":"REST "+Math.round(w.remaining)+" %")));const b=el("div","bar"),i=el("i");i.style.width=(w.remaining===null?0:w.remaining)+"%";b.append(i);r.append(b,el("div","r","R "+(w.reset?when(w.reset):"—")));k.append(r);}
  const f=el("div","f",t.quota.stale?"STALE":t.quota.measured?"REST / QUOTA":"— / UNAVAILABLE");if(t.quota.stale)f.style.color="var(--amber)";k.append(f);return k;}
 const ls=el("div","ls");for(const line of t.lines){const s=short(line,16);ls.append(el("div","l "+(s.length>12?"x":s.length>9?"m":"s"),s));}
 k.append(ls,el("div","f",short(t.footer,20)));if(t.quality==="stale")k.append(el("div","st","STALE"));return k;
}
function show(i,smooth){current=(i+3)%3;const p=$("pages");p.scrollTo({left:current*p.clientWidth,behavior:smooth?"smooth":"auto"});tabs();}
async function openDetail(t){selected=t;$("pages").hidden=true;$("tabs").hidden=true;$("detail").hidden=false;await drawDetail();window.scrollTo(0,0);}
function closeDetail(){selected=null;$("detail").hidden=true;$("pages").hidden=false;$("tabs").hidden=false;show(current,false);}
async function drawDetail(){
 const root=$("detail");root.replaceChildren();const back=el("button","","← Zurück");back.onclick=closeDetail;root.append(back);const panel=el("div","panel");root.append(panel);panel.append(el("h2","",selected.title+" · Verlauf"));
 const filters=el("div","");for(const [h,label] of [[1,"1 Stunde"],[24,"24 Stunden"],[168,"7 Tage"],[720,"30 Tage"]]){const b=el("button","",label+(range===h?" ✓":""));b.onclick=()=>{range=h;drawDetail();};filters.append(b);}panel.append(filters);
 try{const r=await fetch("/api/history/"+encodeURIComponent(selected.module)+"?hours="+range,{cache:"no-store"});if(!r.ok)throw Error();const d=await r.json();const rows=d.rows;panel.append(el("p","muted",rows.length?"Aufzeichnung seit "+when(rows[rows.length-1].at)+" · Lücken bedeuten fehlende Messungen.":"Für diesen Zeitraum liegen noch keine Aufzeichnungen vor."));
 const points=rows.slice().reverse().flatMap(x=>x.points.map(p=>({at:x.at,...p})));const names=[...new Set(points.map(p=>p.name))];
 for(const name of names){const vals=points.filter(p=>p.name===name);if(!vals.length)continue;const lo=Math.min(...vals.map(p=>p.value)),hi=Math.max(...vals.map(p=>p.value));panel.append(el("h3","",name+" · "+vals[vals.length-1].value.toFixed(1)+" "+vals[0].unit));const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg"),line=document.createElementNS(ns,"path");svg.setAttribute("viewBox","0 0 600 180");line.setAttribute("fill","none");line.setAttribute("stroke","#63d7e5");line.setAttribute("stroke-width","3");const begin=Date.now()-range*3600000,gap=Math.max(180000,Math.ceil(range*60/4800)*120000);line.setAttribute("d",vals.map((p,i)=>(!i||p.at-vals[i-1].at>gap?"M":"L")+Math.max(0,Math.min(600,(p.at-begin)/(range*3600000)*600))+" "+(160-(p.value-lo)/(hi-lo||1)*140)).join(" "));svg.append(line);panel.append(svg,el("p","muted","Minimum "+lo.toFixed(1)+" · Maximum "+hi.toFixed(1)+" "+vals[0].unit));}
 const del=el("button","danger","Historie löschen");del.onclick=async()=>{if(!confirm("Gesamte gespeicherte Historie für "+selected.title+" löschen?"))return;const r=await fetch("/api/history/"+encodeURIComponent(selected.module),{method:"DELETE",headers:{"X-OSCA-Token":deleteToken}});if(!r.ok){alert("Löschen nicht möglich.");return;}drawDetail();};panel.append(del);
 for(const row of rows.slice(0,100)){const item=el("div","entry");item.append(el("strong","",when(row.at)+" · "+row.quality.toUpperCase()),el("div","",row.summary.lines.join(" · ")));const b=el("button","danger","Eintrag löschen");b.onclick=async()=>{if(!confirm("Diesen Eintrag löschen?"))return;const r=await fetch("/api/history/"+encodeURIComponent(selected.module)+"/"+row.id,{method:"DELETE",headers:{"X-OSCA-Token":deleteToken}});if(r.ok)drawDetail();else alert("Löschen nicht möglich.");};item.append(b);panel.append(item);}
 }catch{panel.append(el("p","muted","Verlauf derzeit nicht erreichbar."));}
}
function tabs(){const n=$("tabs");n.replaceChildren(...NAMES.map((name,i)=>{const b=el("button",(i===current?"on":"")+(data&&data.device.connected&&data.device.visiblePage===i?" device":""),name);b.type="button";b.setAttribute("aria-label",name+(data&&data.device.visiblePage===i?", gerade am Neo sichtbar":""));b.onclick=()=>show(i,true);return b;}));}
function render(){
 const sum=data.summary,pre=sum.complete?"":"≥",p=$("pages"),x=p.scrollLeft;
 p.replaceChildren(...data.pages.map((page,i)=>{const sec=el("section","page"),deck=el("div","deck");deck.append(...page.tiles.map(key));
  const info=el("div","info"),top=el("div","top");top.append(el("span","",(i+1)+"/3 · "+page.name));const q=el("b","",sum.complete?"LIVE":"PARTIAL");q.style.color=sum.complete?"var(--green)":"var(--amber)";top.append(q);
  const nav=el("div","nav"),prev=el("button","","‹ PREV"),next=el("button","","NEXT ›");prev.type=next.type="button";prev.onclick=()=>show(i-1,true);next.onclick=()=>show(i+1,true);nav.append(prev,el("span","","STAND "+clock(data.at)),next);
  info.append(top,el("div","sum",pre+sum.open+" OPEN · "+pre+sum.work+" WORK · "+pre+sum.needs+" NEED YOU"),nav);sec.append(deck,info);return sec;}));
 p.scrollLeft=x;tabs();fit();
}
// Shrink a value line until it fits its key, like the device keeps every word whole.
function fit(){for(const l of document.querySelectorAll(".key .l")){l.style.fontSize="";const w=l.clientWidth;if(w&&l.scrollWidth>w)l.style.fontSize=(parseFloat(getComputedStyle(l).fontSize)*w/l.scrollWidth*0.98)+"px";}}
function status(){
 const pill=$("pill"),st=$("state"),ban=$("banner"),age=Date.now()-lastOk;
 const set=(cls,text,msg,amber)=>{pill.className="pill "+cls;st.textContent=text;ban.textContent=msg||"";ban.className="banner"+(msg?" on":"")+(amber?" amber":"");};
 if(!data)return set(failed?"down":"",failed?"OFFLINE":"LÄDT …",failed?"Neo-Dienst auf OSCA nicht erreichbar.":"");
 if(failed||age>30000)return set("down","OFFLINE","Keine aktuellen Daten seit "+clock(lastOk)+". Angezeigt wird der letzte bekannte Stand.");
 if(!data.device.connected)return set("warn","GERÄT GETRENNT","Dienst läuft, aber das Stream Deck Neo ist nicht verbunden.",true);
 set("live","LIVE · "+(data.device.visiblePage!==null?NAMES[data.device.visiblePage]:"—"));
}
async function load(){
 try{const r=await fetch("/api/mobile",{cache:"no-store"});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||r.status);data=d;lastOk=Date.now();failed=false;render();$("foot").textContent="Nur lesend · OSCA Neo "+d.version+" · aktualisiert "+clock(lastOk);}
 catch(e){failed=true;}
 status();
}
function loop(){clearTimeout(timer);if(document.hidden)return;load().finally(()=>{timer=setTimeout(loop,5000);});}
$("pages").addEventListener("scroll",()=>{const p=$("pages"),i=Math.round(p.scrollLeft/Math.max(1,p.clientWidth));if(i!==current){current=i;tabs();}},{passive:true});
addEventListener("resize",()=>{show(current,false);fit();});document.addEventListener("visibilitychange",loop);setInterval(status,5000);
tabs();loop();
</script></body></html>`;}

export interface MobileOptions {port:number;upstream:string;cacheMs?:number;history?:History;cockpit?:CockpitHub;maxStreams?:number}
export function createMobileServer(o:MobileOptions,fetchStatus:()=>Promise<any>=()=>fetchJson(`${o.upstream}/api/status`,3000,4*1024*1024)):http.Server{
 let cached:{at:number;body:string;code:number}|null=null;let icon:Buffer|null=null;let cockpitIcon:Buffer|null=null;const ttl=o.cacheMs??2000;const deleteToken=randomBytes(32).toString("hex");
 const api=async()=>{if(cached&&Date.now()-cached.at<ttl)return cached;try{cached={at:Date.now(),code:200,body:JSON.stringify(mobileView(await fetchStatus()))};}catch{cached={at:Date.now(),code:503,body:JSON.stringify({ok:false,error:"Neo-Dienst nicht erreichbar"})};}return cached;};
 return http.createServer((req,res)=>{void (async()=>{
  if(!allowedHost(req.headers.host,o.port)||!['GET','HEAD','DELETE'].includes(req.method||'')){res.writeHead(403);res.end();return;}
  res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","no-referrer");res.setHeader("X-Frame-Options","DENY");res.setHeader("Cross-Origin-Resource-Policy","same-origin");
  const url=new URL(req.url||"/","http://localhost"),path=url.pathname;
  try{
   const match=/^\/api\/history\/([A-Za-z]+)(?:\/(\d+))?$/.exec(path);
   if(match){const module=match[1];if(!modules.has(module)||!o.history){res.writeHead(404);res.end();return;}
    if(req.method==="DELETE"){let origin:URL;try{origin=new URL(String(req.headers.origin||""));}catch{res.writeHead(403);res.end();return;}if(origin.host!==req.headers.host||req.headers['x-osca-token']!==deleteToken||!['http:','https:'].includes(origin.protocol)){res.writeHead(403);res.end();return;}const result=match[2]?o.history.removePoint(module,Number(match[2])):o.history.remove(module);res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true,deleted:Number(result.changes)}));return;}
    if(match[2]){res.writeHead(404);res.end();return;}const h=Number(url.searchParams.get('hours')||24);if(![1,24,168,720].includes(h)){res.writeHead(400);res.end();return;}res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:true,rows:o.history.list(module,Date.now()-h*3600000)}));return;
   }
   if(req.method==='DELETE'){res.writeHead(404);res.end();return;}
   if(path==="/api/cockpit"&&o.cockpit){res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});res.end(req.method==="HEAD"?undefined:JSON.stringify(o.cockpit.frame()));return;}
   if(path==="/api/cockpit/history"&&o.cockpit?.recorder){const range=url.searchParams.get("range")||"";if(!RANGES[range]){res.writeHead(400);res.end();return;}res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});res.end(req.method==="HEAD"?undefined:JSON.stringify({ok:true,...o.cockpit.recorder.series(range)}));return;}
   if((path==="/widget"||path==="/widget.js")&&o.cockpit){const host=String(req.headers.host);const base=(/\.ts\.net(:\d+)?$/i.test(host)?"https://":"http://")+host;const script=widgetScript(base);
    if(path==="/widget.js"){res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8"});res.end(req.method==="HEAD"?undefined:script);return;}
    const nonce=randomBytes(16).toString("base64");res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`});res.end(req.method==="HEAD"?undefined:widgetPage(nonce,script));return;}
   if(path==="/manifest.webmanifest"&&o.cockpit){res.writeHead(200,{"Content-Type":"application/manifest+json","Cache-Control":"max-age=3600"});res.end(req.method==="HEAD"?undefined:JSON.stringify({name:"OSCA – Operating System · Core · Agent",short_name:"OSCA",start_url:"/cockpit",scope:"/",display:"standalone",orientation:"any",background_color:cockpitPalette.bg,theme_color:cockpitPalette.bg,icons:[{src:"/cockpit-icon.png",sizes:"180x180",type:"image/png"}]}));return;}
   if(path==="/api/cockpit/stream"&&o.cockpit){
    if(req.method!=="GET"||o.cockpit.subscribers>=(o.maxStreams??8)){res.writeHead(503);res.end();return;}
    res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8","Connection":"keep-alive","X-Accel-Buffering":"no"});res.flushHeaders?.();
    const hub=o.cockpit;const send=(f:unknown)=>{res.write("data: "+JSON.stringify(f)+"\n\n");};send(hub.frame());const off=hub.subscribe(send);
    const ping=setInterval(()=>res.write(": ping\n\n"),15000);req.on("close",()=>{off();clearInterval(ping);});return;
   }
   if(path==="/cockpit"&&o.cockpit){const nonce=randomBytes(16).toString("base64");res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":`default-src 'none'; img-src 'self'; manifest-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`});res.end(req.method==="HEAD"?undefined:cockpitHtml(nonce));return;}
   if(path==="/cockpit-icon.png"||path==="/favicon.ico"){cockpitIcon??=await sharp(Buffer.from(COCKPIT_ICON)).png().toBuffer();res.writeHead(200,{"Content-Type":"image/png","Cache-Control":"max-age=86400"});res.end(req.method==="HEAD"?undefined:cockpitIcon);return;}
   if(path==="/api/mobile"){const r=await api();res.writeHead(r.code,{"Content-Type":"application/json; charset=utf-8"});res.end(req.method==="HEAD"?undefined:r.body);return;}
   if(path==="/icon.png"||path==="/apple-touch-icon.png"){icon??=await sharp(Buffer.from(ICON)).png().toBuffer();res.writeHead(200,{"Content-Type":"image/png","Cache-Control":"max-age=86400"});res.end(req.method==="HEAD"?undefined:icon);return;}
   if(path!=="/"){res.writeHead(404);res.end();return;}
   const nonce=randomBytes(16).toString("base64");res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":`default-src 'none'; img-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`});res.end(req.method==="HEAD"?undefined:mobileHtml(nonce,deleteToken,!!o.cockpit));
  }catch{if(!res.headersSent)res.writeHead(503);res.end();}
 })();});
}
