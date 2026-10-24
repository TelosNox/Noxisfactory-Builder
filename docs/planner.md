# Planer

Wählt Rezepte und Maschinenzahlen für ein Produktionsziel. Code: `src/planner/`, Daten: `data/recipes.json`.

## Daten

`tools/extract_recipes.py` liest `Docs.json` (CommunityResources) und schreibt nur die Fakten, die der Planer braucht: Mengen je Zyklus, Dauer, Maschine, Leistung. Namen werden aus den Klassennamen abgeleitet, Spieltexte werden nicht übernommen. Flüssigkeiten in m³ (das Spiel speichert Liter).

Berücksichtigt sind Rezepte, die in Produktionsmaschinen laufen (Constructor bis Quantum Encoder), keine Werkbank- oder Baurezepte.

## Modell

Lineares Programm (`yalps`):

- Eine Variable je Rezept: Maschinen bei 100 % Takt (gebrochen).
- Eine Variable je Rohstoff: entnommene Menge pro Minute.
- Eine Variable je zugeliefertem Item (Kosten 0): Der Plan nimmt es als geliefert, statt es herzustellen. Das Zielprodukt wird nie zugeliefert.
- Je Item: Produktion − Verbrauch + Entnahme ≥ Bedarf (Ziel oder 0). Überschuss ist erlaubt und wird als Nebenprodukt ausgewiesen.
- Ziel: Kosten nach dem gewählten Kriterium, dazu ein kleiner Term für die Maschinenzahl.

## Kriterien

„Optimal“ ist einstellbar (Spielstand):

- **Knappe Rohstoffe schonen** (Standard): Gewicht je Rohstoff = Förderrate Eisenerz der Karte ÷ Förderrate dieses Rohstoffs (`WORLD_LIMIT` in `planner.ts`). Quelle: Satisfactory Wiki, Summen aller Vorkommen bei Miner Mk3 / Extraktoren mit 250 % *(prüfen)*.
- **Wenig Rohstoffe**: alle Rohstoffe gleich.
- **Wenig Maschinen**: Kosten 1 je Maschine, Rohstoffe nur als Gleichstandsregel.
- **Wenig Strom**: Leistung je Maschine bei 100 % (bei variabler Leistung das Maximum).

Wasser ist auf der Karte unbegrenzt, hängt aber davon ab, wie gut sich Extraktoren am Bauort setzen lassen (Spieler). Deshalb pro Plan: frei verfügbar (Gewicht 0,01, Standard), wie Eisenerz (1), meiden (10). Mit freiem Wasser gewinnen Rezepte wie Pure Iron Ingot fast immer.

## Alternativrezepte und erzwungene Rezepte

- Freigeschaltete Alternativrezepte stehen im Spielstand; der Planer darf sie zusätzlich zu den Standardrezepten nutzen und nimmt sie, wenn sie nach dem Kriterium günstiger sind.
- Ein erzwungenes Rezept ist das einzige für sein Hauptprodukt (Alternative oder Standard). Damit lassen sich andere Varianten gezielt ausprobieren.
- Beobachtung: Mit vielen freigeschalteten Alternativen mischt das Optimum gern Splitter-Ketten mit Bruchteilen einer Maschine ein. Abhilfe wäre eine Strafe pro verwendetem Rezept (braucht ganzzahlige Variablen); bis dahin per Erzwingen.

Standardrezepte (Grundset): alle Nicht-Alternativrezepte ohne Converter-Rezepte. Mit gleichen Gewichten würde der Solver sonst SAM in Erz umwandeln, um normales Erz zu sparen.

## Offen

- Strafe für viele kleine Schritte (siehe oben).

## Nebenprodukte

Nebenprodukt ist jedes Produkt eines Rezepts außer dem ersten (Hauptprodukt). `src/build/byproducts.ts` ordnet es zu:

- **Im Kreislauf**: Ein anderer Schritt verbraucht es (Wasser aus Aluminum Scrap → Alumina Solution, Silica aus Alumina Solution → Ingot Aluminum). Der Planer hat das schon eingerechnet; die Anleitung sagt, wohin es geht.
- **Überschuss**: Rest, den kein Schritt braucht. Muss weiterverarbeitet oder im Sink entsorgt werden; Flüssigkeiten vorher abfüllen.

Ein zurückgeführtes Nebenprodukt braucht Vorrang vor frischem Zufluss desselben Items, sonst staut es sich und hält die erzeugenden Maschinen an:

- Bänder: Prioritäts-Merger, Nebenprodukt auf den Vorrang-Eingang.
- Flüssigkeiten: Die tiefer eintretende Flüssigkeit hat Vorrang. Rücklauf tief anschließen, frischer Zufluss von höher. *(Quelle: Spielerfahrung des Nutzers)*

Automatisch geroutet wird noch nichts: Ketten in einem Bauplan können bisher nur Maschinen mit einem Ein- und Ausgang. Das Routing steht deshalb in der Bauanleitung.

Alternativrezepte: Alle Rezepte, die ein Schema vom Typ `EST_Alternate` freischaltet. Nicht alle tragen „Alternate“ im Klassennamen (z. B. Pure Aluminum Ingot).
