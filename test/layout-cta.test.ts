import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type DeckConfig } from "../src/config.js";
import { groupProjects } from "../src/dashboard.js";
import { actionForControl } from "../src/input.js";
import { openUrl } from "../src/lib/focus.js";
import { renderInfoBar, renderProjectsKey } from "../src/render.js";
import type { DashboardSnapshot, ProviderSnapshot, SessionSnapshot } from "../src/types.js";

const NOW = 1_800_000_000_000;

const session = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  key: "claude:a", id: "abcdef123456", provider: "claude", state: "idle",
  isOpen: true, activityAt: NOW, completionAt: 0, ...overrides
});

const emptyProvider = (provider: SessionSnapshot["provider"]): ProviderSnapshot => ({
  provider, state: "idle", sessions: [], usage: { provider, windows: [], updatedAt: 1, error: null },
  openCount: 0, workingCount: 0, attentionCount: 0, idleCount: 0, primary: null
});

const snapshotOf = (sessions: SessionSnapshot[]): DashboardSnapshot => ({
  providers: { claude: emptyProvider("claude"), codex: emptyProvider("codex") },
  openCount: sessions.length, workingCount: 0, attentionCount: 0, updatedAt: NOW,
  ranked: sessions, projects: groupProjects(sessions)
});

describe("project grouping", () => {
  it("counts one project when two agents share a repository", () => {
    const projects = groupProjects([
      session({ key: "claude:1", cwd: "/w/SaleSync", label: "SaleSync" }),
      session({ key: "codex:1", provider: "codex", cwd: "/w/SaleSync", label: "SaleSync" })
    ]);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ label: "SaleSync", sessions: 2 });
  });

  it("puts projects that want something first", () => {
    const projects = groupProjects([
      session({ key: "a", cwd: "/w/calm", label: "calm", activityAt: NOW }),
      session({ key: "b", cwd: "/w/urgent", label: "urgent", state: "attention", activityAt: NOW - 60_000 })
    ]);
    expect(projects.map((p) => p.label)).toEqual(["urgent", "calm"]);
    expect(projects[0].attention).toBe(1);
  });

  it("keeps sessions without a working directory apart instead of merging them", () => {
    expect(groupProjects([session({ key: "x" }), session({ key: "y" })])).toHaveLength(2);
  });

  it("normalizes equivalent working-directory spellings before grouping", () => {
    expect(groupProjects([
      session({ key: "x", cwd: "/w/project", label: "project" }),
      session({ key: "y", cwd: "/w/project/", label: "project" })
    ])).toHaveLength(1);
  });
});

describe("projects key", () => {
  it("renders differently when a project needs you", async () => {
    const calm = await renderProjectsKey(snapshotOf([session({ cwd: "/w/a", label: "a" })]));
    const urgent = await renderProjectsKey(snapshotOf([session({ cwd: "/w/a", label: "a", state: "attention" })]));
    expect(calm.length).toBe(96 * 96 * 4);
    expect(calm.equals(urgent)).toBe(false);
  });

  it("survives having no projects at all", async () => {
    expect((await renderProjectsKey(snapshotOf([]))).length).toBe(96 * 96 * 4);
  });
});

describe("sessions InfoBar page", () => {
  const config: DeckConfig = { ...DEFAULT_CONFIG, infoBar: ["sessions", "all"], restingPage: "sessions" };

  it("draws names, and differs from the counter page", async () => {
    const snapshot = snapshotOf([
      session({ key: "a", cwd: "/w/SaleSync", label: "SaleSync", state: "attention" }),
      session({ key: "b", cwd: "/w/deck", label: "deck", provider: "codex" })
    ]);
    const names = await renderInfoBar(snapshot, 0, config);
    const counters = await renderInfoBar(snapshot, 1, config);
    expect(names.length).toBe(248 * 58 * 4);
    expect(names.equals(counters)).toBe(false);
  });

  it("handles an empty deck and more sessions than fit", async () => {
    expect((await renderInfoBar(snapshotOf([]), 0, config)).length).toBe(248 * 58 * 4);
    const many = Array.from({ length: 6 }, (_, i) => session({ key: `s${i}`, cwd: `/w/p${i}`, label: `p${i}` }));
    expect((await renderInfoBar(snapshotOf(many), 0, config)).length).toBe(248 * 58 * 4);
  });
});

describe("key actions", () => {
  const layout: DeckConfig = {
    ...DEFAULT_CONFIG,
    keys: ["codex.status", "codex.usage", "claude.status", "summary", "session.1", "session.2", "projects", "info"]
  };

  it("maps the configured layout to the intended call to action", () => {
    expect(actionForControl(0, layout)).toEqual({ type: "acknowledge-provider", provider: "codex" });
    expect(actionForControl(1, layout)).toEqual({ type: "open-url", url: DEFAULT_CONFIG.codexUsageUrl });
    expect(actionForControl(2, layout)).toEqual({ type: "acknowledge-provider", provider: "claude" });
    expect(actionForControl(3, layout)).toEqual({ type: "show-agents" });
    expect(actionForControl(4, layout)).toEqual({ type: "focus-session", slot: 0 });
    expect(actionForControl(5, layout)).toEqual({ type: "focus-session", slot: 1 });
    expect(actionForControl(6, layout)).toEqual({ type: "acknowledge-all" });
    expect(actionForControl(7, layout)).toEqual({ type: "cycle-info", delta: 1 });
  });

  it("falls back to a refresh when no link is configured", () => {
    const noLink: DeckConfig = { ...layout, codexUsageUrl: null };
    expect(actionForControl(1, noLink)).toEqual({ type: "refresh" });
  });
});

describe("opening links", () => {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const execute = async (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    return { stdout: "", stderr: "" };
  };

  it("hands the URL to open as a single argument, never through a shell", async () => {
    calls.length = 0;
    const result = await openUrl("https://chatgpt.com/codex/cloud/settings/analytics", { platform: "darwin", execute });
    expect(result.focused).toBe(true);
    expect(calls).toEqual([{ file: "/usr/bin/open", args: ["https://chatgpt.com/codex/cloud/settings/analytics"] }]);
  });

  it("refuses anything that is not https, so a config file cannot launch arbitrary things", async () => {
    calls.length = 0;
    for (const url of ["file:///etc/passwd", "http://example.com", "x-devil://run", "not a url"]) {
      expect((await openUrl(url, { platform: "darwin", execute })).focused).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it("does not echo a failed URL into a loggable result", async () => {
    const secretUrl = "https://user:password@example.com/path?token=secret";
    const execute = async () => { throw new Error(`Command failed: /usr/bin/open ${secretUrl}`); };
    const result = await openUrl(secretUrl, { platform: "darwin", execute });
    expect(result.focused).toBe(false);
    expect(result.detail).toBe("could not open an https link to example.com");
    expect(result.detail).not.toContain("password");
    expect(result.detail).not.toContain("secret");
  });
});
