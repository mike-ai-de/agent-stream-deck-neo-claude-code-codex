import fs from "node:fs/promises";import path from "node:path";import http from "node:http";import net from "node:net";import {createHash,randomBytes} from "node:crypto";
import {DeviceModelId,listStreamDecks,openStreamDeck,type StreamDeck} from "@elgato-stream-deck/node";
import {OscaDashboard} from "./dashboard.js";import {Actions,actionFor} from "./actions.js";import {home,load} from "./config.js";import {PAGES,PAGE_NAMES,normalizePage,type Snapshot} from "./model.js";import {render,preview,tiles} from "./view.js";
import {fileURLToPath} from "node:url";import {shutdownProbes} from "./io.js";
const hash=(b:Buffer|string)=>createHash("sha256").update(b).digest("hex");
export class OscaNeo{
 readonly loaded=load();readonly dashboard=new OscaDashboard(this.loaded.config);readonly actions=new Actions(this.loaded.config);
 private deck:StreamDeck|null=null;private timer:NodeJS.Timeout|null=null;private web:http.Server|null=null;private ipc:net.Server|null=null;private running=false;private painting=false;private dirty=false;private scanPending=false;private pressed=new Set<number>();
 private desiredPage=0;private visiblePage=0;private frames=0;private lastWrite=0;private keyHashes:string[]=[];private lastError="";private startedAt=Date.now();
 private lock=path.join(home,"osca-neo.pid");private socket=path.join(home,"osca-neo.sock");private entry="";private build="";private moduleHashes:Record<string,string>={};private buildSha="";
 async start():Promise<void>{
  await fs.mkdir(home,{recursive:true,mode:0o700});await this.acquireLock();
  this.entry=path.resolve(process.argv[1]);this.build=hash(await fs.readFile(this.entry));
  const modules=path.dirname(fileURLToPath(import.meta.url));for(const name of (await fs.readdir(modules)).filter(n=>n.endsWith(".js")).sort())this.moduleHashes[name]=hash(await fs.readFile(path.join(modules,name)));this.buildSha=hash(JSON.stringify({entry:this.build,modules:this.moduleHashes}));
  try{const s=JSON.parse(await fs.readFile(path.join(home,"osca-state.json"),"utf8"));if(Number.isInteger(s.page))this.desiredPage=normalizePage(s.page);}catch{}
  this.visiblePage=this.desiredPage;this.running=true;
  try{await this.startServers();this.dashboard.tick();await this.scan();this.timer=setInterval(()=>{this.dashboard.tick();if(!this.deck)void this.scan();else void this.paint();},2000);console.log(`OSCA Neo active · build ${this.build.slice(0,12)} · config ${this.loaded.hash.slice(0,12)} · direct HID`);}catch(e){await this.stop();throw e;}
 }
 private async acquireLock():Promise<void>{
  try{const old=JSON.parse(await fs.readFile(this.lock,"utf8"));if(Number.isInteger(old.pid)){try{process.kill(old.pid,0);throw new Error("Another OSCA Neo process is live");}catch(e){if((e as NodeJS.ErrnoException).code!=="ESRCH")throw e;}}await fs.unlink(this.lock);}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
  const f=await fs.open(this.lock,"wx",0o600);try{await f.writeFile(JSON.stringify({pid:process.pid,startedAt:this.startedAt}));}finally{await f.close();}
 }
 private async scan():Promise<void>{
  if(this.scanPending||!this.running)return;this.scanPending=true;
  try{const devices=await listStreamDecks();const neo=devices.find(d=>d.model===DeviceModelId.NEO);if(!neo){this.lastError="Neo not connected";return;}
   const deck=await openStreamDeck(neo.path,{resetToLogoOnClose:true});if(!this.running){await deck.close();return;}this.deck=deck;this.pressed.clear();
   deck.on("error",()=>{void this.disconnect("HID disconnected");});deck.on("down",control=>{if(this.pressed.has(control.index))return;this.pressed.add(control.index);void this.press(control.index);});deck.on("up",control=>this.pressed.delete(control.index));
   await deck.setBrightness(this.loaded.config.brightness);await Promise.all([deck.fillKeyColor(8,28,100,140),deck.fillKeyColor(9,28,100,140)]);await this.paint();this.lastError="";
  }catch{this.lastError="Neo HID unavailable/busy; no Elgato takeover attempted";await this.disconnect(this.lastError);}finally{this.scanPending=false;}
 }
 private async disconnect(reason:string):Promise<void>{const deck=this.deck;this.deck=null;this.lastError=reason;this.pressed.clear();if(deck)await deck.close().catch(()=>{});}
 async press(index:number):Promise<void>{
  if(index<0||index>9)return;
  const action=actionFor(this.visiblePage,index,this.loaded.config.port);
  if(action.type==="navigate"){await this.navigate(action.delta);return;}
  if(this.painting){this.actions.message="PAGE UPDATING · PRESS AGAIN";return;}
  try{if(action.type==="quota"){this.dashboard.tick(true);this.actions.message="QUOTA REFRESH REQUESTED";}else await this.actions.perform(action,this.dashboard.snapshot());}
  catch{this.actions.message="ACTION UNAVAILABLE · SEE DETAILS";this.lastError="Last action unavailable (sanitized)";}
  await this.paint();
 }
 async navigate(delta:number):Promise<void>{this.desiredPage=normalizePage(this.desiredPage+delta);this.actions.resetConfirmation();this.actions.message="";await fs.writeFile(path.join(home,"osca-state.json"),JSON.stringify({schema:3,page:this.desiredPage})+"\n",{mode:0o600});await this.paint();}
 async setPage(page:number):Promise<void>{return this.navigate(normalizePage(page)-this.desiredPage);}
 private async paint():Promise<void>{
  this.dirty=true;if(this.painting)return;this.painting=true;
  try{while(this.dirty&&this.running){this.dirty=false;const deck=this.deck;if(!deck)break;if(this.actions.confirmUntil>0&&this.actions.confirmUntil<=Date.now()){this.actions.resetConfirmation();this.actions.message="STOP NOT CONFIRMED";}const page=this.desiredPage;const s=this.dashboard.snapshot();const buffers=await render(s,page,this.actions.confirmUntil,this.actions.message);if(this.deck!==deck)continue;
    // Key actions are ignored during this short frame write; dispatch always uses visiblePage.
    await Promise.all(buffers.slice(0,8).map((b,k)=>deck.fillKeyBuffer(k,b,{format:"rgba"})));await deck.fillLcd(0,buffers[8],{format:"rgba"});this.visiblePage=page;this.keyHashes=buffers.map(hash);this.frames++;this.lastWrite=Date.now();
  }}catch{await this.disconnect("HID frame write failed");}finally{this.painting=false;}
 }
 status(){return {software:{name:"OSCA Neo",version:"0.3.1-osca.1",pid:process.pid,startedAt:this.startedAt,entry:this.entry,entrySha256:this.build,buildSha256:this.buildSha,moduleHashes:this.moduleHashes,configFile:this.loaded.file,configSha256:this.loaded.hash,pages:this.loaded.config.pages,pageNames:PAGE_NAMES},hardware:{connected:!!this.deck,interface:"direct USB HID",visiblePage:this.visiblePage,pageName:PAGE_NAMES[this.visiblePage],frames:this.frames,lastWriteAt:this.lastWrite,keyAndLcdHashes:this.keyHashes,error:this.lastError||null},snapshot:this.dashboard.snapshot(),tiles:tiles(this.dashboard.snapshot(),this.visiblePage,this.actions.confirmUntil),actionMessage:this.actions.message};}
 private async startServers():Promise<void>{
  this.web=http.createServer((req,res)=>{void this.http(req,res);});await new Promise<void>((resolve,reject)=>{this.web!.once("error",reject);this.web!.listen(this.loaded.config.port,"127.0.0.1",resolve);});
  try{await fs.lstat(this.socket);await fs.unlink(this.socket);}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
  this.ipc=net.createServer(s=>{let raw="";s.setTimeout(1500,()=>s.destroy());s.on("error",()=>{});s.on("data",b=>{raw+=b.toString();if(raw.length>1024){s.destroy();return;}if(!raw.includes("\n"))return;
    void (async()=>{try{const d=JSON.parse(raw.split("\n")[0]);if(d.op==="page"&&Number.isInteger(d.page)&&d.page>=0&&d.page<3)await this.setPage(d.page);else if(d.op==="navigate"&&(d.delta===1||d.delta===-1))await this.press(d.delta===1?9:8);else throw new Error("Only page navigation is exposed");s.end(JSON.stringify({ok:true,hardware:this.status().hardware})+"\n");}catch{s.end('{"ok":false}\n');}})();});});
  await new Promise<void>((resolve,reject)=>{this.ipc!.once("error",reject);this.ipc!.listen(this.socket,()=>{void fs.chmod(this.socket,0o600).then(resolve,reject);});});
 }
 private async http(req:http.IncomingMessage,res:http.ServerResponse):Promise<void>{
  const host=`127.0.0.1:${this.loaded.config.port}`;if(req.headers.host!==host||req.method!=="GET"){res.writeHead(403);res.end();return;}
  res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Cross-Origin-Resource-Policy","same-origin");const url=new URL(req.url||"/",`http://${host}`);
  try{
   if(url.pathname==="/api/status"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify(this.status()));return;}
   const p=/^\/preview\/([0-2])\.png$/.exec(url.pathname);if(p){res.setHeader("Content-Type","image/png");res.end(await preview(this.dashboard.snapshot(),Number(p[1])));return;}
   if(url.pathname!=="/"){res.writeHead(404);res.end();return;}
   const nonce=randomBytes(16).toString("base64");res.setHeader("Content-Type","text/html; charset=utf-8");res.setHeader("Content-Security-Policy",`default-src 'none'; img-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'`);
   res.end(`<!doctype html><html lang="de"><meta charset="utf-8"><title>OSCA Neo · Status</title><style nonce="${nonce}">body{margin:36px;background:#09111f;color:#dbe7f8;font:15px system-ui}h1{color:#74ddeb}main{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0}img{width:464px;max-width:95vw;border:1px solid #233a55;border-radius:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:1100px;background:#111f31;padding:20px;border-radius:12px}p{color:#aebed2}nav a{color:#74ddeb;margin-right:18px}</style><h1>OSCA · Stream Deck Neo</h1><p>Drei vollständige Tastenseiten. Vorschau und Details sind lesend; Tastenaktionen laufen am Gerät. PARTIAL bedeutet unvollständige Quellen, nicht ALL CLEAR.</p><nav><a href="#agents">Agents</a><a href="#services">Dienste</a><a href="#backup">Backup</a></nav><main>${PAGE_NAMES.map((name,i)=>`<figure><h2>${i+1} · ${name}</h2><img src="/preview/${i}.png" alt="${name}: acht Tasten und Infobar"></figure>`).join("")}</main><h2 id="agents">Aktive Quellen und Status</h2><p>Codex: Lebenszyklussignale, keine vollständige Sicht auf Desktop-Freigaben oder offene Tabs. Hermes: echter Control-Socket, aber keine vollständige Rückfragenliste. Deshalb kein ungesichertes ALL CLEAR. Claude: explizite Session-Metadaten. Abschlüsse werden nicht zu Rückfragen umgedeutet.</p><h2 id="services">OSCA-Dienste</h2><p>GW/WA/LLM sind aktive Antworten. Sprache zeigt Konfiguration/Assets, keinen neuen Audiotest. Ollama: geladen ≠ beschäftigt. Inferenzdauer aus erfolgreichem Serverlog; Token/s ohne Quelle nicht verfügbar.</p><h2 id="backup">OPS und Sicherung</h2><p>Backupdatum, Lauf und Restore sind getrennt. Notion zeigt den belegten Zugriffstag, keine behauptete Live-Verbindung. Mail und Hostinger haben derzeit keine eingerichtete lesende Neo-Telemetrie.</p><pre id="status">Loading…</pre><script nonce="${nonce}">async function update(){try{const r=await fetch('/api/status');document.getElementById('status').textContent=JSON.stringify(await r.json(),null,2)}catch{document.getElementById('status').textContent='Status unavailable'}}update();setInterval(update,5000)</script></html>`);
  }catch{res.writeHead(503);res.end("UNAVAILABLE");}
 }
 async stop():Promise<void>{this.running=false;if(this.timer)clearInterval(this.timer);this.timer=null;shutdownProbes();this.web?.close();this.ipc?.close();await this.disconnect("stopped");for(const p of [this.socket,this.lock]){try{if(p===this.lock){const d=JSON.parse(await fs.readFile(p,"utf8"));if(d.pid!==process.pid)continue;}await fs.unlink(p);}catch{}}}
}
