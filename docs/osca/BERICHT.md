# OSCA Neo – Implementierung und laufender Stand

> Kopie aus dem OSCA-Projektordner. Verweise auf `deployment.json`, `evidence/` und `backup/` beziehen sich auf `/Volumes/OSCA-DATA/Projects/OSCA-Neo-2026-10-26` und sind nicht Teil des Repos.

Stand: 26.10.2026 · Europe/Berlin. **Drei Seiten implementiert und am echten Neo aktiv. Abschließende Prüfung der Dateiquellen und der sichtbaren Sitzungsnavigation wartet auf die Entsperrung des Macs. Nicht als vollständig abgenommen behandeln.**

## Tatsächlicher Betrieb

Der frühere Projektpfad `/Users/mike/Projects/neo-agent-deck` existiert und enthielt unvollständige Änderungen an Typen/Konfiguration sowie fehlerhafte zusätzliche Collector. Diese Originaldateien wurden erhalten und gesichert. Die laufende Installation lag dagegen unter `/Users/mike/.local/share/neo-agent-deck`. Ein LaunchAgent startet dort den gebauten Entry mit `/Users/mike/.local/node/node`. Die ursprüngliche Belegung und die Elgato-App waren nicht Grundlage einer neuen Plugin-Installation: Das vorhandene System nutzt direktes USB/HID.

Canonical Source der geprüften OSCA-Anpassung: `source` in diesem Projekt. Die vorherigen unvollständigen Dateien sind zusätzlich unter `source/legacy-attempt` erhalten. Bestehende OpenCode-Funktionen bleiben als Quellbestand erhalten, sind auf der Hauptseite nicht belegt. Die vorhandenen Abhängigkeiten wurden geklont, weder heruntergeladen noch aktualisiert.

Aktiv: `0.3.1-osca.1`, drei vollständige Seiten mit jeweils acht Tasten; derselbe LaunchAgent `com.neo-agent-deck`, dieselben Startargumente, eine neue geprüfte `~/.neo-agent-deck/config.json`. Links/rechts wechseln sämtliche Tasten und die Infobar gemeinsam, einschließlich Umlauf in beide Richtungen. Aktueller PID und Buildfingerabdruck stehen in `deployment.json` und `evidence/activation-verification.json`; sie sind keine dauerhaften Einstellungen.

Der tatsächliche Dienst und seine Konfiguration wurden gegen Entry-, Modul- und Konfigurationshashes geprüft. Genau ein Neo-Prozess besitzt den vorgesehenen Entry. Das angeschlossene Neo wurde geöffnet und auf allen drei Seiten mit acht RGBA-Tastenbildern und seiner 248×58-Infobar beschrieben. Erfolgreiche HID-Schreiboperationen sind belegt; eine optische Pixelrücklesung oder ein physischer Fingerdruck ist damit nicht behauptet.

## Belegung

| Seite | Oben 1–4 | Unten 5–8 |
| --- | --- | --- |
| AGENTS | Claude, Codex, Hermes, All Agents | Claude Rest, Codex Rest, Ollama geladen, Needs You |
| LOCAL | CPU, Memory Pressure/Swap, GPU, DATA/CORE frei | Ollama-Modellspeicher, letzte Inferenz, lokale Sprache, OSCA-Dienste |
| OPS | E-Mail, Notion-Beleg, Austausch, Backup | Hostinger, Hermes Gateway stoppen, nächster Prüfpunk, Control öffnen |

Die Infobar zeigt Seite und aggregierte bekannte Zahlen. `≥` und `PARTIAL` kennzeichnen fehlende vollständige Quellen; Null erkannte Rückfragen wird nicht als ALL CLEAR ausgegeben. Die Needs-You-Auswahl berücksichtigt die älteste tatsächlich erkannte wartende Rückfrage. Das Öffnen verändert keine Rückfrage und bestätigt nichts.

## Nachweisbare Datenquellen

- Claude: explizite lokale Session-Metadaten plus lebender PID. Abgeschlossene Antworten zählen nicht als Rückfragen. Quoten aus vorhandener OAuth-Nutzungsauskunft; `utilization/used_percentage` wird genau einmal in Rest umgerechnet.
- Codex: schreibgeschützte Hauptthread-Metadaten und begrenzte lokale Lebenszyklus-/Aktivitätsereignisse. Auch bei aus dem Lesefenster gefallenem Startmarker wird ein frisches Tool-/Reasoning-Ereignis als partielles Arbeitssignal erkannt. Komplette offene Desktop-Tabs und sämtliche Freigaben sind nicht zugänglich. Deshalb bleibt der Status ausdrücklich PARTIAL. Das separate App-Server-Listing sieht seine eigene Laufzeit und ist kein belastbarer Ersatz für den anderen Desktop-Prozess.
- Codex-Quoten: dokumentierter `account/rateLimits/read` mit bestehender Anmeldung; kein Chat gestartet, kein Modell angefragt. `usedPercent` wird genau einmal invertiert. Aktuell liefert der Codex-Plantopf nur 7d; 5h bleibt fehlend statt erfunden. Eventuelle Zusatzguthaben sind kein Bestandteil dieser Prozentanzeige.
- Beide Anbieter: `REST n %`, voller Balken = 100 % Rest; fehlend = Strich/UNAVAILABLE. Bei Fehlschlag bleiben ursprünglicher Messzeitpunkt und gegebenenfalls veraltete Werte erhalten. Resetzeiten werden pro Fenster in Europe/Berlin angezeigt. Automatische Quotenabfrage alle fünf Minuten.
- Hermes: tatsächlich vorhandener `gateway.sock`/Pointer und lesendes `status`-Verb, anhand des gepinnten aktuellen Hermes-Quellcodes geprüft. Antwortende PID, erwartetes Hermes-Home und Antwortzeit werden validiert. Ein Prozess allein gilt nicht als funktionierende Verbindung. Aktivität und WhatsApp-Zustand stammen aus dieser realen Antwort. Eine vollständige Rückfragenliste wird dort nicht angeboten.
- Ollama: ausschließlich `/api/ps` mit `models`-Array für geladene Modelle, `size` und `size_vram`. Kein Fallback von installierten Tags auf geladene Modelle, kein BUSY aus bloßem Laden. Aktivität bleibt unbekannt.
- Letzte lokale Inferenzdauer: letzter passender erfolgreicher Inferenzrequest im lokalen Ollama-GIN-Serverlog, einschließlich zusammengesetzter Go-Dauern. Keine Prompt-/Antworttexte ausgegeben. Token/s ohne passende Quelle bleiben nicht verfügbar.
- CPU: echte intervallbezogene Summen der CPU-Zähler. Memory Pressure: eigenes macOS-Signal; Swap separat; Seitengröße aus `vm_stat`, auf diesem Mac 16 KiB. GPU: echte `IOAccelerator PerformanceStatistics / Device Utilization %`, bei Fehlen kein künstliches 0 %. Speicherplatz: `statfs` auf tatsächlich eingebundenen DATA-/CORE-Volumes.
- Sprache: aktuelle Konfiguration, Ryan-Adapter und eigenständige Laufzeit-/Modellassets; kein Modell-/Audiotest nur zur Statusanzeige. Notion: vorhandener Nachweis acht erfolgreicher Readbacks vom 26.10., nur Tagespräzision und keine behauptete Liveverbindung. Nächster Prüfpunkt aus der aktuellen konsolidierten OPEN-QUESTIONS-Datei.
- Backup: `tmutil status` und `latestbackup` getrennt; Restore bleibt unbestätigt. Letztes aktuelles Erfolgsdatum ist wegen fehlendem lesendem Zugriff nicht belegt. Mail und Hostinger besitzen keine eingerichtete lesende Neo-Telemetrie; passende aktuelle Launchd-Dienste oder ein Hostinger-SSH-Alias wurden nicht gefunden. Keine alten Integrationen reaktiviert, keine Server-Schreibaktion und kein Mailzugriff.

Alle Collector arbeiten unabhängig. Netzwerk-/Prozessabfragen haben Timeouts und Größenlimits; einzelne hängende Quellen blockieren weder die anderen Anzeigen noch die Seitennavigation. Nur ausgewählte technische Sitzungsdaten werden ausgegeben. Begrenzte Codex-Ereignisdateien werden lokal gelesen; ihre Nachrichteninhalte werden nicht dargestellt oder an Modelle weitergegeben. Zugangsdaten werden nicht in Quellcode, Konfiguration, Logs oder Dokumentation gespeichert.

## Aktionen und Sicherheit

Codex öffnet die native vorhandene Thread-Route. Claude Desktop nutzt nach überprüftem installierten App-Handler `claude://code/continue?session=<hostSessionId>` für bestehende lokale Desktop-Sitzungen. Das vermeidet den CLI-Transfer einer noch aktiven Sitzung. Eine laufende CLI-Sitzung ohne Desktop-ID kann nicht automatisch in Desktop verschoben werden; in diesem Fall werden App und lokale Details geöffnet und die Einschränkung angezeigt. Native Navigation wurde aufgerufen; die sichtbare Endauswahl muss nach Entsperrung noch kontrolliert werden.

Hermes Stop: erst ein Druck zum Scharfschalten, zweiter separater Druck innerhalb von fünf Sekunden. Halten bestätigt nicht zweimal. Navigation oder Zeitablauf hebt die Bestätigung auf. Danach erneute Prüfung der frischen Gateway-Identität und Aufruf ausschließlich des vorhandenen neuen Stopwrappers. Kein pauschaler Prozesskill, Ollama bleibt unabhängig. Es wird das Gateway gestoppt; ein offenes Desktopfenster wird nicht gewaltsam geschlossen. Ein Live-Stopp des produktiven Hermes wurde in dieser Neo-Arbeit nicht ausgelöst.

Details sind unter `http://127.0.0.1:9463` nur lesend erreichbar; keine Fernaktionen über HTTP. Der private 0600-Unixsocket bietet ausschließlich Seitennavigation, keine Stop-/Freigabeaktion. Source- und Statusfehler werden bereinigt ausgegeben.

## Tests und Aktivierungsprüfung

Compiler, Build und 95 Tests bestanden, einschließlich bestehender Kompatibilitätstests. Die neuen Tests prüfen Restumrechnung (0/50/100 % genutzt, bereits verbleibend, fehlend, veraltet, Reset), Ollama leer/gefüllt/falsches Schema/Nichterreichbarkeit/Timeout/Größenlimit, reale Seitengröße/Pressure/GPU-Fehlen, Hermes laufend/gestoppt/unbekannt und falsche Identität, alle 24 Module, acht gerenderte Tasten je Seite, beide Navigationen, seitenabhängige Aktionen, HID-Controller, keine Quittierung beim Öffnen, Zweitbestätigung und Collector-Ausfall.

Auf dem echten Gerät wurden beide Navigationsrichtungen durch dieselben Touchpoint-Handler ausgeführt und alle drei vollständigen Frames geschrieben. Der laufende Build-/Konfigurationsabgleich ist in `evidence` dokumentiert. Dreißig geschützte Hermes-Konfigurations-/Starter-/Sprachdateien sind unverändert. Ursprüngliches Neo-Projekt und bisherige Zustandsdatei sind ebenfalls hashidentisch. Die vorhandenen Hermes-/Ollama-Dienste wurden weder ersetzt noch für einen Statusprobe angefragt oder gestoppt.

## Noch ausstehende Abnahme

Die native Bedienoberfläche meldet den Mac als gesperrt und kann ihn nicht automatisch entsperren. Der Nutzer wurde um Entsperrung gebeten. Zugleich laufen mehrere Leseabfragen des tatsächlichen LaunchAgents auf OSCA-DATA in ihr Zeitbudget; das betrifft aktuell Sprache, Notion-Beleg und Control-Prüfpunkt. Die Dateiwerte funktionieren aus der autorisierten Codex-Sitzung, dürfen deshalb aber nicht als im LaunchAgent verfügbar ausgegeben werden. Keine macOS-Schutzmechanismen oder Berechtigungen verändert. Nach Entsperrung müssen diese Quellen und gegebenenfalls ein sichtbarer macOS-Dateizugriffsdialog geprüft werden.

Danach: aktuelle Vorschauen neu aufnehmen und am Gerät rechts → LOCAL, rechts → OPS, links → LOCAL, links → AGENTS prüfen. Claude-/Codex-Statusdruck soll die passende Sitzung öffnen und keine Rückfrage verändern. Den Stopknopf zunächst einmal drücken und fünf Sekunden warten: Bestätigung muss verfallen und Hermes weiterlaufen. Ein absichtlicher zweiter Druck würde das Gateway tatsächlich stoppen.

## Sicherungen und Rückweg

Quellen und ursprüngliche Änderungen, Konfigurationszustand, Build und Launchparameter wurden vor Änderungen gesichert. Die vollständige alte Installation bleibt unter dem `previous`-Pfad in `deployment.json` erhalten. Zwischenstände liegen separat, keine fremden Änderungen wurden verworfen. Der [Rückweg](RUECKWEG.md) prüft alte Prüfsumme/Launchparameter, stoppt ausschließlich Neo, sichert den neuen Stand und stellt die vorherige Installation samt ursprünglichem Konfigurationszustand wieder her. Lesende Rückwegprüfung bestanden; kein produktiver Rückbau ausgeführt.

## Schnittstellenquellen

- Context7 geprüft: Stream Deck SDK; die direkte HID-Bibliothek ist davon verschieden und dort nicht passend abgedeckt. Verifiziert gegen installierte 7.6.3-Typen, Neo-Modellimplementierung und [Maintainer-Repository](https://github.com/Julusian/node-elgato-stream-deck).
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md), über Context7: ps-Objekt, Modellspeicher und echte Inferenzmetriken.
- [Codex App Server](https://learn.chatgpt.com/docs/app-server): Kontingentsemantik, lesende Thread-/Turn-Metadaten und Grenzen separater Laufzeitinstanzen.
- [Claude Statusline](https://code.claude.com/docs/en/statusline), über Context7: verbrauchte Prozentwerte und Fenster; [Desktop](https://code.claude.com/docs/en/desktop): Sitzungsnavigation und Grenzen eines aktiven CLI-Transfers. Nativer lokaler Desktop-Navigationsweg zusätzlich an der tatsächlich installierten App geprüft.
