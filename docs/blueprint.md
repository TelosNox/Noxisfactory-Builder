# Blueprint-Dateien

Lesen und Schreiben mit `@etothepii/satisfactory-file-parser` (MIT). Erkenntnisse aus eigenen Blueprints (Spielversion 1.1/1.2) und den PoC-Skripten in `tools/poc/`.

## Stand

- Einlesen und Zurückschreiben ist byteidentisch, das Spiel lädt das Ergebnis (`roundtrip.ts`).
- Geänderte Blueprints funktionieren: Merger verschoben, Band verlängert, im Spiel baubar (`modify.ts`).
- Offen: Blueprint komplett neu erzeugen.

## Aufbau

- `.sbp`: Kopf (Version, Designer-Größe in Foundations, Materialkosten, Rezeptliste), danach zlib-komprimierter Rumpf im Objektformat der Spielstände. `.sbpcfg`: Name, Beschreibung, Icon, Farbe.
- Koordinaten in cm, Mittelpunkt des Blueprints im Ursprung.
- Jedes Gebäude ist eine `SaveEntity` mit `transform` (Rotation als Quaternion, Position, Skalierung) und einer Liste von Komponenten (`SaveComponent`: Ports, Inventare, Strom, Beine), benannt `<Gebäude>.<Komponente>`.
- Verbindungen stehen auf beiden Seiten: `mConnectedComponent` am Port verweist auf den Port des Gegenübers. Offene Enden haben keine Eigenschaft.

## Bänder

- `mSplineData`: Punkte mit `Location`, `ArriveTangent`, `LeaveTangent`, relativ zur Transformation des Band-Actors.
- Gerades Band mit zwei Punkten: innere Tangenten haben die halbe Länge des Bands in Laufrichtung, die äußeren Tangenten (Ankunft am ersten, Abgang am letzten Punkt) die Länge 1. So schreibt es das Spiel; im Spiel bestätigt für 3 m → 5 m.
