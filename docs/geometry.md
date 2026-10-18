# Geometrie

Maße in m, relativ zum Ursprung des Gebäudes, Achsen wie in Unreal (X, Y horizontal, Z oben).
Abgeleitete Werte je Gebäude stehen in `data/geometry.json`, erzeugt von `tools/extract_geometry.py` aus FModel-Exporten (`Save Properties (.json)` der `Build_*_C`-Klassen).

Spielversion der Exporte und Tests: 1.2.4.1 (CL#513885). „Spielerfahrung“ und „im Spiel getestet“ beziehen sich auf diese Version.

## Quellen

- **`mClearanceData`** im Default-Objekt der Gebäudeklasse: harte (`CT_Default`) und weiche (`CT_Soft`) Boxen.
- **Port-Komponenten**: `FGFactoryConnectionComponent` (Band), `FGPipeConnectionComponent`/`FGPipeConnectionFactory` (Rohr), `FGPowerConnectionComponent` (Strom) mit `RelativeLocation`/`RelativeRotation`.
- Alle `Build_*_C`-Klassen erben direkt von C++-Klassen (`/Script/FactoryGame`). Fehlt `mClearanceData` im Asset, liegt der Wert im C++-Code und ist aus den Assets nicht zu holen. Dasselbe gilt für Grenzwerte von Kurven und Lifts (Hologramm-Klassen ohne Werte).

## Raster

- Alles im Spiel folgt dem 1-m-Raster; Gebäude und Bänder lassen sich auf Foundations in 1-m-Schritten verschieben (Spielerfahrung).
- Beim Einrasten auf Foundations richtet das Spiel die harte Box an den Kanten der Foundation aus, nicht den Ursprung an der Mitte. Beispiel Manufacturer (18 × 20 m): 2 volle Foundations + 2 m in der Breite, 2 volle + 4 m in der Länge (Spielerfahrung).
- **Festlegung:** Platzierungsraster des Generators ist 1 m in allen Richtungen. Abstände wie die 2 m zwischen gestapelten Bändern sind Mindestabstände auf diesem Raster, kein eigenes Raster.
- Bandebenen liegen auf 1, 3, 5, … m über der Foundation (Abstand 2 m). Im Spiel gemessen an gestapelten Stackern. Die unterste Ebene (1 m, normale Stütze) liegt auf Port-Höhe der Maschinen (Z = 1).

## Freiraum (Clearance)

- **Hart:** Harte Boxen zweier Gebäude dürfen sich berühren, aber nicht überlappen (rotes Hologramm, Bauen gesperrt). Im Spiel als weißer Rahmen sichtbar. Getestet mit Constructors nebeneinander und hintereinander.
- **Weich:** Überlappung ist erlaubt, aber mit Warnung (gelbes Hologramm).
- Ein Band, das in eine fremde harte Box ragt, gibt nur eine Warnung (gelb), keine Sperre. Eine Einstellung für hartes Clipping gibt es nicht (mehr).
- **Regel für den Generator:** Keine Warnungen. Weder harte noch weiche Boxen dürfen überlappen, Bänder dürfen nicht in fremde Boxen ragen. Ein Plan soll warnungsfrei nachbaubar sein.

## Maschinen

- Ports liegen innerhalb der harten Box (z. B. Constructor: Port bei Y ±3, Box bis ±5). Ein angeschlossenes Band beginnt am Port in der Maschine (im Spiel getestet). Für das Layout zählt das Band erst ab der Kante der Box.
- Maschinen lassen sich nicht Port an Port verbinden. Zwischen zwei Ports liegt mindestens der Abstand beider Ports zur Kante ihrer Box (Constructor → Constructor: 2 + 2 = 4 m Band).

## Bänder

- Ein Band belegt im Querschnitt den Raum eines **Conveyor Pole Stackable**: 2 m breit, 2 m hoch (Spielerfahrung). Laut Export hat der Stacker eine weiche Box von 1 × 2 × 2 m (X −0,5…0,5, Y −1…1, Z 0…2) und rastet das Band bei Z = 3 m ein.
- Mindestlänge zwischen zwei Stützen bzw. Anschlüssen: 2 m (Spielerfahrung), passt zu `mMeshLength` = 200 cm.
- **Kurven:** 90°, kleinster Radius der Mittellinie 2 m (Spielerfahrung). Abgeleitet aus einer Kehre (zwei 90°-Kurven + 2-m-Stück) auf einer 8-m-Foundation: Abstand der Mittellinien 8 − 2 = 6 m = 2 + 2 + 2 m. Eine 90°-Kurve belegt 4 × 4 m.
- **Rampe:** Ein schräges Band überwindet 2 m Höhe auf mindestens 3 m Länge (Spielerfahrung), ist aber unüblich. **Festlegung:** Der Generator meidet Rampen; als Notlösung für 2 m Höhe mit 4 m Länge.

## Lifts

- Ein Lift ist 2 m breit (¼ Foundation, Spielerfahrung).
- Mindesthöhe frei gebaut (Unter- und Oberteil): 6 m. Wenn der Lift einrastet (z. B. an einer Stütze): 4 m (Spielerfahrung). 2 m Höhenunterschied geht mit keinem Lift.
- **Förderlift-Durchführung** (`Build_FoundationPassthrough_Lift`): Der Lift geht durch die Foundation, darüber bleibt nur der Kopf als Umlenkung von senkrecht auf waagerecht (Spielerfahrung). Passt zur Unterboden-Ebene aus dem Konzept.
- Der Fuß eines Lifts lässt sich direkt an einen Splitter-Port setzen, ohne Band dazwischen. Mit der Durchführung ergibt das kurze Abzweige: Splitter unter der Foundation, Lift am Port, durch die Durchführung nach oben (Spielerfahrung).
- Der Lift lässt sich auch in den Splitter hineinbauen. **Festlegung:** Der Generator setzt den Liftfuß außen an den Port (übliche Bauweise).

## Splitter und Merger

- Ports 1 m vom Mittelpunkt in alle vier Richtungen, auf Höhe Z = 0 des Bauteils.
- **Horizontal** belegen sie ihre weiche Box von 4 × 4 m: Mittenabstand 4 m nebeneinander ist warnungsfrei, 3 m gibt eine Warnung (im Spiel getestet).
- **Senkrecht** lassen sie sich im 2-m-Abstand warnungsfrei stapeln, obwohl sich die weichen Boxen (Z −0,8…1,8, 2,6 m hoch) um 0,6 m überlappen (im Spiel getestet, Grund unbekannt). Ein Band lässt sich 2 m über einem Splitter warnungsfrei hinwegführen.
- Splitter lassen sich im Spiel auf beliebiger Höhe setzen. **Festlegung:** Der Generator setzt sie auf die Bandebenen.

### Vertikale Splitter und Merger

- `TopConnection`/`BottomConnection` mit Richtung `FCD_ANY`, zwei seitliche Ports ±1 m in Y. Mesh-Bounds X ±1,88, Y ±2,10, Z −0,75…2,80.
- Keine Clearance: Im Spiel lassen sie sich ineinander bauen, ohne Warnung.
- **Festlegung:** In Richtung der Ports 4 m Mittenabstand wie beim normalen Splitter. An den Seiten ohne Port (±X) 2 m, also Lift an Lift. Übereinander in derselben Säule mindestens 4 m, weil an den seitlichen Ports ein Band angeschlossen wird. Begründung: Ineinander gebaute Teile sind schwer nachzubauen und sehen kaputt aus.

## Strom

- Strommasten müssen auf den Boden, nicht auf Maschinendächer (Spielerfahrung).
- **Daisy Chaining:** Die Stromanschlüsse aller Produktionsmaschinen haben `mAllowDaisyChaining = true` (Export). Erst nach der Erforschung lassen sich Maschinen direkt untereinander verbinden (Spielerfahrung). Freigeschaltet durch die M.A.M.-Forschung „Verbesserte Stromanschlüsse“ (`Research_Caterium_5_2_C`, Caterium-Baum; Quelle: `Docs.json`). Wie viele Leitungen ein Maschinenanschluss trägt, steht nicht im Export *(prüfen)*.
- Anschlüsse je Mast (`mMaxNumConnectionLinks`): Mk1 4, Mk2 7, Mk3 10; Wandanschlüsse gleich, doppelte Wandanschlüsse je Seite. Eine Leitung davon geht für die Zuleitung ab.
- **Festlegung:** Zwei Modi, der Spieler wählt, ob Daisy Chain verfügbar ist.
  - *Ohne Daisy Chain* (Standard): Mast am Boden auf einem freien Platz nahe dem Stromanschluss der ersten Maschine. Ein Mast versorgt höchstens die Hälfte seiner Anschlüsse an Maschinen, aufgerundet (Mk1: 2, Mk2: 4, Mk3: 5). Die übrigen Anschlüsse bleiben für Zuleitung und Verbindungen zu anderen Masten. Für die nächste Maschine kommt ein neuer Mast. Stellfläche: weiche Box 0,8 × 0,8 m, auf dem 1-m-Raster also 1 × 1 m, Höhe 7,6 (Mk1) bis 9,5 m (Mk3) (Export).
  - *Mit Daisy Chain*: keine Masten im Bauplan. Maschinen in Kette, Baupläne untereinander ebenfalls per Daisy Chain verbunden.

## Offene Punkte

- Höhe des Bandanschlusses am Kopf der Förderlift-Durchführung *(vermutlich 1 m wie die Ports)*.
- Bedeutung von `ExcludeForSnapping` an harten Boxen.
- Fehlendes `mDirection` an Eingängen wird als Eingang gedeutet *(prüfen)*.
- Strom: maximale Leitungslänge, ob Leitungen durch Gebäude führen dürfen, Platzbedarf eines Masts.
- Rohre und Flüssigkeiten (später, Schritt 6 im Konzept).
