import { describe, expect, it } from "vitest";
import { parseCodexCwd, parseCodexMeta, parseCodexProcessCwds, parseCodexProcessList } from "../src/collectors/codex.js";
import { DEFAULT_CONFIG, loadConfig, saveConfig, sessionSlot, type DeckConfig } from "../src/config.js";
import { groupProjects, pickPrimary, rankSessions, stabilizeSessionSlots } from "../src/dashboard.js";
import { actionForControl } from "../src/input.js";
import { isFocusable } from "../src/lib/focus.js";
import { AttentionNotifier } from "../src/lib/notify.js";
import { formatCountdown, projectLabel } from "../src/lib/util.js";
import { leadingWindow, renderProviderKey, renderSessionKey, renderUsageKey, soonestReset, usageLevelFor } from "../src/render.js";
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
    codex: providerView({ provider: "codex" })
  },
  openCount: claude.openCount,
  workingCount: claude.workingCount,
  attentionCount: claude.attentionCount,
  updatedAt: NOW,
  ranked: rankSessions(claude.sessions),
  projects: groupProjects(claude.sessions)
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
    expect(projectLabel("/Users/me/Documents/SaleSync")).toBe("SaleSync");
    expect(projectLabel("/Users/me/code/api/")).toBe("api");
  });

  it("ignores directories that identify no project and falls back to the session name", () => {
    expect(projectLabel("/", "claude-49")).toBe("claude-49");
    expect(projectLabel("/Users/me", "claude-49")).toBe("claude-49");
    expect(projectLabel(undefined, "claude-49")).toBe("claude-49");
    expect(projectLabel("/", undefined)).toBeNull();
  });

  it("treats a Windows or WSL home directory as no project either", () => {
    // The account name is not a project, and putting it on a key also puts it in the notification.
    expect(projectLabel("C:\\Users\\mike", "codex-3")).toBe("codex-3");
    expect(projectLabel("\\\\wsl$\\Ubuntu\\home\\mike", "codex-3")).toBe("codex-3");
    expect(projectLabel("C:\\Users\\mike\\code\\api")).toBe("api");
    expect(projectLabel("\\\\wsl$\\Ubuntu\\home\\mike\\api")).toBe("api");
  });

  it("truncates to fit a key", () => {
    expect(projectLabel("/x/a-very-long-project-name")).toHaveLength(14);
    expect(projectLabel("/x/a-very-long-project-name")).toMatch(/…$/);
  });

  it("redacts token-shaped and control text before it can reach a display or log", () => {
    expect(projectLabel(undefined, "sk-ant-oat01-SECRETVALUE123\nforged log line")).toBe("sk-ant-… forg…");
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
      primary: session({ state: "attention", label: "SaleSync" })
    });
    const withoutLabel = providerView({ state: "attention", attentionCount: 1, primary: session({ state: "attention" }) });
    expect((await renderProviderKey(withLabel, DEFAULT_CONFIG)).equals(await renderProviderKey(withoutLabel, DEFAULT_CONFIG))).toBe(false);
  });

  it("honours showProjectLabels being switched off", async () => {
    const view = providerView({ state: "attention", attentionCount: 1, primary: session({ state: "attention", label: "SaleSync" }) });
    const off: DeckConfig = { ...DEFAULT_CONFIG, showProjectLabels: false };
    const plain = providerView({ state: "attention", attentionCount: 1, primary: session({ state: "attention" }) });
    expect((await renderProviderKey(view, off)).equals(await renderProviderKey(plain, off))).toBe(true);
  });
});

describe("attention notifier", () => {
  const waiting = (key = "claude:a", label = "SaleSync") => session({ key, state: "attention", label });
  const attention = (...keys: string[]) => {
    const sessions = (keys.length ? keys : ["claude:a"]).map((key) => waiting(key));
    return providerView({
      state: "attention",
      attentionCount: sessions.length,
      sessions,
      primary: sessions[0]
    });
  };

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
    expect(sent).toEqual(["Claude Code · SaleSync"]);
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

  it("announces a second session on a provider that is already waiting", async () => {
    const sent: string[] = [];
    const notifier = new AttentionNotifier(DEFAULT_CONFIG, async (title) => void sent.push(title));
    await notifier.handle(snapshotWith(providerView()), NOW);
    await notifier.handle(snapshotWith(attention("claude:a")), NOW + 1_000);
    // The provider never leaves "attention" here; only a per-session edge can catch this.
    expect(await notifier.handle(snapshotWith(attention("claude:a", "claude:b")), NOW + 70_000)).toEqual(["claude"]);
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

describe("session ranking and keys", () => {
  it("puts waiting sessions first, then working, then idle", () => {
    const ranked = rankSessions([
      session({ key: "c:idle", state: "idle", activityAt: NOW }),
      session({ key: "c:work", state: "working", activityAt: NOW - 60_000 }),
      session({ key: "c:wait", state: "attention", activityAt: NOW - 120_000 })
    ]);
    expect(ranked.map((s) => s.key)).toEqual(["c:wait", "c:work", "c:idle"]);
  });

  it("orders by recency within a state", () => {
    const ranked = rankSessions([
      session({ key: "old", state: "attention", activityAt: NOW - 10_000 }),
      session({ key: "new", state: "attention", activityAt: NOW })
    ]);
    expect(ranked.map((s) => s.key)).toEqual(["new", "old"]);
  });

  it("breaks ties deterministically so a slot does not reshuffle under your finger", () => {
    const build = () => [
      session({ key: "b", state: "idle", activityAt: NOW }),
      session({ key: "a", state: "idle", activityAt: NOW })
    ];
    expect(rankSessions(build()).map((s) => s.key)).toEqual(["a", "b"]);
    expect(rankSessions(build().reverse()).map((s) => s.key)).toEqual(["a", "b"]);
  });

  it("drops finished sessions, since a slot exists to be tapped", () => {
    const ranked = rankSessions([
      session({ key: "closed", state: "idle", isOpen: false }),
      session({ key: "open", state: "idle", isOpen: true })
    ]);
    expect(ranked.map((s) => s.key)).toEqual(["open"]);
  });

  it("keeps a session that still wants you even if it reads as closed", () => {
    const ranked = rankSessions([session({ key: "waiting", state: "attention", isOpen: false })]);
    expect(ranked.map((s) => s.key)).toEqual(["waiting"]);
  });

  it("does not mutate the array it is given", () => {
    const input = [
      session({ key: "b", state: "idle", activityAt: NOW - 1_000 }),
      session({ key: "a", state: "attention", activityAt: NOW })
    ];
    rankSessions(input);
    expect(input.map((s) => s.key)).toEqual(["b", "a"]);
  });

  it("keeps same-state sessions in their physical slots when activity changes", () => {
    const sessions = [
      session({ key: "old-slot-1", state: "working", activityAt: NOW - 10_000 }),
      session({ key: "old-slot-2", state: "working", activityAt: NOW })
    ];
    expect(stabilizeSessionSlots(sessions, ["old-slot-1", "old-slot-2"], 2).slice(0, 2).map((item) => item.key))
      .toEqual(["old-slot-1", "old-slot-2"]);
  });

  it("lets a more urgent newcomer displace the least urgent incumbent", () => {
    const sessions = [
      session({ key: "working", state: "working" }),
      session({ key: "idle", state: "idle" }),
      session({ key: "waiting", state: "attention" })
    ];
    const keys = stabilizeSessionSlots(sessions, ["working", "idle"], 2).slice(0, 2).map((item) => item.key);
    expect(keys).toEqual(["working", "waiting"]);
  });

  it("maps session.N modules to zero-based slots and nothing else", () => {
    expect(sessionSlot("session.1")).toBe(0);
    expect(sessionSlot("session.4")).toBe(3);
    expect(sessionSlot("claude.status")).toBeNull();
    expect(sessionSlot("blank")).toBeNull();
  });

  it("routes a session key tap to a focus action for that slot", () => {
    const config: DeckConfig = { ...DEFAULT_CONFIG, keys: ["session.1", "session.2", "blank", "summary", "info", "blank", "blank", "blank"] };
    expect(actionForControl(0, config)).toEqual({ type: "focus-session", slot: 0 });
    expect(actionForControl(1, config)).toEqual({ type: "focus-session", slot: 1 });
    expect(actionForControl(2, config)).toEqual({ type: "refresh" });
  });

  it("renders a filled slot differently from an empty one, both at native size", async () => {
    const filled = await renderSessionKey(session({ state: "attention", label: "SaleSync" }), 0);
    const empty = await renderSessionKey(null, 0);
    expect(filled.length).toBe(96 * 96 * 4);
    expect(empty.length).toBe(96 * 96 * 4);
    expect(filled.equals(empty)).toBe(false);
  });

  it("survives a session with no project label", async () => {
    expect((await renderSessionKey(session({ state: "working" }), 1)).length).toBe(96 * 96 * 4);
  });
});

describe("usage window selection", () => {
  const window = (label: string, percent?: number, resetsAt: number | null = null) => ({ label, percent, resetsAt });

  it("speaks for the window closest to its limit, not the last one", () => {
    const windows = [window("5h", 99), window("7d", 30)];
    expect(leadingWindow(windows)?.label).toBe("5h");
  });

  it("falls back to the last window when none are quotas", () => {
    const windows = [window("24h", undefined), window("7d", undefined)];
    expect(leadingWindow(windows)?.label).toBe("7d");
    expect(leadingWindow([])).toBeUndefined();
  });

  it("picks the soonest reset across all windows", () => {
    const windows = [window("7d", 30, NOW + 86_400_000), window("5h", 99, NOW + 600_000)];
    expect(soonestReset(windows, NOW)?.label).toBe("5h");
    expect(soonestReset([window("5h", 1)], NOW)).toBeUndefined();
  });

  it("ignores expired and invalid reset timestamps when a future reset exists", () => {
    const windows = [window("expired", 99, NOW - 1), window("invalid", 50, Number.NaN), window("future", 10, NOW + 60_000)];
    expect(soonestReset(windows, NOW)?.label).toBe("future");
  });

  it("warns on the 5h window even when the weekly one is calm", async () => {
    const near: UsageSnapshot = { provider: "codex", windows: [window("5h", 99), window("7d", 10)], updatedAt: 1, error: null };
    const calm: UsageSnapshot = { provider: "codex", windows: [window("5h", 10), window("7d", 10)], updatedAt: 1, error: null };
    expect((await renderUsageKey(near, DEFAULT_CONFIG)).equals(await renderUsageKey(calm, DEFAULT_CONFIG))).toBe(false);
    expect(usageLevelFor(leadingWindow(near.windows)?.percent, DEFAULT_CONFIG)).toBe("critical");
  });
});

describe("focusability", () => {
  it("accepts a session with a live process or a known app entry point", () => {
    expect(isFocusable(session({ pid: 1234 }))).toBe(true);
    expect(isFocusable(session({ entrypoint: "claude-desktop" }))).toBe(true);
  });

  it("rejects sessions with nothing to raise, which is every Codex session today", () => {
    expect(isFocusable(session({ provider: "codex" }))).toBe(false);
    expect(isFocusable(session({ pid: 0 }))).toBe(false);
    expect(isFocusable(null)).toBe(false);
  });

  it("does not offer to open a window it cannot raise", async () => {
    const raisable = await renderSessionKey(session({ state: "attention", label: "SaleSync", pid: 1234 }), 0);
    const notRaisable = await renderSessionKey(session({ state: "attention", label: "SaleSync" }), 0);
    expect(raisable.equals(notRaisable)).toBe(false);
  });
});

describe("codex session metadata", () => {
  it("reads cwd out of the session_meta header", () => {
    const head = [
      JSON.stringify({ type: "session_meta", payload: { session_id: "x", cwd: "/Users/me/Documents/SaleSync" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "task_started" } })
    ].join("\n");
    expect(parseCodexCwd(head)).toBe("/Users/me/Documents/SaleSync");
  });

  it("tolerates a truncated final line and a missing cwd", () => {
    expect(parseCodexCwd(`${JSON.stringify({ type: "session_meta", payload: {} })}\n{"type":"event_ms`)).toBeNull();
    expect(parseCodexCwd("")).toBeNull();
  });

  it("recognizes Codex Desktop without treating the originator as script input", () => {
    const head = JSON.stringify({
      type: "session_meta",
      payload: { cwd: "/repo", originator: "Codex Desktop", base_instructions: { text: "x".repeat(32 * 1024) } }
    });
    expect(parseCodexMeta(head)).toEqual({ cwd: "/repo", entrypoint: "codex-desktop" });
  });

  it("parses only real Codex executables and maps lsof cwd records", () => {
    const ps = [
      "  10 /opt/bin/codex",
      "  11 /opt/bin/codex-x86_64-apple-darwin",
      "  12 /Applications/Codex (Renderer)",
      "  13 /bin/zsh"
    ].join("\n");
    expect(parseCodexProcessList(ps)).toEqual([10, 11]);
    expect(parseCodexProcessCwds("p10\nfcwd\nn/Users/me/repo\np11\nfcwd\nn/Users/me/other\n"))
      .toEqual(new Map([["/Users/me/repo", 10], ["/Users/me/other", 11]]));
  });

  it("does not guess a terminal when multiple Codex processes share one cwd", () => {
    expect(parseCodexProcessCwds("p10\nfcwd\nn/Users/me/repo\np11\nfcwd\nn/Users/me/repo\n")).toEqual(new Map());
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
