# Planer

Wählt Rezepte und Maschinenzahlen für ein Produktionsziel. Code: `src/planner/`, Daten: `data/recipes.json`.

## Daten

`tools/extract_recipes.py` liest `Docs.json` (CommunityResources) und schreibt nur die Fakten, die der Planer braucht: Mengen je Zyklus, Dauer, Maschine, Leistung. Namen werden aus den Klassennamen abgeleitet, Spieltexte werden nicht übernommen. Flüssigkeiten in m³ (das Spiel speichert Liter).

Berücksichtigt sind Rezepte, die in Produktionsmaschinen laufen (Constructor bis Quantum Encoder), keine Werkbank- oder Baurezepte.

## Modell

Lineares Programm (`yalps`):

- Eine Variable je Rezept: Maschinen bei 100 % Takt (gebrochen).
- Eine Variable je Rohstoff: entnommene Menge pro Minute.
- Je Item: Produktion − Verbrauch + Entnahme ≥ Bedarf (Ziel oder 0). Überschuss ist erlaubt und wird als Nebenprodukt ausgewiesen.
- Ziel: Rohstoffverbrauch minimieren, alle Rohstoffe gleich gewichtet, Wasser mit 0,01. Dazu ein kleiner Term für die Maschinenzahl.

Standardrezepte (Grundset): alle Nicht-Alternativrezepte ohne Converter-Rezepte. Mit gleichen Gewichten würde der Solver sonst SAM in Erz umwandeln, um normales Erz zu sparen.

## Offen

- Gewichtung der Rohstoffe (z. B. nach Knappheit auf der Karte).
- Ganze Maschinenzahlen und Untertakten; Ausgabe für den Generator.

## Nebenprodukte

Nebenprodukt ist jedes Produkt eines Rezepts außer dem ersten (Hauptprodukt). `src/build/byproducts.ts` ordnet es zu:

- **Im Kreislauf**: Ein anderer Schritt verbraucht es (Wasser aus Aluminum Scrap → Alumina Solution, Silica aus Alumina Solution → Ingot Aluminum). Der Planer hat das schon eingerechnet; die Anleitung sagt, wohin es geht.
- **Überschuss**: Rest, den kein Schritt braucht. Muss weiterverarbeitet oder im Sink entsorgt werden; Flüssigkeiten vorher abfüllen.

Ein zurückgeführtes Nebenprodukt braucht Vorrang vor frischem Zufluss desselben Items, sonst staut es sich und hält die erzeugenden Maschinen an:

- Bänder: Prioritäts-Merger, Nebenprodukt auf den Vorrang-Eingang.
- Flüssigkeiten: Die tiefer eintretende Flüssigkeit hat Vorrang. Rücklauf tief anschließen, frischer Zufluss von höher. *(Quelle: Spielerfahrung des Nutzers)*

Automatisch geroutet wird noch nichts: Ketten in einem Bauplan können bisher nur Maschinen mit einem Ein- und Ausgang. Das Routing steht deshalb in der Bauanleitung.

Alternativrezepte: Alle Rezepte, die ein Schema vom Typ `EST_Alternate` freischaltet. Nicht alle tragen „Alternate“ im Klassennamen (z. B. Pure Aluminum Ingot).
