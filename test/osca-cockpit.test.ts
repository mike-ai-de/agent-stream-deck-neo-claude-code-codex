import { describe,it,expect } from "vitest";
import http from "node:http";
import { parseSensorLine,parseLlamaLog,parseOrcaTerminals,cockpitFrame,CockpitHub,type SensorFrame } from "../src/osca/cockpit.js";
import { createMobileServer } from "../src/osca/mobile.js";
import { FlightRecorder } from "../src/osca/recorder.js";
import { OscaDashboard } from "../src/osca/dashboard.js";
import { defaults } from "../src/osca/config.js";
import { reading } from "../src/osca/model.js";

const now=1_800_000_000_000;
const sensors=(extra:Partial<SensorFrame>={}):SensorFrame=>({t:now,cpu:12,cores:[10,20],gpu:99,temp:{max:70,avg:60,hottest:72,sensors:67},thermal:"fair",swap:0,pressure:1,...extra});
const status=()=>{const s:any=new OscaDashboard(defaults).snapshot();
 s.claude=reading({sessions:[{provider:"claude",id:"secret-session",state:"working",open:true,at:now},{provider:"claude",id:"x",state:"idle",open:true,at:now}],waitingComplete:true,openComplete:true,source:"t"},"t");
 s.codex={...reading({sessions:[{provider:"codex",id:"y",state:"idle",open:false,at:now}],waitingComplete:false,openComplete:false,source:"t"},"t"),quality:"partial"};
 s.hermes=reading({state:"running",active:0,whatsapp:"connected",pid:4711,home:"/secret/home",attentionComplete:false},"t");
 s.ollama=reading({activity:"unknown",models:[{name:"osca-qwen3.8:27b",size:1,vram:1}]},"t");
 s.claudeQuota={windows:[{label:"5h",remaining:94,reset:now+3600000},{label:"7d",remaining:8,reset:now+86400000}],measuredAt:now,error:null,source:"t"};
 s.codexQuota={windows:[{label:"7d",remaining:64,reset:now+86400000}],measuredAt:now,error:null,source:"t"};
 return {snapshot:s};};

describe("cockpit sensors",()=>{
 it("parses sampler lines and drops invalid values",()=>{
  const f=parseSensorLine('{"t":1,"cpu":4.2,"cores":[1,250],"gpu":101,"temp":{"max":-9201,"avg":40,"hottest":50,"sensors":3},"thermal":"nominal","swap":0,"pressure":1}');
  expect(f).toMatchObject({t:1,cpu:4.2,cores:[1,0],thermal:"nominal",swap:0,pressure:1});
  expect(f?.gpu).toBeUndefined();expect(f?.temp).toBeUndefined();
  expect(parseSensorLine("not json")).toBeNull();expect(parseSensorLine('{"cpu":1}')).toBeNull();
 });
});

describe("cockpit LLM log",()=>{
 const log=["slot print_timing: id  0 | task 7 | prompt processing, n_tokens =   4431, progress = 0.81, t =   5.21 s / 850.47 tokens per second",
  "slot print_timing: id  0 | task 7 | n_gen =   5853, tg =  16.79 t/s, tg_3s =  16.64 t/s"].join("\n");
 it("detects writing with the current token rate",()=>{expect(parseLlamaLog(log,now,now)).toEqual({phase:"writing",tps:16.64,lastTps:16.79,prefillTps:850.47,progress:null});});
 it("detects reading the prompt",()=>{expect(parseLlamaLog(log.split("\n")[0],now,now)).toMatchObject({phase:"reading",progress:0.81,tps:null});});
 it("falls back to idle when the log went quiet or the slot was released",()=>{
  expect(parseLlamaLog(log,now-60000,now).phase).toBe("idle");
  const done=parseLlamaLog(log+"\nslot      release: id  0 | task 7 | stop processing: n_tokens = 93, truncated = 0",now,now);
  expect(done).toMatchObject({phase:"idle",tps:null,lastTps:16.79});
 });
});

describe("cockpit Orca",()=>{
 it("counts recently active terminals and Pi sessions",()=>{
  const body={ok:true,result:{terminals:[{title:"Pi - LaserCraft",connected:true,lastOutputAt:now-2000},{title:"π - HomePage",connected:true,lastOutputAt:null},{title:"Build",connected:true,lastOutputAt:now-60000}]}};
  expect(parseOrcaTerminals(body,now)).toEqual({running:true,terminals:3,active:1,pi:2,piActive:1});
  expect(()=>parseOrcaTerminals({ok:false},now)).toThrow();
 });
});

describe("cockpit frame",()=>{
 it("maps lamps, quotas and alerts without leaking identifiers",()=>{
  const f=cockpitFrame({sensors:sensors(),llm:{phase:"writing",tps:16,lastTps:16,prefillTps:800,progress:null},orca:{running:true,terminals:2,active:1,pi:1,piActive:1},status:status(),now});
  expect(f.agents.claude).toEqual({lamp:"active",open:2,working:1});
  expect(f.agents.codex).toMatchObject({lamp:"idle",partial:true});
  expect(f.agents.hermes).toEqual({lamp:"idle",whatsapp:"connected"});
  expect(f.agents.orca.lamp).toBe("active");
  expect(f.llm).toMatchObject({lamp:"active",loaded:true,model:"osca-qwen3.8:27b"});
  expect(f.temp.level).toBe("ok"); // "fair" under sustained load is not a warning on its own
  expect(f.alerts).toEqual([{level:"warning",text:"CLAUDE 7D QUOTA 8% LEFT"}]);
  const raw=JSON.stringify(f);for(const leak of ["secret-session","/secret/home","4711"])expect(raw).not.toContain(leak);
 });
 it("warns on heat and swap and reports lost sources",()=>{
  const hot=cockpitFrame({sensors:sensors({thermal:"serious",temp:{max:97,avg:90,hottest:99,sensors:1},swap:9*1024**3,pressure:4}),llm:null,orca:null,status:null,now});
  expect(hot.temp.level).toBe("warning");expect(hot.memory).toMatchObject({level:"warning",pressure:"CRITICAL"});
  expect(hot.agents.orca.lamp).toBe("off");expect(hot.agents.claude.lamp).toBe("unknown");
  expect(hot.alerts.map(a=>a.text)).toEqual(expect.arrayContaining(["NEO STATUS UNAVAILABLE"]));
  expect(hot.alerts[0].level).toBe("warning");
  const stale=cockpitFrame({sensors:sensors({t:now-10000}),llm:null,orca:null,status:null,now});
  expect(stale.sources.sensors).toBe(false);expect(stale.live.cpu).toBeNull();
 });
});

describe("cockpit routes",()=>{
 it("serves page, snapshot and live stream",async()=>{
  const hub=new CockpitHub({sensorsBin:"/nonexistent",upstream:"http://127.0.0.1:1"});
  const options={port:0,upstream:"http://127.0.0.1:1",cockpit:hub};const server=createMobileServer(options,async()=>status());
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
   const port=(server.address() as {port:number}).port,url=`http://127.0.0.1:${port}`;options.port=port;
   const page=await fetch(url+"/cockpit");expect(page.status).toBe(200);
   expect(page.headers.get("content-security-policy")).toContain("script-src 'nonce-");
   const html=await page.text();expect(html).toContain("OPERATING SYSTEM · CORE · AGENT");expect(html).not.toMatch(/<body[\s\S]*style="/);
   const neo=await (await fetch(url+"/")).text();expect(neo).toContain('href="/cockpit"');
   const snap=await (await fetch(url+"/api/cockpit")).json();expect(snap.ok).toBe(true);
   const ctrl=new AbortController();const stream=await fetch(url+"/api/cockpit/stream",{signal:ctrl.signal});
   expect(stream.headers.get("content-type")).toContain("text/event-stream");
   const first=await stream.body!.getReader().read();expect(new TextDecoder().decode(first.value)).toMatch(/^data: \{"ok":true/);
   ctrl.abort();
   const foreign=await new Promise<number>((resolve,reject)=>http.get({host:"127.0.0.1",port,path:"/api/cockpit",headers:{host:"evil.example"}},r=>{r.resume();resolve(r.statusCode||0);}).on("error",reject));
   expect(foreign).toBe(403);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));hub.stop();}
 });
});

describe("flight recorder",()=>{
 it("stores one row per second, buckets ranges and prunes old data",()=>{
  const r=new FlightRecorder(":memory:",1);
  const f=cockpitFrame({sensors:sensors(),llm:{phase:"writing",tps:16,lastTps:16,prefillTps:null,progress:null},orca:null,status:status(),now});
  r.record(f,now);r.record(f,now+400);r.record({...f,live:{...f.live,cpu:30}},now+1000);
  expect(r.count()).toBe(2);
  const s=r.series("1h",240,now+2000);expect(s.step).toBe(15000);expect(s.points).toHaveLength(1);
  expect(s.points[0].slice(1)).toEqual([21,99,16,70]);
  r.record(f,now-3*86400e3);expect(r.count()).toBe(3);expect(r.prune(now)).toBe(1);expect(r.count()).toBe(2);
  expect(()=>r.series("1y")).toThrow();
  r.close();
 });
 it("serves history ranges and the web app manifest",async()=>{
  const recorder=new FlightRecorder(":memory:");const hub=new CockpitHub({sensorsBin:"/nonexistent",upstream:"http://127.0.0.1:1",recorder});
  recorder.record(cockpitFrame({sensors:sensors({t:Date.now()}),llm:null,orca:null,status:null}));
  const options={port:0,upstream:"http://127.0.0.1:1",cockpit:hub};const server=createMobileServer(options,async()=>status());
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
   const port=(server.address() as {port:number}).port,url=`http://127.0.0.1:${port}`;options.port=port;
   const h=await (await fetch(url+"/api/cockpit/history?range=24h")).json();expect(h.ok).toBe(true);expect(h.points).toHaveLength(1);
   expect((await fetch(url+"/api/cockpit/history?range=forever")).status).toBe(400);
   const m=await (await fetch(url+"/manifest.webmanifest")).json();expect(m).toMatchObject({short_name:"OSCA",display:"standalone",start_url:"/cockpit"});
   expect((await fetch(url+"/cockpit")).headers.get("content-security-policy")).toContain("manifest-src 'self'");
   const js=await (await fetch(url+"/widget.js")).text();expect(js).toContain(`const BASE = "http://127.0.0.1:${port}";`);expect(js).toContain("accessoryRectangular");
   expect(await (await fetch(url+"/widget")).text()).toContain("SKRIPT KOPIEREN");
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));hub.stop();recorder.close();}
 });
});
