import { ClaudeCollector } from "./collectors/claude.js";
import { CodexCollector } from "./collectors/codex.js";
import path from "node:path";
import { configDir, loadConfig, type DeckConfig } from "./config.js";
import { StateStore } from "./state.js";
import type { DashboardSnapshot, ProjectSnapshot, Provider, ProviderSnapshot, SessionSnapshot, UsageSnapshot } from "./types.js";

interface CollectorResult {
  sessions: SessionSnapshot[];
  usage: UsageSnapshot;
}

export class Dashboard {
  readonly config: DeckConfig;
  readonly state: StateStore;
  private readonly claude = new ClaudeCollector();
  private readonly codex = new CodexCollector();
  private snapshot: DashboardSnapshot | null = null;
  private sessionSlots: string[] = [];

  constructor() {
    const dir = configDir();
    this.config = loadConfig(dir);
    const restingIndex = this.config.infoBar.indexOf(this.config.restingPage);
    this.state = new StateStore(dir, this.config.infoBar.length, restingIndex);
  }

  async collect(): Promise<DashboardSnapshot> {
    const [claude, codex] = await Promise.all([
      this.claude.collect(this.state.data),
      this.codex.collect(this.state.data)
    ]);
    const providers: Record<Provider, ProviderSnapshot> = {
      claude: summarizeProvider("claude", claude),
      codex: summarizeProvider("codex", codex)
    };
    const all = Object.values(providers).flatMap((provider) => provider.sessions);
    const ranked = stabilizeSessionSlots(all, this.sessionSlots, sessionSlotCount(this.config));
    this.sessionSlots = ranked.slice(0, sessionSlotCount(this.config)).map((session) => session.key);
    this.snapshot = {
      providers,
      openCount: all.filter((session) => session.isOpen).length,
      workingCount: all.filter((session) => session.state === "working").length,
      attentionCount: all.filter((session) => session.state === "attention").length,
      updatedAt: Date.now(),
      ranked,
      projects: groupProjects(ranked)
    };
    return this.snapshot;
  }

  current(): DashboardSnapshot {
    if (!this.snapshot) throw new Error("Dashboard has not been collected yet");
    return this.snapshot;
  }

  acknowledgeProvider(provider: Provider): void {
    const sessions = this.current().providers[provider].sessions.filter((session) => session.state === "attention");
    this.state.acknowledgeMany(sessions);
  }

  /** The session behind a `session.N` key, or null when fewer sessions are open than slots. */
  sessionAt(slot: number): SessionSnapshot | null {
    return this.current().ranked[slot] ?? null;
  }

  acknowledgeSession(session: SessionSnapshot): void {
    if (session.state === "attention") this.state.acknowledgeMany([session]);
  }

  /** Clears every outstanding notice at once, across providers and projects. */
  acknowledgeAll(): number {
    const waiting = Object.values(this.current().providers)
      .flatMap((provider) => provider.sessions)
      .filter((session) => session.state === "attention");
    this.state.acknowledgeMany(waiting);
    return waiting.length;
  }
}

const STATE_ORDER: Record<SessionSnapshot["state"], number> = { attention: 0, working: 1, idle: 2 };

/**
 * Ranks sessions by urgency, then recency, and keeps the ones worth tapping: open, or still
 * asking for you. Ordering is deliberately not pinned — the most urgent session should hold slot 1
 * even if that means a reshuffle — but equal timestamps break on the session key so the order is at
 * least deterministic rather than dependent on collector iteration order.
 */
export function rankSessions(sessions: SessionSnapshot[]): SessionSnapshot[] {
  return sessions
    .filter((session) => session.isOpen || session.state !== "idle")
    .sort((a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state]
      || b.activityAt - a.activityAt
      || a.key.localeCompare(b.key));
}

/**
 * Keeps the sessions already under the user's fingers in their slots. A newcomer only displaces
 * an incumbent when it is strictly more urgent; recency changes within one state never reshuffle
 * the physical keys. Empty or vanished slots are filled by the normal ranking.
 */
export function stabilizeSessionSlots(sessions: SessionSnapshot[], previousKeys: readonly string[], slotCount: number): SessionSnapshot[] {
  const ranked = rankSessions(sessions);
  if (slotCount <= 0 || previousKeys.length === 0) return ranked;

  const byKey = new Map(ranked.map((session) => [session.key, session]));
  const slots: Array<SessionSnapshot | null> = Array.from({ length: slotCount }, (_, index) => byKey.get(previousKeys[index] || "") ?? null);
  const assigned = new Set(slots.filter((session): session is SessionSnapshot => session !== null).map((session) => session.key));

  for (const candidate of ranked) {
    if (assigned.has(candidate.key)) continue;
    const empty = slots.indexOf(null);
    if (empty >= 0) {
      slots[empty] = candidate;
      assigned.add(candidate.key);
      continue;
    }
    let replace = -1;
    for (let index = slots.length - 1; index >= 0; index -= 1) {
      const incumbent = slots[index];
      if (incumbent && STATE_ORDER[candidate.state] < STATE_ORDER[incumbent.state]) {
        if (replace < 0 || STATE_ORDER[incumbent.state] > STATE_ORDER[slots[replace]!.state]) replace = index;
      }
    }
    if (replace >= 0) {
      assigned.delete(slots[replace]!.key);
      slots[replace] = candidate;
      assigned.add(candidate.key);
    }
  }

  const pinned = slots.filter((session): session is SessionSnapshot => session !== null);
  return [...pinned, ...ranked.filter((session) => !assigned.has(session.key))];
}

function sessionSlotCount(config: DeckConfig): number {
  return config.keys.reduce((count, module) => {
    const match = module.match(/^session\.(\d+)$/);
    return match ? Math.max(count, Number(match[1])) : count;
  }, 0);
}

/**
 * Collapses sessions onto the projects they belong to. Two agents in the same repository are one
 * piece of work, not two — which is the number that answers "how many things am I juggling?".
 * Sessions without a working directory stand alone rather than being merged into one anonymous
 * bucket, since they are genuinely separate pieces of work.
 */
export function groupProjects(sessions: readonly SessionSnapshot[]): ProjectSnapshot[] {
  const byProject = new Map<string, ProjectSnapshot>();
  for (const session of sessions) {
    const id = session.cwd ? normalizedProjectId(session.cwd) : session.key;
    const existing = byProject.get(id);
    const entry = existing ?? {
      id,
      label: session.label || session.provider.toUpperCase(),
      sessions: 0,
      attention: 0,
      working: 0,
      activityAt: 0
    };
    entry.sessions += 1;
    if (session.state === "attention") entry.attention += 1;
    if (session.state === "working") entry.working += 1;
    entry.activityAt = Math.max(entry.activityAt, session.activityAt);
    if (!existing) byProject.set(id, entry);
  }
  return [...byProject.values()].sort((a, b) =>
    b.attention - a.attention || b.working - a.working || b.activityAt - a.activityAt || a.id.localeCompare(b.id));
}

function normalizedProjectId(cwd: string): string {
  if (/^[A-Za-z]:[\\/]/.test(cwd) || /^\\\\/.test(cwd)) {
    const normalized = path.win32.normalize(cwd).toLowerCase();
    return normalized.replace(/\\+$/, "") || normalized;
  }
  const normalized = path.posix.normalize(cwd);
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

export function summarizeProvider(provider: Provider, result: CollectorResult): ProviderSnapshot {
  const workingCount = result.sessions.filter((session) => session.state === "working").length;
  const attentionCount = result.sessions.filter((session) => session.state === "attention").length;
  const state = attentionCount > 0 ? "attention" : workingCount > 0 ? "working" : "idle";
  return {
    provider,
    state,
    sessions: result.sessions,
    usage: result.usage,
    openCount: result.sessions.filter((session) => session.isOpen).length,
    workingCount,
    attentionCount,
    idleCount: result.sessions.filter((session) => session.state === "idle").length,
    primary: pickPrimary(result.sessions, state)
  };
}

/**
 * The session a key stands for. Prefer one in the provider's own state — the key already says
 * NEED YOU, so it should name the session that is waiting — and among equals take the most recent.
 */
export function pickPrimary(sessions: SessionSnapshot[], state: SessionSnapshot["state"]): SessionSnapshot | null {
  const ranked = [...sessions].sort((a, b) => b.activityAt - a.activityAt);
  return ranked.find((session) => session.state === state) ?? ranked[0] ?? null;
}
