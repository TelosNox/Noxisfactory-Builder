# Blueprint-Dateien

Lesen und Schreiben mit `@etothepii/satisfactory-file-parser` (MIT). Erkenntnisse aus eigenen Blueprints (Spielversion 1.1/1.2) und den PoC-Skripten in `tools/poc/`.

## Stand

- Einlesen und Zurückschreiben ist byteidentisch, das Spiel lädt das Ergebnis (`roundtrip.ts`).
- Geänderte Blueprints funktionieren: Merger verschoben, Band verlängert, im Spiel baubar (`modify.ts`).
- Neu erzeugte Blueprints funktionieren: Constructor mit zwei angeschlossenen Bändern, Kopf (Größe, Rezepte, Kosten) selbst berechnet, im Spiel baubar, Kosten korrekt (`generate.ts`).

## Erzeugen

- Objekte werden aus Vorlagen geklont (Gebäude samt Komponenten aus einem vorhandenen Blueprint), dann mit neuem Namen, Position und Verbindungen versehen. Instanznamen: `Build_<Klasse>_C_<Zahl>`, eindeutig im Blueprint.
- Der Kopf braucht `designerDimension`, `recipeReferences` (Baurezepte aller Gebäude) und `itemCosts`. Kosten: Summe der Baurezepte; Bänder kosten je angefangene 2 m ein Rezept (abgeleitet aus Vorlagen, im Spiel bestätigt für Mk5).
- Vorlagen nur aus Blueprints ohne Mod-Inhalte (alle Klassen unter `/Game/FactoryGame/` oder `/Script/`) und aus Sessions, die ohne Mods gespielt wurden. Quellen: Session „1.1 Spass“ (Spielversion 1.1/1.2) und zwei Vorlagen-Blueprints aus „Bananendödels“ (Build 513885 = 1.2.4.1). `tools/poc/inventory.ts` listet, welche Klassen ein Blueprint-Ordner liefert.
- Die Vorlagen-Blueprints aus 1.2 enthalten alle Splitter- und Merger-Varianten (normal, Smart, Programmable, Priority, jeweils auch vertikal), Bänder Mk1/Mk2, Lifts Mk1/Mk2/Mk4/Mk5, Stütze, Stacker, Masten Mk2/Mk3, Blender, Rohrteile. Maschinen, Bänder Mk3–Mk5 und Lift Mk3 kommen aus „1.1 Spass“.
- Es fehlen nur Band und Lift Mk6 (nicht freigeschaltet).
- **Stufen von Bändern und Lifts unterscheiden sich nur im Namen** (Klasse, Rezept). Verglichen: Band Mk1/Mk2/Mk5, Lift Mk2/Mk4; nach Ersetzen von `MkN` identisch. Mk6 lässt sich daher aus Mk5 herleiten (Klasse `Build_ConveyorBeltMk6_C`, Rezept `Recipe_ConveyorBeltMk6_C`; Kosten laut `Docs.json`: Band 1 Ficsite Mesh + 1 Time Crystal je Segment, Lift 2 + 2) *(im Spiel nicht prüfbar, Mk6 nicht freigeschaltet)*.
- Unterschied zwischen Vorlagen aus 1.1 und 1.2: In 1.2 gibt es zusätzlich die Eigenschaft `BuiltBy`. Vorlagen aus 1.2 bevorzugen.
- Vorlagen gibt es nur für Gebäude, die in einem Blueprint vorkommen. Für jedes weitere Gebäude braucht es eine Vorlage oder ein Wissen darüber, welche Komponenten und Eigenschaften es hat.

## Aufbau

- `.sbp`: Kopf (Version, Designer-Größe in Foundations, Materialkosten, Rezeptliste), danach zlib-komprimierter Rumpf im Objektformat der Spielstände. `.sbpcfg`: Name, Beschreibung, Icon, Farbe.
- Koordinaten in cm, Mittelpunkt des Blueprints im Ursprung.
- Jedes Gebäude ist eine `SaveEntity` mit `transform` (Rotation als Quaternion, Position, Skalierung) und einer Liste von Komponenten (`SaveComponent`: Ports, Inventare, Strom, Beine), benannt `<Gebäude>.<Komponente>`.
- Verbindungen stehen auf beiden Seiten: `mConnectedComponent` am Port verweist auf den Port des Gegenübers. Offene Enden haben keine Eigenschaft.

## Bänder

- `mSplineData`: Punkte mit `Location`, `ArriveTangent`, `LeaveTangent`, relativ zur Transformation des Band-Actors.
- Gerades Band mit zwei Punkten: innere Tangenten haben die halbe Länge des Bands in Laufrichtung, die äußeren Tangenten (Ankunft am ersten, Abgang am letzten Punkt) die Länge 1. So schreibt es das Spiel; im Spiel bestätigt für 3 m → 5 m.

## Name

Das Spiel kürzt Blueprint-Namen auf 32 Zeichen (im Spiel beobachtet). `src/blueprint/name.ts` baut kurze Namen wie `IronPlateReinforced x2 B3 LF F6`: Maschinen, Bandstufe, Zuführung (L/R) und Ausgang (F gleiche Richtung, R zurück), Logistic Floor. Der Rezeptteil wird gekürzt, bis alles passt. Die Details stehen in der Beschreibung.

## Kosten von Bändern und Lifts

Abgeglichen mit den Kosten, die das Spiel in den Kopf von 28 Spieler-Blueprints geschrieben hat (1.1 Spass, Bananendödels):

- Lift: ein Baurezept je angefangene 4 m Höhe (1,5, 2 und 2,5 m kosten 1, 4,5 m kostet 2). Passt auf alle Blueprints mit Lifts.
- Band: ein Baurezept je angefangene 2 m passt fast immer. Ausnahme: 7-m-Bänder kosten im Spiel 3 statt 4 (Manufaktor Straight, Test, eigene Floor-Blueprints); 5 m kosten 3. Ursache unbekannt, vermutlich misst das Spiel die Länge anders. Der Designer zeigt beim Setzen ohnehin seine eigene Rechnung; die Kosten im Kopf sind nur eine Anzeige. Korrigieren: Bauplan einmal im Designer laden und neu speichern. Kein Handlungsbedarf.

## Stromleitungen

Aus Spieler-Blueprints (TelosDesert, Bananendödels): `Build_PowerLine_C` mit `mWireInstances` (zwei Endpunkte `Locations`, `CachedRelativeLocations` relativ zum Ursprung der Leitung, der an einem Ende sitzt), `mCachedLength` in cm und in `specialProperties` die Anschlüsse `source` und `target`. Beide Anschlüsse (`FGPowerConnectionComponent`) führen die Leitung in `mWires`. Kosten: 3 Kabel je Leitung, unabhängig von der Länge (38 Leitungen bis 30 m im HMF Encabulator).

## Rohre

`Build_Pipeline_C` (Mk1) und `Build_PipelineMK2_C` mit `mSplineData` wie Bänder, Anschlüsse `PipelineConnection0/1` über `mConnectedComponent`. Bögen mit vier Punkten: 1 m gerade, Bogen mit waagerechten Tangenten (Länge halbe Bogensehne, wie in der Referenz), 1 m gerade. Kosten in der Referenz grob 1 Baurezept je Rohr bis etwa 5 m; angenommen: je angefangene 6 m *(prüfen)*.
