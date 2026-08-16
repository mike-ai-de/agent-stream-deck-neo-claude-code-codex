# Second-Brain-Vertrag

- Kanonische Notion-Seite: `Agentenvertrag v1.0`
- Notion-Seiten-ID: `3ba3c6c7-d014-8102-bcee-e6557fd428d7`
- Architektur-Charta: `v1.1`
- Charta-Seiten-ID: `3b43c6c7-d014-8107-94c3-db335dbc9305`
- Betriebsregeln-Seiten-ID: `3b43c6c7-d014-8199-9234-f7859342b953`
- Projekte-Datenquelle: `collection://d720db58-8814-4cf9-bc3e-62dc6eda4027`
- Wissen-Datenquelle: `collection://a13fa429-23b8-40bc-9bfc-736d640b5c6e`
- Entscheidungen-Datenquelle: `collection://76d68fd2-0774-4928-8c46-02450f0f5d08`
- Inbox-Datenquelle: `collection://381fa043-92da-4f01-bff6-59437e2c236f`
- Inbox-Datenbank-ID: `48f0a0cf-d705-4931-9784-02fe0f64b1a9`
- Vertragsversion: `1.0`
- Synchronisiert am: `2026-08-12`

## Verbindliche Arbeitsreihenfolge

Vor projektbezogener Arbeit:

1. Vertragsversion mit der kanonischen Notion-Seite abgleichen.
2. Betriebsregeln lesen.
3. Projekt eindeutig identifizieren und seine Notion-Seite lesen.
4. Nur verknüpfte verbindliche Entscheidungen einschließlich Ersetzungsketten lesen.
5. Nur verknüpftes relevantes Wissen lesen.
6. Repository-Anweisungen und technischen Istzustand prüfen.

## Wahrheitsbereiche

- Notion: Projektziel, Projektstatus, nächster Schritt, freigegebene Entscheidungen und wiederverwendbares Wissen.
- Repository: Code, Tests, Konfiguration, technische Details, Commits und tatsächlicher Buildzustand.
- Inbox: ungeprüfte Vorschläge; niemals verbindliche Grundlage.

## Schutzregeln

- Nur Wissen und Entscheidungen mit Status `Verbindlich` und Titelpräfix `[VERBINDLICH]` verwenden.
- Konflikte nicht anhand des Datums auflösen. Eine Ersetzung benötigt die Relationen `Ersetzt` und `Ersetzt durch` sowie den Status `Veraltet` beim Vorgänger.
- KI-Systeme ändern keine Projekte, Wissensbausteine, Entscheidungen, Charta, Betriebsregeln oder bestehenden Inbox-Einträge.
- KI-Systeme erstellen ausschließlich neue strukturierte Inbox-Einträge mit Status `Neu`.
- Pflichtfelder eines Inbox-Eintrags: `Titel`, `Typ`, `Status`, `Projekt`, `Agent`, `Session-ID`, `Quellenverweis` und `Deduplizierungsschlüssel`; `Ergebnislink` wird bei menschlicher Übernahme ergänzt.
- Vor dem Writeback nach demselben offenen Deduplizierungsschlüssel suchen.
- HR-, Personal-, Kunden-, Secret- und vertrauliche Inhalte nicht verarbeiten oder in Notion speichern.

## Fallback

Ist Notion nicht erreichbar, unvollständig lesbar oder die Vertragsversion abweichend:

- keine verbindliche Notion-Aussage treffen;
- keinen Notion-Writeback ausführen;
- Ergebnis als `Pending Writeback` mit Projekt, Quellen, Zeitpunkt, Vertragsversion und vorgesehenem Inbox-Typ ausgeben;
- vor späterer Übernahme erneut lesen und deduplizieren.

## Ergebnisstandard

Relevante Ergebnisse nennen knapp:

- Projekt;
- verwendete verbindliche Entscheidungen;
- verwendetes Wissen;
- geprüften Repository-Zustand;
- Ergebnis;
- Risiken oder Konflikte;
- Inbox-Eintrag oder Pending Writeback.
