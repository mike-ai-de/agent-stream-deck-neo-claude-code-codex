# Vorherige Neo-Belegung wiederherstellen

Der Rückweg betrifft ausschließlich Neo. Hermes, Ollama, Sprachlaufzeit und deren Einstellungen werden dabei nicht verändert.

Die vollständige bisherige Installation liegt unter:
`/Users/mike/.local/share/neo-agent-deck.pre-osca-20261026-215701`

Weitere Sicherungen: `backup/project` (mit ursprünglichen Änderungen), `backup/installed` (Quellen und Build ohne doppelte Abhängigkeiten), `backup/config`, originale LaunchAgent-Datei, ursprünglicher Git-Diff und `backup-manifest.json`. Die vollständige vorherige Laufzeit enthält auch ihre ursprünglichen Abhängigkeiten.

Lesende Rückwegprüfung:
```sh
/usr/bin/python3 /Volumes/OSCA-DATA/Projects/OSCA-Neo-2026-10-26/rollback.py
```

Eine bewusst ausgelöste tatsächliche Rücknahme:
```sh
/usr/bin/python3 /Volumes/OSCA-DATA/Projects/OSCA-Neo-2026-10-26/rollback.py --rollback
```

Das Skript prüft die alte Entry-Prüfsumme und die unveränderten Launchparameter, stoppt ausschließlich den Neo-LaunchAgent und wartet auf das Ende seines konkreten Prozesses. Dann erhält es den aktuellen OSCA-Build unter einem eigenen Sicherungspfad, setzt die vollständige alte Installation zurück und legt die neue Konfiguration separat unter `evidence` ab. Die ursprüngliche Konfiguration war nicht vorhanden und wird deshalb wieder auf diesen Zustand gebracht. Es startet denselben LaunchAgent erneut. Keine pauschalen Python-/Node-/Ollama-Kills und keine endgültigen Löschungen.

Die lesende Rückwegprüfung wurde erfolgreich ausgeführt. Ein produktiver Rückbau wurde nicht durchgeführt, da der neue Neo-Build aktiv bleiben soll. Vor einer späteren Rücknahme nach weiteren Änderungen zuerst deren Bestand separat sichern und bei Prüfsummenabweichungen stoppen.
