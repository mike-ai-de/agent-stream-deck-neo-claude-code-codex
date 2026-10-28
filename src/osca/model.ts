export type Provider = "claude" | "codex" | "hermes";
export type Quality = "ok" | "partial" | "stale" | "unavailable" | "not-configured";
export interface Reading<T> { value: T | null; quality: Quality; at: number; source: string; note?: string }
export const unavailable = <T>(source: string, note = "UNAVAILABLE"): Reading<T> => ({ value: null, quality: "unavailable", at: 0, source, note });
export const reading = <T>(value: T, source: string, at = Date.now()): Reading<T> => ({ value, quality: "ok", at, source });
export interface QuotaWindow { label: string; remaining: number | null; reset: number | null }
export interface Quota { windows: QuotaWindow[]; measuredAt: number; error: string | null; source: string }
export interface Session { provider: Provider; id: string; state: "idle" | "working" | "attention" | "unknown"; open: boolean; at: number; waitingSince?: number; entrypoint?: string; desktopId?: string }
export interface Sessions { sessions: Session[]; waitingComplete: boolean; openComplete: boolean; source: string }
export interface Hermes { state: "running" | "working" | "stopped" | "unknown"; active: number | null; whatsapp: string | null; pid: number | null; home: string; attentionComplete: boolean }
export interface Model { name: string; size: number | null; vram: number | null }
export interface Ollama { models: Model[]; activity: "unknown"; version?: string }
export interface Memory { pressure: "NORMAL" | "WARN" | "CRITICAL" | null; swapBytes: number | null; pageSize: number | null; totalBytes: number; freeBytes: number | null }
export interface Disks { coreFree: number | null; dataFree: number | null; coreTotal: number | null; dataTotal: number | null }
export interface Speech { stt: string; tts: string; assets: boolean; configured: boolean; note: string }
export interface Backup { running: boolean | null; lastSuccess: string | null; restore: "unverified"; note: string }
export interface Ops { mail: Reading<string>; notion: Reading<string>; hostinger: Reading<string>; nextCheck: Reading<string>; backup: Reading<Backup> }
export interface Snapshot {
  claude: Reading<Sessions>; codex: Reading<Sessions>; hermes: Reading<Hermes>;
  claudeQuota: Quota; codexQuota: Quota; ollama: Reading<Ollama>;
  cpu: Reading<number>; memory: Reading<Memory>; gpu: Reading<number>; disks: Reading<Disks>; speech: Reading<Speech>;
  inference: Reading<{ durationMs: number; tokensPerSecond: number | null }>;
  ops: Ops; at: number;
}
export const HERMES_ROOT = "/Volumes/OSCA-DATA/Projects/OSCA-Hermes-Neustart-2026-10-26";
export const HERMES_HOME = `${HERMES_ROOT}/runtime/hermes-home`;
export const CONTROL = "/Volumes/OSCA-DATA/00-Control";
export const EXCHANGE = "/Volumes/OSCA-DATA/Transfer/OSCA-Austausch";
export const PAGE_NAMES = ["AGENTS", "LOCAL", "OPS"] as const;
export type Module = "claude" | "codex" | "hermes" | "agents" | "claudeQuota" | "codexQuota" | "ollama" | "needs" | "cpu" | "memory" | "gpu" | "disks" | "ollamaMemory" | "inference" | "speech" | "services" | "mail" | "notion" | "exchange" | "backup" | "hostinger" | "stop" | "nextCheck" | "control";
export const PAGES: readonly (readonly Module[])[] = [
  ["claude", "codex", "hermes", "agents", "claudeQuota", "codexQuota", "ollama", "needs"],
  ["cpu", "memory", "gpu", "disks", "ollamaMemory", "inference", "speech", "services"],
  ["mail", "notion", "exchange", "backup", "hostinger", "stop", "nextCheck", "control"]
];
export function normalizePage(page: number): number { return ((page % 3) + 3) % 3; }
export function allSessions(s: Snapshot): Session[] { return [...(s.claude.value?.sessions || []), ...(s.codex.value?.sessions || [])]; }
export function counts(s: Snapshot) {
  const sessions = allSessions(s); const waiting = sessions.filter(x => x.open && x.state === "attention").sort((a,b)=>(a.waitingSince || a.at)-(b.waitingSince || b.at));
  const complete = [s.claude, s.codex, s.hermes].every(x=>x.quality === "ok") && !!s.claude.value?.waitingComplete && !!s.codex.value?.waitingComplete && !!s.hermes.value?.attentionComplete;
  return { open: sessions.filter(x=>x.open).length + (s.hermes.value?.state === "running" || s.hermes.value?.state === "working" ? 1 : 0), work: sessions.filter(x=>x.open && x.state === "working").length + (s.hermes.value?.active || 0), needs: waiting.length, oldest: waiting[0] || null, complete };
}
