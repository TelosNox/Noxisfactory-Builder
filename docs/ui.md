# Oberfläche

Eine Seite (`src/ui/App.tsx`, Preact), alles läuft im Browser. Die Rechnung liegt in `src/build/buildPlan.ts` und ist ohne UI testbar.

## Spielstand

Einmal festgelegt und jederzeit änderbar (`src/ui/config.ts`, `ConfigPanel.tsx`), gespeichert im `localStorage` des Browsers: größter Designer, höchste Band-, Rohr- und Maststufe, Strom (Masten, Daisy Chain, keiner), freigeschaltete Alternativrezepte, Items, die immer zugeliefert werden (Standard: Ingots), und das Kriterium für das optimale Rezept, dazu Aufschläge je Maschine und MW und wie stark kleine Nebenketten vermieden werden.

Spielstand finden (`src/ui/saveFolder.ts`, `SavePicker.tsx`): In Chrome und Edge wählt man einmal den Ordner `FactoryGame` (unter `%LOCALAPPDATA%`; auch `Saved`, `SaveGames` oder der Spielerordner gehen). Die Seite merkt sich den Ordner (File System Access API, Handle in IndexedDB) und sucht darunter `Saved/SaveGames/<id>/*.sav` (ohne `ServerManager`, ohne `blueprints`), neueste zuerst, mit Spielstand-Name ohne `_autosave_n`. Bei späteren Besuchen fragt der Browser beim Klick erneut nach Lesezugriff, sofern man ihn nicht dauerhaft erlaubt hat. Firefox und Safari kennen keinen Ordnerzugriff; dort bleibt die einzelne Datei. Ob Chrome den Ordner unter `AppData\Local` auswählen lässt, ist ungeprüft *(prüfen)*: Chrome sperrt einige Systemordner.

Aus Spielstand übernehmen (`src/ui/savegame.ts`): Eine `.sav`-Datei wird im Browser gelesen (Web Worker, `saveWorker.ts`, Parser `@etothepii/satisfactory-file-parser`), nichts wird hochgeladen. Der Rezept-Manager im Spielstand (`FGRecipeManager`, ältere Stände `BP_RecipeManager_C`, Eigenschaft `mAvailableRecipes`) listet alle freigeschalteten Rezepte, Baurezepte eingeschlossen. Daraus: Designer (`Recipe_BlueprintDesigner_C`, `_Mk2_C`, `_Mk3_C`), Band (`Recipe_ConveyorBeltMk1_C` … `Mk6`), Rohr (`Recipe_PipelineMK2_C`), Masten (`Recipe_PowerPoleMk1_C` … `Mk3`) und die Alternativrezepte. Strom, Zulieferungen und Kriterium bleiben, wie sie sind. Idee nach SatisfactoryTools (MIT), eigene Umsetzung.

## Ablauf

Zwei Schritte: Die Produktionskette rechnet bei jeder Änderung neu (nur das LP, schnell). Baupläne entstehen erst auf „Baupläne erzeugen“, weil Generator und Prüfung je Gruppe viele Layouts durchprobieren. Ändert sich danach etwas, verschwinden die Baupläne, bis man neu erzeugt.

1. **Produktionskette**: Planer (`docs/planner.md`) mit Produkt, Menge (oder „so viel wie verfügbar“) und Wasser am Bauort. „Verfügbar am Bauort“ setzt Höchstmengen für die Rohstoffe und Zulieferungen des Plans; scheitert ein Plan, bleiben die Felder des letzten Plans und die in der Meldung genannten stehen. Gezeigt werden Rezepte (Alternativen und erzwungene markiert), Maschinen bei 100 %, Rohstoffe, Zulieferung mit Mengen, Nebenprodukte und Überschuss.
   - Zulieferung: Jeder Zwischenschritt lässt sich auf „zuliefern“ stellen, jede Zulieferung auf „selbst bauen“. Gilt für diesen Plan; beim Produktwechsel gelten wieder die Standards.
   - Verwendete Alternativrezepte stehen gesondert, mit „Standard erzwingen“. Für Schritte mit Standardrezept die freigeschalteten Alternativen fürs selbe Produkt mit „erzwingen“, dazu die Zahl der nicht freigeschalteten. Erzwungenes lässt sich lösen.
2. **Baupläne**: Logistic Floor, Zuführung, Ausgangsrichtung, dann der Knopf.
3. **Passt das in einen Bauplan?** Ja, wenn die ganze Kette als Ketten-Modul (`src/generator/chain.ts`) in den Designer passt und eine Kopie reicht. Rezepte, die der Generator noch nicht kann, werden mit Grund genannt.
4. **Gruppen**: ein Bauplan pro Rezept, eine Reihe gleicher Maschinen (Modul „Reihe“, `docs/generator.md`).
5. **Bauanleitung** (Meta-Bauplan): Zulieferung, Reihenfolge von den Rohstoffen zum Produkt, wie oft jeder Bauplan gesetzt wird und wie die Kopien zusammenhängen.

## Rechnung je Gruppe

- Maschinen pro Bauplan: größte Reihe, die in den Designer passt und deren Bänder reichen (Generator + Prüfung).
- Kopien: benötigte Maschinen ÷ Maschinen pro Bauplan, aufgerundet. Alle Kopien sind gleich, Ziel sind möglichst wenige Kopien (am besten ein Bauplan, einmal gesetzt). Geht die Zahl der Maschinen nicht glatt auf, wird untertaktet, damit die Menge stimmt (kein Übertakten). Die Seite weist dann darauf hin.
- Mengen mit ganzen Maschinen (`wholeRates`, schon im Rezeptschritt): je Schritt die nächstniedrigere und nächsthöhere Menge, bei der die Zielmaschine oder eine direkte Vorstufe ganze Maschinen braucht. Bei gleicher Rezeptwahl wachsen alle Maschinenzahlen proportional zur Menge, das braucht keine neue Rechnung. Weiter zurück wird nicht gesucht (Spieler): Mit Alternativrezepten geht fast nie die ganze Kette glatt auf. Ob sich die Maschinen gleichmäßig auf die Kopien verteilen, bleibt dabei unberücksichtigt.
- Stränge: Kopien, die per Autoconnect am Ende der Zuführung angehängt werden, teilen sich Zuleitung und Ausgang. Ein Strang trägt höchstens ein Band; was darüber liegt, bekommt einen eigenen Strang mit eigener Zuleitung.
- Stufe: längster Weg von den Rohstoffen, bestimmt die Reihenfolge der Bauanleitung.

## Ketten-Modul

Bilden die Schritte eine gerade Linie (jeder Schritt verarbeitet nur das Produkt des vorigen, je ein Ein- und Ausgang), versucht die Rechnung zuerst einen Bauplan für die ganze Kette: Reihen hintereinander, die Ausgangsleitung einer Reihe ist die Zuleitung der nächsten. Passt die volle Kette nicht, wird sie auf 2, 3, … gleiche Kopien mit je eigener Zuleitung verteilt (höchstens 8). Erst wenn das scheitert, gibt es einen Bauplan pro Rezept. Nur mit Ausgang in gleicher Richtung.

## Offen

- Verzweigte Ketten in einem Bauplan (mehrere Zutaten, z. B. Reinforced Iron Plate).
- Ketten-Modul im Spiel testen.
- Verbindungen zwischen den Gruppen (welcher Ausgang speist welchen Strang).
- Blueprint-Download: braucht Vorlagen aus Spieler-Blueprints, die nicht im Repo liegen.

## Vorschau

Draufsicht je Bauplan (`src/ui/Preview.tsx`), von der Eingangsseite aus gesehen: Zuführung unten, „links“ links. Orange Rahmen: Designer, Gitter: Foundations. Gefüllt: harte Boxen, gestrichelt: weiche Boxen. Graue Pfeile: Bänder in Flussrichtung, orange: Stummel und offene Enden.

Umschalter „3D“ (`src/ui/Preview3D.tsx`, three.js, erst beim Öffnen geladen): harte Boxen der Maschinen, Splitter und Merger als Würfel, Bänder als Streifen mit Pfeil in Flussrichtung, Lifts als Säulen, Durchführungen grau. Beim Logistic Floor zeigt eine halbtransparente Platte die Foundation-Ebene (nicht Teil des Bauplans, ausblendbar). Orangefarbener Drahtwürfel: Designer. Die Kamera richtet sich auf den Inhalt aus.
