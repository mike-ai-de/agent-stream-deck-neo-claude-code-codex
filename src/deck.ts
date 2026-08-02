import { setTimeout as delay } from "node:timers/promises";
import { DeviceModelId, listStreamDecks, openStreamDeck, type StreamDeck } from "@elgato-stream-deck/node";
import { Dashboard } from "./dashboard.js";
import { actionForControl } from "./input.js";
import { focusSession } from "./lib/focus.js";
import { AttentionNotifier } from "./lib/notify.js";
import { renderDeckBuffers } from "./render.js";
import type { SessionSnapshot } from "./types.js";

const POLL_INTERVAL_MS = 3_000;
const DEVICE_SCAN_INTERVAL_MS = 5_000;

export class NeoAgentDeck {
  private readonly dashboard = new Dashboard();
  private readonly notifier = new AttentionNotifier(this.dashboard.config);
  private deck: StreamDeck | null = null;
  private timer: NodeJS.Timeout | null = null;
  private rendering = false;
  private running = false;
  private disconnectResolve: (() => void) | null = null;
  private lastWaitingReason = "";
  private lastRefreshError = "";

  async start(): Promise<void> {
    this.running = true;
    while (this.running) {
      const connected = await this.connect();
      if (!this.running) break;
      if (!connected) await delay(DEVICE_SCAN_INTERVAL_MS);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.disconnect();
  }

  private async connect(): Promise<boolean> {
    let devices;
    try {
      devices = await listStreamDecks();
    } catch (error) {
      this.reportWaiting(`USB scan failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    const neo = devices.find((device) => device.model === DeviceModelId.NEO);
    if (!neo) {
      this.reportWaiting("Neo not connected; waiting for USB device.");
      return false;
    }

    try {
      this.deck = await openStreamDeck(neo.path, { resetToLogoOnClose: true });
    } catch {
      this.reportWaiting("Neo detected but busy; quit the Elgato Stream Deck app.");
      return false;
    }

    this.lastWaitingReason = "";
    this.deck.on("error", (error) => void this.handleDeviceError(error));
    this.deck.on("down", (control) => void this.onKeyDown(control.index));
    try {
      await this.deck.setBrightness(Math.max(0, Math.min(100, this.dashboard.config.brightness)));
      await this.refresh(true);
    } catch (error) {
      await this.handleDeviceError(error);
      return false;
    }
    this.timer = setInterval(() => void this.refresh(false).catch((error) => this.handleDeviceError(error)), POLL_INTERVAL_MS);
    console.log("Neo connected; live dashboard active.");
    await new Promise<void>((resolve) => {
      this.disconnectResolve = resolve;
    });
    return true;
  }

  private async handleDeviceError(error: unknown): Promise<void> {
    if (!this.deck) return;
    console.warn(`Neo disconnected: ${error instanceof Error ? error.message : String(error)}`);
    await this.disconnect();
  }

  private async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const deck = this.deck;
    this.deck = null;
    if (deck) {
      try {
        await deck.close();
      } catch {
        // The HID handle can already be gone after unplugging the device.
      }
    }
    const resolve = this.disconnectResolve;
    this.disconnectResolve = null;
    resolve?.();
  }

  private reportWaiting(reason: string): void {
    if (reason === this.lastWaitingReason) return;
    this.lastWaitingReason = reason;
    console.log(reason);
  }

  private async onKeyDown(key: number): Promise<void> {
    try {
      const config = this.dashboard.config;
      const action = actionForControl(key, config);
      if (action.type === "acknowledge-provider") {
        // Acknowledging says "I have seen it"; raising the window is how you act on it. Doing both
        // on one tap keeps the deck a control surface rather than a read-only display.
        const view = this.dashboard.current().providers[action.provider];
        if (config.focusOnTap && view.state === "attention") this.raise(view.primary, action.provider);
        this.dashboard.acknowledgeProvider(action.provider);
      } else if (action.type === "focus-session") {
        // A session key names one concrete session, so the tap goes straight there whatever its
        // state — this is the "jump to my agent" control, not just an acknowledgement.
        const session = this.dashboard.sessionAt(action.slot);
        if (session) {
          if (config.focusOnTap) this.raise(session, session.label || session.key);
          this.dashboard.acknowledgeSession(session);
        }
      } else if (action.type === "cycle-info") {
        this.dashboard.state.nextInfoPage(action.delta);
      } else if (action.type === "show-agents") {
        const allIndex = config.infoBar.indexOf("all");
        this.dashboard.state.setInfoPage(allIndex >= 0 ? allIndex : config.infoBar.indexOf(config.restingPage));
      }
      await this.refresh(action.forceUsage);
    } catch (error) {
      console.error("Button action failed:", error);
    }
  }

  /**
   * Raises a session's window without blocking the key press. The first AppleScript against a
   * given application makes macOS raise a consent dialog, and osascript sits there until someone
   * answers it — awaiting that would freeze the deck for the whole timeout on the very tap that
   * is supposed to feel instant.
   */
  private raise(session: SessionSnapshot | null, describe: string): void {
    void focusSession(session)
      .then((result) => {
        if (!result.focused) console.warn(`Could not raise ${describe}: ${result.detail}`);
      })
      .catch((error) => {
        console.warn(`Could not raise ${describe}: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  private async refresh(forceUsage: boolean): Promise<void> {
    const deck = this.deck;
    if (!deck || this.rendering) return;
    this.rendering = true;
    try {
      let buffers: Awaited<ReturnType<typeof renderDeckBuffers>>;
      try {
        const snapshot = await this.dashboard.collect(forceUsage);
        // Announce before drawing: the notification is the point of the feature when you are not
        // looking at the deck, and a render failure should not swallow it.
        await this.notifier.handle(snapshot);
        const page = this.dashboard.state.data.infoPage;
        buffers = await renderDeckBuffers(snapshot, page, this.dashboard.config);
      } catch (error) {
        // Collector/render failures are not device failures; skip this frame. Deduplicate the
        // message so a persistent failure does not grow the log file every POLL_INTERVAL_MS.
        const message = error instanceof Error ? error.message : String(error);
        if (message !== this.lastRefreshError) {
          this.lastRefreshError = message;
          console.warn(`Refresh skipped: ${message}`);
        }
        return;
      }
      // The device may have disconnected (or reconnected) while we were collecting.
      if (this.deck !== deck) return;
      await Promise.all(buffers.slice(0, 8).map((buffer, key) => deck.fillKeyBuffer(key, buffer, { format: "rgba" })));
      await deck.fillLcd(0, buffers[8], { format: "rgba" });
      this.lastRefreshError = "";
    } finally {
      this.rendering = false;
    }
  }
}
