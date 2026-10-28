import type { Quota,QuotaWindow } from "./model.js";
export function percent(value:unknown):number|null {return typeof value === "number"&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):null;}
export function remaining(value:unknown,semantics:"used"|"remaining"):number|null{const n=percent(value);return n===null?null:semantics==="used"?100-n:n;}
export function windowLabel(minutes:unknown):string{if(typeof minutes!=="number"||!Number.isFinite(minutes)||minutes<=0)return "?";return minutes===10080?"7d":minutes%1440===0?`${minutes/1440}d`:minutes%60===0?`${minutes/60}h`:`${minutes}m`;}
function reset(value:unknown):number|null{if(typeof value==="number"&&Number.isFinite(value)&&value>0)return value*1000;if(typeof value==="string"){const n=Date.parse(value);if(Number.isFinite(n))return n;}return null;}
export function emptyQuota(source:string):Quota{return {windows:[{label:"5h",remaining:null,reset:null},{label:"7d",remaining:null,reset:null}],measuredAt:0,error:"UNAVAILABLE",source};}
function aligned(windows:QuotaWindow[]):QuotaWindow[]{return ["5h","7d"].map(label=>windows.find(w=>w.label===label)||{label,remaining:null,reset:null}).concat(windows.filter(w=>!["5h","7d"].includes(w.label)));}
export function claudeQuota(body:any,at=Date.now()):Quota{
  const windows=["five_hour","seven_day"].map((k,i)=>{const v=body?.[k]||{};const val=v.remaining_percentage!==undefined?remaining(v.remaining_percentage,"remaining"):remaining(v.used_percentage??v.utilization,"used");return {label:i?"7d":"5h",remaining:val,reset:reset(v.resets_at)};});
  return {windows,measuredAt:windows.some(x=>x.remaining!==null)?at:0,error:windows.every(x=>x.remaining===null)?"UNAVAILABLE":null,source:"Claude OAuth usage: utilization/used_percentage = used"};
}
export function codexQuota(body:any,at=Date.now()):Quota{
 const bucket=body?.rateLimitsByLimitId?.codex??body?.rateLimits;const windows:QuotaWindow[]=[];
 for(const v of [bucket?.primary,bucket?.secondary]){if(!v)continue;windows.push({label:windowLabel(v.windowDurationMins??v.window_minutes),remaining:v.remainingPercent!==undefined?remaining(v.remainingPercent,"remaining"):remaining(v.usedPercent??v.used_percent,"used"),reset:reset(v.resetsAt??v.resets_at)});}
 return {windows:aligned(windows),measuredAt:windows.some(w=>w.remaining!==null)?at:0,error:windows.every(w=>w.remaining===null)?"UNAVAILABLE":null,source:"Codex account/rateLimits/read: usedPercent = used; codex bucket"};
}
export function quotaStale(q:Quota,now=Date.now()):boolean{return q.measuredAt>0&&(!!q.error||now-q.measuredAt>10*60_000||q.windows.some(w=>w.remaining!==null&&w.reset!==null&&w.reset<=now));}
export function quotaCaption(w:QuotaWindow):string{return w.remaining===null?"REST —":`REST ${Math.round(w.remaining)} %`;}
