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
