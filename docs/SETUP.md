# Agent Stream Deck Neo Claude Code & Codex — setup guide

This guide covers installation, backend discovery, key layout, InfoBar rotation, and platform-specific behavior for Agent Stream Deck Neo Claude Code & Codex.

## Prerequisites

- macOS, Windows 10+, or Linux with a systemd user session.
- Node.js 22.x or Node.js 24+ (`node --version`). Node 23 is unsupported.
- An Elgato Stream Deck Neo. It may stay disconnected during setup.
- A local Claude Code or Codex installation.
- On macOS and Windows, close Elgato Stream Deck while this application controls the device. The installers do this automatically.

## Install

Clone this repository, enter it, then run the guided installer:

```bash
git clone https://github.com/mike-ai-de/agent-stream-deck-neo-claude-code-codex.git
cd agent-stream-deck-neo-claude-code-codex
./install.sh                 # macOS or Linux
```

On Windows, use `\.\install.cmd` for the third command. The guide checks Node.js, installs dependencies, opens the setup UI, and installs the matching per-user login service.

To try the dashboard without installing a service:

```bash
npm ci
npm run doctor
npm run preview:live
npm run dev
```

`doctor` works without a connected Neo. It checks the platform, USB access, expected Claude/Codex data, and both collectors without printing session content or credentials.

### macOS

```bash
npm run install:mac
launchctl kickstart -k gui/$UID/com.neo-agent-deck
tail -f ~/Library/Logs/NeoAgentDeck.log
npm run uninstall:mac
```

The installer copies the built application to `~/.local/share/neo-agent-deck` and creates the per-user `com.neo-agent-deck` launch agent. No administrator password is required.

### Windows

```powershell
npm run install:win
Get-Content "$HOME\.neo-agent-deck\logs\NeoAgentDeck.log" -Wait
npm run uninstall:win
```

The installer copies the app to `%LOCALAPPDATA%\NeoAgentDeck` and creates a hidden per-user Startup entry. Configuration remains in `%USERPROFILE%\.neo-agent-deck` after uninstalling.

### Linux

```bash
npm run install:linux
systemctl --user status neo-agent-deck.service
journalctl --user -u neo-agent-deck.service -f
npm run uninstall:linux
```

The installer creates a systemd user service and installs the Stream Deck udev rule. Installing missing `libusb`/`libudev` packages and the udev rule are the only steps that may request `sudo`; the application never runs as root.

## Windows and WSL

Native Windows uses `%USERPROFILE%\.claude` and `%USERPROFILE%\.codex`. To read agent data stored in WSL, persist UNC paths before installing:

```powershell
$distro = "Ubuntu-24.04"
$linuxUser = "your-linux-user"

$env:CLAUDE_CONFIG_DIR = "\\wsl.localhost\$distro\home\$linuxUser\.claude"
$env:CODEX_HOME = "\\wsl.localhost\$distro\home\$linuxUser\.codex"

[Environment]::SetEnvironmentVariable("CLAUDE_CONFIG_DIR", $env:CLAUDE_CONFIG_DIR, "User")
[Environment]::SetEnvironmentVariable("CODEX_HOME", $env:CODEX_HOME, "User")

npm run doctor
npm run install:win
```

The dashboard reads those files through the UNC shares. Window focusing remains unavailable on Windows, including for WSL processes.

## Backend locations

| Provider | Default data directory | Environment override |
| --- | --- | --- |
| Claude Code | `~/.claude` | `CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex` | `CODEX_HOME` |

The collectors read lifecycle, timestamps, working directories, and aggregate usage values. They do not render prompts or responses.

## Configuration

Configuration lives in `~/.neo-agent-deck/config.json`; set `NEO_AGENT_DECK_HOME` to override the directory. Runtime acknowledgement and page state live next to it in `state.json`.

```bash
npm run setup              # edit keys, InfoBar, resting page, and brightness
npm run setup -- --print   # print effective JSON
npm run setup -- --default # restore the default
npm run setup -- --reset   # alias for --default
```

The default configuration is:

```json
{
  "brightness": 70,
  "keys": [
    "codex.status", "codex.usage", "claude.status", "summary",
    "session.1", "session.2", "projects", "info"
  ],
  "infoBar": ["sessions", "codex", "all"],
  "restingPage": "sessions",
  "usageWarnPercent": 80,
  "usageCriticalPercent": 95,
  "showProjectLabels": true,
  "focusOnTap": true,
  "notifyOnAttention": true,
  "attentionSound": "Submarine",
  "codexUsageUrl": "https://chatgpt.com/codex/cloud/settings/analytics"
}
```

Unknown key modules become blank tiles. Invalid thresholds, sounds, URLs, or pages fall back safely and cannot prevent startup. `codexUsageUrl` accepts only an absolute HTTPS URL; set it to `null` to disable browser opening. Set `attentionSound` to `null` for silence.

## Module reference

### Keys

| Module | Display | Tap action |
| --- | --- | --- |
| `claude.status` | Claude state and primary project | Focus primary session; acknowledge waiting Claude sessions |
| `codex.status` | Codex state and primary project | Focus primary session; acknowledge waiting Codex sessions |
| `codex.usage` | Local Codex rate-limit percentages | Open `codexUsageUrl` on macOS |
| `session.1` … `session.4` | A stable ranked session slot | Focus that session; acknowledge it if waiting |
| `projects` | Distinct live working directories | Acknowledge all waiting sessions |
| `summary` | Combined open and attention counts | Show the All Agents InfoBar page |
| `info` | Current InfoBar page | Move forward one page |
| `blank` | Dim empty tile | Refresh local state |

### InfoBar pages

| Module | Content |
| --- | --- |
| `sessions` | Names and states of up to three ranked live sessions |
| `codex` | Codex rate-limit windows |
| `all` | Combined open, working, and attention counts |

The left and right Neo touch points move backward and forward through the configured page list. Cycling wraps around.

## macOS-only integration

Session focus, terminal-tab selection, application raising, browser opening, desktop notifications, and the optional attention sound are implemented for macOS. The status dashboard, acknowledgement actions, local collection, rendering, and Stream Deck service work on every supported platform.

The first focus tap for an application can trigger a one-time Automation consent dialog. Approve it under **System Settings → Privacy & Security → Automation**, then tap again. The key handler remains responsive while macOS waits for that decision.

## Troubleshooting

1. Run `npm run doctor`.
2. Run `npm run status` for a sanitized collector summary.
3. Fully close Elgato Stream Deck on macOS or Windows; on Linux, verify the udev rule and reconnect the device.
4. Re-run the platform installer to rebuild and restart the service.
5. Inspect the platform log shown above. Never attach agent data directories, credentials, `~/.neo-agent-deck`, or SSH files to an issue.
