import fs from "node:fs";
import path from "node:path";
import {DatabaseSync,type StatementSync} from "node:sqlite";
import type {CockpitFrame} from "./cockpit.js";

// Flight recorder for the cockpit instruments: one row per second (CPU, GPU, token rate, chip temperature, swap).
// Only aggregate numbers are stored. Rows older than the retention period are deleted automatically.
// Roughly 4 MB per day; 30 days stay well below 150 MB.

export const RANGES:Record<string,number>={"1h":3600e3,"24h":86400e3,"7d":7*86400e3,"30d":30*86400e3};
export type SeriesPoint=[t:number,cpu:number|null,gpu:number|null,tps:number|null,temp:number|null,tpsIn:number|null];

export class FlightRecorder{
 private db:DatabaseSync;private insert:StatementSync;private lastPrune=0;
 constructor(file:string,readonly retentionDays=30){
  if(file!==":memory:")fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(file);
  this.db.exec("PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;CREATE TABLE IF NOT EXISTS samples(t INTEGER PRIMARY KEY,cpu REAL,gpu REAL,tps REAL,temp REAL,swap REAL)");
  if(file!==":memory:")try{fs.chmodSync(file,0o600);}catch{}
  // Added 2026-11-18: input (prompt reading) rate; older rows stay NULL.
  if(!(this.db.prepare("PRAGMA table_info(samples)").all() as any[]).some(c=>c.name==="tps_in"))this.db.exec("ALTER TABLE samples ADD COLUMN tps_in REAL");
  this.insert=this.db.prepare("INSERT OR REPLACE INTO samples(t,cpu,gpu,tps,temp,swap,tps_in) VALUES(?,?,?,?,?,?,?)");
 }
 record(f:CockpitFrame,now=f.t):void{
  if(!f.sources.sensors&&!f.sources.llm)return;
  const tps=f.llm.phase==="writing"?f.llm.tps:f.llm.phase==="unknown"?null:0;
  const tpsIn=f.llm.phase==="reading"?f.llm.prefillTps:f.llm.phase==="unknown"?null:0;
  this.insert.run(Math.floor(now/1000)*1000,f.live.cpu,f.live.gpu,tps,f.temp.max,f.memory.swapBytes,tpsIn);
  if(now-this.lastPrune>3600e3)this.prune(now);
 }
 prune(now=Date.now()):number{this.lastPrune=now;return Number(this.db.prepare("DELETE FROM samples WHERE t<?").run(now-this.retentionDays*86400e3).changes);}
 series(range:string,buckets=240,now=Date.now()):{range:string;step:number;from:number;points:SeriesPoint[];peak:{out:number|null;in:number|null}}{
  const span=RANGES[range];if(!span)throw new Error("Unknown range");
  const step=Math.max(1000,Math.ceil(span/buckets/1000)*1000),from=now-span;
  const rows=this.db.prepare("SELECT (t/CAST(? AS INTEGER))*CAST(? AS INTEGER) AS b,avg(cpu) cpu,avg(gpu) gpu,avg(tps) tps,avg(temp) temp,avg(tps_in) tps_in FROM samples WHERE t>=? GROUP BY b ORDER BY b").all(step,step,from) as any[];
  const r=(v:unknown)=>typeof v==="number"?Math.round(v*10)/10:null;
  // Peaks use the raw one-second samples, not the bucket averages.
  const pk=this.db.prepare("SELECT max(tps) o,max(tps_in) i FROM samples WHERE t>=?").get(from) as any;
  return {range,step,from,peak:{out:r(pk?.o),in:r(pk?.i)},points:rows.map(x=>[Number(x.b),r(x.cpu),r(x.gpu),r(x.tps),r(x.temp),r(x.tps_in)] as SeriesPoint)};
 }
 count():number{return Number((this.db.prepare("SELECT count(*) n FROM samples").get() as any).n);}
 close():void{this.db.close();}
}
