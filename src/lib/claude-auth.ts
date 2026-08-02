import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { configDir } from "../config.js";
import { claudeConfigDirectory } from "../platform.js";

const execFileAsync = promisify(execFile);

interface ClaudeCredentials {
  claudeAiOauth?: { accessToken?: string };
  accessToken?: string;
}

export interface ClaudeAccessToken {
  token: string;
  source: "environment" | "macOS Keychain" | "token file" | "credentials file";
}

/**
 * A token produced by `claude setup-token`, stored 0600 next to the deck's own config. This exists
 * because a Claude Code install can hold a Keychain entry whose accessToken is an empty string —
 * the sign-in is valid, but there is nothing for a separate process to present to the API.
 */
export function tokenFilePath(dir = configDir()): string {
  return path.join(dir, "claude-token");
}

export function extractClaudeAccessToken(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const credentials = value as ClaudeCredentials;
  const token = credentials.claudeAiOauth?.accessToken || credentials.accessToken;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

export async function readClaudeAccessToken(
  directory = claudeConfigDirectory(),
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform
): Promise<ClaudeAccessToken> {
  const environmentToken = env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  if (environmentToken) return { token: environmentToken, source: "environment" };

  if (platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("/usr/bin/security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
        timeout: 5_000,
        maxBuffer: 1024 * 1024
      });
      const token = extractClaudeAccessToken(JSON.parse(stdout));
      if (token) return { token, source: "macOS Keychain" };
    } catch {
      // File-backed credentials are used by Windows, WSL, Linux, and some legacy installs.
    }
  }

  try {
    const raw = (await fs.promises.readFile(tokenFilePath(), "utf8")).trim();
    // The file may hold a bare token or the same JSON shape the Keychain uses.
    const token = raw.startsWith("{") ? extractClaudeAccessToken(JSON.parse(raw)) : raw;
    if (token) return { token, source: "token file" };
  } catch {
    // Absent by default; fall through to Claude's own credentials file.
  }

  const credentialsFile = path.join(directory, ".credentials.json");
  try {
    const token = extractClaudeAccessToken(JSON.parse(await fs.promises.readFile(credentialsFile, "utf8")));
    if (token) return { token, source: "credentials file" };
  } catch {
    // Return one sanitized error below; never include file content or a token.
  }

  throw new Error("Claude Code OAuth token not found");
}
