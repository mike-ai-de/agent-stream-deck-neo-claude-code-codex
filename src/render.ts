import sharp from "sharp";
import { DEFAULT_CONFIG, sessionSlot, type DeckConfig, type KeyModule } from "./config.js";
import { isFocusable } from "./lib/focus.js";
import { formatCountdown } from "./lib/util.js";
import type { DashboardSnapshot, Provider, ProviderSnapshot, SessionSnapshot, UsageSnapshot, UsageWindow } from "./types.js";

const KEY_SIZE = 96;
const BAR_WIDTH = 248;
const BAR_HEIGHT = 58;

const brands: Record<Provider, { name: string; background: string; accent: string }> = {
  claude: { name: "CLAUDE", background: "#311b16", accent: "#f59e67" },
  codex: { name: "CODEX", background: "#10283d", accent: "#55b7ff" },
  opencode: { name: "OPENCODE", background: "#241b3d", accent: "#b69cff" }
};

const states = {
  working: { background: "#0c3629", accent: "#34d399", label: "WORKING" },
  idle: { background: "#222934", accent: "#91a0b5", label: "IDLE" },
  attention: { background: "#4a2b09", accent: "#ffb020", label: "NEED YOU" }
};

// Escalation tints for usage keys. They override the provider brand so a nearly exhausted quota
// reads as a warning at a glance rather than as "the bar happens to be long".
const usageLevels = {
  warn: { background: "#40300d", accent: "#ffc247" },
  critical: { background: "#45161a", accent: "#ff6b6b" }
};

type UsageLevel = "normal" | "warn" | "critical";

/**
 * The window a single key should speak for: the one closest to its limit. Taking the last window
 * instead means a 5-hour quota at 99% hides behind a weekly one at 30% — the key stays calm at
 * exactly the moment it should not.
 */
export function leadingWindow(windows: readonly UsageWindow[]): UsageWindow | undefined {
  const quotas = windows.filter((window) => typeof window.percent === "number");
  if (!quotas.length) return windows.at(-1);
  return quotas.reduce((worst, window) => (Number(window.percent) > Number(worst.percent) ? window : worst));
}

/** The next window to roll over, across all of them. */
export function soonestReset(windows: readonly UsageWindow[]): UsageWindow | undefined {
  return windows
    .filter((window) => typeof window.resetsAt === "number")
    .sort((a, b) => Number(a.resetsAt) - Number(b.resetsAt))[0];
}

export function usageLevelFor(percent: number | undefined, config: DeckConfig): UsageLevel {
  if (typeof percent !== "number") return "normal";
  if (percent >= config.usageCriticalPercent) return "critical";
  if (percent >= config.usageWarnPercent) return "warn";
  return "normal";
}

export async function renderDeckBuffers(snapshot: DashboardSnapshot, page: number, config: DeckConfig): Promise<Buffer[]> {
  const buffers: Buffer[] = [];
  for (let index = 0; index < 8; index += 1) {
    buffers.push(await renderKeyModule(snapshot, config.keys[index] ?? "blank", page, config));
  }
  buffers.push(await renderInfoBar(snapshot, page, config));
  return buffers;
}

async function renderKeyModule(snapshot: DashboardSnapshot, module: KeyModule, page: number, config: DeckConfig): Promise<Buffer> {
  switch (module) {
    case "claude.status":
      return renderProviderKey(snapshot.providers.claude, config);
    case "codex.status":
      return renderProviderKey(snapshot.providers.codex, config);
    case "opencode.status":
      return renderProviderKey(snapshot.providers.opencode, config);
    case "claude.usage":
      return renderUsageKey(snapshot.providers.claude.usage, config);
    case "codex.usage":
      return renderUsageKey(snapshot.providers.codex.usage, config, Boolean(config.codexUsageUrl));
    case "opencode.usage":
      return renderUsageKey(snapshot.providers.opencode.usage, config);
    case "projects":
      return renderProjectsKey(snapshot);
    case "summary":
      return renderSummaryKey(snapshot);
    case "info":
      return renderInfoKey(page, config.infoBar.length);
    case "blank":
      return renderBlankKey();
    default: {
      const slot = sessionSlot(module);
      return slot === null ? renderBlankKey() : renderSessionKey(snapshot.ranked[slot] ?? null, slot);
    }
  }
}

/**
 * One concrete session: which project, what it is doing, and a tap that takes you there. This is
 * what turns "1 open" into an answer you can act on when several agents are running at once.
 */
export async function renderSessionKey(session: SessionSnapshot | null, slot: number): Promise<Buffer> {
  if (!session) {
    return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="15" fill="#14171f"/><text x="48" y="52" text-anchor="middle" fill="#39414f" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="13" font-weight="700">SLOT ${slot + 1}</text><text x="48" y="70" text-anchor="middle" fill="#2c333e" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="8">no session</text></svg>`, KEY_SIZE, KEY_SIZE);
  }

  const brand = brands[session.provider];
  const state = states[session.state];
  const label = session.label || `SESSION ${session.id.slice(-6)}`;
  // Long repo names need smaller type; the key is only 96px across.
  const labelSize = label.length > 11 ? 10 : label.length > 8 ? 12 : 14;
  const footer = isFocusable(session)
    ? (session.state === "attention" ? "tap to open" : "tap to focus")
    : (session.state === "attention" ? "tap to acknowledge" : "no window to raise");

  return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="15" fill="${state.background}"/><circle cx="13" cy="13" r="4" fill="${state.accent}"/><text x="83" y="17" text-anchor="end" fill="${brand.accent}" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="8" font-weight="800">${brand.name}</text><text x="48" y="47" text-anchor="middle" fill="#f3f6fa" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="${labelSize}" font-weight="800">${escapeXml(label)}</text><text x="48" y="68" text-anchor="middle" fill="${state.accent}" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="11" font-weight="900">${state.label}</text><text x="48" y="87" text-anchor="middle" fill="#718095" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="7">${footer}</text></svg>`, KEY_SIZE, KEY_SIZE);
}

export async function renderProviderKey(provider: ProviderSnapshot, config: DeckConfig = DEFAULT_CONFIG): Promise<Buffer> {
  const brand = brands[provider.provider];
  const state = states[provider.state];
  const detail = providerDetail(provider, config);
  // Only promise to open a window when there is one to open.
  const canFocus = config.focusOnTap && isFocusable(provider.primary);
  const footer = canFocus
    ? `tap to open ${brand.name.toLowerCase()}`
    : provider.state === "attention" ? "tap to acknowledge" : "live backend";
  return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="15" fill="${state.background}"/><circle cx="13" cy="13" r="4" fill="${state.accent}"/><text x="48" y="24" text-anchor="middle" fill="#f3f6fa" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="11" font-weight="800">${brand.name}</text><text x="48" y="54" text-anchor="middle" fill="${state.accent}" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="14" font-weight="900">${state.label}</text><text x="48" y="76" text-anchor="middle" fill="#c6d0dc" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="9" font-weight="600">${escapeXml(detail)}</text><text x="48" y="89" text-anchor="middle" fill="#718095" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="7">${footer}</text></svg>`, KEY_SIZE, KEY_SIZE);
}

/**
 * The line under the state label. A project name answers "which one?", which matters more than a
 * count once you have several sessions open; the count is appended only when it adds something.
 */
function providerDetail(provider: ProviderSnapshot, config: DeckConfig): string {
  const relevantCount = provider.state === "attention"
    ? provider.attentionCount
    : provider.state === "working"
      ? provider.workingCount
      : provider.openCount;

  const label = config.showProjectLabels ? provider.primary?.label : undefined;
  if (!label) {
    const noun = provider.state === "attention" ? "attention" : provider.state === "working" ? "active" : "open";
    return `${relevantCount} ${noun}`;
  }
  return relevantCount > 1 ? `${label} +${relevantCount - 1}` : label;
}

export async function renderUsageKey(usage: UsageSnapshot, config: DeckConfig = DEFAULT_CONFIG, opensLink = false): Promise<Buffer> {
  const brand = brands[usage.provider];
  const primary = leadingWindow(usage.windows);
  const isQuota = typeof primary?.percent === "number";
  const headline = primary ? formatUsageValue(primary) : "--";
  const label = primary?.label || "usage";
  const subtitle = usage.error && !usage.windows.length
    ? "data unavailable"
    : isQuota ? `${label} used` : `${label} tokens`;
  // A full bar under "--" reads as "quota exhausted"; with no window there is nothing to fill.
  const width = isQuota ? Math.round(70 * Number(primary?.percent) / 100) : primary ? 70 : 0;

  const level = usageLevelFor(primary?.percent, config);
  const palette = level === "normal" ? brand : usageLevels[level];
  // A stale reading must not be dressed up in warning colours; it is not a live measurement.
  const theme = usage.error ? brand : palette;

  // The soonest reset, which is the deadline you can act on — and the one the InfoBar shows, so
  // the two surfaces agree.
  const countdown = usage.error ? null : formatCountdown(soonestReset(usage.windows)?.resetsAt);
  // Do not offer a refresh the collector will refuse to perform.
  const pausedFor = typeof usage.retryAt === "number" ? formatCountdown(usage.retryAt) : null;
  const footer = usage.error
    ? (usage.windows.length ? (pausedFor ? `stale · paused ${pausedFor}` : "stale · tap refresh") : "data unavailable")
    : countdown
      ? `${label} · ${countdown} left`
      : usage.provider === "opencode" ? `${formatCurrency(usage.costUsd || 0)} / 7d` : subtitle;
  // The countdown line is longer than the plain label, so it gets a smaller type size.
  const footerSize = footer.length > 13 ? 8 : 9;
  // A key that opens a web page should say so; the countdown moves up to the subtitle slot.
  const hint = opensLink ? "tap for details ↗" : null;

  return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="15" fill="${theme.background}"/><circle cx="14" cy="14" r="4" fill="${theme.accent}"/><text x="48" y="25" text-anchor="middle" fill="#f7fafc" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="11" font-weight="800">${brand.name}</text><text x="48" y="59" text-anchor="middle" fill="${theme.accent}" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="24" font-weight="800">${escapeXml(headline)}</text><rect x="13" y="69" width="70" height="6" rx="3" fill="#ffffff24"/><rect x="13" y="69" width="${Math.max(0, Math.min(70, width))}" height="6" rx="3" fill="${theme.accent}"/><text x="48" y="${hint ? 84 : 88}" text-anchor="middle" fill="#bdc8d6" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="${footerSize}">${escapeXml(footer)}</text>${hint ? `<text x="48" y="93" text-anchor="middle" fill="#7a8798" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="7">${hint}</text>` : ""}</svg>`, KEY_SIZE, KEY_SIZE);
}

/**
 * How many separate pieces of work are live, and how many of them want something. Two agents in
 * one repository count once — the number answers "how many things am I juggling?", which a session
 * count does not. The tap clears every outstanding notice at once.
 */
export async function renderProjectsKey(snapshot: DashboardSnapshot): Promise<Buffer> {
  const projects = snapshot.projects;
  const waiting = projects.filter((project) => project.attention > 0).length;
  const background = waiting > 0 ? "#3c2710" : "#1b2430";
  const accent = waiting > 0 ? "#ffb020" : "#7fd1ff";
  // With a single project its name is more useful than the digit "1".
  const headline = projects.length === 1 ? projects[0].label : String(projects.length);
  const headlineSize = projects.length === 1 ? (headline.length > 10 ? 11 : 14) : 26;
  const detail = waiting > 0 ? `${waiting} need you` : projects.length === 1 ? "1 project" : "all quiet";
  const footer = waiting > 0 ? "tap to clear all" : "projects";

  return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="15" fill="${background}"/><circle cx="13" cy="13" r="4" fill="${accent}"/><text x="48" y="26" text-anchor="middle" fill="#cfd9e6" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="10" font-weight="800">PROJECTS</text><text x="48" y="${projects.length === 1 ? 58 : 62}" text-anchor="middle" fill="${accent}" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="${headlineSize}" font-weight="900">${escapeXml(headline)}</text><text x="48" y="76" text-anchor="middle" fill="#c6d0dc" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="9" font-weight="600">${escapeXml(detail)}</text><text x="48" y="89" text-anchor="middle" fill="#718095" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="7">${footer}</text></svg>`, KEY_SIZE, KEY_SIZE);
}

export async function renderSummaryKey(snapshot: DashboardSnapshot): Promise<Buffer> {
  const attention = snapshot.attentionCount > 0;
  const background = attention ? "#3c2710" : "#202339";
  return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="15" fill="${background}"/><text x="48" y="23" text-anchor="middle" fill="#c9d2ff" font-family="-apple-system,sans-serif" font-size="11" font-weight="800">ALL AGENTS</text><text x="31" y="55" text-anchor="middle" fill="#71c7ff" font-family="-apple-system,sans-serif" font-size="22" font-weight="900">${snapshot.openCount}</text><text x="67" y="55" text-anchor="middle" fill="#ffb020" font-family="-apple-system,sans-serif" font-size="22" font-weight="900">${snapshot.attentionCount}</text><text x="31" y="72" text-anchor="middle" fill="#aab6c7" font-family="-apple-system,sans-serif" font-size="8">OPEN</text><text x="67" y="72" text-anchor="middle" fill="#aab6c7" font-family="-apple-system,sans-serif" font-size="8">NEED YOU</text><text x="48" y="88" text-anchor="middle" fill="#717f94" font-family="-apple-system,sans-serif" font-size="8">tap overview</text></svg>`, KEY_SIZE, KEY_SIZE);
}

export async function renderInfoKey(page: number, total: number): Promise<Buffer> {
  return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="15" fill="#251d45"/><circle cx="48" cy="42" r="23" fill="none" stroke="#a78bfa" stroke-width="4"/><text x="48" y="51" text-anchor="middle" fill="#d9ceff" font-family="Georgia,serif" font-size="28" font-weight="700">i</text><text x="48" y="82" text-anchor="middle" fill="#a99bcf" font-family="-apple-system,sans-serif" font-size="10" font-weight="700">INFO ${page + 1}/${total}</text></svg>`, KEY_SIZE, KEY_SIZE);
}

export async function renderBlankKey(): Promise<Buffer> {
  return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="15" fill="#14171f"/></svg>`, KEY_SIZE, KEY_SIZE);
}

export async function renderInfoBar(snapshot: DashboardSnapshot, page: number, config: DeckConfig): Promise<Buffer> {
  const module = config.infoBar[page] ?? config.restingPage;
  if (module === "claude" || module === "codex" || module === "opencode") return usageBar(snapshot.providers[module].usage);
  if (module === "sessions") return sessionListBar(snapshot);
  return sessionsBar(snapshot);
}

/**
 * The only surface wide enough for real names. A key can show one project in abbreviated type;
 * 248px shows three, with the state colour carrying the urgency so the eye finds the amber one.
 */
async function sessionListBar(snapshot: DashboardSnapshot): Promise<Buffer> {
  const shown = snapshot.ranked.slice(0, 3);
  const overflow = snapshot.ranked.length - shown.length;

  if (!shown.length) {
    return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="248" height="58"><rect width="248" height="58" rx="9" fill="#171b2d"/><text x="13" y="19" fill="#e8ecff" font-family="-apple-system,sans-serif" font-size="13" font-weight="900">SESSIONS</text><text x="235" y="18" text-anchor="end" fill="#8e9bb0" font-family="-apple-system,sans-serif" font-size="7">Claude · Codex · OpenCode</text><text x="13" y="44" fill="#6c7a90" font-family="-apple-system,sans-serif" font-size="13">no live sessions</text></svg>`, BAR_WIDTH, BAR_HEIGHT);
  }

  const columnWidth = 248 / shown.length;
  const entries = shown.map((session, index) => {
    const x = Math.round(index * columnWidth) + 13;
    const state = states[session.state];
    const brand = brands[session.provider];
    const name = truncate(session.label || brand.name, shown.length >= 3 ? 11 : 16);
    return `<circle cx="${x + 4}" cy="34" r="4" fill="${state.accent}"/>`
      + `<text x="${x + 14}" y="38" fill="#e7edf6" font-family="-apple-system,sans-serif" font-size="12" font-weight="800">${escapeXml(name)}</text>`
      + `<text x="${x + 14}" y="50" fill="${brand.accent}" font-family="-apple-system,sans-serif" font-size="7" font-weight="700">${brand.name}</text>`;
  }).join("");

  const caption = overflow > 0 ? `+${overflow} more` : "Claude · Codex · OpenCode";
  return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="248" height="58"><rect width="248" height="58" rx="9" fill="#171b2d"/><text x="13" y="19" fill="#e8ecff" font-family="-apple-system,sans-serif" font-size="13" font-weight="900">SESSIONS</text><text x="235" y="18" text-anchor="end" fill="#8e9bb0" font-family="-apple-system,sans-serif" font-size="7">${escapeXml(caption)}</text>${entries}</svg>`, BAR_WIDTH, BAR_HEIGHT);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

async function usageBar(usage: UsageSnapshot): Promise<Buffer> {
  const brand = brands[usage.provider];
  const first = usage.windows[0] || { label: "--", value: 0, resetsAt: null };
  const second = usage.windows[1] || first;
  // The InfoBar has room for the exact wording, so it names the window that is resetting.
  const soonest = soonestReset(usage.windows);
  const countdown = usage.error ? null : formatCountdown(soonest?.resetsAt);
  const pausedFor = typeof usage.retryAt === "number" ? formatCountdown(usage.retryAt) : null;
  const caption = usage.error
    ? (usage.windows.length ? (pausedFor ? `last known · retrying in ${pausedFor}` : "last known · refresh failed") : "data unavailable")
    : countdown
      ? `${soonest?.label ?? "quota"} resets in ${countdown}`
      : usage.provider === "opencode" ? "local token usage" : "live plan usage";
  return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="248" height="58"><rect width="248" height="58" rx="9" fill="${brand.background}"/><circle cx="13" cy="12" r="4" fill="${brand.accent}"/><text x="23" y="17" fill="#f5f7fb" font-family="-apple-system,sans-serif" font-size="13" font-weight="900">${brand.name}</text><text x="236" y="17" text-anchor="end" fill="#aeb9c8" font-family="-apple-system,sans-serif" font-size="8">${escapeXml(caption)}</text>${usageMetric(12, 30, first, brand.accent)}${usageMetric(134, 30, second, brand.accent)}</svg>`, BAR_WIDTH, BAR_HEIGHT);
}

function usageMetric(x: number, y: number, window: UsageWindow, accent: string): string {
  const value = formatUsageValue(window);
  if (typeof window.percent !== "number") {
    return `<text x="${x}" y="${y}" fill="#cbd4df" font-family="-apple-system,sans-serif" font-size="9" font-weight="700">${escapeXml(window.label.toUpperCase())}</text><text x="${x}" y="${y + 20}" fill="${accent}" font-family="-apple-system,sans-serif" font-size="17" font-weight="900">${escapeXml(value)}</text><text x="${x + 49}" y="${y + 19}" fill="#9eabba" font-family="-apple-system,sans-serif" font-size="8">TOKENS</text>`;
  }
  const width = Math.round(70 * window.percent / 100);
  return `<text x="${x}" y="${y}" fill="#cbd4df" font-family="-apple-system,sans-serif" font-size="9" font-weight="700">${escapeXml(window.label.toUpperCase())}</text><text x="${x + 70}" y="${y}" text-anchor="end" fill="${accent}" font-family="-apple-system,sans-serif" font-size="11" font-weight="900">${escapeXml(value)}</text><rect x="${x}" y="${y + 7}" width="70" height="6" rx="3" fill="#ffffff24"/><rect x="${x}" y="${y + 7}" width="${Math.max(0, Math.min(70, width))}" height="6" rx="3" fill="${accent}"/>`;
}

async function sessionsBar(snapshot: DashboardSnapshot): Promise<Buffer> {
  return svgToRgba(`<svg xmlns="http://www.w3.org/2000/svg" width="248" height="58"><rect width="248" height="58" rx="9" fill="#171b2d"/><text x="13" y="19" fill="#e8ecff" font-family="-apple-system,sans-serif" font-size="13" font-weight="900">ALL AGENTS</text><text x="235" y="18" text-anchor="end" fill="#8e9bb0" font-family="-apple-system,sans-serif" font-size="7">Claude · Codex · OpenCode</text>${counter(18, snapshot.openCount, "OPEN", "#71c7ff")}${counter(96, snapshot.workingCount, "WORK", "#34d399")}${counter(174, snapshot.attentionCount, "NEED YOU", "#ffb020")}</svg>`, BAR_WIDTH, BAR_HEIGHT);
}

function counter(x: number, value: number, label: string, color: string): string {
  return `<text x="${x}" y="47" fill="${color}" font-family="-apple-system,sans-serif" font-size="22" font-weight="900">${value}</text><text x="${x + 25}" y="46" fill="#aeb8c7" font-family="-apple-system,sans-serif" font-size="8" font-weight="700">${label}</text>`;
}

export function formatCompactNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${trimDecimal(value / 1_000_000_000)}B`;
  if (absolute >= 1_000_000) return `${trimDecimal(value / 1_000_000)}M`;
  if (absolute >= 1_000) return `${trimDecimal(value / 1_000)}K`;
  return String(Math.round(value));
}

function formatUsageValue(window: UsageWindow): string {
  if (typeof window.percent === "number") return `${Math.round(window.percent)}%`;
  if (window.unit === "usd") return formatCurrency(window.value || 0);
  return formatCompactNumber(window.value || 0);
}

function formatCurrency(value: number): string {
  return `$${value < 0.01 ? value.toFixed(3) : value.toFixed(2)}`;
}

function trimDecimal(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

async function svgToRgba(svg: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(width, height).ensureAlpha().raw().toBuffer();
}

function escapeXml(value: string): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character] || character);
}
