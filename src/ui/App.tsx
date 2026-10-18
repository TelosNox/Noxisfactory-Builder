// Planner page: production chain, fit check, groups and the build instructions.

import { useMemo, useState } from 'preact/hooks';
import { gameData, type ItemId } from '../planner/gameData';
import { plan, standardRecipes, type Plan } from '../planner/planner';
import { buildPlan, type BuildOptions, type BuildPlan, type Group } from '../build/buildPlan';

const products: ItemId[] = [
  ...new Set(standardRecipes().flatMap((r) => Object.keys(gameData.recipes[r].out))),
]
  .filter((id) => !gameData.items[id]?.resource)
  .sort((a, b) => itemName(a).localeCompare(itemName(b)));

function itemName(id: ItemId) {
  return gameData.items[id]?.name ?? id;
}
const machineName = (cls: string) => gameData.machines[cls]?.name ?? cls;
const recipeName = (id: string) => gameData.recipes[id]?.name ?? id;
const fmt = (n: number, digits = 2) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });
const rates = (r: Record<ItemId, number>, factor = 1) =>
  Object.entries(r).map(([item, v]) => `${fmt(v * factor)} ${itemName(item)}`).join(', ');

export function App() {
  const [item, setItem] = useState<ItemId>('Desc_IronPlate_C');
  const [rate, setRate] = useState(60);
  const [opt, setOpt] = useState<BuildOptions>({ designer: 4, beltTier: 1, feedFrom: 'left', output: 'forward' });

  const result = useMemo((): { plan: Plan; build: BuildPlan } | { error: string } => {
    try {
      const p = plan({ item, rate });
      return { plan: p, build: buildPlan(p, opt) };
    } catch (error) {
      return { error: String((error as Error).message) };
    }
  }, [item, rate, opt]);

  const set = <K extends keyof BuildOptions>(key: K, value: BuildOptions[K]) => setOpt({ ...opt, [key]: value });

  return (
    <>
      <h1>Noxisfactory Builder</h1>
      <section class="inputs">
        <label>
          Produkt
          <select value={item} onChange={(e) => setItem(e.currentTarget.value)}>
            {products.map((id) => (
              <option value={id}>{itemName(id)}</option>
            ))}
          </select>
        </label>
        <label>
          Menge / min
          <input type="number" min="0" step="any" value={rate} onInput={(e) => setRate(+e.currentTarget.value)} />
        </label>
        <label>
          Blueprint Designer
          <select value={opt.designer} onChange={(e) => set('designer', +e.currentTarget.value)}>
            {[4, 5, 6].map((d) => (
              <option value={d}>Mk{d - 3} ({d}×{d} Foundations)</option>
            ))}
          </select>
        </label>
        <label>
          Höchste Bandstufe
          <select value={opt.beltTier} onChange={(e) => set('beltTier', +e.currentTarget.value)}>
            {[1, 2, 3, 4, 5, 6].map((t) => (
              <option value={t}>Mk{t}</option>
            ))}
          </select>
        </label>
        <label>
          Zuführung von
          <select value={opt.feedFrom} onChange={(e) => set('feedFrom', e.currentTarget.value as 'left' | 'right')}>
            <option value="left">links</option>
            <option value="right">rechts</option>
          </select>
        </label>
        <label>
          Ausgang
          <select value={opt.output} onChange={(e) => set('output', e.currentTarget.value as 'forward' | 'reverse')}>
            <option value="forward">gleiche Richtung</option>
            <option value="reverse">zurück zum Eingang</option>
          </select>
        </label>
      </section>

      {'error' in result ? (
        <p class="error">{result.error}</p>
      ) : (
        rate > 0 && <Result plan={result.plan} build={result.build} opt={opt} />
      )}
    </>
  );
}

function Result({ plan, build, opt }: { plan: Plan; build: BuildPlan; opt: BuildOptions }) {
  const unsupported = build.groups.filter((g) => g.unsupported);
  return (
    <>
      <section>
        <h2>1. Produktionskette</h2>
        <table>
          <thead>
            <tr><th>Rezept</th><th>Maschine</th><th class="num">Anzahl (100 %)</th></tr>
          </thead>
          <tbody>
            {build.groups.map((g) => (
              <tr>
                <td>{recipeName(g.recipe)}</td>
                <td>{machineName(gameData.recipes[g.recipe].machine)}</td>
                <td class="num">{fmt(g.machinesExact)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Rohstoffe: {rates(plan.resources) || '–'}</p>
        {Object.keys(plan.surplus).length > 0 && <p>Überschuss: {rates(plan.surplus)}</p>}
      </section>

      <section>
        <h2>2. Passt das in einen Bauplan?</h2>
        <p class={build.singleBlueprint ? 'ok' : 'warn'}>
          {build.singleBlueprint
            ? 'Ja, ein Bauplan, einmal gesetzt.'
            : `Nein: ${build.blueprints} Baupläne, zusammen ${build.placements}-mal gesetzt.`}
        </p>
        {unsupported.length > 0 && (
          <p class="warn">
            Noch nicht generierbar: {unsupported.map((g) => `${recipeName(g.recipe)} (${g.unsupported})`).join('; ')}.
          </p>
        )}
      </section>

      <section>
        <h2>3. Gruppen</h2>
        <p>Eine Gruppe ist ein Bauplan mit einer Reihe gleicher Maschinen. Er wird so oft gesetzt wie angegeben.</p>
        <div class="groups">
          {build.groups.map((g, i) => (
            <GroupCard group={g} index={i} opt={opt} />
          ))}
        </div>
      </section>

      <section>
        <h2>4. Bauanleitung</h2>
        <ol>
          {build.groups.map((g, i) => (
            <li>{instruction(g, i, opt)}</li>
          ))}
        </ol>
      </section>
    </>
  );
}

function GroupCard({ group: g, index, opt }: { group: Group; index: number; opt: BuildOptions }) {
  const n = g.perModule;
  return (
    <div class={'card' + (g.unsupported ? ' unsupported' : '')}>
      <h3>Bauplan {String.fromCharCode(65 + index)}: {recipeName(g.recipe)}</h3>
      <p>
        {n} × {machineName(gameData.recipes[g.recipe].machine)} pro Bauplan, {g.copies}-mal setzen
        {g.clock < 99.95 && `, Takt ${fmt(g.clock, 1)} %`}
      </p>
      <p>Rein je Bauplan: {rates(g.inputs, (n * g.clock) / 100)} /min</p>
      <p>Raus je Bauplan: {rates(g.outputs, (n * g.clock) / 100)} /min</p>
      {g.unsupported ? (
        <p class="warn">Generator: {g.unsupported}</p>
      ) : (
        <p>Designer Mk{opt.designer - 3}, Band Mk{opt.beltTier}</p>
      )}
    </div>
  );
}

function instruction(g: Group, index: number, opt: BuildOptions) {
  const name = `Bauplan ${String.fromCharCode(65 + index)}`;
  const inputs = Object.keys(g.inputs).map(itemName).join(' und ');
  if (g.unsupported) return `${name} (${recipeName(g.recipe)}): von Hand bauen, ${g.perModule} Maschinen.`;
  const side = opt.feedFrom === 'right' ? 'rechts' : 'links';
  const chain = (count: number) =>
    count === 1 ? 'einmal setzen' : `${count}-mal hintereinander setzen, jede Kopie am Ende der Zuführung (Autoconnect)`;
  const lines =
    g.chains.length === 1
      ? chain(g.chains[0])
      : `${g.chains.length} Stränge mit je eigener Zuleitung: ${g.chains.map((c) => `${c}×`).join(', ')}. Pro Strang ${chain(g.chains[0])}`;
  const exit = opt.output === 'reverse' ? 'neben der Zuführung' : 'am Ende des Strangs';
  return `${name} (${recipeName(g.recipe)}): ${lines}. ${inputs} von ${side} zuführen, ${Object.keys(g.outputs).map(itemName).join(' und ')} kommt ${exit} heraus.`;
}
