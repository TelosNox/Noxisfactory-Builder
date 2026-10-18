# Konzept

Ein Planer für Satisfactory, der aus Produktionszielen Baupläne erzeugt und dabei den verfügbaren Raum möglichst gut nutzt.

Werte, die mit *(prüfen)* markiert sind, stammen aus dem Gedächtnis und müssen gegen die aktuelle Spielversion verifiziert werden.

## Randbedingungen des Spiels

- Baupläne sind in ihrer Größe begrenzt, abhängig vom Blueprint Designer (in Foundations à 8 m): Mk1 4×4×4, Mk2 5×5×5, Mk3 6×6×6 (Quelle: `mDimensions` in `Build_BlueprintDesigner*`, FModel-Export).
- Gebäude beanspruchen nicht pauschal ganze Kacheln. Es zählen die tatsächliche Kollisionsbox bzw. Clearance (harte und weiche Clearance *(prüfen)*), Port-Positionen, -Höhen und -Richtungen sowie das Platzierungsraster.
- Obere Ebenen brauchen keine Stützen, Stützen sind rein ästhetisch. Der Bauraum ist damit ein echtes 3D-Raster ohne Statik.
- Es gibt vertikale Splitter und Merger.
- Lifts haben dieselbe Kapazität wie Belts derselben Stufe.
- Der Export als Blueprint-Datei (`.sbp`/`.sbpcfg`) ist optional. Ein Plan, den man von Hand nachbaut, reicht.

## Datenquellen

- Rezepte und Raten: `Docs.json` im Installationsordner des Spiels.
- Geometrie (Clearance, Ports): nicht in `Docs.json` enthalten. Muss aus den Spiel-Assets extrahiert oder im Spiel vermessen werden. **Größtes Risiko**, weil jede Layout-Optimierung davon abhängt.

## Anwendungsfälle

1. **Einfaches wiederholbares Modul**: fester Würfel, feste Ports an den Kanten, aneinanderreihbar.
2. **Komplexes wiederholbares Modul**: mehrere Ein- und Ausgänge, interne Zwischenprodukte, fester Würfel.
3. **Einzelbau**: ein Bauplan, der genau ein Produkt baut. Effektivität ist zweitrangig, Hauptsache, es funktioniert.
4. **Aufgeteiltes Produkt**: eine Produktion, die in keinen einzelnen Bauplan passt und auf mehrere Module verteilt werden muss.
5. **Reine Consumer**, z. B. Kraftwerke: Module ohne Produktausgang (Brennstoff und Wasser rein; beim Atomkraftwerk zusätzlich Abfall raus). Guter Einstieg in Flüssigkeiten.

## Variationen

- **Ziel**: Platz und Effektivität gegen Ästhetik, als Gewichte in einer gemeinsamen Kostenfunktion (z. B. Strafe für sichtbare Belts, Bonus für Logistik im Unterboden).
- **Unterirdische Logistik**: eine reservierte untere Ebene, in der nur Belts, Lifts, Splitter und Merger liegen.
- **Zwischenspeicher**: Bausteine mit Volumen und Ports, rechnerisch neutral.
- **Uploader** (Dimensional Depot): Senke. Spart Ausgangsports an der Modulkante.

## Anbindung von Maschinen mit mehreren Eingängen

Beispiel Manufacturer: 4 Eingänge nebeneinander auf einer Seite, 1 Ausgang gegenüber.

Flach parallel geführte Zuleitungen kreuzen sich bei den Abzweigungen. Die Leitungen müssen deshalb über die Höhe getrennt werden.

### Grundformen

- **Reihe, Zuleitungen gestapelt über den Eingängen**: jede Zuleitung auf eigener Höhe, Abzweig per Splitter und Lift. Schnell gebaut, braucht n Ebenen.
- **Reihe, Zuleitungen von zwei Seiten** (oben oder im Unterboden): Die Zuleitungen laufen längs an der Lift-Reihe vor den Ports vorbei. Jeder Splitter gibt nach links oder rechts in seinen Lift ab. Je zwei Bänder teilen sich eine Ebene.
- **Gespiegelte Reihen**: zwei Reihen teilen sich die Leitungen einer Seite in der Mitte.
- **Stapel**: Maschinen übereinander, eine Lift-Säule pro Port, vertikale Splitter bzw. Merger je Etage. Keine Kreuzungen, konstante Grundfläche. Besonders gut für Maschinen mit großem Grundriss und wenigen Ports (Manufacturer).
- **Gestapelte Reihen**: Maschinengitter über Reihe × Etagen, siehe unten.

### Regeln

- **Lift von zwei Seiten**: n Eingänge brauchen ⌈n/2⌉ Ebenen.
- **Spiegelung**: Das geteilte Band trägt doppelte Last. Geteilt wird die Seite, deren stärkstes Band die geringere Rate hat. Bei den Eingängen ist das die Zutat mit der höchsten Rate. Beim Manufacturer ist es oft der Ausgang.
- **Kettenlänge eines Manifolds**: min(Kapazität ÷ (2 × Rate der geteilten Seite), Kapazität ÷ Rate je ungeteiltes Band). Ohne Spiegelung gilt Kapazität ÷ Rate der stärksten Zutat.
- Welche Grundform gewinnt, entscheidet der Generator pro Rezept anhand von Grundriss, Portzahl, Raten und Würfelgröße.

### Gestapelte Reihen

Zwei Zuführungsmuster:

1. **Etagen-Manifold mit Steigleitung am Reihenende**: horizontale Zuleitungen pro Etage, am Reihenende eine Lift-Säule je Zutat mit vertikalen Splittern. Ausgang spiegelbildlich am anderen Ende.
2. **Säulen pro Maschine mit Verteiler unten oder oben**: jede Spalte wie ein Stapel, eine horizontale Verteilleitung speist die Säulen. Minimale Etagenhöhe.

Engpass bei beiden: Die Zuführung einer Zutat trägt das ganze Gitter. Maschinen pro Zuführung ≤ Kapazität ÷ Rate der stärksten Zutat. Große Gitter lohnen sich nur bei niedrigen Raten, sonst braucht es mehrere Einspeisungen (z. B. eine pro Etage).

Wenn die Leitungen an den Seitenkanten und die Steigleitungen an den Würfelkanten austreten, lässt sich das Modul in allen drei Richtungen kacheln. Die Modulschnittstelle ist dann eine Fläche mit festgelegten Port-Positionen.

## Eingaben pro Bau

Der Spieler gibt an, was er bauen will, was er freigeschaltet hat und wie gebaut wird.

Zu- und Ausgangsleitungen laufen quer zu den Maschinenports, entlang der Maschinenreihe; nur so lassen sich Module aneinanderreihen.

### Grundset

Das Minimum für einen ersten Test. Alles andere läuft mit festen Standards.

| Eingabe | Werte | Standard |
|---|---|---|
| Produkt | Item aus `Docs.json` | – (Pflicht) |
| Menge | Items/min | – (Pflicht) |
| Blueprint Designer | Mk1–Mk3 | Mk1 |
| Höchste Bandstufe (gilt auch für Lifts) | Mk1–Mk6 | Mk1 |
| Höchste Mast-Stufe | Mk1–Mk3 | Mk1 |

Feste Standards im Grundset: nur Standardrezepte, kein Übertakten (Untertakten nur als Notlösung, wenn gleiche Kopien nicht glatt aufgehen; die Seite schlägt dann passende Mengen vor), keine Daisy Chain, keine Unterboden-Ebene, Rohstoffe kommen seitlich am Anfang der Maschinenreihe an, Ausgangsleitung läuft in dieselbe Richtung wie die Zuleitung.

Module sind erweiterbar: Man beginnt mit einem Teil und hängt weitere Kopien am Ende der Zuführung an, solange das Band genug Leistung hat. Der Anfang der Zuführung (und bei Rückführung auch der Ausgang) bleibt dabei an seinem Platz.

### Erweiterungen

- Freigeschaltete Alternativrezepte.
- Übertakten (Power Shards), Somersloops.
- Daisy Chain verfügbar ja/nein.
- Wo die Rohstoffe am Block ankommen (unten, oben, seitlich, verteilt).
- Seite der Zuführung, von der Eingangsseite der Maschinen aus gesehen: links oder rechts (Standard links).
- Laufrichtung der Ausgangsleitung: dieselbe Richtung wie die Zuleitung (Produkt kommt am anderen Ende des Moduls heraus), Gegenrichtung (Produkt kommt dort heraus, wo die Rohstoffe zugeführt werden) oder der Generator wählt.
- Unterboden-Ebene ja/nein.
- Gewichtung Platz und Effektivität gegen Ästhetik (siehe Variationen).

## Vorgeschlagene Reihenfolge

1. Geometriemodell für 5–6 Gebäude (Constructor, Assembler, Manufacturer, Smelter, Splitter/Merger, Lift), Herkunft der Maße klären.
2. Planner (lineares Programm) auf Basis von `Docs.json`.
3. Einfaches Modul im festen Würfel, nur Belts, Ziel Platz und Effektivität.
4. Ästhetik-Gewichte, Unterboden-Ebene.
5. Komplexe Module, Grundformen Stapel und gestapelte Reihen.
6. Kraftwerke und Flüssigkeiten.
7. Einzelbau und aufgeteilte Produkte.
8. Optional: Blueprint-Export.
