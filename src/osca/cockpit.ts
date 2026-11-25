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
export interface LoadedEngine{kind:"ollama"|"strata"|"inkling";model:string}
export interface OrcaState{running:boolean;terminals:number;active:number;pi:number;piActive:number}
export interface Alert{level:Exclude<Level,"ok">;text:string}
export interface CockpitFrame{
 ok:true;t:number;
 live:{cpu:number|null;cores:number[];gpu:number|null;at:number|null};
 temp:{max:number|null;avg:number|null;hottest:number|null;thermal:string;level:Level};
 memory:{swapBytes:number|null;pressure:"NORMAL"|"WARN"|"CRITICAL"|null;level:Level};
 llm:LlmState&{model:string|null;loaded:boolean;lamp:Lamp;engines:LoadedEngine[]};
 strata:LlmState|null;
 inkling:LlmState|null;
 agents:{claude:{lamp:Lamp;open:number;working:number};codex:{lamp:Lamp;working:number;partial:boolean};hermes:{lamp:Lamp;whatsapp:string|null};orca:{lamp:Lamp;terminals:number;active:number;pi:number;piActive:number}};
 quota:{claude:{h5:QuotaWindow;d7:QuotaWindow};codex:{h5:QuotaWindow;d7:QuotaWindow}};
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
// The input rate is the momentary rate between two consecutive progress lines of the same task (Δtokens / Δtime).
// The rate printed by llama-server is an average since the start of the prompt and includes reused cache, so it is
// only used as a fallback when neither a previous line of that task nor its cache size is available.
export function parseLlamaLog(raw:string,modifiedAt:number,now=Date.now()):LlmState{
 let phase:LlmPhase="unknown",tps:number|null=null,lastTps:number|null=null,prefillTps:number|null=null,progress:number|null=null;
 let prev:{task:string;n:number;t:number}|null=null,cached:{task:string;n:number}|null=null;
 for(const line of raw.split("\n")){
  let m:RegExpExecArray|null;
  // A new prompt means llama-server starts reading; the first progress line can take seconds.
  if(/\| new prompt,/.test(line)){phase="reading";progress=0;prefillTps=null;tps=null;continue;}
  if((m=/task (\d+) \| cached n_tokens = (\d+)/.exec(line))){cached={task:m[1],n:Number(m[2])};continue;}
  if((m=/task (\d+) \| prompt processing, n_tokens =\s*(\d+), progress = ([\d.]+), t =\s*([\d.]+) s \/\s*([\d.]+) tokens per second/.exec(line))){
   const task=m[1],n=Number(m[2]),t=Number(m[4]);phase="reading";progress=Number(m[3]);tps=null;
   // First line of a task: subtract the reused cache reported just before ("cached n_tokens").
   const base=prev&&prev.task===task?prev:cached&&cached.task===task?{n:cached.n,t:0}:null;
   // The final line (progress 1.00) jumps to the end position and gives no real rate; keep the previous value then.
   const inst=base&&t>base.t&&n>base.n&&progress<1?(n-base.n)/(t-base.t):null;
   prefillTps=inst!==null&&inst<5000?Math.round(inst*10)/10:prev&&prev.task===task?prefillTps:Number(m[5]);prev={task,n,t};continue;}
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

/** Model name while Strata holds its model in memory (idle, reading or generating); null while unloaded or unknown. */
export function strataLoadedModel(body:any):string|null{
 const state=body?.live?.state;
 if(state!=="idle"&&state!=="reading"&&state!=="generating")return null;
 const name=body?.engine?.model;
 return typeof name==="string"&&name?name:"strata";
}

export function parseStrataMetrics(body:any):LlmState|null{
 const live=body?.live;
 const rate=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0?value:null;
 let phase:LlmPhase;
 switch(live?.state){
  case "reading":phase="reading";break;
  case "generating":phase="writing";break;
  case "unloaded":
  case "idle":phase="idle";break;
  default:return null;
 }
 const read=rate(live.prompt_read),total=rate(live.prompt_total);
 return {phase,tps:phase==="writing"?rate(live.tok_s):null,lastTps:null,
  prefillTps:phase==="reading"?rate(live.prefill_tok_s_mean):null,
  progress:phase==="reading"&&read!==null&&total!==null&&total>0?Math.min(1,read/total):null};
}

export interface SlotSample{task:number;read:number;written:number;at:number}
export const INKLING_PREFILL_WINDOW_MS=15000,INKLING_PREFILL_MIN_MS=5000;
/**
 * Rates from llama-server slot counters. Decode (n_decoded) moves per token, so the last poll is enough. The prompt counter
 * (n_prompt_tokens_processed) moves in blocks of 2048 tokens, one block every 5-15 s under load, so a per-second delta is
 * almost always 0: prefill is averaged over a 15 s window and stays unknown (null) until 5 s of the same task are seen.
 */
export function inklingFlow(previous:SlotSample[],cur:SlotSample):{samples:SlotSample[];tps:number|null;prefillTps:number|null}{
 const samples=[...previous.filter(s=>s.task===cur.task&&cur.at-s.at<=INKLING_PREFILL_WINDOW_MS&&s.at<cur.at),cur];
 const last=samples.length>1?samples[samples.length-2]:null;
 const tps=cur.written>0&&last&&cur.written>=last.written&&cur.at>last.at?(cur.written-last.written)/((cur.at-last.at)/1000):null;
 const base=samples[0];const span=cur.at-base.at;
 const prefillTps=cur.written===0&&span>=INKLING_PREFILL_MIN_MS&&cur.read>=base.read?(cur.read-base.read)/(span/1000):null;
 return {samples,tps,prefillTps};
}

export interface CockpitInputs{sensors:SensorFrame|null;llm:LlmState|null;strata?:LlmState|null;inkling?:LlmState|null;strataModel?:string|null;inklingModel?:string|null;orca:OrcaState|null;status:any|null;tokens?:TokenTotals|null;now?:number}
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
 // "Loaded" means any local engine holds a model: Ollama (api/ps), Strata (metrics state not unloaded), Inkling (slots answer).
 const engines:LoadedEngine[]=[
  ...(models.length?[{kind:"ollama" as const,model:String(models[0]?.name??"ollama")}]:[]),
  ...(i.strataModel?[{kind:"strata" as const,model:i.strataModel}]:[]),
  ...(i.inkling?[{kind:"inkling" as const,model:i.inklingModel||"inkling"}]:[])];
 const engineActive=llm.phase==="reading"||llm.phase==="writing"||[i.strata,i.inkling].some(x=>x?.phase==="reading"||x?.phase==="writing");
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
  llm:{...llm,model:engines[0]?.model??null,loaded:engines.length>0,engines,lamp:!s&&!engines.length?"unknown":engineActive?"active":engines.length?"idle":"off"},
  strata:i.strata??null,
  inkling:i.inkling??null,
  agents:{
   claude:{lamp:lampFor(!!s?.claude,claudeWorking>0),open:claudeS.filter((x:any)=>x?.open).length,working:claudeWorking},
   codex:{lamp:lampFor(!!s?.codex,codexWorking>0),working:codexWorking,partial:s?.codex?.quality!=="ok"},
   hermes:{lamp:!s?.hermes||hermesState==="unknown"?"unknown":hermesState==="stopped"?"off":lampFor(true,hermesState==="working"),whatsapp:s?.hermes?.value?.whatsapp??null},
   orca:i.orca?{lamp:i.orca.active>0?"active":"idle",terminals:i.orca.terminals,active:i.orca.active,pi:i.orca.pi,piActive:i.orca.piActive}:{lamp:"off",terminals:0,active:0,pi:0,piActive:0},
  },
  quota:{claude:{h5:q(s?.claudeQuota,"5h"),d7:q(s?.claudeQuota,"7d")},codex:{h5:q(s?.codexQuota,"5h"),d7:q(s?.codexQuota,"7d")}},
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
 quota("CLAUDE 5H",f.quota.claude.h5);quota("CLAUDE 7D",f.quota.claude.d7);quota("CODEX 5H",f.quota.codex.h5);quota("CODEX 7D",f.quota.codex.d7);
 if(!f.sources.sensors)a.push({level:"caution",text:"SENSOR LINK LOST"});
 if(!f.sources.neo)a.push({level:"caution",text:"NEO STATUS UNAVAILABLE"});
 return a.sort((x,y)=>(x.level==="warning"?0:1)-(y.level==="warning"?0:1));
}

export interface HubOptions{sensorsBin:string;upstream:string;orcaBin?:string|null;ollamaLog?:string;intervalMs?:number;recorder?:FlightRecorder|null;ledgerUrl?:string|null;strataMetricsUrl?:string}
export class CockpitHub{
 private sensors:SensorFrame|null=null;private llm:LlmState|null=null;private orca:OrcaState|null=null;private status:any=null;private tokens:TokenTotals|null=null;
 private strata:LlmState|null=null;
 private inkling:LlmState|null=null;
 private inklingSamples:SlotSample[]=[];
 private inklingModel:string|null=null;private inklingModelAt=0;private strataModel:string|null=null;
 private child:ChildProcess|null=null;private timers:NodeJS.Timeout[]=[];private stopped=false;private restartDelay=1000;
 private listeners=new Set<(f:CockpitFrame)=>void>();
 constructor(private o:HubOptions){}
 start():this{
  this.spawnSensors();
  const every=(ms:number,fn:()=>Promise<void>)=>{let busy=false;const run=()=>{if(busy)return;busy=true;fn().catch(()=>{}).finally(()=>{busy=false;});};run();this.timers.push(setInterval(run,ms));};
  every(1000,()=>this.pollLlm());
  every(1000,()=>this.pollInkling());
  const strataMetricsUrl=this.o.strataMetricsUrl;
  if(strataMetricsUrl)every(1000,()=>this.pollStrata(strataMetricsUrl));
  if(this.o.recorder){const rec=this.o.recorder;this.timers.push(setInterval(()=>{try{rec.record(this.frame());}catch{}},1000));}every(3000,()=>this.pollOrca());every(2000,()=>this.pollStatus());if(this.o.ledgerUrl)every(15000,()=>this.pollLedger());
  this.timers.push(setInterval(()=>{if(!this.listeners.size)return;const f=this.frame();for(const l of this.listeners){try{l(f);}catch{}}},this.o.intervalMs??250));
  return this;
 }
 stop():void{this.stopped=true;for(const t of this.timers)clearInterval(t);this.timers=[];this.child?.kill("SIGTERM");this.child=null;this.listeners.clear();}
 frame():CockpitFrame{return cockpitFrame({sensors:this.sensors,llm:this.llm,strata:this.strata,inkling:this.inkling,strataModel:this.strataModel,inklingModel:this.inklingModel,orca:this.orca,status:this.status,tokens:this.tokens});}
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
 private async pollInkling():Promise<void>{
  try{
   const slots=await fetchJson("http://127.0.0.1:11435/slots",900);
   if(!Array.isArray(slots)||!slots.length)throw new Error("Invalid Inkling slots");
   if(!this.inklingModel||Date.now()-this.inklingModelAt>30000){
    try{const m:any=await fetchJson("http://127.0.0.1:11435/v1/models",900);const name=m?.models?.[0]?.name??m?.data?.[0]?.id;this.inklingModel=typeof name==="string"&&name?name:this.inklingModel;this.inklingModelAt=Date.now();}catch{}
   }
   const slot=slots.find((item:any)=>item?.is_processing===true);
   if(!slot){this.inkling={phase:"idle",tps:null,lastTps:null,prefillTps:null,progress:null};this.inklingSamples=[];return;}
   const written=Number(slot.next_token?.[0]?.n_decoded),read=Number(slot.n_prompt_tokens_processed),task=Number(slot.id_task),now=Date.now();
   if(![written,read,task].every(Number.isFinite))throw new Error("Invalid Inkling counters");
   const flow=inklingFlow(this.inklingSamples,{task,read,written,at:now});this.inklingSamples=flow.samples;
   this.inkling={phase:written>0?"writing":"reading",tps:flow.tps,lastTps:null,prefillTps:flow.prefillTps,progress:null};
  }catch{this.inkling=null;this.inklingSamples=[];this.inklingModel=null;}
 }
 private async pollStrata(url:string):Promise<void>{
  try{const body=await fetchJson(url,900,512*1024,{Accept:"application/json"});this.strata=parseStrataMetrics(body);this.strataModel=strataLoadedModel(body);}
  catch{this.strata=null;this.strataModel=null;}
 }
 private async pollLedger():Promise<void>{try{this.tokens=parseLedger(await fetchJson(`${this.o.ledgerUrl}/api/tokens`,3000));}catch{this.tokens=null;}}
 private async pollStatus():Promise<void>{try{this.status=await fetchJson(`${this.o.upstream}/api/status`,2500,4*1024*1024);}catch{this.status=null;}}
}
