# OSCA Neo · Source

Aktiver OSCA-Build: 0.3.1-osca.1.

[Projektübersicht](../README.md) · [Umsetzung und aktueller Abnahmestand](../BERICHT.md) · [Rückweg](../RUECKWEG.md)

Produktiver Entry: src/index.ts → src/osca/app.ts. Die ursprünglichen Module bleiben für Kompatibilität und OpenCode erhalten, sind aber nicht der neue Seitencontroller. Unvollständige Vorarbeiten sind unter legacy-attempt archiviert (lokal von Git ausgeschlossen). Der ursprüngliche Projektpfad wurde nicht überschrieben; er liegt seit 28.10.2026 im Hermes-Altbestand.

Git: Branch osca auf Upstream v0.3.1 (75afd9a), Remote upstream = github.com/m-a-b-u/neo-agent-deck. node_modules ist eine echte lokale Kopie.

Build mit vorhandenem Node: node scripts/clean.mjs && node node_modules/typescript/bin/tsc -p tsconfig.json.
Compiler für Tests: node node_modules/typescript/bin/tsc -p tsconfig.test.json.
Tests: node node_modules/vitest/vitest.mjs run.
Status: node dist/scripts/osca-status.js (liest den laufenden Dienst, öffnet keinen zweiten HID-Prozess).

Quell- und Laufzeitabhängigkeiten wurden nicht aktualisiert. Statusquellen dürfen teilweise nicht verfügbar sein; daraus wird keine funktionierende Messung erfunden. Die macOS-Entsperrung für die letzte Quellen-/Sichtprüfung steht noch aus.
