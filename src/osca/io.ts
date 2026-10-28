import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import type { ChildProcess } from "node:child_process";
const children=new Set<ChildProcess>();
export function shutdownProbes():void{for(const child of children){try{child.kill("SIGTERM");}catch{}}}
export async function command(file: string, args: readonly string[], timeout = 3500, maxBuffer = 512 * 1024): Promise<string> {
  return new Promise((resolve,reject)=>{const child=execFile(file,[...args],{timeout,maxBuffer,encoding:"utf8",env:{...process.env,LC_ALL:"C"}},(err,out)=>err?reject(new Error(err.killed?"TIMEOUT":"COMMAND UNAVAILABLE")):resolve(out));children.add(child);child.once("close",()=>children.delete(child));});
}
export async function jsonFile(file: string, max = 512*1024): Promise<any> {
  const stat=await fs.stat(file);if(stat.size>max)throw new Error("FILE TOO LARGE");return JSON.parse(await fs.readFile(file,"utf8"));
}
export async function textFile(file: string, max = 512*1024): Promise<string> {
  const stat=await fs.stat(file);if(stat.size>max)throw new Error("FILE TOO LARGE");return fs.readFile(file,"utf8");
}
export async function tail(file: string, max=1024*1024):Promise<string> {
  const h=await fs.open(file,"r");try {const s=await h.stat();const n=Math.min(s.size,max);const b=Buffer.alloc(n);await h.read(b,0,n,s.size-n);return b.toString("utf8");}finally{await h.close();}
}
export async function fetchJson(url:string,timeout=2500,max=512*1024,headers?:Record<string,string>):Promise<any>{
  const r=await fetch(url,{signal:AbortSignal.timeout(timeout),headers});if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const reader=r.body?.getReader();if(!reader)throw new Error("EMPTY RESPONSE");let total=0;const chunks:Uint8Array[]=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max)throw new Error("RESPONSE TOO LARGE");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function unixJson(socketPath:string,payload:unknown,timeout=1800,max=512*1024):Promise<any>{
  return new Promise((resolve,reject)=>{const s=net.createConnection(socketPath);let raw="";let done=false;const timer=setTimeout(()=>finish(new Error("TIMEOUT")),timeout);
    function finish(err?:Error,data?:any){if(done)return;done=true;clearTimeout(timer);s.destroy();err?reject(err):resolve(data);}
    s.on("connect",()=>s.write(JSON.stringify(payload)+"\n"));s.on("error",()=>finish(new Error("SOCKET UNAVAILABLE")));s.on("end",()=>{if(!done)finish(new Error("INCOMPLETE RESPONSE"));});
    s.on("data",b=>{raw+=b.toString("utf8");if(Buffer.byteLength(raw)>max)return finish(new Error("RESPONSE TOO LARGE"));const i=raw.indexOf("\n");if(i>=0){try{finish(undefined,JSON.parse(raw.slice(0,i)));}catch{finish(new Error("INVALID JSON"));}}});
  });
}
export async function codexQuotaRpc(executable:string):Promise<any>{
  return new Promise((resolve,reject)=>{const child=spawn(executable,["app-server","--listen","stdio://"],{stdio:["pipe","pipe","ignore"]});children.add(child);child.once("close",()=>children.delete(child));let raw="",bytes=0,done=false;
    const timer=setTimeout(()=>finish(new Error("CODEX QUOTA TIMEOUT")),12000);
    function finish(err?:Error,data?:any){if(done)return;done=true;clearTimeout(timer);child.stdin.end();child.kill("SIGTERM");setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");},1000).unref();err?reject(err):resolve(data);}
    const send=(x:unknown)=>child.stdin.write(JSON.stringify(x)+"\n");child.on("error",()=>finish(new Error("CODEX APP SERVER UNAVAILABLE")));child.stdin.on("error",()=>{});child.on("exit",()=>{if(!done)finish(new Error("CODEX APP SERVER EXITED"));});
    child.stdout.on("data",b=>{bytes+=b.length;if(bytes>512*1024)return finish(new Error("CODEX RESPONSE TOO LARGE"));raw+=b.toString();let i;while((i=raw.indexOf("\n"))>=0){const line=raw.slice(0,i);raw=raw.slice(i+1);let d:any;try{d=JSON.parse(line);}catch{continue;}
      if(d.id===1){if(d.error)return finish(new Error("CODEX INITIALIZE FAILED"));send({method:"initialized"});send({id:2,method:"account/rateLimits/read"});}
      if(d.id===2){if(d.error)return finish(new Error("CODEX QUOTA UNAVAILABLE"));finish(undefined,d.result);}
    }});
    send({id:1,method:"initialize",params:{clientInfo:{name:"osca_neo_status",title:"OSCA Neo Status",version:"1.0.0"},capabilities:{}}});
  });
}
export class Poll<T>{
  private at=0;private pending:Promise<void>|null=null; value:T;
  constructor(private interval:number,private fn:()=>Promise<T>,initial:T,private failure:(previous:T,error?:unknown)=>T){this.value=initial;}
  start(force=false):void{if(this.pending||(!force&&Date.now()-this.at<this.interval))return;this.at=Date.now();let expired=false;const timer=setTimeout(()=>{expired=true;this.value=this.failure(this.value,new Error("TIMEOUT"));},15000);timer.unref();this.pending=Promise.resolve().then(this.fn).then(v=>{if(!expired)this.value=v;},error=>{if(!expired)this.value=this.failure(this.value,error);}).finally(()=>{clearTimeout(timer);this.pending=null;});}
  async settle():Promise<void>{await this.pending;}
}
