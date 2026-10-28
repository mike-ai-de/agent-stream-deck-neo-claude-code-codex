import fs from "node:fs/promises";import path from "node:path";import os from "node:os";import { DatabaseSync } from "node:sqlite";
import {jsonFile,tail} from "./io.js";import {reading,unavailable,type Reading,type Sessions,type Session} from "./model.js";
export function inferStatus(status:unknown):Session["state"]{const s=String(status||"").toLowerCase();return /waiting|attention|permission|blocked|needs.?input/.test(s)?"attention":/working|running|busy|processing/.test(s)?"working":/idle|ready/.test(s)?"idle":"unknown";}
export async function collectClaude(directory=path.join(os.homedir(),".claude/sessions")):Promise<Reading<Sessions>>{
 try {const files=(await fs.readdir(directory)).filter(f=>f.endsWith(".json")).slice(0,64);const sessions:Session[]=[];let complete=true;
  for(const f of files){try{const d=await jsonFile(path.join(directory,f),32*1024);if(!Number.isInteger(d.pid)||typeof d.sessionId!=="string")continue;try{process.kill(d.pid,0);}catch{continue;}
    const state=inferStatus(d.status);if(state==="unknown")complete=false;const at=Number(d.statusUpdatedAt||d.updatedAt||d.startedAt)||0;
    const desktopId=typeof d.hostSessionId==="string"&&/^local_[a-f0-9-]{36}$/.test(d.hostSessionId)?d.hostSessionId:undefined;
    if(!sessions.some(x=>x.id===d.sessionId))sessions.push({provider:"claude",id:d.sessionId,state,open:true,at,waitingSince:state==="attention"?at:undefined,entrypoint:typeof d.entrypoint==="string"?d.entrypoint:undefined,desktopId});
  }catch{complete=false;}}
  const value={sessions,waitingComplete:complete,openComplete:complete,source:"Claude live PID + explicit session metadata; completion is not attention"};return {...reading(value,directory),quality:complete?"ok":"partial"};
 }catch{return unavailable(directory,"Claude session metadata unavailable");}
}
export interface CodexSignal {state:Session["state"];at:number;waitingSince?:number;complete:boolean}
export function parseCodexSignal(text:string,mtime:number,now=Date.now()):CodexSignal{
 let life:"idle"|"working"|"unknown"="unknown",at=0,activity=0;const pending=new Map<string,number>();
 for(const line of text.split("\n")){let e:any;try{e=JSON.parse(line);}catch{continue;}const p=e.payload;if(!p||typeof p!=="object")continue;const t=Date.parse(e.timestamp||"")||0;
  if(e.type==="event_msg"&&p.type==="task_started"){life="working";at=t;pending.clear();}
  if(e.type==="event_msg"&&["task_complete","turn_aborted"].includes(p.type)){life="idle";at=t;pending.clear();}
  if(e.type==="response_item"&&["reasoning","custom_tool_call","custom_tool_call_output","function_call","function_call_output"].includes(p.type))activity=Math.max(activity,t);
  if(e.type==="response_item"&&p.type==="function_call"&&typeof p.name==="string"&&/^(?:request_user_input|functions\.request_user_input)$/.test(p.name)&&typeof p.call_id==="string")pending.set(p.call_id,t);
  if(e.type==="response_item"&&p.type==="function_call_output"&&typeof p.call_id==="string")pending.delete(p.call_id);
 }
 if(pending.size)return {state:"attention",at:Math.max(at,mtime),waitingSince:Math.min(...pending.values()),complete:false};
 if(activity>at&&now-activity<120000){life="working";at=activity;}
 if(life==="working"&&now-mtime>600000)life="unknown";
 // Desktop approvals/async questions are not fully represented in rollouts; never claim ALL CLEAR.
 return {state:life,at:Math.max(at,mtime),complete:false};
}
export async function collectCodex(database=path.join(os.homedir(),".codex/state_5.sqlite")):Promise<Reading<Sessions>>{
 let db:DatabaseSync|undefined;
 try{db=new DatabaseSync(database,{readOnly:true,timeout:500});const rows=db.prepare("SELECT id,rollout_path FROM threads WHERE archived=0 AND (agent_path IS NULL OR agent_path='/root') AND source NOT LIKE '%subAgent%' ORDER BY updated_at DESC LIMIT 32").all() as Array<{id:string;rollout_path:string}>;const sessions:Session[]=[];
  for(const r of rows){try{const st=await fs.stat(r.rollout_path);const signal=parseCodexSignal(await tail(r.rollout_path,2*1024*1024),st.mtimeMs);sessions.push({provider:"codex",id:r.id,state:signal.state,open:signal.state==="working"||signal.state==="attention",at:signal.at,waitingSince:signal.waitingSince});}catch{sessions.push({provider:"codex",id:r.id,state:"unknown",open:false,at:0});}}
  return {...reading({sessions,waitingComplete:false,openComplete:false,source:"Read-only main-thread metadata and bounded lifecycle/activity tails"},database),quality:"partial",note:"Recent runtime tool/reasoning events count as work signals; full Desktop tabs and approval lists unavailable"};
 }catch{return unavailable(database,"Codex metadata unavailable");}finally{db?.close();}
}
