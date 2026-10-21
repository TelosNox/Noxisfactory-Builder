# Generator

Erzeugt aus einem Rezept ein baubares Layout und daraus einen Blueprint. Code: `src/generator/` (Layout, Prüfung), `src/blueprint/` (Vorlagen, Schreiben), Kommandozeile: `tools/generate-module.ts`.

## Ablauf

1. **Layout** (`Layout`): Gebäude mit Position und Drehung, gerade Bänder mit Anfang, Ende und den Ports, an die sie anschließen. Meter, Mittelpunkt des Blueprints im Ursprung.
2. **Prüfung** (`validate`): Regeln aus `docs/geometry.md`. Keine Überlappung harter oder weicher Boxen, kein Band in fremden Boxen, Bänder mindestens 2 m, alles innerhalb des Designers, Bandenden sitzen auf ihren Ports.
3. **Blueprint** (`layoutToBlueprint`): Objekte aus Vorlagen klonen, Positionen in cm, Band-Splines, Verbindungen, Kopf mit Größe, Baurezepten und Kosten (`data/recipes.json`, Abschnitt `buildings`).

## Modul „Reihe“ (Schritt 3)

`generateRow`: eine Reihe gleicher Maschinen mit genau einem Bandeingang und einem Bandausgang (Constructor, Smelter).

- Maschinen stehen Box an Box nebeneinander, Ports in ±Y.
- Vor jedem Eingang ein Splitter (Zuleitung entlang +X), hinter jedem Ausgang ein Merger.
- Zuführung von links oder rechts, von der Eingangsseite der Maschinen aus gesehen (`feedFrom`, Standard links = −X).
- Sammelleitung: standardmäßig entlang +X (`forward`), wahlweise zurück entlang −X (`reverse`), dann kommen die Produkte neben der Zuführung heraus.
- Erweiterung am Ende der Zuführung (+X), die Seite der Stummelbänder richtet sich immer nach der Zuführung: 2-m-Stummelbänder auf der Seite −X, auf der Seite +X offene Ports. Eine neue Kopie rechts neben die vorige setzen, Autoconnect verbindet beide Leitungen (`docs/geometry.md`, Blueprint-Schnittstellen).
- Alles am Boden, Bänder auf Port-Höhe (1 m).
- Kapazität: Zu- und Sammelleitung tragen die Summe aller Maschinen; überschreitet das die Bandstufe, bricht der Generator ab.

Aufruf:

```bash
npm run generate:row -- Recipe_IronPlate_C 4 4 3 left forward
```

Schreibt `data/poc/Gen IronPlate x4 Mk3 left forward.sbp/.sbpcfg`. Im Spiel getestet (4 Constructor, 5 Smelter, Mk3): baubar, Bänder verbunden, keine Warnungen. Autoconnect zwischen Kopien im Spiel bestätigt (Ausgang `forward`); `reverse` noch nicht getestet.

Offen: Rezepte der Maschinen setzen, Strom (Masten), Maschinen mit mehreren Eingängen, kleinsten passenden Designer wählen.

## Modul „Kette“

`src/generator/chain.ts`: mehrere Reihen in einem Bauplan. Jede Reihe wird von `row.ts` erzeugt und so verschoben, dass ihre Splitterleitung auf der Mergerleitung der vorigen liegt; die nächste Reihe beginnt 4 m nach dem letzten Merger (2-m-Band dazwischen). Stummel nur an der ersten Reihe. Nur Ausgang in gleicher Richtung. Im Spiel noch nicht getestet.

## Modul „Reihe auf Logistic Floor“

`src/generator/floor.ts`: Maschinen auf einer Foundation-Ebene in 4, 6 oder 8 m Höhe, Zuleitungen darunter. Bauweise nach „Manufaktor Straight“ (`docs/geometry.md`, Unterboden):

- Bandebenen unter dem Boden: 1 m bei 4 m Boden, 1 und 3 m bei 6 m, 1, 3 und 5 m bei 8 m (Oberkante Band unter der 1 m dicken Foundation).
- Eine Spur pro Eingang auf 1 m, nebeneinander, Abstand 5 m. Splitter je Spur unter ihrem Eingang. Abzweig zur Eingangsseite: Lift 2 m vor dem Splitter-Port (normaler Anschluss, nicht in den Splitter hinein), Durchführung in der Liftreihe 2 m vor den Eingängen, Lift mit Kopf am Port.
- Spur an der Liftreihe: Lift direkt von 1 m in die Durchführung. Weiter innen: Lift 1 → 3 m, Querband auf 3 m, Lift in die Durchführung.
- 4-m-Boden: nur eine Ebene, keine Kreuzung. Höchstens 2 Eingänge: eine Spur innen, eine außen vor der Liftreihe.
- Ausgang wahlweise oben auf der Foundation wie bei „Reihe“ oder unter dem Floor (`outputBelow`, Referenz „Fabrikator Simple“, Bananendödels): Lift vom Ausgang abwärts in die Durchführung, zweiter Lift abwärts auf 1 m, Merger-Leitung längs der Reihe. Der Merger liegt unter der Ausgangskante der Maschine, wenn die Zuleitungsspuren 4 m Abstand lassen (Splitter und Merger 4 × 4 m), sonst außen vor dem Lift.
- Nur die Durchführungen sind im Bauplan, keine Foundations (wie in der Referenz). Ketten auf Logistic Floor gibt es noch nicht.
- CLI: `npm run generate:row -- <recipe> <machines> <designer> <tier> [left|right] [forward|reverse] [floor 0|4|6|8][u]` (`u`: Ausgang unter dem Floor).
- Im Spiel noch nicht getestet. Offen: Lift-Kopf am Port bei Ports, die nicht im 1-m-Raster 2 m vor der Liftreihe liegen; Liftkosten im Kopf (1 Baurezept pro Lift angenommen).
