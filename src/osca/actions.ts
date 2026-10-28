import {PAGES,normalizePage,counts,HERMES_ROOT,CONTROL,EXCHANGE,type Snapshot,type Session} from "./model.js";import type {Config} from "./config.js";import {command,textFile} from "./io.js";import {collectHermes} from "./local.js";
export type Action={type:"navigate";delta:-1|1}|{type:"session";provider:"claude"|"codex"}|{type:"needs"}|{type:"stop"}|{type:"open";target:string}|{type:"exchange"}|{type:"quota"};
export function actionFor(page:number,index:number,port=9463):Action{
 if(index===8)return {type:"navigate",delta:-1};if(index===9)return {type:"navigate",delta:1};const m=PAGES[normalizePage(page)][index];const details=(section:string):Action=>({type:"open",target:`http://127.0.0.1:${port}/#${section}`});
 switch(m){case "claude":case "codex":return {type:"session",provider:m};case "needs":return {type:"needs"};case "stop":return {type:"stop"};case "exchange":return {type:"exchange"};case "control":return {type:"open",target:CONTROL};case "nextCheck":return {type:"open",target:`${CONTROL}/OPEN-QUESTIONS.md`};case "claudeQuota":case "codexQuota":return {type:"quota"};case "hermes":return details("hermes");case "agents":return details("agents");case "services":return details("services");default:return details(m||"agents");}
}
export function selectSession(sessions:Session[]):Session|null{return [...sessions].sort((a,b)=>{if(a.state==="attention"&&b.state!=="attention")return -1;if(b.state==="attention"&&a.state!=="attention")return 1;if(a.state==="attention"&&b.state==="attention")return (a.waitingSince||a.at)-(b.waitingSince||b.at);if(a.state==="working"&&b.state!=="working")return -1;if(b.state==="working"&&a.state!=="working")return 1;if(a.entrypoint==="claude-desktop"&&b.entrypoint!=="claude-desktop")return -1;if(b.entrypoint==="claude-desktop"&&a.entrypoint!=="claude-desktop")return 1;return b.at-a.at;})[0]||null;}
export class Actions{
 confirmUntil=0;message="";private busy=false;
 constructor(private readonly config:Config,private readonly run=command,private readonly liveHermes=collectHermes){}
 resetConfirmation():void{this.confirmUntil=0;}
 private async openSession(session:Session|null):Promise<void>{
  if(!session){this.message="NO KNOWN OPEN SESSION";await this.run("/usr/bin/open",[`http://127.0.0.1:${this.config.port}/#agents`]);return;}
  if(!/^[a-zA-Z0-9_-]{6,100}$/.test(session.id))throw new Error("Invalid session ID");
  if(session.provider==="codex")await this.run("/usr/bin/open",[`codex://threads/${encodeURIComponent(session.id)}`]);
  else if(session.provider==="claude"){
   if(session.desktopId&&/^local_[a-f0-9-]{36}$/.test(session.desktopId))await this.run("/usr/bin/open",["-a","/Applications/Claude.app",`claude://code/continue?session=${encodeURIComponent(session.desktopId)}`]);
   else{await this.run("/usr/bin/open",["-a","/Applications/Claude.app"]);await this.run("/usr/bin/open",[`http://127.0.0.1:${this.config.port}/#agents`]);this.message="LIVE CLAUDE CLI · NO DESKTOP ROUTE";return;}
  }else await this.run("/usr/bin/open",[this.config.hermesDashboard]);
  this.message="SESSION NAVIGATION · NO ACK";
 }
 async perform(action:Action,s:Snapshot):Promise<void>{
  if(action.type!=="stop")this.resetConfirmation();if(this.busy)return;
  if(action.type==="stop"){
   if(this.confirmUntil<=Date.now()){this.confirmUntil=Date.now()+5000;this.message="PRESS STOP AGAIN WITHIN 5 SEC";return;}
   this.confirmUntil=0;this.busy=true;
   try{const live=await this.liveHermes();if(live.quality!=="ok"||live.value?.home!==`${HERMES_ROOT}/runtime/hermes-home`||!["running","working"].includes(live.value.state))throw new Error("Fresh Hermes identity unavailable");
    const stopper=`${HERMES_ROOT}/Hermes Backend stoppen.command`;const text=await textFile(stopper,4096);if(!text.includes(`${HERMES_ROOT}/scripts/hermes-fresh gateway stop`))throw new Error("Unexpected stop wrapper");
    await this.run("/bin/bash",[stopper],30000,128*1024);this.message="GATEWAY STOP REQUESTED · OLLAMA UNCHANGED";
   }finally{this.busy=false;}return;
  }
  if(action.type==="session"){await this.openSession(selectSession(s[action.provider].value?.sessions||[]));return;}
  if(action.type==="needs"){await this.openSession(counts(s).oldest);return;}
  if(action.type==="open"){await this.run("/usr/bin/open",[action.target]);this.message="DETAILS OPENED";return;}
  if(action.type==="exchange"){await this.run("/usr/bin/open",[`${EXCHANGE}/Eingang`,`${EXCHANGE}/Ausgang`]);this.message="EXCHANGE FOLDERS OPENED";}
 }
}
