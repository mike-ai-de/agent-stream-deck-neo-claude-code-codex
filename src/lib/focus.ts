import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SessionSnapshot } from "../types.js";

type FocusExecResult = { stdout: string; stderr: string };
export type FocusExec = (file: string, args: readonly string[], options: { timeout: number }) => Promise<FocusExecResult>;
const execFileAsync = promisify(execFile) as unknown as FocusExec;

export interface FocusDependencies {
  platform?: NodeJS.Platform;
  execute?: FocusExec;
}

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
  "claude-desktop": "Claude",
  "codex-desktop": "ChatGPT"
};

const MAX_ANCESTRY_DEPTH = 12;

/**
 * Whether there is anything to raise for this session. Collectors that read a log file rather than
 * a live process record no pid, and a key must not offer an action it cannot perform.
 */
export function isFocusable(session: SessionSnapshot | null | undefined, platform = process.platform): boolean {
  if (!session || platform !== "darwin") return false;
  if (APP_ENTRYPOINTS[String(session.entrypoint || "")]) return true;
  return Number.isInteger(session.pid) && Number(session.pid) > 0;
}

export async function focusSession(session: SessionSnapshot | null | undefined, dependencies: FocusDependencies = {}): Promise<FocusResult> {
  const platform = dependencies.platform ?? process.platform;
  const execute = dependencies.execute ?? execFileAsync;
  if (platform !== "darwin") return { focused: false, detail: "focus is implemented for macOS only" };
  if (!session) return { focused: false, detail: "no session to focus" };

  const appForEntrypoint = APP_ENTRYPOINTS[String(session.entrypoint || "")];
  if (appForEntrypoint) return activateApp(appForEntrypoint, execute);

  if (!Number.isInteger(session.pid) || Number(session.pid) <= 0) {
    return { focused: false, detail: "session records no process id" };
  }

  const terminal = await findTerminalAncestor(Number(session.pid), execute);
  if (!terminal) return { focused: false, detail: "no known terminal in the process ancestry" };

  const tty = await ttyForPid(Number(session.pid), execute);
  if (tty && terminal === "Terminal") return activateTerminalTab(tty, execute);
  if (tty && terminal === "iTerm") return activateITermSession(tty, execute);
  return activateApp(terminal, execute);
}

/** Walks up the parent chain until it hits a process we recognise as a terminal. */
async function findTerminalAncestor(pid: number, execute: FocusExec): Promise<string | null> {
  let current = pid;
  for (let depth = 0; depth < MAX_ANCESTRY_DEPTH && current > 1; depth += 1) {
    const parent = await parentOf(current, execute);
    if (!parent) return null;
    const mapped = TERMINAL_APPS[parent.command];
    if (mapped) return mapped;
    current = parent.pid;
  }
  return null;
}

async function parentOf(pid: number, execute: FocusExec): Promise<{ pid: number; command: string } | null> {
  try {
    const { stdout } = await execute("/bin/ps", ["-o", "ppid=,comm=", "-p", String(pid)], { timeout: 2_000 });
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

async function ttyForPid(pid: number, execute: FocusExec): Promise<string | null> {
  try {
    const { stdout } = await execute("/bin/ps", ["-o", "tty=", "-p", String(pid)], { timeout: 2_000 });
    const value = stdout.trim();
    if (!value || value === "??") return null;
    const device = value.startsWith("/dev/") ? value : `/dev/${value}`;
    // Guard the value before it reaches AppleScript.
    return /^\/dev\/tty[a-z0-9]+$/i.test(device) ? device : null;
  } catch {
    return null;
  }
}

async function activateApp(app: string, execute: FocusExec): Promise<FocusResult> {
  return runAppleScript(`tell application "${app}" to activate`, `raised ${app}`, execute);
}

async function activateTerminalTab(tty: string, execute: FocusExec): Promise<FocusResult> {
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
  return runAppleScript(script, `raised Terminal for ${tty}`, execute);
}

async function activateITermSession(tty: string, execute: FocusExec): Promise<FocusResult> {
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
  return runAppleScript(script, `raised iTerm for ${tty}`, execute);
}

const OSASCRIPT_TIMEOUT_MS = 5_000;

async function runAppleScript(script: string, detail: string, execute: FocusExec): Promise<FocusResult> {
  try {
    await execute("/usr/bin/osascript", ["-e", script], { timeout: OSASCRIPT_TIMEOUT_MS });
    return { focused: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // -1743 is macOS refusing automation outright.
    if (message.includes("-1743") || message.toLowerCase().includes("not authorized")) {
      return {
        focused: false,
        detail: "macOS denied automation; allow this app under System Settings > Privacy & Security > Automation"
      };
    }
    // The first attempt against a given app raises a consent dialog and osascript blocks on it
    // until someone answers, so a timeout here is far more likely to be a waiting prompt than a
    // hung Terminal. Say so, because "timed out" sends people looking in the wrong place.
    if (isTimeout(error, message)) {
      return {
        focused: false,
        detail: "timed out — macOS is probably showing the one-time Automation consent dialog; approve it and tap again"
      };
    }
    return { focused: false, detail: `focus failed: ${message.split("\n")[0]}` };
  }
}

function isTimeout(error: unknown, message: string): boolean {
  const killed = (error as { killed?: boolean; signal?: string });
  return killed?.killed === true || killed?.signal === "SIGTERM" || /timed? ?out/i.test(message);
}
