import type { Provider, UsageSnapshot } from "../types.js";

export function clampPercent(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}

export function emptyUsage(provider: Provider, error: string, extra: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return { provider, windows: [], updatedAt: 0, error, ...extra };
}

/**
 * Coarse duration for a 96px key: at most two units, largest first ("3d 4h", "48m").
 * Returns null for a past or missing deadline so callers can fall back to their own text.
 */
export function formatCountdown(resetsAt: number | null | undefined, now = Date.now()): string | null {
  if (typeof resetsAt !== "number" || !Number.isFinite(resetsAt)) return null;
  const remaining = resetsAt - now;
  if (remaining <= 0) return null;

  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes % 60 > 0 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return `${Math.max(1, minutes)}m`;
}

// Directories that identify no project in particular; a session sitting in one of them is better
// described by its own name than by "/" or "claude".
const UNINFORMATIVE_DIRECTORIES = new Set(["", "/", ".", "..", "~"]);

/**
 * Short label for a session: the working directory's name, falling back to the provider-supplied
 * session name. Truncated to fit a key, since the render target is 96px wide.
 */
export function projectLabel(cwd?: string, fallback?: string, maxLength = 14): string | null {
  const candidate = directoryName(cwd) ?? (fallback || "").trim();
  if (!candidate) return null;
  return candidate.length > maxLength ? `${candidate.slice(0, maxLength - 1)}…` : candidate;
}

function directoryName(cwd?: string): string | null {
  if (!cwd) return null;
  const trimmed = cwd.replace(/[/\\]+$/, "");
  if (UNINFORMATIVE_DIRECTORIES.has(trimmed)) return null;
  const name = trimmed.split(/[/\\]/).pop() || "";
  if (!name || UNINFORMATIVE_DIRECTORIES.has(name)) return null;
  // A session started in the home directory is not a project either.
  if (/^\/(Users|home)\/[^/]+$/.test(trimmed)) return null;
  return name;
}
