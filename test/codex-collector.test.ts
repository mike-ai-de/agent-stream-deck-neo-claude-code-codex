import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CodexCollector } from "../src/collectors/codex.js";
import type { PersistedState } from "../src/types.js";

const state: PersistedState = {
  schemaVersion: 2,
  installedAt: 0,
  attentionSince: 0,
  infoPage: 0,
  acknowledged: {}
};

describe("Codex collector metadata cache", () => {
  it("retries a transient head-read failure, then caches metadata and attaches the matching pid", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "neo-codex-meta-"));
    const id = "12345678-1234-1234-1234-123456789abc";
    const file = path.join(directory, `${id}.jsonl`);
    fs.writeFileSync(file, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      type: "event_msg",
      payload: { type: "task_started" }
    })}\n`);
    let reads = 0;
    const requestedBytes: number[] = [];
    const readHead = async (_file: string, bytes: number): Promise<string> => {
      reads += 1;
      requestedBytes.push(bytes);
      if (reads === 1) return "";
      return JSON.stringify({ type: "session_meta", payload: { cwd: directory, originator: "codex_cli" } });
    };
    const collector = new CodexCollector(directory, async () => new Map([[directory, 4321]]), readHead);

    try {
      expect((await collector.collect(state)).sessions[0].cwd).toBeUndefined();
      const recovered = (await collector.collect(state)).sessions[0];
      expect(recovered.cwd).toBe(directory);
      expect(recovered.pid).toBeUndefined();
      expect((await collector.collect(state)).sessions[0].pid).toBe(4321);
      expect(reads).toBe(2);
      expect(requestedBytes).toEqual([256 * 1024, 256 * 1024]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
