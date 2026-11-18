import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PAGES, type Module, type Snapshot } from "./model.js";
import { mobileView } from "./mobile.js";
import { quotaStale } from "./quota.js";

export const modules = new Set<string>(PAGES.flat());
type Point = { name: string; value: number; unit: string };

// Only aggregate measurements and the already-sanitized tile text are persisted.
export function measurements(s: Snapshot, module: string): Point[] {
 const out: Point[] = [];
 const add = (name: string, n: number | null | undefined, unit: string) => { if (typeof n === "number" && Number.isFinite(n)) out.push({name,value:n,unit}); };
 const good = (r: {quality:string}) => r.quality === "ok" || r.quality === "partial";
 if (module === "cpu" && good(s.cpu)) add("CPU",s.cpu.value,"%");
 if (module === "gpu" && good(s.gpu)) add("GPU",s.gpu.value,"%");
 if (module === "memory" && good(s.memory)) add("Swap",s.memory.value?.swapBytes == null ? null : s.memory.value.swapBytes / 1e9,"GB");
 if (module === "disks" && good(s.disks)) { add("CORE frei",s.disks.value?.coreFree == null ? null : s.disks.value.coreFree / 1e12,"TB"); add("DATA frei",s.disks.value?.dataFree == null ? null : s.disks.value.dataFree / 1e12,"TB"); }
 if (module === "ollamaMemory" && good(s.ollama) && s.ollama.value) { const m=s.ollama.value.models; if(m.length && m.every(x=>x.size!==null)) add("Modellspeicher",m.reduce((n,x)=>n+(x.size ?? 0),0)/1e9,"GB"); if(m.length && m.every(x=>x.vram!==null)) add("GPU-Speicher",m.reduce((n,x)=>n+(x.vram ?? 0),0)/1e9,"GB"); }
 if (module === "inference" && good(s.inference)) { add("Dauer",s.inference.value?.durationMs == null ? null : s.inference.value.durationMs / 1000,"s"); add("Geschwindigkeit",s.inference.value?.tokensPerSecond,"Token/s"); }
 if (module === "claudeQuota" || module === "codexQuota") { const q=module === "claudeQuota" ? s.claudeQuota : s.codexQuota; if (!q.error && q.measuredAt && !quotaStale(q,Date.now())) for (const w of q.windows) add(w.label,w.remaining,"%"); }
 return out;
}

export class History {
 private db: DatabaseSync; private lastPrune=0;
 // Rows older than retentionDays are deleted automatically (checked at most once per hour).
 constructor(file: string, readonly retentionDays=30) {
  if (file !== ":memory:") { fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700}); }
  this.db = new DatabaseSync(file);
  if (file !== ":memory:") fs.chmodSync(file,0o600);
  this.db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS samples (id INTEGER PRIMARY KEY, module TEXT NOT NULL, at INTEGER NOT NULL, quality TEXT NOT NULL, summary TEXT NOT NULL, points TEXT NOT NULL); CREATE INDEX IF NOT EXISTS samples_module_at ON samples(module,at);");
 }
 record(status: unknown, now=Date.now()): void {
  if (now-this.lastPrune>3600e3) this.prune(now);
  const view=mobileView(status,now), s=(status as {snapshot:Snapshot}).snapshot;
  const insert=this.db.prepare("INSERT INTO samples(module,at,quality,summary,points) VALUES(?,?,?,?,?)");
  this.db.exec("BEGIN");
  try { for (const page of view.pages) for (const t of page.tiles) {
   const points=measurements(s,t.module);
   // Tile text is already intentionally sanitized by mobileView; do not retain IDs or paths.
   const summary=JSON.stringify({title:t.title,lines:t.lines,footer:t.footer});
   insert.run(t.module,now,t.quality,summary,JSON.stringify(points));
  } this.db.exec("COMMIT"); } catch(e) {this.db.exec("ROLLBACK");throw e;}
 }
 list(module: string, since: number) { if (!modules.has(module)) throw new Error("Unknown module"); return this.db.prepare("SELECT id,at,quality,summary,points FROM (SELECT *,ROW_NUMBER() OVER (ORDER BY at DESC) AS rn FROM samples WHERE module=? AND at>=?) WHERE (rn - 1) % ? = 0 ORDER BY at DESC LIMIT 5000").all(module,since,Math.max(1,Math.ceil((Date.now()-since)/60000/4800))).map(row=>({...row,summary:JSON.parse(String(row.summary)),points:JSON.parse(String(row.points))})); }
 remove(module: string) {if(!modules.has(module)) throw new Error("Unknown module"); return this.db.prepare("DELETE FROM samples WHERE module=?").run(module);}
 removePoint(module:string,id:number) {if(!modules.has(module)||!Number.isSafeInteger(id)||id<=0) throw new Error("Invalid selection");return this.db.prepare("DELETE FROM samples WHERE module=? AND id=?").run(module,id);}
 prune(now=Date.now()):number {this.lastPrune=now;return Number(this.db.prepare("DELETE FROM samples WHERE at<?").run(now-this.retentionDays*86400e3).changes);}
 close(){this.db.close();}
}
