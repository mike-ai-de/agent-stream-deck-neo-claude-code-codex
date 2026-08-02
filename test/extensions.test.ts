import { describe, expect, it } from "vitest";
import { usageErrorMessage } from "../src/collectors/claude.js";
import { parseCodexCwd } from "../src/collectors/codex.js";
import { DEFAULT_CONFIG, loadConfig, saveConfig, type DeckConfig } from "../src/config.js";
import { pickPrimary } from "../src/dashboard.js";
import { AttentionNotifier } from "../src/lib/notify.js";
import { formatCountdown, projectLabel } from "../src/lib/util.js";
import { renderProviderKey, renderUsageKey, usageLevelFor } from "../src/render.js";
import type { DashboardSnapshot, Provider, ProviderSnapshot, SessionSnapshot, UsageSnapshot } from "../src/types.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const NOW = 1_800_000_000_000;

const session = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  key: "claude:a",
  id: "a",
  provider: "claude",
  state: "idle",
  isOpen: true,
  activityAt: NOW,
  completionAt: 0,
  ...overrides
});

const providerView = (overrides: Partial<ProviderSnapshot> = {}): ProviderSnapshot => ({
  provider: "claude",
  state: "idle",
  sessions: [],
  usage: { provider: "claude", windows: [], updatedAt: 1, error: null },
  openCount: 0,
  workingCount: 0,
  attentionCount: 0,
  idleCount: 0,
  primary: null,
  ...overrides
});

const snapshotWith = (claude: ProviderSnapshot): DashboardSnapshot => ({
  providers: {
    claude,
    codex: providerView({ provider: "codex" }),
    opencode: providerView({ provider: "opencode" })
  },
  openCount: claude.openCount,
  workingCount: claude.workingCount,
  attentionCount: claude.attentionCount,
  updatedAt: NOW
});

describe("countdown formatting", () => {
  it("shows at most two units, largest first", () => {
    expect(formatCountdown(NOW + 3 * 86_400_000 + 4 * 3_600_000, NOW)).toBe("3d 4h");
    expect(formatCountdown(NOW + 2 * 86_400_000, NOW)).toBe("2d");
    expect(formatCountdown(NOW + 4 * 3_600_000 + 12 * 60_000, NOW)).toBe("4h 12m");
    expect(formatCountdown(NOW + 5 * 3_600_000, NOW)).toBe("5h");
    expect(formatCountdown(NOW + 8 * 60_000, NOW)).toBe("8m");
  });

  it("rounds a sub-minute remainder up rather than showing 0m", () => {
    expect(formatCountdown(NOW + 20_000, NOW)).toBe("1m");
  });

  it("returns null for a deadline that has passed or is unknown", () => {
    expect(formatCountdown(NOW - 1, NOW)).toBeNull();
    expect(formatCountdown(null, NOW)).toBeNull();
    expect(formatCountdown(undefined, NOW)).toBeNull();
    expect(formatCountdown(Number.NaN, NOW)).toBeNull();
  });
});

describe("project labels", () => {
  it("uses the working directory name", () => {
    expect(projectLabel("/Users/me/Documents/MediLog")).toBe("MediLog");
    expect(projectLabel("/Users/me/code/api/")).toBe("api");
  });

  it("ignores directories that identify no project and falls back to the session name", () => {
    expect(projectLabel("/", "claude-49")).toBe("claude-49");
    expect(projectLabel("/Users/me", "claude-49")).toBe("claude-49");
    expect(projectLabel(undefined, "claude-49")).toBe("claude-49");
    expect(projectLabel("/", undefined)).toBeNull();
  });

  it("truncates to fit a key", () => {
    expect(projectLabel("/x/a-very-long-project-name")).toHaveLength(14);
    expect(projectLabel("/x/a-very-long-project-name")).toMatch(/…$/);
  });
});

describe("usage thresholds", () => {
  it("escalates at the configured percentages", () => {
    expect(usageLevelFor(50, DEFAULT_CONFIG)).toBe("normal");
    expect(usageLevelFor(79.9, DEFAULT_CONFIG)).toBe("normal");
    expect(usageLevelFor(80, DEFAULT_CONFIG)).toBe("warn");
    expect(usageLevelFor(94, DEFAULT_CONFIG)).toBe("warn");
    expect(usageLevelFor(95, DEFAULT_CONFIG)).toBe("critical");
    expect(usageLevelFor(100, DEFAULT_CONFIG)).toBe("critical");
  });

  it("treats a token count with no percentage as normal", () => {
    expect(usageLevelFor(undefined, DEFAULT_CONFIG)).toBe("normal");
  });

  it("draws a warned key differently from a calm one", async () => {
    const quota = (percent: number): UsageSnapshot => ({
      provider: "claude",
      windows: [{ label: "5h", percent, resetsAt: null }],
      updatedAt: 1,
      error: null
    });
    const calm = await renderUsageKey(quota(50), DEFAULT_CONFIG);
    const warned = await renderUsageKey(quota(85), DEFAULT_CONFIG);
    const critical = await renderUsageKey(quota(99), DEFAULT_CONFIG);
    expect(calm.equals(warned)).toBe(false);
    expect(warned.equals(critical)).toBe(false);
  });

  it("does not colour a stale reading as a live warning", async () => {
    const stale: UsageSnapshot = {
      provider: "claude",
      windows: [{ label: "5h", percent: 99, resetsAt: null }],
      updatedAt: 1,
      error: "backend unavailable"
    };
    const live: UsageSnapshot = { ...stale, error: null };
    expect((await renderUsageKey(stale, DEFAULT_CONFIG)).equals(await renderUsageKey(live, DEFAULT_CONFIG))).toBe(false);
  });

  it("renders a countdown without changing the buffer size", async () => {
    const withReset: UsageSnapshot = {
      provider: "codex",
      windows: [{ label: "1w", percent: 100, resetsAt: Date.now() + 3 * 86_400_000 }],
      updatedAt: 1,
      error: null
    };
    const buffer = await renderUsageKey(withReset, DEFAULT_CONFIG);
    expect(buffer.length).toBe(96 * 96 * 4);
  });
});

describe("primary session selection", () => {
  it("prefers a session in the provider's own state", () => {
    const sessions = [
      session({ key: "a", state: "idle", activityAt: NOW }),
      session({ key: "b", state: "attention", activityAt: NOW - 5_000 })
    ];
    expect(pickPrimary(sessions, "attention")?.key).toBe("b");
  });

  it("takes the most recent among equals", () => {
    const sessions = [
      session({ key: "old", state: "attention", activityAt: NOW - 10_000 }),
      session({ key: "new", state: "attention", activityAt: NOW })
    ];
    expect(pickPrimary(sessions, "attention")?.key).toBe("new");
  });

  it("falls back to the most recent session, then to null", () => {
    expect(pickPrimary([session({ key: "only", state: "idle" })], "working")?.key).toBe("only");
    expect(pickPrimary([], "idle")).toBeNull();
  });
});

describe("status key detail line", () => {
  it("shows the project instead of a bare count when one is known", async () => {
    const withLabel = providerView({
      state: "attention",
      attentionCount: 1,
      primary: session({ state: "attention", label: "MediLog" })
    });
    const withoutLabel = providerView({ state: "attention", attentionCount: 1, primary: session({ state: "attention" }) });
    expect((await renderProviderKey(withLabel, DEFAULT_CONFIG)).equals(await renderProviderKey(withoutLabel, DEFAULT_CONFIG))).toBe(false);
  });

  it("honours showProjectLabels being switched off", async () => {
    const view = providerView({ state: "attention", attentionCount: 1, primary: session({ state: "attention", label: "MediLog" }) });
    const off: DeckConfig = { ...DEFAULT_CONFIG, showProjectLabels: false };
    const plain = providerView({ state: "attention", attentionCount: 1, primary: session({ state: "attention" }) });
    expect((await renderProviderKey(view, off)).equals(await renderProviderKey(plain, off))).toBe(true);
  });
});

describe("attention notifier", () => {
  const attention = () => providerView({
    state: "attention",
    attentionCount: 1,
    primary: session({ state: "attention", label: "MediLog" })
  });

  it("stays silent on the first pass so a restart announces nothing", async () => {
    const sent: string[] = [];
    const notifier = new AttentionNotifier(DEFAULT_CONFIG, async (title) => void sent.push(title));
    expect(await notifier.handle(snapshotWith(attention()), NOW)).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("fires once on the transition into attention, not on every poll", async () => {
    const sent: string[] = [];
    const notifier = new AttentionNotifier(DEFAULT_CONFIG, async (title) => void sent.push(title));
    await notifier.handle(snapshotWith(providerView()), NOW);
    expect(await notifier.handle(snapshotWith(attention()), NOW + 1_000)).toEqual(["claude"]);
    expect(await notifier.handle(snapshotWith(attention()), NOW + 2_000)).toEqual([]);
    expect(sent).toEqual(["Claude Code · MediLog"]);
  });

  it("re-arms after the provider goes quiet, but respects the re-notify interval", async () => {
    const sent: string[] = [];
    const notifier = new AttentionNotifier(DEFAULT_CONFIG, async (title) => void sent.push(title));
    await notifier.handle(snapshotWith(providerView()), NOW);
    await notifier.handle(snapshotWith(attention()), NOW + 1_000);
    await notifier.handle(snapshotWith(providerView()), NOW + 2_000);

    // Same minute: the state flipped back but the cooldown suppresses a second alert.
    expect(await notifier.handle(snapshotWith(attention()), NOW + 3_000)).toEqual([]);

    await notifier.handle(snapshotWith(providerView()), NOW + 90_000);
    expect(await notifier.handle(snapshotWith(attention()), NOW + 91_000)).toEqual(["claude"]);
    expect(sent).toHaveLength(2);
  });

  it("says nothing when notifications are disabled", async () => {
    const sent: string[] = [];
    const notifier = new AttentionNotifier({ ...DEFAULT_CONFIG, notifyOnAttention: false }, async (title) => void sent.push(title));
    await notifier.handle(snapshotWith(providerView()), NOW);
    expect(await notifier.handle(snapshotWith(attention()), NOW + 1_000)).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe("usage backoff messaging", () => {
  it("names the likely cause and when it will try again", () => {
    expect(usageErrorMessage(403, NOW + 10 * 60_000, NOW)).toContain("token rejected");
    expect(usageErrorMessage(403, NOW + 10 * 60_000, NOW)).toContain("retrying in 10m");
    expect(usageErrorMessage(429, NOW + 20 * 60_000, NOW)).toContain("rate limited");
    expect(usageErrorMessage(503, NOW + 5 * 60_000, NOW)).toContain("Anthropic API error");
    expect(usageErrorMessage(418, NOW + 5 * 60_000, NOW)).toContain("unexpected response");
  });

  it("never advertises a wait shorter than a minute", () => {
    expect(usageErrorMessage(429, NOW + 1_000, NOW)).toContain("retrying in 1m");
  });
});

describe("codex session metadata", () => {
  it("reads cwd out of the session_meta header", () => {
    const head = [
      JSON.stringify({ type: "session_meta", payload: { session_id: "x", cwd: "/Users/me/Documents/MediLog" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "task_started" } })
    ].join("\n");
    expect(parseCodexCwd(head)).toBe("/Users/me/Documents/MediLog");
  });

  it("tolerates a truncated final line and a missing cwd", () => {
    expect(parseCodexCwd(`${JSON.stringify({ type: "session_meta", payload: {} })}\n{"type":"event_ms`)).toBeNull();
    expect(parseCodexCwd("")).toBeNull();
  });
});

describe("extended config", () => {
  it("round-trips the new options and repairs inverted thresholds", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-deck-config-"));
    try {
      saveConfig({ ...DEFAULT_CONFIG, usageWarnPercent: 90, usageCriticalPercent: 60, attentionSound: "Glass" }, dir);
      const loaded = loadConfig(dir);
      expect(loaded.usageWarnPercent).toBe(90);
      // Critical can never sit below warn, however the file is written.
      expect(loaded.usageCriticalPercent).toBe(90);
      expect(loaded.attentionSound).toBe("Glass");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a sound name that is not a plain identifier and allows silence", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-deck-config-"));
    try {
      fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ ...DEFAULT_CONFIG, attentionSound: "../../evil" }));
      expect(loadConfig(dir).attentionSound).toBe(DEFAULT_CONFIG.attentionSound);

      fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ ...DEFAULT_CONFIG, attentionSound: null }));
      expect(loadConfig(dir).attentionSound).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps defaults for a config file written by an older version", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-deck-config-"));
    try {
      fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({
        brightness: 70,
        keys: DEFAULT_CONFIG.keys,
        infoBar: DEFAULT_CONFIG.infoBar,
        restingPage: "all"
      }));
      const loaded = loadConfig(dir);
      expect(loaded.usageWarnPercent).toBe(DEFAULT_CONFIG.usageWarnPercent);
      expect(loaded.focusOnTap).toBe(DEFAULT_CONFIG.focusOnTap);
      expect(loaded.notifyOnAttention).toBe(DEFAULT_CONFIG.notifyOnAttention);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
