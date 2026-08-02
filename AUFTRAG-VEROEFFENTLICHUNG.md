# Auftrag an Codex: Bugcheck, Fokussierung, Veröffentlichung

Stand 2026-08-02. Ergänzt `HANDOVER.md`, ersetzt es nicht.

---

## 1. Was seit deinem letzten Commit passiert ist

Dein Commit `10cd5f4` wurde geprüft: Build und Typecheck sauber, alle Tests grün. Die vier
Übergabepunkte sind korrekt umgesetzt — `readlink -f` in beiden Installern, Usage-Abruf als
Single-Flight-Hintergrundjob, Codex-Prozesszuordnung über `ps` + `lsof -d cwd`, Slot-Pinning, plus
drei neue Testdateien. Der 256-KiB-Head-Read und die `originator`-Erkennung für Codex Desktop waren
gute Fänge.

Danach wurden zwei Dinge entschieden und umgesetzt:

**Claude-Usage aufgegeben.** Der Endpunkt `/api/oauth/usage` verlangt den Scope `user:profile`, den
nur ein interaktiver CLI-Login vergibt. Der [offizielle Fehlerkatalog](https://code.claude.com/docs/en/errors)
bestätigt Fehlerbild und Lösung wörtlich. Deine empfohlene Schrittfolge (`claude auth login --claudeai`)
ist korrekt — nachgeprüft, die Unterbefehle existieren mit genau diesen Flags. Ergänzung zu deiner
Diagnose: `claude auth status --text` meldet `Login: Expired`, nicht „nie angemeldet". Es gab also
einen CLI-Login, dessen Token abgelaufen ist; der Keychain-Eintrag ist seiner, mit geleertem Token
und stehengebliebenen Metadaten. Der Nutzer hat entschieden, die Kachel aufzugeben statt sich neu
anzumelden.

**Neue Belegung mit CTA auf jeder Taste** (Commit `fb91a51`):

| | Kachel | Tap |
|---|---|---|
| 1.1 | `codex.status` | springt in Codex, quittiert Wartendes |
| 1.2 | `codex.usage` | öffnet `codexUsageUrl` im Browser |
| 1.3 | `claude.status` | springt in Claude |
| 1.4 | `summary` | springt auf die All-Agents-Seite |
| 2.1 | `session.1` | springt in diese Session |
| 2.2 | `session.2` | springt in diese Session |
| 2.3 | `projects` | quittiert **alle** offenen Meldungen |
| 2.4 | `info` | blättert die InfoBar |

InfoBar: `sessions` → `codex` → `all`, Ruheseite `sessions`.

Neu dazugekommen: Modul `projects` (zählt Arbeitsverzeichnisse, nicht Sessions), InfoBar-Seite
`sessions` (nennt Sessions beim Namen, drei passen nebeneinander), Config-Feld `codexUsageUrl`,
Action-Typen `acknowledge-all` und `open-url`. Status-Kacheln springen jetzt bei jedem Tap, nicht
nur im Wartezustand.

---

## 2. Endstand, verifiziert

| | |
|---|---|
| Branch | `feature/neo-erweiterungen`, Arbeitsverzeichnis sauber |
| Commits über Upstream `75afd9a` | 10 |
| Tests | **125 grün**, 12 Dateien |
| Build + beide Typechecks | fehlerfrei |
| Dienst | läuft, Fehlerlog leer, stabiler Node-Pfad im Plist |
| Secrets in Repo oder Historie | **keine** — der einzige `sk-ant-`-Treffer ist ein bewusst erfundener Testwert in `test/extensions.test.ts:411` |

Beobachtung nebenbei: Codex' Wochenlimit hat sich zurückgesetzt, von 100 % auf 4 %, nächster Reset
in rund sieben Tagen. Die Schwellenwertfarben greifen dadurch belegt in beide Richtungen.

**Offen, aber nicht durch dich lösbar:** der interaktive `claude auth login --claudeai` und die
einmalige macOS-Automation-Bestätigung beim ersten Fokus-Tap. Beides braucht einen Menschen.

---

## 3. Der Auftrag

### Phase 0 — Bugcheck, bevor irgendetwas anderes passiert

Adversarialer Review des gesamten Branches gegen Upstream:

```bash
git diff 75afd9a..HEAD
```

Schwerpunkte, in dieser Reihenfolge:

1. **Sicherheit.** `src/lib/focus.ts` und `src/lib/notify.ts` bauen AppleScript-Strings;
   `openUrl` übergibt eine URL an `/usr/bin/open`; `attentionSound` wird zu einem Dateipfad.
   Prüfe jede Stelle, an der ein Wert aus Config, Session-Datei oder Prozessliste in ein Skript,
   einen Pfad oder eine Kommandozeile gelangt. Der letzte Review fand hier ein reales Token-Leck
   über `fetch`-Fehlermeldungen — such nach weiteren Pfaden, auf denen Werte in Logs, Renderings
   oder CLI-Ausgaben austreten können.
2. **Korrektheit.** Zustandsautomat des Usage-Backoffs (kann er dauerhaft klemmen?),
   `stabilizeSessionSlots`, `groupProjects`, `leadingWindow`/`soonestReset`, Randfälle in
   `formatCountdown` und `projectLabel`.
3. **Robustheit.** Unbehandelte Promise-Rejections, Ressourcenlecks, alles was den 3-Sekunden-Loop
   oder einen Tastendruck blockieren kann. `deck.ts` verzichtet an drei Stellen bewusst auf `await`
   (Fokus, Notification, URL) — prüfe, ob das überall konsistent und fehlerdicht ist.
4. **Konsistenz.** Widersprüche zwischen Code, Kommentaren, README und `HANDOVER.md`.

Melde jeden Fund mit Datei:Zeile, konkretem Fehlszenario (Eingabe → falsches Verhalten) und
Fixvorschlag. Verifiziere jeden Fund am Code, bevor du ihn meldest — keine Spekulation. Behebe alles
Substanzielle und halte `npm run check` grün.

### Phase 1 — Repo-Hygiene für die Veröffentlichung

**Zuerst, und das ist die gefährlichste Stelle:** `origin` zeigt weiterhin auf
`https://github.com/m-a-b-u/neo-agent-deck.git`. Ein `git push` würde auf ein **fremdes**
Repository zielen. Lege das Fork-Remote an, bevor du irgendetwas pushst.

Weiter:

- `HANDOVER.md` und diese Datei enthalten Maschinenpfade (`/Users/claude/...`, fnm-Versionspfade).
  Entweder aus dem öffentlichen Stand entfernen oder generisch umschreiben. Sie gehören nicht in
  ein öffentliches Repo.
- `package.json`: `repository`, `bugs`, `homepage` zeigen auf das Upstream-Repo, `private: true`,
  `author: Manuel Burgschachner`. Auf den Fork umstellen, Autorenfeld sauber lösen (siehe unten).
- Alle 10 Commits sind als `Claude Code <claude@MacBookPro.fritz.box>` signiert — ein privater
  Hostname. Setze für künftige Commits eine saubere Identität. Eine Historien-Umschreibung
  empfehle ich **nicht**; der Nutzen wiegt das Risiko nicht auf.
- `.github/workflows/release.yml` läuft auf Tags mit `contents: write` und legt Releases an.
  Prüfen, ob das im Fork gewollt ist, sonst deaktivieren.

**Lizenz — nicht verhandelbar:** Das Projekt steht unter MIT, `Copyright (c) 2026 Manuel
Burgschachner`. Diese Zeile **bleibt unverändert** in `LICENSE`. Ergänze eine eigene
Copyright-Zeile für die eigenen Änderungen darunter. Die README muss oben sichtbar sagen, dass dies
ein Fork von [m-a-b-u/neo-agent-deck](https://github.com/m-a-b-u/neo-agent-deck) ist, mit Link.
MIT erlaubt den Fork ausdrücklich — aber nur mit erhaltener Urheberrechts- und Lizenzangabe.

### Phase 2 — Fokus auf Claude und Codex

OpenCode ist auf dieser Maschine nicht installiert und aus der Belegung verschwunden, aber im Code
noch überall präsent: **20 Dateien** enthalten OpenCode-Bezüge, darunter ein eigener Collector,
Typen, Render-Zweige, Doctor-Checks und Tests.

Der Nutzer will ein Repo mit Fokus auf Claude und GPT/Codex. Setze das um — aber sauber:

- `src/collectors/opencode.ts` und die zugehörigen Tests entfernen
- `Provider` auf `"claude" | "codex"` reduzieren, alle Folgefehler auflösen
  (`types.ts`, `dashboard.ts`, `render.ts`, `config.ts`, `input.ts`, `platform.ts`, `notify.ts`)
- Module `opencode.status`, `opencode.usage` und die InfoBar-Seite `opencode` streichen
- `doctor.ts`, `setup.ts`, `preview.ts` entsprechend anpassen
- README und `docs/SETUP.md` von OpenCode befreien, Hero-/Doku-Bilder neu rendern
  (`npm run preview:docs`)
- Node-SQLite-Abhängigkeit prüfen: sie existierte nur für OpenCode und kann vermutlich ganz raus

Nach dem Umbau muss `npm run check` grün sein und ein `npm run preview -- --live` das echte Deck
zeigen.

**Bewusste Konsequenz:** Danach ist ein Merge von Upstream-Änderungen praktisch ausgeschlossen. Das
ist der Preis der Fokussierung und in Ordnung — aber sag es in der README, damit klar ist, dass
dies ein eigenständiger Fork ist und kein nachziehbarer Branch.

### Phase 3 — Dokumentation neu schreiben

Die README beschreibt noch das Upstream-Projekt mit drei Agenten. Sie braucht:

- Fork-Hinweis und Attribution ganz oben
- Was dieser Fork anders macht: zwei Agenten, Session-Tasten, Projekt-Kachel, Fokus per Tap,
  Notifications, CTA auf jeder Taste, Reset-Countdown, Schwellenwerte
- Die tatsächliche Standardbelegung dieses Forks statt der alten 4×2-Matrix
- Ehrliche Plattformangabe: Fokus und Fenster-Raising sind macOS-only
- Der Abschnitt zur Claude-Usage muss zu Entscheidung 2 unten passen

### Phase 4 — Veröffentlichen

Erst wenn Phase 0 bis 3 abgeschlossen sind und `npm run check` grün ist. Repository im GitHub-Konto
des Nutzers anlegen, pushen, auf öffentlich stellen.

---

## 4. Harte Regeln

1. **Nicht auf `m-a-b-u/neo-agent-deck` pushen.** Fork-Remote zuerst anlegen.
2. **MIT-Copyright von Manuel Burgschachner bleibt in `LICENSE`.** Eigene Zeile ergänzen, nicht
   ersetzen.
3. **Keine Testanfragen gegen `https://api.anthropic.com/api/oauth/usage`.** Wir sind dort schon in
   ein rund 50-minütiges Rate-Limit gelaufen; der Backoff ist genau dagegen gebaut.
4. **Token nie ausgeben** — nicht in Logs, Fehlermeldungen, Testausgaben oder Commits.
5. **AppleScript-Werte nur aus Allowlists**, `execFile` immer mit argv-Array, nie String-Interpolation
   in eine Shell.
6. **Nach jeder Änderung `npm run check`.** Danach `npm run install:mac`; der `readlink -f`-Fix ist
   drin, ein PATH-Export ist nicht mehr nötig.
7. Vor dem Veröffentlichen: `git log -p --all | grep -E "sk-ant-[A-Za-z0-9_-]{20,}"` muss außer dem
   Testwert in `test/extensions.test.ts` leer bleiben.

---

## 5. Zwei Entscheidungen, die der Nutzer treffen muss

Beide vor Phase 4 klären, nicht selbst entscheiden.

### Entscheidung 1 — Wird die Claude-Usage-Funktion mitveröffentlicht?

Der Code für `claude.usage`, die Token-Datei, `npm run token:claude` und der Backoff sind
funktionsfähig und nur aus der Belegung verschwunden. Für ein **privates** Setup ist das unkritisch.

Für ein **öffentliches** Repo ist es das nicht ohne Weiteres: Anthropic schreibt im
[Login-Artikel](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account), der
bevorzugte Weg für Drittanbieter-Software sei API-Key-Authentifizierung, und untersagt Anwendungen,
die Drittanbieter-Traffic gegen Abo-Limits routen. `/api/oauth/usage` ist nicht als öffentliche
Schnittstelle dokumentiert. In [anthropics/claude-code#30930](https://github.com/anthropics/claude-code/issues/30930)
ist belegt, dass genau dieses Muster bei Statuszeilen-Tools zu dauerhaften 429ern führt.

Ein öffentliches Tool, das Fremde anleitet, ihren Abo-OAuth-Token gegen diesen Endpunkt zu richten,
ist etwas anderes als dasselbe im Eigengebrauch.

**Empfehlung:** die OAuth-Usage-Funktion vor der Veröffentlichung entfernen — Kachel, Collector-Pfad,
Token-Skript und Doku. Alternative, falls die Zahl gewünscht bleibt: lokal aus den Transkripten
rechnen. Die Machbarkeit ist belegt, `~/.claude/projects/*.jsonl` trägt `input_tokens`,
`output_tokens` und beide Cache-Felder je Antwort; eine Probe ergab 151 M Tokens über 5 h und
233 M über 7 d. Das wären Rohtokens, keine Plan-Prozente — ehrlich zu beschriften.

### Entscheidung 2 — Wie heißt das Projekt?

Der aktuelle Name `neo-agent-deck` ist der des Upstream-Projekts. Bei einem öffentlichen,
inhaltlich abweichenden Fork ist ein eigener Name die sauberere Lösung: er verhindert Verwechslung,
und Issues landen beim richtigen Maintainer. Vorschlag einholen, bevor `package.json` und README
final geschrieben werden.
