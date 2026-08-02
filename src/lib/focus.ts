import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SessionSnapshot } from "../types.js";

const execFileAsync = promisify(execFile);

export interface FocusResult {
  focused: boolean;
  /** Short, log-safe explanation. Never contains session content. */
  detail: string;
}

/**
 * Terminal emulators we know how to raise, keyed by the executable name `ps` reports. The values
 * are the application names AppleScript expects. This is an allowlist on purpose: the name is
 * interpolated into an AppleScript string, so it must never come from an untrusted source.
 */
const TERMINAL_APPS: Record<string, string> = {
  "Terminal": "Terminal",
  "iTerm2": "iTerm",
  "iTerm": "iTerm",
  "WezTerm": "WezTerm",
  "wezterm-gui": "WezTerm",
  "alacritty": "Alacritty",
  "kitty": "kitty",
  "Hyper": "Hyper",
  "ghostty": "Ghostty",
  "Warp": "Warp",
  "warp": "Warp",
  "Code Helper": "Visual Studio Code",
  "Electron": "Visual Studio Code",
  "Code": "Visual Studio Code",
  "Cursor": "Cursor"
};

/** Entry points that are an application window rather than a terminal session. */
const APP_ENTRYPOINTS: Record<string, string> = {
  "claude-desktop": "Claude"
};

const MAX_ANCESTRY_DEPTH = 12;

export async function focusSession(session: SessionSnapshot | null | undefined): Promise<FocusResult> {
  if (process.platform !== "darwin") return { focused: false, detail: "focus is implemented for macOS only" };
  if (!session) return { focused: false, detail: "no session to focus" };

  const appForEntrypoint = APP_ENTRYPOINTS[String(session.entrypoint || "")];
  if (appForEntrypoint) return activateApp(appForEntrypoint);

  if (!Number.isInteger(session.pid) || Number(session.pid) <= 0) {
    return { focused: false, detail: "session records no process id" };
  }

  const terminal = await findTerminalAncestor(Number(session.pid));
  if (!terminal) return { focused: false, detail: "no known terminal in the process ancestry" };

  const tty = await ttyForPid(Number(session.pid));
  if (tty && terminal === "Terminal") return activateTerminalTab(tty);
  if (tty && terminal === "iTerm") return activateITermSession(tty);
  return activateApp(terminal);
}

/** Walks up the parent chain until it hits a process we recognise as a terminal. */
async function findTerminalAncestor(pid: number): Promise<string | null> {
  let current = pid;
  for (let depth = 0; depth < MAX_ANCESTRY_DEPTH && current > 1; depth += 1) {
    const parent = await parentOf(current);
    if (!parent) return null;
    const mapped = TERMINAL_APPS[parent.command];
    if (mapped) return mapped;
    current = parent.pid;
  }
  return null;
}

async function parentOf(pid: number): Promise<{ pid: number; command: string } | null> {
  try {
    const { stdout } = await execFileAsync("/bin/ps", ["-o", "ppid=,comm=", "-p", String(pid)], { timeout: 2_000 });
    const line = stdout.trim();
    if (!line) return null;
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match) return null;
    // comm is a full path for most processes; the basename is what the table keys on.
    const command = (match[2].trim().split("/").pop() || "").trim();
    return { pid: Number(match[1]), command };
  } catch {
    return null;
  }
}

async function ttyForPid(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("/bin/ps", ["-o", "tty=", "-p", String(pid)], { timeout: 2_000 });
    const value = stdout.trim();
    if (!value || value === "??") return null;
    const device = value.startsWith("/dev/") ? value : `/dev/${value}`;
    // Guard the value before it reaches AppleScript.
    return /^\/dev\/tty[a-z0-9]+$/i.test(device) ? device : null;
  } catch {
    return null;
  }
}

async function activateApp(app: string): Promise<FocusResult> {
  return runAppleScript(`tell application "${app}" to activate`, `raised ${app}`);
}

async function activateTerminalTab(tty: string): Promise<FocusResult> {
  const script = [
    `tell application "Terminal"`,
    `  activate`,
    `  repeat with w in windows`,
    `    repeat with t in tabs of w`,
    `      if tty of t is "${tty}" then`,
    `        set selected of t to true`,
    `        set index of w to 1`,
    `        return "ok"`,
    `      end if`,
    `    end repeat`,
    `  end repeat`,
    `end tell`,
    `return "app-only"`
  ].join("\n");
  return runAppleScript(script, `raised Terminal for ${tty}`);
}

async function activateITermSession(tty: string): Promise<FocusResult> {
  const script = [
    `tell application "iTerm"`,
    `  activate`,
    `  repeat with w in windows`,
    `    repeat with t in tabs of w`,
    `      repeat with s in sessions of t`,
    `        if tty of s is "${tty}" then`,
    `          select w`,
    `          select t`,
    `          select s`,
    `          return "ok"`,
    `        end if`,
    `      end repeat`,
    `    end repeat`,
    `  end repeat`,
    `end tell`,
    `return "app-only"`
  ].join("\n");
  return runAppleScript(script, `raised iTerm for ${tty}`);
}

async function runAppleScript(script: string, detail: string): Promise<FocusResult> {
  try {
    await execFileAsync("/usr/bin/osascript", ["-e", script], { timeout: 5_000 });
    return { focused: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // -1743 is macOS refusing automation until the user grants it in Privacy & Security.
    if (message.includes("-1743") || message.toLowerCase().includes("not authorized")) {
      return {
        focused: false,
        detail: "macOS has not granted automation permission; allow it under Privacy & Security > Automation"
      };
    }
    return { focused: false, detail: `focus failed: ${message.split("\n")[0]}` };
  }
}
