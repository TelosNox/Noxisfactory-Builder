# Oberfläche

Eine Seite (`src/ui/App.tsx`, Preact), alles läuft im Browser. Die Rechnung liegt in `src/build/buildPlan.ts` und ist ohne UI testbar.

## Ablauf

1. **Produktionskette**: Planer (`docs/planner.md`) mit Produkt und Menge. Gezeigt werden Rezepte, Maschinen bei 100 %, Rohstoffe und Überschuss.
2. **Passt das in einen Bauplan?** Ja, wenn die ganze Kette als Ketten-Modul (`src/generator/chain.ts`) in den Designer passt und eine Kopie reicht. Rezepte, die der Generator noch nicht kann, werden mit Grund genannt.
3. **Gruppen**: ein Bauplan pro Rezept, eine Reihe gleicher Maschinen (Modul „Reihe“, `docs/generator.md`).
4. **Bauanleitung** (Meta-Bauplan): Reihenfolge von den Rohstoffen zum Produkt, wie oft jeder Bauplan gesetzt wird und wie die Kopien zusammenhängen.

## Rechnung je Gruppe

- Maschinen pro Bauplan: größte Reihe, die in den Designer passt und deren Bänder reichen (Generator + Prüfung).
- Kopien: benötigte Maschinen ÷ Maschinen pro Bauplan, aufgerundet. Alle Kopien sind gleich, Ziel sind möglichst wenige Kopien (am besten ein Bauplan, einmal gesetzt). Geht die Zahl der Maschinen nicht glatt auf, wird untertaktet, damit die Menge stimmt (kein Übertakten). Die Seite weist dann darauf hin und schlägt die nächstniedrigere und die nächsthöhere Menge vor, bei der alle Maschinen mit 100 % laufen. Grundlage ist die kleinste Menge, bei der jeder Schritt ganze Maschinen braucht (`unitRate`); geprüft werden deren Vielfache.
- Stränge: Kopien, die per Autoconnect am Ende der Zuführung angehängt werden, teilen sich Zuleitung und Ausgang. Ein Strang trägt höchstens ein Band; was darüber liegt, bekommt einen eigenen Strang mit eigener Zuleitung.
- Stufe: längster Weg von den Rohstoffen, bestimmt die Reihenfolge der Bauanleitung.

## Ketten-Modul

Bilden die Schritte eine gerade Linie (jeder Schritt verarbeitet nur das Produkt des vorigen, je ein Ein- und Ausgang), versucht die Rechnung zuerst einen Bauplan für die ganze Kette: Reihen hintereinander, die Ausgangsleitung einer Reihe ist die Zuleitung der nächsten. Passt die volle Kette nicht, wird sie auf 2, 3, … gleiche Kopien mit je eigener Zuleitung verteilt (höchstens 8). Erst wenn das scheitert, gibt es einen Bauplan pro Rezept. Nur mit Ausgang in gleicher Richtung.

## Offen

- Verzweigte Ketten in einem Bauplan (mehrere Zutaten, z. B. Reinforced Iron Plate).
- Ketten-Modul im Spiel testen.
- Verbindungen zwischen den Gruppen (welcher Ausgang speist welchen Strang).
- Blueprint-Download: braucht Vorlagen aus Spieler-Blueprints, die nicht im Repo liegen.
- Auswahl von Alternativrezepten, Mast-Stufe, Daisy Chain.
