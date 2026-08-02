import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DeckConfig } from "../config.js";
import type { DashboardSnapshot, Provider } from "../types.js";

const execFileAsync = promisify(execFile);

const PROVIDER_TITLES: Record<Provider, string> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode"
};

/** Do not re-notify for the same provider more often than this, however it flaps. */
const RENOTIFY_INTERVAL_MS = 60_000;

/**
 * Fires a desktop notification when a session newly starts waiting on you. State lives here so the
 * deck loop stays a pure render pass. Edges are tracked per session key, so a second agent asking
 * for you while a first is still unacknowledged is announced rather than swallowed; the cooldown
 * that follows is per provider, which bounds how noisy a flapping backend can get.
 */
export class AttentionNotifier {
  private readonly waitingKeys = new Map<Provider, Set<string>>();
  private readonly lastNotifiedAt = new Map<Provider, number>();
  private permissionWarned = false;
  private primed = false;

  /**
   * @param deliver Overridable so tests can exercise the transition rules without shelling out to
   *                osascript. Production leaves it at the default.
   */
  constructor(
    private readonly config: DeckConfig,
    private readonly deliver: (title: string, body: string) => Promise<void> = (title, body) => this.post(title, body)
  ) {}

  /** Call once per refresh. Returns the providers it actually notified for. */
  async handle(snapshot: DashboardSnapshot, now = Date.now()): Promise<Provider[]> {
    const fired: Provider[] = [];
    // The first pass only records the world as it is. Otherwise every login, replug, or service
    // restart would announce sessions that have been waiting quietly for hours.
    const seeding = !this.primed;
    this.primed = true;

    for (const provider of Object.keys(snapshot.providers) as Provider[]) {
      const view = snapshot.providers[provider];
      const waiting = view.sessions.filter((session) => session.state === "attention");
      const previous = this.waitingKeys.get(provider) ?? new Set<string>();
      const current = new Set(waiting.map((session) => session.key));
      this.waitingKeys.set(provider, current);

      // Edge per session, not per provider: with one session already waiting the provider never
      // leaves "attention", so a second one starting to wait would otherwise be silent.
      const fresh = waiting.filter((session) => !previous.has(session.key));
      if (seeding || !fresh.length) continue;
      if (!this.config.notifyOnAttention) continue;
      if (now - (this.lastNotifiedAt.get(provider) ?? 0) < RENOTIFY_INTERVAL_MS) continue;

      this.lastNotifiedAt.set(provider, now);
      const label = fresh[0].label;
      const extra = fresh.length > 1 ? ` (+${fresh.length - 1})` : "";
      await this.deliver(`${PROVIDER_TITLES[provider]}${label ? ` · ${label}` : ""}${extra}`, "Waiting for you");
      fired.push(provider);
    }
    return fired;
  }

  private async post(title: string, body: string): Promise<void> {
    if (process.platform !== "darwin") return;
    // Strip quotes and backslashes: both values reach AppleScript as string literals.
    const safeTitle = sanitize(title);
    const safeBody = sanitize(body);
    try {
      await execFileAsync(
        "/usr/bin/osascript",
        ["-e", `display notification "${safeBody}" with title "${safeTitle}"`],
        { timeout: 5_000 }
      );
    } catch (error) {
      if (!this.permissionWarned) {
        this.permissionWarned = true;
        const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
        console.warn(`Notification failed (${message}); allow notifications for the script runner or set notifyOnAttention to false.`);
      }
    }

    if (!this.config.attentionSound) return;
    // Not awaited: the default sound runs about 1.5s and this sits inside the render loop, so
    // waiting for it would blank the deck for the length of the chime.
    void execFileAsync("/usr/bin/afplay", [`/System/Library/Sounds/${this.config.attentionSound}.aiff`], { timeout: 10_000 })
      .catch(() => {
        // A missing or renamed system sound must not interrupt the render loop.
      });
  }
}

function sanitize(value: string): string {
  return value.replace(/["\\]/g, "").replace(/[\r\n]+/g, " ").slice(0, 120);
}
