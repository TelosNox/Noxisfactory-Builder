# Planer

Wählt Rezepte und Maschinenzahlen für ein Produktionsziel. Code: `src/planner/`, Daten: `data/recipes.json`.

## Daten

`tools/extract_recipes.py` liest `Docs.json` (CommunityResources) und schreibt nur die Fakten, die der Planer braucht: Mengen je Zyklus, Dauer, Maschine, Leistung. Namen werden aus den Klassennamen abgeleitet, Spieltexte werden nicht übernommen. Ausnahme `NAMES` im Skript, wo der Klassenname ein anderes Produkt nennt als das Spiel: `Desc_Fuel_C` ist Packaged Fuel, `Desc_LiquidFuel_C` ist Fuel (ebenso Turbo Fuel). Flüssigkeiten in m³ (das Spiel speichert Liter).

Berücksichtigt sind Rezepte, die in Produktionsmaschinen laufen (Constructor bis Quantum Encoder), keine Werkbank- oder Baurezepte.

## Modell

Lineares Programm (`yalps`):

- Eine Variable je Rezept: Maschinen bei 100 % Takt (gebrochen).
- Eine Variable je Rohstoff: entnommene Menge pro Minute.
- Eine Variable je zugeliefertem Item (Kosten 0): Der Plan nimmt es als geliefert und stellt es nie selbst her, auch wenn die Menge begrenzt ist. Das Zielprodukt wird nie zugeliefert.
- Je Item: Produktion − Verbrauch + Entnahme ≥ Bedarf (Ziel oder 0). Überschuss ist erlaubt und wird als Nebenprodukt ausgewiesen.
- Ziel: Kosten nach dem gewählten Kriterium, dazu ein kleiner Term für die Maschinenzahl und die Aufschläge (unten).

## Kriterien

„Optimal“ ist einstellbar (Spielstand):

- **Knappe Rohstoffe schonen** (Standard): Gewicht je Rohstoff = Förderrate Eisenerz der Karte ÷ Förderrate dieses Rohstoffs (`WORLD_LIMIT` in `planner.ts`). Quelle: Satisfactory Wiki, Vorkommen je Reinheit × 300 / 600 / 1200 pro Minute (Miner Mk3 mit 250 %, Flüssigkeiten 150 / 300 / 600). Abgeglichen mit den Standardgewichten von SatisfactoryTools: alle gleich bis auf Kalkstein, dort war 69 900 falsch, richtig 69 300 (15 / 50 / 29 Vorkommen).
- **Wenig Rohstoffe**: alle Rohstoffe gleich.
- **Wenig Maschinen**: Kosten 1 je Maschine, Rohstoffe nur als Gleichstandsregel.
- **Wenig Strom**: Leistung je Maschine bei 100 % (bei variabler Leistung das Maximum).

Wasser ist auf der Karte unbegrenzt, hängt aber davon ab, wie gut sich Extraktoren am Bauort setzen lassen (Spieler). Deshalb pro Plan: frei verfügbar (Gewicht 0,01, Standard), wie Eisenerz (1), meiden (10). Mit freiem Wasser gewinnen Rezepte wie Pure Iron Ingot fast immer.

Aufschläge (Spielstand), in Eisenerz pro Minute, kommen zum Kriterium hinzu: je Maschine und je MW. So lässt sich etwa „Rohstoffe schonen, aber nicht um jeden Preis an Maschinen“ einstellen (Idee: SatisfactoryTools gewichtet Strom und Maschinen standardmäßig mit 0,1).

## Kleine Nebenketten

Mit vielen Alternativen mischt das reine LP gern Splitter-Ketten mit Bruchteilen einer Maschine ein (Heavy Modular Frame mit allen Alternativen: 16 Schritte, darunter fünf unter 0,15 Maschinen). Abhilfe: Jedes verwendete Rezept kostet einen Anteil der Plankosten extra (Spielstand: aus, leicht 1 %, mittel 3 %, stark 10 %; Standard leicht).

Exakt wäre das ein ganzzahliges Programm (eine Binärvariable je Rezept). Mit yalps dauert das bei großen Ketten über eine Sekunde (Lightweight Motor: Timeout nach 1 s) und läuft bei jeder Eingabe. Deshalb gierig mit normalen LPs: Die verwendeten Rezepte werden von der kleinsten Maschinenzahl an probeweise verboten; der Plan ohne das Rezept bleibt, wenn Kosten plus Aufschläge sinken. Der Vergleich zählt die Rezepte des neuen Plans, weil ein Ersatz andere Rezepte nach sich ziehen kann. Erzwungene Rezepte bleiben. Dauer: unter 50 ms. Ergebnis bei 1 %: Heavy Modular Frame 11 statt 16 Schritte bei 0,8 % mehr Rohstoffen.

## Verfügbare Mengen und Maximum

Je Bauort lässt sich für Rohstoffe und Zulieferungen eine Höchstmenge pro Minute setzen (`available`). Leer heißt unbegrenzt.

- **Feste Menge**: Reichen die Mengen nicht, rechnet der Planer ohne Grenzen nach und nennt, welche Grenzen der Plan überschreitet („Ore Iron 90/min nötig, 30/min verfügbar“).
- **So viel wie verfügbar** (`maximize`): Erst die höchste Menge des Ziels aus den Grenzen bestimmen, dann für diese Menge (minimal darunter, gegen Rundung) den günstigsten Plan nach Kriterium. Ist das Ziel aus unbegrenzten Zuflüssen beliebig herstellbar, nennt die Meldung diese Zuflüsse (zweite Rechnung mit riesiger Obergrenze für die unbegrenzten); man gibt dafür eine Menge an, notfalls 0.

## Alternativrezepte und erzwungene Rezepte

- Maschinen, die noch nicht freigeschaltet sind (Spielstand), fallen mit all ihren Rezepten weg; erzwungene Rezepte bleiben.

- Freigeschaltete Alternativrezepte stehen im Spielstand; der Planer darf sie zusätzlich zu den Standardrezepten nutzen und nimmt sie, wenn sie nach dem Kriterium günstiger sind.
- Ein erzwungenes Rezept ist das einzige für sein Hauptprodukt (Alternative oder Standard). Damit lassen sich andere Varianten gezielt ausprobieren.

Standardrezepte (Grundset): alle Nicht-Alternativrezepte ohne Converter-Rezepte. Mit gleichen Gewichten würde der Solver sonst SAM in Erz umwandeln, um normales Erz zu sparen.

## Nebenprodukte

Nebenprodukt ist jedes Produkt eines Rezepts außer dem ersten (Hauptprodukt). `src/build/byproducts.ts` ordnet es zu:

- **Im Kreislauf**: Ein anderer Schritt verbraucht es (Wasser aus Aluminum Scrap → Alumina Solution, Silica aus Alumina Solution → Ingot Aluminum). Der Planer hat das schon eingerechnet; die Anleitung sagt, wohin es geht.
- **Überschuss**: Rest, den kein Schritt braucht. Muss weiterverarbeitet oder im Sink entsorgt werden; Flüssigkeiten vorher abfüllen.

Ein zurückgeführtes Nebenprodukt braucht Vorrang vor frischem Zufluss desselben Items, sonst staut es sich und hält die erzeugenden Maschinen an:

- Bänder: Prioritäts-Merger, Nebenprodukt auf den Vorrang-Eingang.
- Flüssigkeiten: Die tiefer eintretende Flüssigkeit hat Vorrang. Rücklauf tief anschließen, frischer Zufluss von höher. *(Quelle: Spielerfahrung des Nutzers)*

Automatisch geroutet wird noch nichts: Ketten in einem Bauplan können bisher nur Maschinen mit einem Ein- und Ausgang. Das Routing steht deshalb in der Bauanleitung.

Alternativrezepte: Alle Rezepte, die ein Schema vom Typ `EST_Alternate` freischaltet. Nicht alle tragen „Alternate“ im Klassennamen (z. B. Pure Aluminum Ingot).
