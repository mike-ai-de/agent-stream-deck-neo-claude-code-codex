import os from "node:os";
import path from "node:path";

export function claudeConfigDirectory(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
}

export function claudeSessionsDirectory(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return path.join(claudeConfigDirectory(env, home), "sessions");
}

export function claudeProjectsDirectory(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return path.join(claudeConfigDirectory(env, home), "projects");
}

export function codexHomeDirectory(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return env.CODEX_HOME || path.join(home, ".codex");
}

export function codexSessionsDirectory(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return path.join(codexHomeDirectory(env, home), "sessions");
}

export function platformLabel(platform = process.platform): string {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  return platform;
}

export function wslDistributionFromPath(value: string): string | null {
  return value.match(/^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)\\/i)?.[1] ?? null;
}
