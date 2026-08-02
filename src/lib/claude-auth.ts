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

/**
 * Rejects anything that cannot be an HTTP header value. `trim()` only removes the outer
 * whitespace, so a hand-written token file with a trailing comment line would otherwise reach
 * `fetch`, whose header validation throws a TypeError that quotes the whole value back — and that
 * message ends up in a snapshot the CLI prints. Refusing here keeps the token out of that path.
 */
export function isWellFormedToken(token: string): boolean {
  return /^[\x21-\x7e]+$/.test(token);
}

/** Replaces anything token-shaped in free text, for messages that may be printed or logged. */
export function redactTokens(text: string): string {
  return text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-…");
}

export async function readClaudeAccessToken(
  directory = claudeConfigDirectory(),
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  // Injectable so tests stay isolated from the real deck directory. Without this a test asserting
  // on the credentials-file fallback would read — and on failure print — the operator's own token.
  deckDirectory = configDir()
): Promise<ClaudeAccessToken> {
  const environmentToken = env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  if (environmentToken && isWellFormedToken(environmentToken)) return { token: environmentToken, source: "environment" };

  if (platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("/usr/bin/security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
        timeout: 5_000,
        maxBuffer: 1024 * 1024
      });
      const token = extractClaudeAccessToken(JSON.parse(stdout));
      if (token && isWellFormedToken(token)) return { token, source: "macOS Keychain" };
    } catch {
      // File-backed credentials are used by Windows, WSL, Linux, and some legacy installs.
    }
  }

  try {
    const raw = (await fs.promises.readFile(tokenFilePath(deckDirectory), "utf8")).trim();
    // The file may hold a bare token or the same JSON shape the Keychain uses.
    const token = raw.startsWith("{") ? extractClaudeAccessToken(JSON.parse(raw)) : raw;
    if (token && isWellFormedToken(token)) return { token, source: "token file" };
  } catch {
    // Absent by default; fall through to Claude's own credentials file.
  }

  const credentialsFile = path.join(directory, ".credentials.json");
  try {
    const token = extractClaudeAccessToken(JSON.parse(await fs.promises.readFile(credentialsFile, "utf8")));
    if (token && isWellFormedToken(token)) return { token, source: "credentials file" };
  } catch {
    // Return one sanitized error below; never include file content or a token.
  }

  throw new Error("Claude Code OAuth token not found");
}
