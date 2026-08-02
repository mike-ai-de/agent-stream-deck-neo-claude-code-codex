import fs from "node:fs";
import path from "node:path";
import { configDir } from "../config.js";

/**
 * Shared backoff deadline for the Claude usage endpoint.
 *
 * The long-running service keeps its backoff in memory, but `doctor`, `status` and `preview` are
 * separate short-lived processes that would each start with a clean slate — and those are exactly
 * the commands someone runs repeatedly while waiting for a rate limit to clear. Persisting the
 * deadline makes every entry point honour the same wait.
 */
interface BackoffFile {
  retryAt?: number;
  failures?: number;
}

export interface BackoffState {
  retryAt: number;
  failures: number;
}

const EMPTY: BackoffState = { retryAt: 0, failures: 0 };

// A stale deadline from a previous era should not lock usage out indefinitely.
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

function backoffFile(dir = configDir()): string {
  return path.join(dir, "usage-backoff.json");
}

export function readBackoff(dir = configDir(), now = Date.now()): BackoffState {
  try {
    const parsed = JSON.parse(fs.readFileSync(backoffFile(dir), "utf8")) as BackoffFile;
    const retryAt = Number(parsed.retryAt);
    const failures = Number(parsed.failures);
    if (!Number.isFinite(retryAt) || retryAt <= now || retryAt - now > MAX_BACKOFF_MS) return EMPTY;
    return { retryAt, failures: Number.isFinite(failures) ? Math.max(0, failures) : 0 };
  } catch {
    return EMPTY;
  }
}

export function writeBackoff(state: BackoffState, dir = configDir()): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = backoffFile(dir);
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch {
    // Losing the shared deadline only costs an extra request; never fail a refresh over it.
  }
}

export function clearBackoff(dir = configDir()): void {
  try {
    fs.unlinkSync(backoffFile(dir));
  } catch {
    // Absent is the desired state.
  }
}
