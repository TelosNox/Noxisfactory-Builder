# Generator

Erzeugt aus einem Rezept ein baubares Layout und daraus einen Blueprint. Code: `src/generator/` (Layout, Prüfung), `src/blueprint/` (Vorlagen, Schreiben), Kommandozeile: `tools/generate-module.ts`.

## Ablauf

1. **Layout** (`Layout`): Gebäude mit Position und Drehung, gerade Bänder mit Anfang, Ende und den Ports, an die sie anschließen. Meter, Mittelpunkt des Blueprints im Ursprung.
2. **Prüfung** (`validate`): Regeln aus `docs/geometry.md`. Keine Überlappung harter oder weicher Boxen, kein Band in fremden Boxen, Bänder mindestens 2 m, alles innerhalb des Designers, Bandenden sitzen auf ihren Ports.
3. **Blueprint** (`layoutToBlueprint`): Objekte aus Vorlagen klonen, Positionen in cm, Band-Splines, Verbindungen, Kopf mit Größe, Baurezepten und Kosten (`data/recipes.json`, Abschnitt `buildings`).

## Modul „Reihe“ (Schritt 3)

`generateRow`: eine Reihe gleicher Maschinen mit genau einem Bandeingang und einem Bandausgang (Constructor, Smelter).

- Maschinen stehen Box an Box nebeneinander, Ports in ±Y.
- Vor jedem Eingang ein Splitter (Zuleitung entlang +X), hinter jedem Ausgang ein Merger (Sammelleitung entlang +X).
- Autoconnect: 2-m-Stummelbänder vor dem ersten Splitter und vor dem ersten Merger (Seite −X); auf der Seite +X enden beide Leitungen mit offenen Ports. Die Reihe wächst in +X (`docs/geometry.md`, Blueprint-Schnittstellen).
- Alles am Boden, Bänder auf Port-Höhe (1 m).
- Kapazität: Zu- und Sammelleitung tragen die Summe aller Maschinen; überschreitet das die Bandstufe, bricht der Generator ab.

Aufruf:

```bash
npm run generate:row -- Recipe_IronPlate_C 4 4 3
```

Schreibt `data/poc/Gen IronPlate x4 Mk3.sbp/.sbpcfg`. Im Spiel getestet (4 Constructor, 5 Smelter, Mk3): baubar, Bänder verbunden, keine Warnungen. Autoconnect zwischen Kopien im Spiel bestätigt.

Offen: Rezepte der Maschinen setzen, Strom (Masten), Maschinen mit mehreren Eingängen, kleinsten passenden Designer wählen.
