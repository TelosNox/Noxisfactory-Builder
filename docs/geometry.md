# Geometrie

Maße in m, relativ zum Ursprung des Gebäudes, Achsen wie in Unreal (X, Y horizontal, Z oben).
Abgeleitete Werte je Gebäude stehen in `data/geometry.json`, erzeugt von `tools/extract_geometry.py` aus FModel-Exporten (`Save Properties (.json)` der `Build_*_C`-Klassen).

## Quellen

- **`mClearanceData`** im Default-Objekt der Gebäudeklasse: harte (`CT_Default`) und weiche (`CT_Soft`) Boxen.
- **Port-Komponenten**: `FGFactoryConnectionComponent` (Band), `FGPipeConnectionComponent`/`FGPipeConnectionFactory` (Rohr), `FGPowerConnectionComponent` (Strom) mit `RelativeLocation`/`RelativeRotation`.
- Alle `Build_*_C`-Klassen erben direkt von C++-Klassen (`/Script/FactoryGame`). Fehlt `mClearanceData` im Asset, liegt der Wert im C++-Code und ist aus den Assets nicht zu holen.

Spielversion der Exporte und Tests: 1.2.4.1 (CL#513885).

## Gebäude untereinander

- Harte Boxen zweier Gebäude dürfen sich nicht überlappen (rotes Hologramm, Bauen gesperrt). Im Spiel getestet: Ein Constructor lässt sich nicht so setzen, dass sein Eingang direkt am Ausgang eines anderen liegt.
- Nebeneinander gilt dasselbe: Die Boxen (im Spiel als weißer Rahmen sichtbar) dürfen sich berühren, aber nicht überlappen. Getestet mit zwei Constructors Seite an Seite.
- Folge: Maschinen lassen sich nicht direkt Port an Port verbinden. Bei Boxen, die sich berühren, liegt zwischen zwei Ports der Abstand beider Ports zur Kante ihrer Box (Constructor → Constructor: 2 + 2 = 4 m Band).

## Bänder, Lifts, Splitter, Merger

Kein `mClearanceData` für Bänder, Lifts und vertikale Splitter/Merger. Belegung stattdessen nach Bauregel:

- Ein Band belegt im Querschnitt den Raum eines **Conveyor Pole Stackable** (Quelle: Spielerfahrung). Laut Export hat der Stacker eine weiche Box von 1 × 2 × 2 m (X −0,5…0,5, Y −1…1, Z 0…2) und einen Snap-Punkt für das Band bei Z = 3 m.
- **Vertikaler Raster für Bänder: 2 m.** Im Spiel gemessen an gestapelten Stackern neben 1-m-Foundations: Bänder auf etwa 1, 3 und 5 m über dem Boden. Das unterste Band (1 m, normale Stütze) liegt auf Port-Höhe der Maschinen (Z = 1).
- Splitter und Merger lassen sich im 2-m-Abstand warnungsfrei übereinander bauen, obwohl sich ihre weichen Boxen (Z −0,8…1,8, also 2,6 m hoch) dabei um 0,6 m überlappen. Im Spiel getestet. Grund unbekannt (evtl. Toleranz oder Sonderfall beim Stapeln). Für den Generator: senkrechter Raster 2 m wie bei Bändern.
- Ein Band lässt sich eine Ebene (2 m) über einem Splitter warnungsfrei hinwegführen. Im Spiel getestet. Senkrecht belegt ein Splitter also nur seine eigene 2-m-Ebene.
- **Horizontal belegen Splitter und Merger ihre weiche Box von 4 × 4 m.** Im Spiel getestet: Mittenabstand 4 m nebeneinander ist warnungsfrei, 3 m gibt eine Warnung (gelb). Bauen ließen sie sich sogar ineinander, aber mit Warnung.
- Splitter/Merger: Ports 1 m vom Mittelpunkt in alle vier Richtungen, auf Höhe Z = 0 des Bauteils.
- Vertikaler Splitter/Merger: `TopConnection`/`BottomConnection` mit Richtung `FCD_ANY`, zwei seitliche Ports ±1 m in Y. Clearance unbekannt; Mesh-Bounds X ±1,88, Y ±2,10, Z −0,75…2,80 *(prüfen)*.

## Offene Punkte

- Ports liegen innerhalb der harten Box der Maschinen (z. B. Constructor: Port bei Y ±3, Box bis ±5). Im Spiel bestätigt: Ein angeschlossenes Band beginnt optisch am Port in der Maschine. Für das Layout zählt das Band also erst ab der Kante der Box. Ein fremdes Band lässt sich quer durch die Maschine ziehen, mit Warnung (gelbes Hologramm). Eine Einstellung für hartes Clipping gibt es im Spiel nicht (mehr), das Ergebnis gilt also. Direkt neben der Box ist ein Band warnungsfrei, sobald es in die Box ragt, wird es gelb.
- **Regel für den Generator:** Bänder dürfen nicht in fremde harte Boxen ragen. Das Spiel erlaubt es mit Warnung, aber ein Plan soll warnungsfrei nachbaubar sein.
- Bedeutung von `ExcludeForSnapping` an harten Boxen.
- Fehlendes `mDirection` an Eingängen wird als Eingang gedeutet *(prüfen)*.
