#!/usr/bin/env node
/**
 * Stores a Claude Code OAuth token for the deck to use.
 *
 *   claude setup-token | npm run token:claude    # preferred: the token never hits the screen
 *   npm run token:claude                         # interactive; input stays hidden
 *   npm run token:claude -- --check              # report what the deck currently resolves
 *   npm run token:claude -- --clear              # remove the stored token
 *
 * The token is written 0600 and is never printed back.
 */
import fs from "node:fs";
import { configDir } from "../src/config.js";
import { missingScope } from "../src/collectors/claude.js";
import { readClaudeAccessToken, tokenFilePath } from "../src/lib/claude-auth.js";
import { clearBackoff, readBackoff } from "../src/lib/usage-backoff.js";

// setup-token prints prose around the value, so a piped payload is scanned for the token itself
// rather than trusted wholesale.
const TOKEN_PATTERN = /sk-ant-[A-Za-z0-9_-]{20,}/;

const args = process.argv.slice(2);
const file = tokenFilePath();

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run token:claude [-- --check | --clear]

  (no flag)  Read a token from stdin, or prompt for one with the input hidden
  --check    Show which source the deck resolves a token from
  --clear    Delete the stored token

Generate a token with:  claude setup-token
Safest route, keeping it off the screen entirely:

  claude setup-token | npm run token:claude`);
  process.exit(0);
}

if (args.includes("--clear")) {
  try {
    fs.unlinkSync(file);
    console.log(`Removed ${file}`);
  } catch {
    console.log("No stored token to remove.");
  }
  process.exit(0);
}

if (args.includes("--check")) {
  await report();
  process.exit(0);
}

const raw = process.stdin.isTTY ? await promptHidden("Paste the token (input stays hidden): ") : await readStdin();
const match = raw.match(TOKEN_PATTERN);

if (!match) {
  console.error(`\nNo Claude OAuth token found in that input; nothing was written.

A token looks like  sk-ant-oat01-...  and contains no spaces. If you pasted a
command or a partial line by mistake, run this again. To keep the value off the
screen entirely, pipe it straight in:

  claude setup-token | npm run token:claude`);
  process.exit(1);
}

const token = match[0];
fs.mkdirSync(configDir(), { recursive: true });
const temporary = `${file}.tmp`;
fs.writeFileSync(temporary, token, { mode: 0o600 });
fs.renameSync(temporary, file);
fs.chmodSync(file, 0o600);

// A new token deserves a fresh attempt; the wait was earned by the old one.
clearBackoff();

console.log(`\nStored ${token.length} characters at ${file} (mode 600).`);
await report();

// One request now beats discovering the problem later through a dashboard that just says
// "unavailable". A setup-token is inference-only and will fail this check.
const verdict = await verifyToken(token);
console.log(verdict.message);
if (!verdict.ok) process.exitCode = 1;
else console.log(`\nApply it with:  launchctl kickstart -k gui/$(id -u)/com.neo-agent-deck`);

async function verifyToken(value: string): Promise<{ ok: boolean; message: string }> {
  process.stdout.write("\nChecking the token against the usage endpoint... ");
  try {
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${value}`,
        "anthropic-beta": "oauth-2025-04-20",
        "user-agent": "neo-agent-deck/0.3.1"
      },
      signal: AbortSignal.timeout(10_000)
    });
    if (response.ok) return { ok: true, message: "accepted." };

    const body = await response.text();
    const detail = (() => {
      try {
        return (JSON.parse(body) as { error?: { message?: string } }).error?.message || "";
      } catch {
        return "";
      }
    })();
    const scope = missingScope(detail);
    if (scope) {
      return {
        ok: false,
        message: `rejected.\n\nThis token lacks the "${scope}" scope, so plan usage will stay unavailable.\n`
          + "Tokens from `claude setup-token` are inference-only. To get usage:\n\n"
          + "  1. Run `claude` in a terminal and sign in with /login (the CLI, not the desktop app)\n"
          + "  2. Run `npm run token:claude -- --clear` so the deck reads the Keychain instead\n\n"
          + "Everything else on the deck — session status, Codex usage — works without this.",
      };
    }
    return { ok: false, message: `rejected: HTTP ${response.status}${detail ? ` — ${detail}` : ""}` };
  } catch (error) {
    // Not reachable is not the same as not valid; keep the token and say so.
    return { ok: true, message: `could not check (${error instanceof Error ? error.message : String(error)}); token kept.` };
  }
}

async function report(): Promise<void> {
  const backoff = readBackoff();
  if (backoff.retryAt) {
    const minutes = Math.max(1, Math.round((backoff.retryAt - Date.now()) / 60_000));
    console.log(`Usage requests are paused for another ${minutes}m after ${backoff.failures} rejected attempt(s).`);
  }
  try {
    const { source } = await readClaudeAccessToken();
    console.log(`Deck resolves a Claude token from: ${source}`);
  } catch (error) {
    console.log(`Deck finds no usable token: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`Expected file: ${file}`);
  }
}

async function readStdin(): Promise<string> {
  let data = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

/**
 * Reads a line without echoing it. readline would print every keystroke, which is how a mistyped
 * line ends up in scrollback — and how a real token ends up somewhere it should not be.
 */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let buffer = "";
    const finish = (value: string | null, error?: Error): void => {
      stdin.removeListener("data", onData);
      stdin.setRawMode?.(wasRaw ?? false);
      stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value ?? "");
    };

    const onData = (chunk: string): void => {
      for (const character of chunk) {
        switch (character) {
          case "\r":
          case "\n":
            finish(buffer);
            return;
          case "": // Ctrl-C
            finish(null, new Error("cancelled"));
            return;
          case "": // Backspace
          case "\b":
            buffer = buffer.slice(0, -1);
            break;
          default:
            // Ignore other control characters so a stray escape sequence cannot enter the value.
            if (character >= " ") buffer += character;
        }
      }
    };

    stdin.on("data", onData);
  });
}
