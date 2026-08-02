import { sessionSlot, type DeckConfig } from "./config.js";
import type { Provider } from "./types.js";

export type InputAction =
  | { type: "acknowledge-provider"; provider: Provider }
  | { type: "focus-session"; slot: number }
  | { type: "acknowledge-all" }
  | { type: "open-url"; url: string }
  | { type: "cycle-info"; delta: -1 | 1 }
  | { type: "show-agents" }
  | { type: "refresh" };

export function actionForControl(index: number, config: DeckConfig): InputAction {
  if (index === 8) return { type: "cycle-info", delta: -1 };
  if (index === 9) return { type: "cycle-info", delta: 1 };
  const module = index >= 0 && index < 8 ? config.keys[index] : undefined;
  switch (module) {
    case "claude.status":
      return { type: "acknowledge-provider", provider: "claude" };
    case "codex.status":
      return { type: "acknowledge-provider", provider: "codex" };
    case "codex.usage":
      // Codex usage is read from local files, so a forced refresh buys nothing the 3s poll does
      // not already do. The tap is worth more as a jump to the page behind the number.
      return config.codexUsageUrl
        ? { type: "open-url", url: config.codexUsageUrl }
        : { type: "refresh" };
    case "projects":
      return { type: "acknowledge-all" };
    case "summary":
      return { type: "show-agents" };
    case "info":
      return { type: "cycle-info", delta: 1 };
    case "blank":
      return { type: "refresh" };
    default: {
      const slot = module ? sessionSlot(module) : null;
      return slot === null ? { type: "refresh" } : { type: "focus-session", slot };
    }
  }
}
