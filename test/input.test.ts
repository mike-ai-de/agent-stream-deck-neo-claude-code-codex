import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type DeckConfig } from "../src/config.js";
import { actionForControl } from "../src/input.js";

describe("Neo controls", () => {
  it("maps the default top row to Codex status/usage, Claude status, and All Agents", () => {
    expect(actionForControl(0, DEFAULT_CONFIG)).toEqual({ type: "acknowledge-provider", provider: "codex" });
    expect(actionForControl(1, DEFAULT_CONFIG)).toEqual({ type: "open-url", url: DEFAULT_CONFIG.codexUsageUrl });
    expect(actionForControl(2, DEFAULT_CONFIG)).toEqual({ type: "acknowledge-provider", provider: "claude" });
    expect(actionForControl(3, DEFAULT_CONFIG)).toEqual({ type: "show-agents" });
  });

  it("maps the default bottom row to two sessions, projects, and Info", () => {
    expect(actionForControl(4, DEFAULT_CONFIG)).toEqual({ type: "focus-session", slot: 0 });
    expect(actionForControl(5, DEFAULT_CONFIG)).toEqual({ type: "focus-session", slot: 1 });
    expect(actionForControl(6, DEFAULT_CONFIG)).toEqual({ type: "acknowledge-all" });
    expect(actionForControl(7, DEFAULT_CONFIG)).toEqual({ type: "cycle-info", delta: 1 });
  });

  it("cycles the InfoBar with both Neo touch points regardless of layout", () => {
    expect(actionForControl(8, DEFAULT_CONFIG)).toMatchObject({ type: "cycle-info", delta: -1 });
    expect(actionForControl(9, DEFAULT_CONFIG)).toMatchObject({ type: "cycle-info", delta: 1 });
  });

  it("dispatches on the configured key layout", () => {
    const config: DeckConfig = {
      ...DEFAULT_CONFIG,
      keys: ["blank", "summary", "codex.status", "info", "session.3", "blank", "claude.status", "blank"]
    };
    expect(actionForControl(0, config)).toEqual({ type: "refresh" });
    expect(actionForControl(1, config)).toEqual({ type: "show-agents" });
    expect(actionForControl(2, config)).toEqual({ type: "acknowledge-provider", provider: "codex" });
    expect(actionForControl(3, config)).toEqual({ type: "cycle-info", delta: 1 });
    expect(actionForControl(4, config)).toEqual({ type: "focus-session", slot: 2 });
    expect(actionForControl(6, config)).toEqual({ type: "acknowledge-provider", provider: "claude" });
    expect(actionForControl(12, config)).toEqual({ type: "refresh" });
  });
});
