import { sessionSlot, type DeckConfig } from "./config.js";
import type { Provider } from "./types.js";

export type InputAction =
  | { type: "acknowledge-provider"; provider: Provider; forceUsage: false }
  | { type: "focus-session"; slot: number; forceUsage: false }
  | { type: "acknowledge-all"; forceUsage: false }
  | { type: "open-url"; url: string; forceUsage: false }
  | { type: "cycle-info"; delta: -1 | 1; forceUsage: false }
  | { type: "show-agents"; forceUsage: true }
  | { type: "refresh"; forceUsage: boolean };

export function actionForControl(index: number, config: DeckConfig): InputAction {
  if (index === 8) return { type: "cycle-info", delta: -1, forceUsage: false };
  if (index === 9) return { type: "cycle-info", delta: 1, forceUsage: false };
  const module = index >= 0 && index < 8 ? config.keys[index] : undefined;
  switch (module) {
    case "claude.status":
      return { type: "acknowledge-provider", provider: "claude", forceUsage: false };
    case "codex.status":
      return { type: "acknowledge-provider", provider: "codex", forceUsage: false };
    case "opencode.status":
      return { type: "acknowledge-provider", provider: "opencode", forceUsage: false };
    case "codex.usage":
      // Codex usage is read from local files, so a forced refresh buys nothing the 3s poll does
      // not already do. The tap is worth more as a jump to the page behind the number.
      return config.codexUsageUrl
        ? { type: "open-url", url: config.codexUsageUrl, forceUsage: false }
        : { type: "refresh", forceUsage: true };
    case "claude.usage":
    case "opencode.usage":
      return { type: "refresh", forceUsage: true };
    case "projects":
      return { type: "acknowledge-all", forceUsage: false };
    case "summary":
      return { type: "show-agents", forceUsage: true };
    case "info":
      return { type: "cycle-info", delta: 1, forceUsage: false };
    case "blank":
      return { type: "refresh", forceUsage: false };
    default: {
      const slot = module ? sessionSlot(module) : null;
      return slot === null ? { type: "refresh", forceUsage: false } : { type: "focus-session", slot, forceUsage: false };
    }
  }
}
