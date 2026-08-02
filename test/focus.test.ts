import { describe, expect, it } from "vitest";
import { focusSession, isFocusable, type FocusExec } from "../src/lib/focus.js";
import type { SessionSnapshot } from "../src/types.js";

const session = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  key: "codex:test",
  id: "test",
  provider: "codex",
  state: "attention",
  isOpen: true,
  activityAt: 1,
  completionAt: 1,
  ...overrides
});

describe("macOS session focus", () => {
  it("walks the process tree, validates the tty, and selects a Terminal tab", async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const execute: FocusExec = async (file, args) => {
      calls.push({ file, args });
      if (file === "/bin/ps" && args.includes("ppid=,comm=")) {
        return { stdout: "20 /Applications/Utilities/Terminal.app/Contents/MacOS/Terminal\n", stderr: "" };
      }
      if (file === "/bin/ps" && args.includes("tty=")) return { stdout: "ttys004\n", stderr: "" };
      return { stdout: "ok\n", stderr: "" };
    };

    const result = await focusSession(session({ pid: 10 }), { platform: "darwin", execute });
    expect(result).toEqual({ focused: true, detail: "raised Terminal for /dev/ttys004" });
    const script = calls.find((call) => call.file === "/usr/bin/osascript")?.args[1];
    expect(script).toContain('if tty of t is "/dev/ttys004"');
  });

  it("activates the allowlisted desktop app without process discovery", async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const execute: FocusExec = async (file, args) => {
      calls.push({ file, args });
      return { stdout: "", stderr: "" };
    };
    expect(isFocusable(session({ entrypoint: "codex-desktop" }), "darwin")).toBe(true);
    expect(await focusSession(session({ entrypoint: "codex-desktop" }), { platform: "darwin", execute }))
      .toEqual({ focused: true, detail: "raised ChatGPT" });
    expect(calls).toEqual([{
      file: "/usr/bin/osascript",
      args: ["-e", 'tell application "ChatGPT" to activate']
    }]);
  });

  it("reports a denied Automation permission without leaking script content", async () => {
    const execute: FocusExec = async () => { throw new Error("osascript: execution error: Not authorized (-1743)"); };
    const result = await focusSession(session({ entrypoint: "codex-desktop" }), { platform: "darwin", execute });
    expect(result.focused).toBe(false);
    expect(result.detail).toContain("Privacy & Security > Automation");
  });
});
