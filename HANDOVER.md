# Übergabe: neo-agent-deck auf diesem Mac

Stand: 2026-08-02. Arbeitsstand von Claude, zur Weiterarbeit durch Codex.

---

## 1. Was das ist

[neo-agent-deck](https://github.com/m-a-b-u/neo-agent-deck) (Upstream v0.3.1, MIT) macht aus einem
Elgato **Stream Deck Neo** ein Dashboard für Agent-Sessions (Claude Code, Codex, OpenCode).
Node/TypeScript, läuft als macOS-LaunchAgent, pollt alle 3 s lokale Session-Dateien, rendert
8 Tastenbilder (96×96) plus InfoBar (248×58) via sharp/SVG über USB-HID.

**Wichtig:** Der Dienst greift exklusiv auf das USB-Gerät zu. Die Elgato-Stream-Deck-App darf nicht
parallel laufen.

### Umgebung

| | |
|---|---|
| Quell-Klon | `/Users/claude/neo-agent-deck` |
| Branch | `feature/neo-erweiterungen` (8 Commits über `75afd9a`), Arbeitsverzeichnis sauber |
| Laufende Kopie | `~/.local/share/neo-agent-deck` (rsync-Kopie, wird bei `npm run install:mac` überschrieben) |
| Config | `~/.neo-agent-deck/config.json` |
| Backoff-Datei | `~/.neo-agent-deck/usage-backoff.json` |
| Token-Datei | `~/.neo-agent-deck/claude-token` (Modus 600) |
| LaunchAgent | `~/Library/LaunchAgents/com.neo-agent-deck.plist` |
| Logs | `~/Library/Logs/NeoAgentDeck.log` / `.error.log` |
| Node | v22.23.1 über fnm, x86_64 Mac (Intel/T2), macOS Darwin 24.6 |
| Gerät | Stream Deck Neo, VID `0x0fd9` / PID `0x009a`, erkannt |

### Installierte Agents

- **Claude Code** 2.1.220 (Desktop-App + CLI unter `/usr/local/bin/claude`) — läuft
- **Codex** — Sessiondaten in `~/.codex`, Wochenlimit aktuell 100 %
- **OpenCode** — **nicht installiert**

---

## 2. Erledigt

### 2.1 Grundinstallation

Der mitgelieferte `install.sh` verlangt ein TTY. Die drei Schritte wurden einzeln ausgeführt:
`npm ci`, `npm run setup -- --default`, `npm run install:mac`. Dienst läuft, Autostart aktiv.

**Fallstrick, der aktiv umgangen wurde:** `scripts/install-macos.sh` schreibt `NODE_BIN="$(command -v node)"`
in den LaunchAgent. Unter fnm ist das ein **temporärer Shell-Pfad**
(`~/.local/state/fnm_multishells/<pid>_<ts>/bin/node`), der einen Neustart nicht überlebt. Die
Installation lief deshalb mit vorangestelltem stabilen Pfad:

```bash
export PATH="/Users/claude/.local/share/fnm/node-versions/v22.23.1/installation/bin:$PATH"
npm run install:mac
```

Im Plist steht jetzt korrekt `/Users/claude/.local/share/fnm/node-versions/v22.23.1/installation/bin/node`.
**Wer ohne diesen Export neu installiert, zerschießt den Autostart.** Siehe Aufgabe 7.1.

### 2.2 Fremdproblem repariert: kaputte `claude`-CLI

Die npm-Installation vom 5. Juni war mitten im Vorgang abgebrochen und hinterließ zwei Leichen unter
`/usr/local/lib/node_modules/@anthropic-ai/`: ein Staging-Verzeichnis `.claude-code-1devilah` mit dem
vollständigen Binary (222.041.104 Bytes) und daneben eine auf 83.852.800 Bytes **abgeschnittene**
Kopie. Der Mach-O-Header verwies auf Segmente jenseits des Dateiendes → Kernel schickte SIGKILL
(`zsh: killed`). Zusätzlich fehlte im nativen Paket die `package.json`, weshalb der Postinstall den
500-Byte-Fehler-Stub liegen ließ — und der war nicht ausführbar, daher zuvor `permission denied`.

Behoben durch Entfernen beider Leichen und sauberen Neuinstall. Jetzt: **2.1.220**, gültig signiert
(`com.anthropic.claude-code`, Team `Q6L2SF6YDW`), Header und Dateigröße stimmen überein,
`claude --version` läuft.

> **Merke:** Auf dieser Maschine gibt es zwei npm-Prefixe. `/usr/local/bin/npm` (Homebrew, Node 25)
> installiert nach `/usr/local`; das fnm-npm nach
> `~/.local/share/fnm/node-versions/v22.23.1/installation`. `npm install -g` mit dem falschen npm
> meldet Erfolg und schreibt am Ziel vorbei.

### 2.3 Gebaute Features (alle auf dem Branch)

| Feature | Kern |
|---|---|
| **Reset-Countdown** | `resetsAt` wurde gesammelt, aber nie gezeigt. Usage-Kacheln zeigen `1w · 3d 2h left`, InfoBar `1w resets in 3d 2h`. Max. zwei Einheiten (`formatCountdown` in `src/lib/util.ts`). |
| **Schwellenwert-Warnung** | Ab `usageWarnPercent` (80) bernstein, ab `usageCriticalPercent` (95) rot. Veraltete Werte behalten die Markenfarbe, damit sie nie als Live-Messung durchgehen. |
| **Projekt-Kontext** | `SessionSnapshot` trägt `cwd`, `label`, `pid`, `entrypoint`. Claude aus der Session-Datei, Codex aus dem `session_meta`-Kopf der Rollout-Datei (gecacht). `/` und Home gelten nicht als Projekt → Fallback auf Session-Name. |
| **Fokus per Tap** | `src/lib/focus.ts`: aus `pid` den Prozessbaum hoch zu einem bekannten Terminal, `tty` holen, per AppleScript den konkreten Tab wählen (Terminal.app, iTerm). Andere Emulatoren: App aktivieren. `claude-desktop`-Entrypoint aktiviert die Claude-App. |
| **Notification + Ton** | `src/lib/notify.ts`: Flanke nach *attention*, Titel mit Projektnamen, 60 s Cooldown pro Provider, erster Durchlauf nach Start bleibt stumm. |
| **Session-Tasten** | Neue Module `session.1`..`session.4`: je **eine** konkrete Session statt Provider-Summe, sortiert wartend → arbeitend → untätig, dann Aktualität. Tap holt Fenster + quittiert. Ersetzt die OpenCode-Tasten. |
| **Sichere Token-Quelle** | `~/.neo-agent-deck/claude-token` (0600), gelesen nach ENV und Keychain. `npm run token:claude` speichert per Pipe oder verdeckter Eingabe und **prüft den Token sofort gegen den Endpunkt**. |
| **Usage-Backoff** | Eskalierend 5/10/20/40/60 min bei 401/403/429/5xx, respektiert `Retry-After`, gedeckelt auf 6 h. Persistiert in `usage-backoff.json`, damit `doctor`/`status`/Dienst dieselbe Wartezeit einhalten. |

### 2.4 Aktuelle Tastenbelegung

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ claude.status│ codex.status │  session.1   │   summary    │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ claude.usage │ codex.usage  │  session.2   │     info     │
└──────────────┴──────────────┴──────────────┴──────────────┘
InfoBar: claude → codex → all   (OpenCode-Seite entfernt)
```

### 2.5 Externer Review + Fixes

Ein unabhängiger Review fand 13 Befunde. Alle substanziellen sind behoben:

1. **Token-Leck (hoch).** `fetch` zitiert einen ungültigen Header-Wert in seiner `TypeError`-Meldung
   zurück; die landete direkt in `usage.error`, das `status`/`doctor` ausgeben. Reproduziert.
   Zweifach geschlossen: `isWellFormedToken()` prüft jede Quelle auf headertaugliche Zeichen,
   `redactTokens()` säubert den Fehlertext.
2. **Falsches Usage-Fenster.** `windows.at(-1)` war immer das Wochenfenster — ein 5-h-Kontingent bei
   99 % blieb unsichtbar, und der Countdown widersprach der InfoBar daneben. Jetzt `leadingWindow()`
   (höchster Prozentwert) und `soonestReset()`.
3. **Notification blockierte den Renderloop.** Lief mit gehaltenem `rendering`-Flag, Standardton
   1,5 s → Deck blind, Tastendrücke verschluckt. Jetzt nicht mehr awaited.
4. **Zweite wartende Session stumm.** Flanke lief pro Provider; jetzt pro Session-Key.
5. **Backoff-Off-by-one.** Counter wurde vor-inkrementiert und als Index benutzt → 5-Minuten-Stufe
   unerreichbar, Fehlerzähler bei 4 gedeckelt. Jetzt `backoffWaitMs()` als reine, getestete Funktion.
6. **Erzwungener Refresh blockiert.** Auch bei reinem Transportfehler, auf einer Taste die
   „tap refresh" versprach. Jetzt schneidet `forceUsage` durch lokale Pausen; die Kachel sagt
   `paused`, wenn sie es nicht tut.
7. **„tap to open" ohne Fenster.** Codex/OpenCode führen keinen Prozess. `isFocusable()` steuert jetzt
   die Beschriftung.
8. **Codex-Label-Cache vergiftet.** Ein transienter Lesefehler cachte `null` dauerhaft.
9. **Home-Verzeichnis-Erkennung POSIX-only.** Unter Windows/WSL wäre der Kontoname zum Label geworden.
10. Unescaptes SVG-Interpolat, fehlende Obergrenze im Backoff, `clearBackoff` erreichte den laufenden
    Dienst nicht, überholte Kommentare — alle korrigiert.

### 2.6 Verifiziert

- `npm run check`: **105 Tests grün**, 8 Dateien
- Dienst läuft, Fehlerlog leer
- Fokus-Logik gegen echte Terminal-Session (PID 627 unter `login` → `Terminal`) getestet
- Notification + Ton real ausgelöst
- Token-Leck reproduziert und Fix belegt
- Prozessübergreifender Backoff belegt: `status` meldet `paused ...; retrying in 39m` statt neuem 403

---

## 3. OFFEN — braucht einen Menschen, nicht Codex

### 3.1 Claude-Usage: fehlender OAuth-Scope

Die API antwortet definitiv:

```
403 OAuth token does not meet scope requirement user:profile
```

`claude setup-token` erzeugt einen **reinen Inferenz-Token**. Der Keychain-Eintrag
`Claude Code-credentials` führt zwar `user:profile` in `scopes`, aber `accessToken` **und**
`refreshToken` sind leere Strings, `expiresAt: 0` — die Desktop-App legt dort nur Metadaten ab.

**Lösung (nur interaktiv möglich):**

```bash
claude          # im Terminal, dann /login
npm run token:claude -- --clear
launchctl kickstart -k gui/$(id -u)/com.neo-agent-deck
```

Danach liest das Deck den Keychain, der Vorrang vor der Token-Datei hat.

> Codex soll **nicht** versuchen, das durch einen anderen Endpunkt, Header oder Token-Typ zu umgehen.
> Der Scope fehlt; das ist kein Bug im Repo.

### 3.2 Automation-Berechtigung

Beim ersten Tap auf eine wartende Kachel zeigt macOS den einmaligen Automation-Dialog.
`osascript` **blockiert** darauf (kein Fehler) — daher der 5-s-Timeout und der nicht-blockierende
Aufruf. Einmal bestätigen, dann sind Taps sofort.

### 3.3 Notification-Zustellung

Aus einem LaunchAgent erscheinen Benachrichtigungen ggf. als „Script Editor" in der
Mitteilungszentrale. Falls nichts ankommt: dort Zustellung erlauben.

---

## 4. OFFEN — Aufgaben für Codex

Nach Nutzen sortiert. Jede ist unabhängig umsetzbar.

### 4.1 `install-macos.sh` soll den Node-Pfad stabil auflösen (hoch)

**Datei:** `scripts/install-macos.sh`, Zeile 7.

```bash
NODE_BIN="$(command -v node)"
```

Unter fnm/nvm/volta ist das ein temporärer Per-Shell-Pfad. Nach einem Neustart zeigt der
LaunchAgent ins Leere und der Dienst startet nicht mehr. Fix:

```bash
NODE_BIN="$(readlink -f "$(command -v node)" 2>/dev/null || command -v node)"
```

Auf dieser Maschine liefert das `/Users/claude/.local/share/fnm/node-versions/v22.23.1/installation/bin/node` —
belegt korrekt. Bitte auch prüfen, ob `scripts/install-linux.sh` dasselbe Problem hat.
**Danach unbedingt `plutil -lint` und einen echten Reboot-Test bzw. `launchctl bootout`+`bootstrap`.**

### 4.2 Usage-Fetch blockiert weiterhin den Renderloop (mittel)

**Datei:** `src/deck.ts:159` — `await this.dashboard.collect(forceUsage)` innerhalb von `refresh()`,
das `this.rendering = true` hält. `collect()` wartet auf `ClaudeCollector.readUsage()` mit
`AbortSignal.timeout(10_000)`.

Auf einer langsamen Leitung friert das Deck alle 5 Minuten bis zu 10 s ein; in dieser Zeit
returnt jeder 3-s-Tick früh und **Tastendrücke zeichnen nichts**, weil `onKeyDown` mit
`await this.refresh(...)` endet.

Vorschlag: Usage-Abruf vom Render-Pfad entkoppeln — im Hintergrund aktualisieren und den Snapshot
aus dem zuletzt bekannten Wert bedienen. Die Notification wurde aus demselben Grund bereits
entkoppelt (`src/deck.ts`, `raise()` und der `void this.notifier.handle(...)`-Aufruf zeigen das
Muster).

### 4.3 Codex-Sessions fokussierbar machen (mittel)

**Dateien:** `src/collectors/codex.ts`, `src/lib/focus.ts`.

Weder Codex- noch OpenCode-Collector setzen `pid`. `isFocusable()` gibt daher `false` zurück und die
Kachel sagt korrekt „tap to acknowledge" statt „tap to open" — aber der eigentliche Ausbau fehlt.

**Achtung:** Codex' `session_meta` enthält **kein** `pid` (Felder: `session_id`, `id`, `timestamp`,
`cwd`, `originator`, `cli_version`, `source`, `thread_source`, `model_provider`,
`base_instructions`, `dynamic_tools`, `history_mode`, `context_window`, `git`). Ein Fix braucht also
Prozess-Discovery, z. B. laufende `codex`-Prozesse über `ps` suchen und per Arbeitsverzeichnis dem
`cwd` aus `session_meta` zuordnen. Bitte robust und ohne Shell-Interpolation
(`execFile` mit argv-Array, wie im bestehenden Code).

### 4.4 Slot-Stabilität der Session-Tasten (niedrig)

**Datei:** `src/dashboard.ts`, `rankSessions()`.

Primärer Sortierschlüssel nach dem Zustand ist `b.activityAt - a.activityAt`, der sich mit jeder
Nachricht ändert. Eine Kachel kann also zwischen zwei Frames (3 s) die Session wechseln — im
schlimmsten Fall genau während man danach greift. Der Tie-Break auf `key` greift nur bei exakt
gleichem Zeitstempel.

Idee: einen Slot an einen Session-Key binden, sobald er zugewiesen ist, und erst neu vergeben, wenn
die Session verschwindet oder eine dringendere auftaucht. Das Kommentar im Code beschreibt den
Ist-Zustand inzwischen korrekt — es geht um die Verbesserung, nicht um eine Lüge im Kommentar.

### 4.5 Kosmetik `renderSessionKey` (niedrig)

**Datei:** `src/render.ts`.

Ohne `label` fällt die Kachel auf den Provider-Namen zurück, der als Badge oben rechts ohnehin
schon steht — doppelt. Besser wäre ein neutraler Text oder die Session-ID-Kurzform.

### 4.6 Testlücken (niedrig)

Kein Test deckt `src/lib/focus.ts` (AppleScript-Pfade, Prozessbaum-Walk) und den Meta-Cache in
`src/collectors/codex.ts` ab. Beides ist mit Injektion testbar zu machen — `AttentionNotifier` zeigt
das Muster (`deliver` als überschreibbarer Parameter).

---

## 5. Regeln für die Weiterarbeit

1. **Keine Anfragen gegen `https://api.anthropic.com/api/oauth/usage` zum Ausprobieren.** Wir sind
   dort schon einmal in ein ~50-minütiges Rate-Limit gelaufen. Der Backoff ist genau dagegen gebaut;
   ihn per Hand zu umgehen macht es schlimmer.
2. **Token niemals ausgeben.** Nicht in Logs, nicht in Fehlermeldungen, nicht in Testausgaben. Der
   Testfehler, der genau das tat, ist gefixt (`readClaudeAccessToken` nimmt jetzt das
   Deck-Verzeichnis als Parameter) — bitte nicht rückgängig machen.
3. **AppleScript-Werte nur aus Allowlists.** `TERMINAL_APPS` und `APP_ENTRYPOINTS` in `focus.ts` sind
   fest kodiert, `tty` ist per Regex `^/dev/tty[a-z0-9]+$` geprüft, `attentionSound` per
   `^[A-Za-z0-9 _-]{1,40}$`. Kein Wert aus Config oder Session-Datei darf ungeprüft in ein Skript.
4. **Immer `execFile` mit argv-Array**, nie String-Interpolation in eine Shell.
5. **Nach jeder Änderung:** `npm run check` (Build + Typecheck Tests + Vitest) muss grün bleiben.
   Dann `npm run install:mac` **mit dem PATH-Export aus 2.1**, sonst kippt der Autostart.
6. Die laufende Kopie unter `~/.local/share/neo-agent-deck` nicht direkt editieren — sie wird bei
   jeder Installation überschrieben.

---

## 6. Befehle

```bash
cd /Users/claude/neo-agent-deck
export PATH="/Users/claude/.local/share/fnm/node-versions/v22.23.1/installation/bin:$PATH"

npm run check                  # Build + Typecheck + 105 Tests
npm run doctor                 # Plattform, Gerät, Sign-in, Dateien, Backends
npm run status                 # Live-Snapshot als Tabelle, ohne Neo
npm run preview -- --live x.png  # rendert den echten Deck-Zustand als PNG
npm run token:claude -- --check  # welche Token-Quelle greift
npm run install:mac            # baut, kopiert, registriert LaunchAgent, startet

launchctl kickstart -k gui/$(id -u)/com.neo-agent-deck   # Neustart
tail -f ~/Library/Logs/NeoAgentDeck.error.log            # Fehler mitlesen
```

Der Fortschritt lässt sich jederzeit visuell prüfen: `npm run preview -- --live` rendert den echten
Zustand inklusive der konfigurierten Belegung in eine PNG.
