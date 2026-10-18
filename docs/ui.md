# Oberfläche

Eine Seite (`src/ui/App.tsx`, Preact), alles läuft im Browser. Die Rechnung liegt in `src/build/buildPlan.ts` und ist ohne UI testbar.

## Ablauf

1. **Produktionskette**: Planer (`docs/planner.md`) mit Produkt und Menge. Gezeigt werden Rezepte, Maschinen bei 100 %, Rohstoffe und Überschuss.
2. **Passt das in einen Bauplan?** Ja nur, wenn die Kette aus einem Rezept besteht und eine Kopie reicht. Rezepte, die der Generator noch nicht kann, werden mit Grund genannt.
3. **Gruppen**: ein Bauplan pro Rezept, eine Reihe gleicher Maschinen (Modul „Reihe“, `docs/generator.md`).
4. **Bauanleitung** (Meta-Bauplan): Reihenfolge von den Rohstoffen zum Produkt, wie oft jeder Bauplan gesetzt wird und wie die Kopien zusammenhängen.

## Rechnung je Gruppe

- Maschinen pro Bauplan: größte Reihe, die in den Designer passt und deren Bänder reichen (Generator + Prüfung).
- Kopien: benötigte Maschinen ÷ Maschinen pro Bauplan, aufgerundet. Alle Kopien sind gleich, die Maschinen werden gleichmäßig verteilt. Der Takt wird so gesenkt, dass die Menge genau stimmt (Untertakten, kein Übertakten).
- Stränge: Kopien, die per Autoconnect am Ende der Zuführung angehängt werden, teilen sich Zuleitung und Ausgang. Ein Strang trägt höchstens ein Band; was darüber liegt, bekommt einen eigenen Strang mit eigener Zuleitung.
- Stufe: längster Weg von den Rohstoffen, bestimmt die Reihenfolge der Bauanleitung.

## Offen

- Mehrere Rezepte in einem Bauplan (komplexe Module).
- Verbindungen zwischen den Gruppen (welcher Ausgang speist welchen Strang).
- Blueprint-Download: braucht Vorlagen aus Spieler-Blueprints, die nicht im Repo liegen.
- Auswahl von Alternativrezepten, Mast-Stufe, Daisy Chain.
