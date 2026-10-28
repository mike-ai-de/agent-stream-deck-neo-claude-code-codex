import fs from "node:fs/promises";import path from "node:path";import os from "node:os";
import type {Config} from "./config.js";import {command,fetchJson,jsonFile,textFile,unixJson,tail} from "./io.js";
import {CONTROL,HERMES_HOME,HERMES_ROOT,reading,unavailable,type Reading,type Hermes,type Ollama,type Memory,type Disks,type Speech,type Backup,type Ops} from "./model.js";
export function parseOllama(body:any):Ollama{if(!body||!Array.isArray(body.models))throw new Error("Invalid /api/ps object");return {activity:"unknown",models:body.models.map((m:any)=>{if(typeof m?.name!=="string")throw new Error("Invalid model");return {name:m.name,size:nonnegative(m.size),vram:nonnegative(m.size_vram)};})};}
export function nonnegative(v:unknown):number|null{return typeof v==="number"&&Number.isFinite(v)&&v>=0?v:null;}
export async function collectOllama(config:Config):Promise<Reading<Ollama>>{return reading(parseOllama(await fetchJson(config.ollamaUrl+"/api/ps")),"Ollama GET /api/ps; loaded != busy");}
export function hermesFromStatus(body:any,expectedHome=HERMES_HOME):Hermes{
 if(body?.hermes_home!==expectedHome||body.answering_pid!==body.pid||typeof body.answered_at!=="number"||Math.abs(Date.now()/1000-body.answered_at)>10)throw new Error("Hermes identity/liveness mismatch");
 const count=nonnegative(body.active_agents);const state=body.gateway_state==="stopped"?"stopped":["running","degraded"].includes(body.gateway_state)?count!==null&&count>0?"working":"running":"unknown";
 return {state,active:count,whatsapp:typeof body.platforms?.whatsapp?.state==="string"?body.platforms.whatsapp.state:null,pid:Number.isInteger(body.pid)?body.pid:null,home:expectedHome,attentionComplete:state==="stopped"};
}
export async function collectHermes():Promise<Reading<Hermes>>{
 try{let socket=path.join(HERMES_HOME,"gateway.sock");try{const p=await textFile(path.join(HERMES_HOME,"gateway.sock.path"),2048);if(p.trim())socket=p.trim();}catch{}
  const answer=await unixJson(socket,{verb:"status",id:"neo-readonly-status"});if(answer.ok!==true||answer.id!=="neo-readonly-status")throw new Error("Invalid Hermes response");
  return reading(hermesFromStatus(answer.result),"Live gateway control socket, status verb (verified checkout)");
 }catch{
  try{const d=await jsonFile(path.join(HERMES_HOME,"gateway_state.json"));let dead=false;
   if(Number.isInteger(d.pid)){try{process.kill(d.pid,0);}catch(e){dead=(e as NodeJS.ErrnoException).code==="ESRCH";}}
   if(d.hermes_home===HERMES_HOME&&(dead||d.gateway_state==="stopped"))return reading({state:"stopped",active:0,whatsapp:null,pid:null,home:HERMES_HOME,attentionComplete:true},"Retained status + no live PID / explicit stopped state");
  }catch{}
  return unavailable("Hermes live control socket","UNKNOWN; process alone is not readiness");
 }
}
export class CpuSampler{
 private previous:{idle:number;total:number}|null=null;
 collect():Reading<number>{const c=os.cpus();if(!c.length)return unavailable("os.cpus","CPU unavailable");const n=c.reduce((a,c)=>({idle:a.idle+c.times.idle,total:a.total+Object.values(c.times).reduce((x,y)=>x+y,0)}),{idle:0,total:0});const p=this.previous;this.previous=n;if(!p||n.total<=p.total)return unavailable("CPU interval deltas","Warming up");return reading(Math.max(0,Math.min(100,100*(1-(n.idle-p.idle)/(n.total-p.total)))),"os.cpus aggregate interval deltas");}
}
export function parseMemory(pressure:string,swap:string,vm:string,total=os.totalmem()):Memory{
 const level=Number(pressure.trim());const label=level===1?"NORMAL":level===2?"WARN":level===4?"CRITICAL":null;
 const size=/page size of\s+(\d+)\s+bytes/i.exec(vm);const pages=/Pages free:\s+(\d+)/i.exec(vm);const sw=/used\s*=\s*([\d.]+)\s*([KMGT])/i.exec(swap);const units:Record<string,number>={K:1024,M:1024**2,G:1024**3,T:1024**4};
 const pageSize=size?Number(size[1]):null;return {pressure:label,swapBytes:sw?Number(sw[1])*units[sw[2].toUpperCase()]:null,pageSize,totalBytes:total,freeBytes:pageSize&&pages?Number(pages[1])*pageSize:null};
}
export async function collectMemory():Promise<Reading<Memory>>{
 const results=await Promise.allSettled([command("/usr/sbin/sysctl",["-n","kern.memorystatus_vm_pressure_level"]),command("/usr/sbin/sysctl",["vm.swapusage"]),command("/usr/bin/vm_stat",[])]);
 const str=(i:number)=>results[i].status==="fulfilled"?(results[i] as PromiseFulfilledResult<string>).value:"";const m=parseMemory(str(0),str(1),str(2));return {...reading(m,"macOS pressure sysctl; vm_stat page size; vm.swapusage"),quality:m.pressure&&m.swapBytes!==null&&m.pageSize!==null?"ok":"partial"};
}
export function parseGpu(raw:string):number|null{const values=[...raw.matchAll(/"Device Utilization %"\s*=\s*([\d.]+)/g)].map(x=>Number(x[1])).filter(n=>Number.isFinite(n)&&n>=0&&n<=100);return values.length?Math.max(...values):null;}
export async function collectGpu():Promise<Reading<number>>{const n=parseGpu(await command("/usr/sbin/ioreg",["-r","-d","1","-c","IOAccelerator"],4000,1024*1024));return n===null?unavailable("IOAccelerator","GPU metric unavailable; no synthetic zero"):reading(n,"IOAccelerator PerformanceStatistics Device Utilization %");}
export async function collectDisks():Promise<Reading<Disks>>{
 const parent=await fs.stat("/Volumes");const disk=async(p:string)=>{try{const st=await fs.stat(p);if(st.dev===parent.dev)return null;const s=await fs.statfs(p);return {free:s.bavail*s.bsize,total:s.blocks*s.bsize};}catch{return null;}};
 const [core,data]=await Promise.all([disk("/Volumes/OSCA-CORE"),disk("/Volumes/OSCA-DATA")]);return {...reading({coreFree:core?.free??null,dataFree:data?.free??null,coreTotal:core?.total??null,dataTotal:data?.total??null},"statfs on verified mounted DATA/CORE"),quality:core&&data?"ok":"partial"};
}
export async function collectSpeech():Promise<Reading<Speech>>{
 const c=await textFile(path.join(HERMES_HOME,"config.yaml"),64*1024);const tts=/^tts:\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m.exec(c)?.[1]||"";const stt=/^stt:\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m.exec(c)?.[1]||"";
 const configured=/provider:\s*qwen-ryan-local/.test(tts)&&/provider:\s*local/.test(stt)&&/model:\s*turbo/.test(stt);let assets=false;
 try{await Promise.all([fs.access(`${HERMES_ROOT}/runtime/qwen-speech/bin/python`),fs.access("/Volumes/OSCA-CORE/Speech/qwen3-tts-1.7b"),fs.access(`${HERMES_ROOT}/scripts/qwen-ryan-local.py`)]);assets=true;}catch{}
 const adapter=await textFile(`${HERMES_ROOT}/scripts/qwen-ryan-local.py`,32*1024);const ryan=/speaker=['"]Ryan['"]/.test(adapter)&&/atempo=1\.10/.test(adapter);
 return {...reading({stt:/model:\s*turbo/.test(stt)?"Whisper turbo de":"UNKNOWN",tts:configured&&ryan?"Ryan de +10%":"UNKNOWN",assets,configured,note:"Configuration/assets checked; not a fresh audio health test"},"Current Hermes config + adapter + independent speech runtime"),quality:configured&&assets&&ryan?"ok":"partial"};
}
export function parseBackup(status:string,latest:string|null,note=""):Backup{
 const r=/\bRunning\s*=\s*([01])/.exec(status);const d=latest?/(\d{4}-\d{2}-\d{2}-\d{6})/.exec(latest):null;
 return {running:r?r[1]==="1":null,lastSuccess:d?d[1]:null,restore:"unverified",note};
}
export async function collectBackup():Promise<Reading<Backup>>{
 const r=await Promise.allSettled([command("/usr/bin/tmutil",["status"],4500,128*1024),command("/usr/bin/tmutil",["latestbackup"],4500,128*1024)]);
 const status=r[0].status==="fulfilled"?r[0].value:"";const last=r[1].status==="fulfilled"?r[1].value:null;const value=parseBackup(status,last,last===null?"Latest successful backup unavailable (possibly Full Disk Access); restore unverified":"Successful timestamp from tmutil; restore unverified");
 return {...reading(value,"tmutil status + latestbackup, separate from restore"),quality:value.running!==null&&value.lastSuccess?"ok":"partial"};
}
export async function collectOps():Promise<Omit<Ops,"backup">>{
 const mail:Reading<string>={...unavailable<string>("No current Neo mail polling source","No configured read-only polling telemetry"),quality:"not-configured"};
 const hostinger:Reading<string>={...unavailable<string>("No current read-only Hostinger telemetry","No SSH/integration reactivated"),quality:"not-configured"};
 let notion:Reading<string>=unavailable("Notion evidence","No verified access evidence");
 try{const d=await jsonFile("/Volumes/OSCA-DATA/Projects/OSCA-Systembaseline-2026-10-26/acceptance.json",64*1024);if(d.passed===true&&d.readback_count===8&&/^\d{4}-\d{2}-\d{2}$/.test(d.date))notion={value:d.date,quality:"partial",at:Date.now(),source:"Systembaseline acceptance: 8 successful Notion readbacks; day precision only",note:"Evidence date only; current connection not checked"};}catch(e){notion.note=`Read failed: ${(e as NodeJS.ErrnoException).code||"UNKNOWN"}`;}
 let nextCheck:Reading<string>=unavailable("OSCA current OPEN-QUESTIONS");try{const s=await textFile(`${CONTROL}/OPEN-QUESTIONS.md`,32*1024);const row=s.split("\n").find(l=>/^\|\s*[^|\s-][^|]*\|/.test(l)&&!/^\|\s*Bereich\s*\|/.test(l));if(row)nextCheck=reading(row.split("|")[1].trim(),`${CONTROL}/OPEN-QUESTIONS.md`);}catch(e){nextCheck.note=`Read failed: ${(e as NodeJS.ErrnoException).code||"UNKNOWN"}`;}
 return {mail,hostinger,notion,nextCheck};
}
export function parseInferenceLog(raw:string):Reading<{durationMs:number;tokensPerSecond:number|null}>{
 let last:Reading<{durationMs:number;tokensPerSecond:number|null}>=unavailable("Ollama server log","No successful inference timing found");
 for(const line of raw.split("\n")){
  if(!/POST\s+"\/(?:v1\/chat\/completions|api\/(?:chat|generate))"/.test(line))continue;
  const m=/\[GIN\]\s*(\d{4}\/\d{2}\/\d{2})\s*-\s*(\d{2}:\d{2}:\d{2})\s*\|\s*200\s*\|\s*([^|]+)\|/.exec(line);if(!m)continue;
  const durationMs=parseGoDuration(m[3].trim());const at=Date.parse(m[1].replaceAll("/","-")+"T"+m[2]);if(!Number.isFinite(at)||durationMs===null){last=unavailable("Ollama server log","Latest inference timing unparseable");continue;}
  last=reading({durationMs,tokensPerSecond:null},"Ollama GIN successful inference request duration; token rate unavailable",at);
 }return last;
}
export function parseGoDuration(raw:string):number|null{const parts=[...raw.matchAll(/(\d+(?:\.\d+)?)(ns|µs|us|ms|s|m|h)/g)];if(!parts.length||parts.map(x=>x[0]).join("")!==raw)return null;const units:Record<string,number>={ns:.000001,"µs":.001,us:.001,ms:1,s:1000,m:60000,h:3600000};return parts.reduce((n,p)=>n+Number(p[1])*units[p[2]],0);}
export async function collectInference():Promise<Reading<{durationMs:number;tokensPerSecond:number|null}>>{return parseInferenceLog(await tail(path.join(os.homedir(),".ollama/logs/server.log"),256*1024));}
