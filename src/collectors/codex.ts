import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractUuid, listJsonl, readHead, readTail, type FileStamp } from "../lib/files.js";
import { clampPercent, emptyUsage, projectLabel } from "../lib/util.js";
import { codexSessionsDirectory } from "../platform.js";
import type { PersistedState, SessionSnapshot, UsageSnapshot, UsageWindow } from "../types.js";

interface RateWindow {
  used_percent?: number;
  window_minutes?: number;
  resets_at?: number;
}

interface RateLimits {
  primary?: RateWindow | null;
  secondary?: RateWindow | null;
}

export interface CodexTail {
  life: "task_started" | "task_complete" | "turn_aborted" | null;
  lifeAt: number;
  rateLimits: RateLimits | null;
}

interface CodexCandidate extends SessionSnapshot {
  rateLimits: RateLimits | null;
}

export interface CodexMeta {
  cwd: string | null;
  entrypoint?: "codex-desktop";
}

type ExecFileResult = { stdout: string; stderr: string };
type ExecFileFn = (file: string, args: readonly string[], options: { timeout: number; maxBuffer?: number }) => Promise<ExecFileResult>;
const execFileAsync = promisify(execFile) as unknown as ExecFileFn;

// A crashed Codex session leaves task_started as its final lifecycle event forever. Bound
// "working" by file recency the way Claude/OpenCode do, so a dead session decays to idle instead
// of being counted as a live agent indefinitely.
const CODEX_WORKING_MS = 10 * 60_000;

export function inferCodexState(info: CodexTail, activityAt: number, state: PersistedState, now: number, key: string): { state: SessionSnapshot["state"]; completionAt: number } {
  if (info.life === "task_started" && now - activityAt < CODEX_WORKING_MS) {
    return { state: "working", completionAt: 0 };
  }
  if ((info.life === "task_complete" || info.life === "turn_aborted") && info.lifeAt > state.attentionSince && info.lifeAt > (state.acknowledged[key] || 0)) {
    return { state: "attention", completionAt: info.lifeAt };
  }
  return { state: "idle", completionAt: 0 };
}

export class CodexCollector {
  private files: FileStamp[] = [];
  private scannedAt = 0;
  private readonly cache = new Map<string, { size: number; mtimeMs: number; info: CodexTail }>();
  // session_meta is the first line of a rollout and never changes, so this cache never expires
  // by content; it is pruned alongside the tail cache when a file disappears.
  private readonly meta = new Map<string, CodexMeta>();
  private processes = new Map<string, number>();
  private processesScannedAt = 0;
  private processRefresh: Promise<void> | null = null;
  private usage: UsageSnapshot = emptyUsage("codex", "loading");

  constructor(
    private readonly sessionDirectory = codexSessionsDirectory(),
    private readonly discoverProcesses: () => Promise<Map<string, number>> = discoverCodexProcesses,
    private readonly readHeadFile: (file: string, bytes: number) => Promise<string> = readHead
  ) {}

  async collect(state: PersistedState): Promise<{ sessions: SessionSnapshot[]; usage: UsageSnapshot }> {
    const now = Date.now();
    if (!this.files.length || now - this.scannedAt > 30_000) {
      this.files = await listJsonl(this.sessionDirectory);
      this.scannedAt = now;
    }
    const candidates: CodexCandidate[] = [];
    const files = [...this.files].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 40);

    for (const [index, file] of files.entries()) {
      const id = extractUuid(file.path);
      if (!id) continue;
      const info = await this.readInfo(file, index);
      const key = `codex:${id}`;
      const inferred = inferCodexState(info, file.mtimeMs, state, now, key);
      // Only the sessions that can reach a key are worth a head read.
      const meta = inferred.state === "idle" ? { cwd: null } : await this.readMeta(file.path);
      candidates.push({
        key,
        id,
        provider: "codex",
        state: inferred.state,
        isOpen: inferred.state !== "idle",
        activityAt: file.mtimeMs,
        completionAt: inferred.completionAt,
        cwd: meta.cwd ?? undefined,
        label: projectLabel(meta.cwd ?? undefined) ?? undefined,
        entrypoint: meta.entrypoint,
        rateLimits: info.rateLimits
      });
    }

    if (candidates.some((candidate) => candidate.cwd && !candidate.entrypoint)) {
      this.refreshCodexProcesses(now);
      for (const candidate of candidates) {
        if (candidate.cwd && !candidate.entrypoint) candidate.pid = this.processes.get(path.resolve(candidate.cwd));
      }
    }

    const source = candidates.find((candidate) => candidate.rateLimits)?.rateLimits;
    if (source) this.usage = usageFromRateLimits(source);
    else this.usage = { ...this.usage, error: "No Codex usage event found", updatedAt: Date.now() };

    const currentPaths = new Set(this.files.map((file) => file.path));
    for (const key of this.cache.keys()) {
      if (!currentPaths.has(key)) this.cache.delete(key);
    }
    for (const key of this.meta.keys()) {
      if (!currentPaths.has(key)) this.meta.delete(key);
    }

    return { sessions: candidates, usage: this.usage };
  }

  private async readMeta(filePath: string): Promise<CodexMeta> {
    const cached = this.meta.get(filePath);
    if (cached) return cached;
    // Current Codex Desktop rollouts can put large base instructions in the first JSON record;
    // 8 KiB truncates that record before cwd/originator can be parsed.
    const head = await this.readHeadFile(filePath, 256 * 1024);
    const meta = parseCodexMeta(head);
    // Only a successful read is worth remembering. readHead returns "" for a transient EMFILE or
    // EBUSY just as it does for a genuinely absent cwd, and this cache never expires by content —
    // so caching the failure would cost that session its project name for its whole lifetime.
    if (head && (meta.cwd !== null || meta.entrypoint)) this.meta.set(filePath, meta);
    return meta;
  }

  /** Process lookup is best-effort and must never turn the local session poll into a slow frame. */
  private refreshCodexProcesses(now: number): void {
    if (this.processRefresh || now - this.processesScannedAt < 8_000) return;
    this.processesScannedAt = now;
    this.processRefresh = this.discoverProcesses()
      .then((processes) => { this.processes = processes; })
      .catch(() => {
        // Process discovery is an enhancement; session collection must survive ps/lsof failures.
      })
      .finally(() => { this.processRefresh = null; });
  }

  private async readInfo(file: FileStamp, rank: number): Promise<CodexTail> {
    const cached = this.cache.get(file.path);
    if (cached && cached.size === file.size && cached.mtimeMs === file.mtimeMs) return cached.info;

    let info = parseCodexTail(await readTail(file.path, 1024 * 1024), file.mtimeMs);
    if (cached && file.size >= cached.size) {
      info = {
        life: info.life || cached.info.life,
        lifeAt: info.life ? info.lifeAt : cached.info.lifeAt,
        rateLimits: info.rateLimits || cached.info.rateLimits
      };
    } else if (!info.life && rank < 5) {
      const lifecycle = await findLatestCodexLifecycle(file.path, file.size, file.mtimeMs);
      if (lifecycle.life) info = { ...info, life: lifecycle.life, lifeAt: lifecycle.lifeAt };
    }
    this.cache.set(file.path, { size: file.size, mtimeMs: file.mtimeMs, info });
    return info;
  }
}

export async function findLatestCodexLifecycle(file: string, size: number, fallbackMs: number): Promise<Pick<CodexTail, "life" | "lifeAt">> {
  const chunkSize = 4 * 1024 * 1024;
  const overlap = 64 * 1024;
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(file, "r");
  } catch {
    return { life: null, lifeAt: 0 };
  }
  try {
    let end = size;
    while (end > 0) {
      const start = Math.max(0, end - chunkSize);
      const buffer = Buffer.alloc(end - start);
      await handle.read(buffer, 0, buffer.length, start);
      const parsed = parseCodexTail(buffer.toString("utf8"), fallbackMs);
      if (parsed.life) return { life: parsed.life, lifeAt: parsed.lifeAt };
      if (start === 0) break;
      end = start + overlap;
    }
  } catch {
    // A session file can disappear or become unreadable mid-scan.
  } finally {
    await handle.close().catch(() => {});
  }
  return { life: null, lifeAt: 0 };
}

export function parseCodexTail(text: string, fallbackMs: number): CodexTail {
  let life: CodexTail["life"] = null;
  let lifeAt = 0;
  let rateLimits: RateLimits | null = null;
  for (const line of text.split("\n")) {
    let event: { type?: string; timestamp?: string; payload?: { type?: string; rate_limits?: RateLimits } };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (event.type !== "event_msg") continue;
    const type = event.payload?.type;
    if (type === "task_started" || type === "task_complete" || type === "turn_aborted") {
      life = type;
      lifeAt = Date.parse(event.timestamp || "") || fallbackMs;
    }
    if (type === "token_count" && event.payload?.rate_limits) rateLimits = event.payload.rate_limits;
  }
  return { life, lifeAt, rateLimits };
}

/** Pulls `cwd` out of the session_meta record that opens every rollout file. */
export function parseCodexCwd(head: string): string | null {
  return parseCodexMeta(head).cwd;
}

/** Pulls stable focus metadata out of the session_meta record that opens every rollout file. */
export function parseCodexMeta(head: string): CodexMeta {
  for (const line of head.split("\n")) {
    let event: { type?: string; payload?: { cwd?: string; originator?: string } };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      // The last line of a bounded head read is usually truncated.
      continue;
    }
    if (event.type === "session_meta") {
      return {
        cwd: typeof event.payload?.cwd === "string" ? event.payload.cwd || null : null,
        entrypoint: /codex desktop/i.test(String(event.payload?.originator || "")) ? "codex-desktop" : undefined
      };
    }
  }
  return { cwd: null };
}

/** Finds CLI Codex processes and indexes them by their kernel-reported working directory. */
export async function discoverCodexProcesses(run: ExecFileFn = execFileAsync, platform = process.platform): Promise<Map<string, number>> {
  if (platform !== "darwin") return new Map();
  const { stdout } = await run("/bin/ps", ["-ww", "-axo", "pid=,comm="], { timeout: 2_000, maxBuffer: 2 * 1024 * 1024 });
  const pids = parseCodexProcessList(stdout);
  if (!pids.length) return new Map();
  const result = await run("/usr/sbin/lsof", ["-a", "-d", "cwd", "-Fn", "-p", pids.join(",")], { timeout: 2_000, maxBuffer: 1024 * 1024 });
  return parseCodexProcessCwds(result.stdout);
}

export function parseCodexProcessList(text: string): number[] {
  const result: number[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(.+?)\s*$/);
    if (!match) continue;
    const command = path.basename(match[2]);
    if (command === "codex" || /^codex-(?:aarch64|x86_64)-/.test(command)) result.push(Number(match[1]));
  }
  return result;
}

export function parseCodexProcessCwds(text: string): Map<string, number> {
  const result = new Map<string, number>();
  let pid: number | null = null;
  for (const line of text.split("\n")) {
    if (/^p\d+$/.test(line)) pid = Number(line.slice(1));
    else if (pid && line.startsWith("n") && line.length > 1) {
      const cwd = path.resolve(line.slice(1));
      if (!result.has(cwd)) result.set(cwd, pid);
    }
  }
  return result;
}

export function usageFromRateLimits(rateLimits: RateLimits): UsageSnapshot {
  const windows: UsageWindow[] = [];
  if (rateLimits.primary) windows.push(toWindow(rateLimits.primary));
  if (rateLimits.secondary) windows.push(toWindow(rateLimits.secondary));
  return { provider: "codex", windows, updatedAt: Date.now(), error: null };
}

function toWindow(window: RateWindow): UsageWindow {
  return {
    label: windowLabel(window.window_minutes),
    percent: clampPercent(window.used_percent),
    resetsAt: window.resets_at ? window.resets_at * 1000 : null
  };
}

export function windowLabel(minutes?: number): string {
  if (!Number.isFinite(minutes)) return "limit";
  const value = Number(minutes);
  if (value % 10_080 === 0) return `${value / 10_080}w`;
  if (value % 1_440 === 0) return `${value / 1_440}d`;
  if (value % 60 === 0) return `${value / 60}h`;
  return `${value}m`;
}
