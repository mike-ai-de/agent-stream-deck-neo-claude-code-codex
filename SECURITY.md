# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's **Security** tab and
its private vulnerability reporting flow. Do not open a public issue for a
suspected vulnerability or include credentials, session content, or local
database files in a report.

Include the affected version, expected impact, and the smallest reproduction
you can share safely. Reports will be acknowledged as soon as possible and
coordinated fixes will be published through a tagged release.

## Sensitive local data

The application reads local Claude Code and Codex session metadata. It does not
read, store, or transmit provider credentials. Do not put tokens into repository
files, screenshots, logs, or issue reports.

Debug reports should contain only the output of `npm run doctor` or
`npm run status`; never attach files from `~/.claude`, `~/.codex`, macOS
Keychain, Windows credential storage, `~/.neo-agent-deck`, or
`~/.ssh`. Review even sanitized output before publishing it.
