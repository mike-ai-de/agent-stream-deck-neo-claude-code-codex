import { ClaudeCollector } from "./collectors/claude.js";
import { CodexCollector } from "./collectors/codex.js";
import { OpenCodeCollector } from "./collectors/opencode.js";
import { configDir, loadConfig, type DeckConfig } from "./config.js";
import { StateStore } from "./state.js";
import type { DashboardSnapshot, Provider, ProviderSnapshot, SessionSnapshot, UsageSnapshot } from "./types.js";

interface CollectorResult {
  sessions: SessionSnapshot[];
  usage: UsageSnapshot;
}

export class Dashboard {
  readonly config: DeckConfig;
  readonly state: StateStore;
  private readonly claude = new ClaudeCollector();
  private readonly codex = new CodexCollector();
  private readonly opencode = new OpenCodeCollector();
  private snapshot: DashboardSnapshot | null = null;

  constructor() {
    const dir = configDir();
    this.config = loadConfig(dir);
    const restingIndex = this.config.infoBar.indexOf(this.config.restingPage);
    this.state = new StateStore(dir, this.config.infoBar.length, restingIndex);
  }

  async collect(forceUsage = false): Promise<DashboardSnapshot> {
    const [claude, codex, opencode] = await Promise.all([
      this.claude.collect(this.state.data, forceUsage),
      this.codex.collect(this.state.data),
      this.opencode.collect(this.state.data)
    ]);
    const providers: Record<Provider, ProviderSnapshot> = {
      claude: summarizeProvider("claude", claude),
      codex: summarizeProvider("codex", codex),
      opencode: summarizeProvider("opencode", opencode)
    };
    const all = Object.values(providers).flatMap((provider) => provider.sessions);
    this.snapshot = {
      providers,
      openCount: all.filter((session) => session.isOpen).length,
      workingCount: all.filter((session) => session.state === "working").length,
      attentionCount: all.filter((session) => session.state === "attention").length,
      updatedAt: Date.now(),
      ranked: rankSessions(all)
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
