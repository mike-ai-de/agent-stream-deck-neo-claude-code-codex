import {spawn,type ChildProcess} from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {command,fetchJson,tail} from "./io.js";
import type {FlightRecorder} from "./recorder.js";

// Live data for the OSCA cockpit page. Read-only: a native sampler (osca-sensors), the Ollama server log,
// `orca terminal list` and the Neo status API. The frame contains no session IDs, paths, PIDs or terminal text.

export type Lamp="active"|"idle"|"off"|"unknown";
export type Level="ok"|"caution"|"warning";
export type LlmPhase="idle"|"reading"|"writing"|"unknown";
export interface SensorFrame{t:number;cpu?:number;cores?:number[];gpu?:number;temp?:{max:number;avg:number;hottest:number;sensors:number};thermal?:string;swap?:number;pressure?:number}
export interface LlmState{phase:LlmPhase;tps:number|null;lastTps:number|null;prefillTps:number|null;progress:number|null}
export interface OrcaState{running:boolean;terminals:number;active:number;pi:number;piActive:number}
export interface Alert{level:Exclude<Level,"ok">;text:string}
export interface CockpitFrame{
 ok:true;t:number;
 live:{cpu:number|null;cores:number[];gpu:number|null;at:number|null};
 temp:{max:number|null;avg:number|null;hottest:number|null;thermal:string;level:Level};
 memory:{swapBytes:number|null;pressure:"NORMAL"|"WARN"|"CRITICAL"|null;level:Level};
 llm:LlmState&{model:string|null;loaded:boolean;lamp:Lamp};
 agents:{claude:{lamp:Lamp;open:number;working:number};codex:{lamp:Lamp;working:number;partial:boolean};hermes:{lamp:Lamp;whatsapp:string|null};orca:{lamp:Lamp;terminals:number;active:number;pi:number;piActive:number}};
 quota:{claude:{h5:QuotaWindow;d7:QuotaWindow};codex:{d7:QuotaWindow}};
 tokens:TokenTotals|null;
 alerts:Alert[];
 sources:{sensors:boolean;neo:boolean;orca:boolean;llm:boolean;ledger:boolean};
}
export interface QuotaWindow{remaining:number|null;reset:number|null}
export interface TokenRange{requests:number;inNew:number;inTotal:number;out:number}
export interface TokenTotals{init:string;at:number;ranges:{h1:TokenRange;h24:TokenRange;month:TokenRange;year:TokenRange;total:TokenRange};perDay:{inNew:number;out:number}}

// Totals from the independent OSCA Token Ledger service (127.0.0.1:9466). Only numbers are passed on.
export function parseLedger(body:any):TokenTotals{
 const keys=["h1","h24","month","year","total"] as const;if(body?.ok!==true||typeof body.init!=="string"||!body.ranges)throw new Error("Invalid ledger response");
 const num=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0?v:0;
 const ranges=Object.fromEntries(keys.map(k=>{const r=body.ranges[k];if(!r)throw new Error("Missing range");return [k,{requests:num(r.requests),inNew:num(r.inNew),inTotal:num(r.inTotal),out:num(r.out)}];})) as TokenTotals["ranges"];
 return {init:body.init,at:num(body.at),ranges,perDay:{inNew:num(body.perDay?.inNew),out:num(body.perDay?.out)}};
}

export const LIMITS={load:{caution:70,warning:90},temp:{caution:85,warning:95},swap:{caution:1024**3,warning:8*1024**3},quota:{caution:20,warning:10}} as const;
const ACTIVE_WINDOW_MS=15000,LLM_STALE_MS=12000;

export function parseSensorLine(line:string):SensorFrame|null{
 let d:any;try{d=JSON.parse(line);}catch{return null;}
 if(!d||typeof d!=="object"||!Number.isFinite(d.t))return null;
 const pct=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=100?v:undefined;
 const f:SensorFrame={t:d.t};
 f.cpu=pct(d.cpu);f.gpu=pct(d.gpu);
 if(Array.isArray(d.cores))f.cores=d.cores.map((x:unknown)=>pct(x)??0).slice(0,64);
 if(d.temp&&[d.temp.max,d.temp.avg,d.temp.hottest].every(v=>typeof v==="number"&&v>0&&v<150))f.temp={max:d.temp.max,avg:d.temp.avg,hottest:d.temp.hottest,sensors:Number(d.temp.sensors)||0};
 if(typeof d.thermal==="string")f.thermal=d.thermal;
 if(typeof d.swap==="number"&&d.swap>=0)f.swap=d.swap;
 if(Number.isInteger(d.pressure))f.pressure=d.pressure;
 return f;
}

// llama-server lines in the Ollama log: "prompt processing ... progress = 0.81, t = 5.21 s / 850.47 tokens per second",
// "n_gen = 5853, tg = 16.79 t/s, tg_3s = 16.64 t/s", "stop processing", "all slots are idle". The lines carry no timestamp,
// so the file's modification time decides whether a reading/writing phase is still current.
export function parseLlamaLog(raw:string,modifiedAt:number,now=Date.now()):LlmState{
 let phase:LlmPhase="unknown",tps:number|null=null,lastTps:number|null=null,prefillTps:number|null=null,progress:number|null=null;
 for(const line of raw.split("\n")){
  let m:RegExpExecArray|null;
  if((m=/prompt processing,.*progress = ([\d.]+).*?\/\s*([\d.]+) tokens per second/.exec(line))){phase="reading";progress=Number(m[1]);prefillTps=Number(m[2]);tps=null;continue;}
  if((m=/n_gen =\s*\d+, tg =\s*([\d.]+) t\/s(?:, tg_\d+s =\s*([\d.]+) t\/s)?/.exec(line))){phase="writing";const now3=Number(m[2]??m[1]);tps=Number.isFinite(now3)?now3:null;lastTps=Number(m[1]);progress=null;continue;}
  if(/stop processing|all slots are idle/.test(line)){phase="idle";tps=null;progress=null;}
 }
 if((phase==="reading"||phase==="writing")&&now-modifiedAt>LLM_STALE_MS){phase="idle";tps=null;progress=null;}
 return {phase,tps,lastTps,prefillTps,progress};
}

export function parseOrcaTerminals(body:any,now=Date.now()):OrcaState{
 const r=body?.result??body;const list:any[]=Array.isArray(r)?r:Array.isArray(r?.terminals)?r.terminals:[];
 if(body?.ok===false)throw new Error("Orca runtime unavailable");
 const recent=(t:any)=>typeof t?.lastOutputAt==="number"&&now-t.lastOutputAt<ACTIVE_WINDOW_MS;
 const isPi=(t:any)=>typeof t?.title==="string"&&/^(?:pi|π)(?![a-z0-9])/i.test(t.title.trim());
 const live=list.filter(t=>t&&t.connected!==false);
 return {running:true,terminals:live.length,active:live.filter(recent).length,pi:live.filter(isPi).length,piActive:live.filter(t=>isPi(t)&&recent(t)).length};
}

const level=(v:number|null,c:number,w:number):Level=>v===null?"ok":v>=w?"warning":v>=c?"caution":"ok";
const pressureName=(p:number|undefined)=>p===1?"NORMAL":p===2?"WARN":p===4?"CRITICAL":null;

export interface CockpitInputs{sensors:SensorFrame|null;llm:LlmState|null;orca:OrcaState|null;status:any|null;tokens?:TokenTotals|null;now?:number}
export function cockpitFrame(i:CockpitInputs):CockpitFrame{
 const now=i.now??Date.now();const s=i.status?.snapshot;const sensors=i.sensors&&now-i.sensors.t<5000?i.sensors:null;
 const sessions=(x:any)=>Array.isArray(x?.value?.sessions)?x.value.sessions:[];
 const claudeS=sessions(s?.claude),codexS=sessions(s?.codex);
 const working=(l:any[])=>l.filter(x=>x?.state==="working").length;
 const claudeWorking=working(claudeS),codexWorking=working(codexS);
 const lampFor=(ok:boolean,active:boolean):Lamp=>!ok?"unknown":active?"active":"idle";
 const hermesState=s?.hermes?.value?.state;
 const models:any[]=Array.isArray(s?.ollama?.value?.models)?s.ollama.value.models:[];
 const llm=i.llm??{phase:"unknown" as LlmPhase,tps:null,lastTps:null,prefillTps:null,progress:null};
 const q=(qq:any,label:string):QuotaWindow=>{const w=Array.isArray(qq?.windows)?qq.windows.find((x:any)=>x?.label===label):null;return {remaining:typeof w?.remaining==="number"?w.remaining:null,reset:typeof w?.reset==="number"?w.reset:null};};
 const thermal=sensors?.thermal??"unknown";const tMax=sensors?.temp?.max??null;
 const thermalLevel:Level=thermal==="critical"?"warning":thermal==="serious"?"caution":"ok";const sensorLevel=level(tMax,LIMITS.temp.caution,LIMITS.temp.warning);
 const tempLevel:Level=thermalLevel==="warning"||sensorLevel==="warning"?"warning":thermalLevel==="caution"||sensorLevel==="caution"?"caution":"ok";
 const pressure=pressureName(sensors?.pressure);const swap=sensors?.swap??null;
 const swapLevel=level(swap,LIMITS.swap.caution,LIMITS.swap.warning);
 const memLevel:Level=pressure==="CRITICAL"?"warning":pressure==="WARN"&&swapLevel==="ok"?"caution":swapLevel;
 const frame:CockpitFrame={ok:true,t:now,
  live:{cpu:sensors?.cpu??null,cores:sensors?.cores??[],gpu:sensors?.gpu??null,at:sensors?.t??null},
  temp:{max:tMax,avg:sensors?.temp?.avg??null,hottest:sensors?.temp?.hottest??null,thermal,level:tempLevel},
  memory:{swapBytes:swap,pressure,level:memLevel},
  llm:{...llm,model:models[0]?.name??null,loaded:models.length>0,lamp:!s?"unknown":llm.phase==="reading"||llm.phase==="writing"?"active":models.length?"idle":"off"},
  agents:{
   claude:{lamp:lampFor(!!s?.claude,claudeWorking>0),open:claudeS.filter((x:any)=>x?.open).length,working:claudeWorking},
   codex:{lamp:lampFor(!!s?.codex,codexWorking>0),working:codexWorking,partial:s?.codex?.quality!=="ok"},
   hermes:{lamp:!s?.hermes||hermesState==="unknown"?"unknown":hermesState==="stopped"?"off":lampFor(true,hermesState==="working"),whatsapp:s?.hermes?.value?.whatsapp??null},
   orca:i.orca?{lamp:i.orca.active>0?"active":"idle",terminals:i.orca.terminals,active:i.orca.active,pi:i.orca.pi,piActive:i.orca.piActive}:{lamp:"off",terminals:0,active:0,pi:0,piActive:0},
  },
  quota:{claude:{h5:q(s?.claudeQuota,"5h"),d7:q(s?.claudeQuota,"7d")},codex:{d7:q(s?.codexQuota,"7d")}},
  tokens:i.tokens??null,
  alerts:[],
  sources:{sensors:!!sensors,neo:!!s,orca:!!i.orca,llm:!!i.llm,ledger:!!i.tokens},
 };
 frame.alerts=alerts(frame);
 return frame;
}

export function alerts(f:CockpitFrame):Alert[]{
 const a:Alert[]=[];const gib=(b:number)=>(b/1024**3).toFixed(1)+" GB";
 if(f.temp.level!=="ok")a.push({level:f.temp.level,text:`TEMP ${f.temp.max??"—"}°C · THERMAL ${f.temp.thermal.toUpperCase()}`});
 if(f.memory.level!=="ok")a.push({level:f.memory.level,text:`SWAP ${f.memory.swapBytes===null?"—":gib(f.memory.swapBytes)} · MEM ${f.memory.pressure??"—"}`});
 if(f.live.cpu!==null&&f.live.cpu>=LIMITS.load.warning)a.push({level:"caution",text:`CPU LOAD ${Math.round(f.live.cpu)}%`});
 const quota=(name:string,w:QuotaWindow)=>{if(w.remaining===null)return;const l=w.remaining<=LIMITS.quota.warning?"warning":w.remaining<=LIMITS.quota.caution?"caution":"ok";if(l!=="ok")a.push({level:l,text:`${name} QUOTA ${Math.round(w.remaining)}% LEFT`});};
 quota("CLAUDE 5H",f.quota.claude.h5);quota("CLAUDE 7D",f.quota.claude.d7);quota("CODEX 7D",f.quota.codex.d7);
 if(!f.sources.sensors)a.push({level:"caution",text:"SENSOR LINK LOST"});
 if(!f.sources.neo)a.push({level:"caution",text:"NEO STATUS UNAVAILABLE"});
 return a.sort((x,y)=>(x.level==="warning"?0:1)-(y.level==="warning"?0:1));
}

export interface HubOptions{sensorsBin:string;upstream:string;orcaBin?:string|null;ollamaLog?:string;intervalMs?:number;recorder?:FlightRecorder|null;ledgerUrl?:string|null}
export class CockpitHub{
 private sensors:SensorFrame|null=null;private llm:LlmState|null=null;private orca:OrcaState|null=null;private status:any=null;private tokens:TokenTotals|null=null;
 private child:ChildProcess|null=null;private timers:NodeJS.Timeout[]=[];private stopped=false;private restartDelay=1000;
 private listeners=new Set<(f:CockpitFrame)=>void>();
 constructor(private o:HubOptions){}
 start():this{
  this.spawnSensors();
  const every=(ms:number,fn:()=>Promise<void>)=>{let busy=false;const run=()=>{if(busy)return;busy=true;fn().catch(()=>{}).finally(()=>{busy=false;});};run();this.timers.push(setInterval(run,ms));};
  every(1000,()=>this.pollLlm());
  if(this.o.recorder){const rec=this.o.recorder;this.timers.push(setInterval(()=>{try{rec.record(this.frame());}catch{}},1000));}every(3000,()=>this.pollOrca());every(2000,()=>this.pollStatus());if(this.o.ledgerUrl)every(15000,()=>this.pollLedger());
  this.timers.push(setInterval(()=>{if(!this.listeners.size)return;const f=this.frame();for(const l of this.listeners){try{l(f);}catch{}}},this.o.intervalMs??250));
  return this;
 }
 stop():void{this.stopped=true;for(const t of this.timers)clearInterval(t);this.timers=[];this.child?.kill("SIGTERM");this.child=null;this.listeners.clear();}
 frame():CockpitFrame{return cockpitFrame({sensors:this.sensors,llm:this.llm,orca:this.orca,status:this.status,tokens:this.tokens});}
 subscribe(fn:(f:CockpitFrame)=>void):()=>void{this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};}
 get subscribers():number{return this.listeners.size;}
 get recorder():FlightRecorder|null{return this.o.recorder??null;}
 private spawnSensors():void{
  if(this.stopped)return;let child:ChildProcess;
  try{child=spawn(this.o.sensorsBin,[String(this.o.intervalMs??250)],{stdio:["ignore","pipe","ignore"]});}catch{this.retrySensors();return;}
  this.child=child;let buf="";
  child.stdout?.on("data",(b:Buffer)=>{buf+=b.toString("utf8");if(buf.length>256*1024)buf="";let n;while((n=buf.indexOf("\n"))>=0){const f=parseSensorLine(buf.slice(0,n));buf=buf.slice(n+1);if(f){this.sensors=f;this.restartDelay=1000;}}});
  child.on("error",()=>{});child.on("exit",()=>{if(this.child===child)this.child=null;this.retrySensors();});
 }
 private retrySensors():void{if(this.stopped)return;const t=setTimeout(()=>this.spawnSensors(),this.restartDelay);t.unref();this.restartDelay=Math.min(this.restartDelay*2,30000);}
 private async pollLlm():Promise<void>{
  const file=this.o.ollamaLog??path.join(os.homedir(),".ollama/logs/server.log");
  try{const st=await fs.stat(file);this.llm=parseLlamaLog(await tail(file,64*1024),st.mtimeMs);}catch{this.llm=null;}
 }
 private async pollOrca():Promise<void>{
  if(!this.o.orcaBin){this.orca=null;return;}
  try{this.orca=parseOrcaTerminals(JSON.parse(await command(this.o.orcaBin,["terminal","list","--json"],2500,2*1024*1024)));}catch{this.orca=null;}
 }
 private async pollLedger():Promise<void>{try{this.tokens=parseLedger(await fetchJson(`${this.o.ledgerUrl}/api/tokens`,3000));}catch{this.tokens=null;}}
 private async pollStatus():Promise<void>{try{this.status=await fetchJson(`${this.o.upstream}/api/status`,2500,4*1024*1024);}catch{this.status=null;}}
}
