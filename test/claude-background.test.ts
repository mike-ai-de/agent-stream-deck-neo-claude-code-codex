import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeCollector } from "../src/collectors/claude.js";
import type { PersistedState } from "../src/types.js";

const state: PersistedState = {
  schemaVersion: 2,
  installedAt: 0,
  attentionSince: 0,
  infoPage: 0,
  acknowledged: {}
};

describe("Claude background usage refresh", () => {
  it("returns local sessions without awaiting the network and shares one in-flight request", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "neo-claude-background-"));
    const previousHome = process.env.NEO_AGENT_DECK_HOME;
    process.env.NEO_AGENT_DECK_HOME = directory;
    let release!: () => void;
    let calls = 0;
    const collector = new ClaudeCollector(path.join(directory, "sessions"), path.join(directory, "projects"));
    (collector as unknown as { readUsage: () => Promise<void> }).readUsage = async () => {
      calls += 1;
      await new Promise<void>((resolve) => { release = resolve; });
    };

    try {
      const first = collector.collect(state, false, true);
      const second = collector.collect(state, false, true);
      await expect(Promise.race([
        Promise.all([first, second]).then(() => "collected"),
        new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 100))
      ])).resolves.toBe("collected");
      expect(calls).toBe(1);
      release();
    } finally {
      if (previousHome === undefined) delete process.env.NEO_AGENT_DECK_HOME;
      else process.env.NEO_AGENT_DECK_HOME = previousHome;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
