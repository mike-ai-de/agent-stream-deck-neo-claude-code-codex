import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  claudeConfigDirectory,
  claudeSessionsDirectory,
  codexHomeDirectory,
  codexSessionsDirectory,
  platformLabel,
  wslDistributionFromPath
} from "../src/platform.js";
import type { PersistedState } from "../src/types.js";

describe("cross-platform data paths", () => {
  it("uses portable home-relative defaults", () => {
    const home = path.join(path.sep, "home", "agent");
    expect(claudeConfigDirectory({}, home)).toBe(path.join(home, ".claude"));
    expect(claudeSessionsDirectory({}, home)).toBe(path.join(home, ".claude", "sessions"));
    expect(codexHomeDirectory({}, home)).toBe(path.join(home, ".codex"));
    expect(codexSessionsDirectory({}, home)).toBe(path.join(home, ".codex", "sessions"));
  });

  it("honors backend directory overrides for native Windows or WSL shares", () => {
    const env = {
      CLAUDE_CONFIG_DIR: path.join(path.sep, "custom", "claude"),
      CODEX_HOME: path.join(path.sep, "custom", "codex")
    };
    expect(claudeConfigDirectory(env, "unused")).toBe(env.CLAUDE_CONFIG_DIR);
    expect(codexHomeDirectory(env, "unused")).toBe(env.CODEX_HOME);
    expect(platformLabel("win32")).toBe("Windows");
    expect(platformLabel("darwin")).toBe("macOS");
    expect(platformLabel("linux")).toBe("Linux");
    expect(wslDistributionFromPath("\\\\wsl.localhost\\Ubuntu-24.04\\home\\agent\\.claude")).toBe("Ubuntu-24.04");
    expect(wslDistributionFromPath("\\\\wsl$\\Debian\\home\\agent\\.codex")).toBe("Debian");
    expect(wslDistributionFromPath("C:\\Users\\agent\\.claude")).toBeNull();
  });
});
