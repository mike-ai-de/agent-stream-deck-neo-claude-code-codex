export type Provider = "claude" | "codex" | "opencode";
export type SessionState = "working" | "idle" | "attention";

export interface SessionSnapshot {
  key: string;
  id: string;
  provider: Provider;
  state: SessionState;
  isOpen: boolean;
  activityAt: number;
  completionAt: number;
  /** Working directory of the session, when the provider records one. */
  cwd?: string;
  /** Short human label for the session; usually the project directory name. */
  label?: string;
  /** OS process id, when known. Used to raise the owning window. */
  pid?: number;
  /** How the agent was launched, e.g. "claude-desktop" or a terminal. */
  entrypoint?: string;
}

export interface UsageWindow {
  label: string;
  percent?: number;
  value?: number;
  unit?: "tokens" | "usd";
  resetsAt: number | null;
}

export interface UsageSnapshot {
  provider: Provider;
  windows: UsageWindow[];
  costUsd?: number;
  updatedAt: number;
  error: string | null;
  /** When the collector will next attempt a refresh; set while it is deliberately holding off. */
  retryAt?: number | null;
}

export interface ProviderSnapshot {
  provider: Provider;
  state: SessionState;
  sessions: SessionSnapshot[];
  usage: UsageSnapshot;
  openCount: number;
  workingCount: number;
  attentionCount: number;
  idleCount: number;
  /**
   * The session the key should speak for: the one waiting on you, else the one
   * that is working, else the most recently active. Drives the project label and
   * the focus action.
   */
  primary: SessionSnapshot | null;
}

export interface DashboardSnapshot {
  providers: Record<Provider, ProviderSnapshot>;
  openCount: number;
  workingCount: number;
  attentionCount: number;
  updatedAt: number;
  /**
   * Every session across all providers, ranked by how much it wants you: waiting first, then
   * working, then idle, most recent first within each group. Feeds the `session.N` keys.
   */
  ranked: SessionSnapshot[];
}

export interface PersistedState {
  schemaVersion: number;
  installedAt: number;
  attentionSince: number;
  infoPage: number;
  acknowledged: Record<string, number>;
}
