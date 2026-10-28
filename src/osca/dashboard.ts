import type {Config} from "./config.js";import {Poll,codexQuotaRpc,fetchJson} from "./io.js";
import {readClaudeAccessToken} from "../lib/claude-auth.js";
import {claudeQuota,codexQuota,emptyQuota} from "./quota.js";
import {collectClaude,collectCodex} from "./sessions.js";
import {collectHermes,collectOllama,CpuSampler,collectMemory,collectGpu,collectDisks,collectSpeech,collectBackup,collectOps,collectInference} from "./local.js";
import {unavailable,type Snapshot,type Reading,type Quota,type Ops} from "./model.js";
const fail=<T>(old:Reading<T>,error?:unknown):Reading<T>=>({...old,quality:old.value===null?"unavailable":"stale",note:`Collector unavailable (${(error as NodeJS.ErrnoException)?.code || (error instanceof Error&&error.message==="TIMEOUT"?"TIMEOUT":error instanceof Error?error.name:"UNKNOWN")}); last value retained`});
const failedQuota=(old:Quota):Quota=>({...old,error:"UNAVAILABLE; last successful timestamp retained"});
export class OscaDashboard{
 private readonly cpuSampler=new CpuSampler();
 private readonly claude=new Poll(3000,()=>collectClaude(),unavailable<Awaited<ReturnType<typeof collectClaude>>["value"] extends infer T?NonNullable<T>:never>("Claude metadata"),fail);
 private readonly codex=new Poll(5000,()=>collectCodex(),unavailable<NonNullable<Awaited<ReturnType<typeof collectCodex>>["value"]>>("Codex metadata"),fail);
 private readonly hermes=new Poll(2000,collectHermes,unavailable<NonNullable<Awaited<ReturnType<typeof collectHermes>>["value"]>>("Hermes control socket"),fail);
 private readonly ollama:Poll<Awaited<ReturnType<typeof collectOllama>>>;
 private readonly cpu=new Poll(3000,async()=>this.cpuSampler.collect(),unavailable<number>("CPU"),fail);
 private readonly memory=new Poll(6000,collectMemory,unavailable<NonNullable<Awaited<ReturnType<typeof collectMemory>>["value"]>>("Memory"),fail);
 private readonly gpu=new Poll(8000,collectGpu,unavailable<number>("GPU"),fail);
 private readonly disks=new Poll(15000,collectDisks,unavailable<NonNullable<Awaited<ReturnType<typeof collectDisks>>["value"]>>("Disks"),fail);
 private readonly speech=new Poll(30000,collectSpeech,unavailable<NonNullable<Awaited<ReturnType<typeof collectSpeech>>["value"]>>("Speech"),fail);
 private readonly backup=new Poll(60000,collectBackup,unavailable<NonNullable<Awaited<ReturnType<typeof collectBackup>>["value"]>>("Backup"),fail);
 private readonly inference=new Poll(10000,collectInference,unavailable<{durationMs:number;tokensPerSecond:number|null}>("Inference metrics"),fail);
 private readonly ops=new Poll<Omit<Ops,"backup">>(60000,collectOps,{mail:unavailable("mail"),notion:unavailable("notion"),hostinger:unavailable("hostinger"),nextCheck:unavailable("control")},old=>Object.fromEntries(Object.entries(old).map(([k,v])=>[k,fail(v)])) as Omit<Ops,"backup">);
 private readonly cq:Poll<Quota>;private readonly oq:Poll<Quota>;
 constructor(readonly config:Config){
  this.ollama=new Poll(3000,()=>collectOllama(config),unavailable<NonNullable<Awaited<ReturnType<typeof collectOllama>>["value"]>>("Ollama"),fail);
  this.cq=new Poll(300000,async()=>{const {token}=await readClaudeAccessToken();return claudeQuota(await fetchJson("https://api.anthropic.com/api/oauth/usage",6000,256*1024,{Authorization:`Bearer ${token}`,"anthropic-beta":"oauth-2025-04-20","user-agent":"osca-neo/1.0.0"}));},emptyQuota("Claude OAuth usage"),failedQuota);
  this.oq=new Poll(300000,async()=>codexQuota(await codexQuotaRpc(config.codexExecutable)),emptyQuota("Codex app-server rateLimits"),failedQuota);
 }
 tick(forceQuota=false):Snapshot{for(const p of [this.claude,this.codex,this.hermes,this.ollama,this.cpu,this.memory,this.gpu,this.disks,this.speech,this.backup,this.inference,this.ops])p.start();this.cq.start(forceQuota);this.oq.start(forceQuota);return this.snapshot();}
 snapshot():Snapshot{return {claude:this.claude.value,codex:this.codex.value,hermes:this.hermes.value,claudeQuota:this.cq.value,codexQuota:this.oq.value,ollama:this.ollama.value,cpu:this.cpu.value,memory:this.memory.value,gpu:this.gpu.value,disks:this.disks.value,speech:this.speech.value,inference:this.inference.value,ops:{...this.ops.value,backup:this.backup.value},at:Date.now()};}
 async initial():Promise<Snapshot>{this.tick();await Promise.allSettled([this.claude,this.codex,this.hermes,this.ollama,this.cpu,this.memory,this.gpu,this.disks,this.speech,this.backup,this.inference,this.ops,this.cq,this.oq].map(p=>p.settle()));return this.snapshot();}
}
