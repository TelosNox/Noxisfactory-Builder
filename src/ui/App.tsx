// Planner page: game progress, production chain (fast, on every change) and,
// on request, the blueprints with fit check, groups and build instructions.

import { Component, type ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { gameData, type ItemId, type RecipeId } from '../planner/gameData';
import { alternateRecipes, plan, PlanError, standardRecipes, WATER, type Plan, type PlanRequest } from '../planner/planner';
import { alternatives, optionEffect, type Effect, type RecipeOption } from '../build/alternatives';
import { LayoutView } from './LayoutView';
import { FLOORS } from '../generator/floor';
import { byproducts, type Byproduct } from '../build/byproducts';
import { buildPlan, chainLayout, moduleLayout, wholeRates, type BuildOptions, type BuildPlan, type ChainPlan, type Group } from '../build/buildPlan';
import { loadConfig, saveConfig, type GameConfig } from './config';
import { ConfigPanel } from './ConfigPanel';

const products: ItemId[] = [
  ...new Set([...standardRecipes(), ...alternateRecipes()].flatMap((r) => Object.keys(gameData.recipes[r].out))),
]
  .filter((id) => gameData.items[id] && !gameData.items[id].resource)
  .sort((a, b) => itemName(a).localeCompare(itemName(b)));

function itemName(id: ItemId) {
  return gameData.items[id]?.name ?? id;
}
const machineName = (cls: string) => gameData.machines[cls]?.name ?? cls;
const recipeName = (id: string) => gameData.recipes[id]?.name ?? id;
const mainProduct = (recipe: RecipeId) => Object.keys(gameData.recipes[recipe].out)[0];
const fmt = (n: number, digits = 2) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });
const rates = (r: Record<ItemId, number>, factor = 1) =>
  Object.entries(r).map(([item, v]) => `${fmt(v * factor)} ${itemName(item)}`).join(', ');

/** Layout choices per plan; tiers and power come from the game progress. */
type Layout = Pick<BuildOptions, 'floor' | 'outputOnTop' | 'feedFrom' | 'output'>;

export function App() {
  const [config, setConfig] = useState<GameConfig>(loadConfig);
  const [item, setItem] = useState<ItemId>('Desc_IronPlate_C');
  const [rate, setRate] = useState(60);
  const [water, setWater] = useState<keyof typeof WATER>('free');
  /** Upper limits at the build site (raw resources, supplied items). */
  const [available, setAvailable] = useState<Record<ItemId, number>>({});
  const [maximize, setMaximize] = useState(false);
  const [forced, setForced] = useState<RecipeId[]>([]);
  /** Supplied items of this plan; undefined: the defaults of the game progress. */
  const [supplied, setSupplied] = useState<ItemId[] | undefined>();
  const [layout, setLayout] = useState<Layout>({ feedFrom: 'left', output: 'forward' });
  const [requested, setRequested] = useState<string>();

  const changeConfig = (c: GameConfig) => {
    setConfig(c);
    saveConfig(c);
  };
  const changeItem = (id: ItemId) => {
    setItem(id);
    setForced([]);
    setSupplied(undefined);
  };
  const supply = supplied ?? config.supplied;

  const request = useMemo(
    (): PlanRequest => ({
      item,
      rate,
      recipes: [...standardRecipes(), ...config.alternates],
      lockedMachines: config.lockedMachines,
      criterion: config.criterion,
      supplied: supply,
      forced,
      water: WATER[water],
      available,
      maximize,
      stepPenalty: config.stepPenalty,
      machineCost: config.machineCost,
      powerCost: config.powerCost,
    }),
    [item, rate, config, supply, forced, water, available, maximize],
  );
  const result = useMemo((): { plan: Plan } | { error: string; items?: ItemId[] } => {
    try {
      return { plan: plan(request) };
    } catch (error) {
      return { error: String((error as Error).message), items: error instanceof PlanError ? error.items : undefined };
    }
  }, [request]);
  const target = 'plan' in result ? result.plan.rate : rate;
  // The limits stay editable when a plan fails: show the inputs of the last plan.
  const lastPlan = useRef<Plan | undefined>(undefined);
  if ('plan' in result) lastPlan.current = result.plan;
  const pickRate = (r: number) => {
    setMaximize(false);
    setRate(r);
  };

  const opt: BuildOptions = {
    designer: config.designer,
    beltTier: config.beltTier,
    pipeTier: config.pipeTier,
    power: config.power,
    poleTier: config.poleTier,
    ...layout,
  };
  // Blueprints are built on request only: generating and checking layouts is slow.
  const key = JSON.stringify([item, rate, config, supply, forced, layout, water, available, maximize]);
  const build = useMemo((): BuildPlan | { error: string } | undefined => {
    if (!('plan' in result) || requested !== key) return undefined;
    try {
      return buildPlan(result.plan, opt);
    } catch (error) {
      return { error: String((error as Error).message) };
    }
  }, [result, requested, key]);
  const setLayoutKey = <K extends keyof Layout>(k: K, v: Layout[K]) => setLayout({ ...layout, [k]: v });

  return (
    <>
      <h1>Noxisfactory Builder</h1>
      <ConfigPanel config={config} onChange={changeConfig} />
      <section class="inputs">
        <label>
          Produkt
          <select value={item} onChange={(e) => changeItem(e.currentTarget.value)}>
            {products.map((id) => (
              <option value={id}>{itemName(id)}</option>
            ))}
          </select>
        </label>
        <label>
          Menge / min
          <input
            type="number"
            min="0"
            step="any"
            value={maximize ? Math.round(target * 100) / 100 : rate}
            disabled={maximize}
            onInput={(e) => setRate(+e.currentTarget.value)}
          />
        </label>
        <label class="inline">
          <input type="checkbox" checked={maximize} onChange={(e) => setMaximize(e.currentTarget.checked)} />
          so viel wie verfügbar
        </label>
        <label>
          Wasser am Bauort
          <select value={water} onChange={(e) => setWater(e.currentTarget.value as keyof typeof WATER)}>
            <option value="free">frei verfügbar</option>
            <option value="normal">wie Eisenerz</option>
            <option value="avoid">meiden</option>
          </select>
        </label>
      </section>
      <LimitsView plan={lastPlan.current} extra={'items' in result ? result.items : undefined} available={available} setAvailable={setAvailable} />

      <Guard reset={key}>
      {'error' in result ? (
        <p class="error">{result.error}</p>
      ) : (
        target > 0 && (
          <>
            <ChainView
              plan={result.plan}
              request={request}
              item={item}
              config={config}
              forced={forced}
              setForced={setForced}
              supply={supply}
              setSupply={setSupplied}
              rate={target}
              setRate={pickRate}
            />
            <section>
              <h2>2. Baupläne</h2>
              <div class="inputs">
                <label>
                  Logistic Floor
                  <select value={layout.floor ?? 0} onChange={(e) => setLayoutKey('floor', (+e.currentTarget.value || undefined) as Layout['floor'])}>
                    <option value={0}>keiner</option>
                    {FLOORS.map((f) => (
                      <option value={f}>{f} m</option>
                    ))}
                  </select>
                </label>
                {layout.floor && (
                  <label>
                    Ausgang liegt
                    <select value={layout.outputOnTop ? 'top' : 'below'} onChange={(e) => setLayoutKey('outputOnTop', e.currentTarget.value === 'top')}>
                      <option value="below">unter dem Floor (wie Eingänge)</option>
                      <option value="top">auf der Foundation</option>
                    </select>
                  </label>
                )}
                <label>
                  Zuführung von
                  <select value={layout.feedFrom} onChange={(e) => setLayoutKey('feedFrom', e.currentTarget.value as 'left' | 'right')}>
                    <option value="left">links</option>
                    <option value="right">rechts</option>
                  </select>
                </label>
                <label>
                  Ausgang
                  <select value={layout.output} onChange={(e) => setLayoutKey('output', e.currentTarget.value as 'forward' | 'reverse')}>
                    <option value="forward">gleiche Richtung</option>
                    <option value="reverse">zurück zum Eingang</option>
                  </select>
                </label>
              </div>
              {(!build || 'error' in build) && (
                <p>
                  <button type="button" class="primary" onClick={() => setRequested(key)}>
                    {requested ? 'Baupläne neu erzeugen' : 'Baupläne erzeugen'}
                  </button>
                </p>
              )}
            </section>
            {build && 'error' in build && <p class="error">Baupläne: {build.error}</p>}
            {build && !('error' in build) && (
              <BuildView
                plan={result.plan}
                build={build}
                opt={opt}
              />
            )}
          </>
        )
      )}
      </Guard>
    </>
  );
}

interface LimitsProps {
  plan?: Plan;
  /** Inputs a failed plan names. */
  extra?: ItemId[];
  available: Record<ItemId, number>;
  setAvailable: (a: Record<ItemId, number>) => void;
}

/** Upper limits at the build site for the raw resources and supplied items of the plan. */
function LimitsView({ plan, extra, available, setAvailable }: LimitsProps) {
  const used = { ...plan?.resources, ...plan?.supplied };
  const ids = [...new Set([...Object.keys(available), ...Object.keys(used), ...(extra ?? [])])].sort((a, b) => itemName(a).localeCompare(itemName(b)));
  if (ids.length === 0) return null;
  const change = (id: ItemId, value: string) => {
    const next = { ...available };
    if (value === '' || !(+value >= 0)) delete next[id];
    else next[id] = +value;
    setAvailable(next);
  };
  return (
    <details class="limits" open={Object.keys(available).length > 0}>
      <summary>
        Verfügbar am Bauort
        {Object.keys(available).length > 0 && `: ${Object.entries(available).map(([id, v]) => `${fmt(v)} ${itemName(id)}`).join(', ')}`}
      </summary>
      <p class="hint">Höchstens so viel pro Minute; leer heißt unbegrenzt.</p>
      <div class="inputs">
        {ids.map((id) => (
          <label>
            {itemName(id)}
            {used[id] !== undefined && <span class="hint"> (braucht {fmt(used[id])})</span>}
            <input type="number" min="0" step="any" placeholder="unbegrenzt" value={available[id] ?? ''} onChange={(e) => change(id, e.currentTarget.value)} />
          </label>
        ))}
      </div>
    </details>
  );
}

/**
 * Catches errors while rendering the results: an uncaught error leaves Preact's
 * DOM half updated and later renders duplicate whole sections.
 */
class Guard extends Component<{ reset: string; children: ComponentChildren }, { error?: string; at?: string }> {
  state: { error?: string; at?: string } = {};
  componentDidCatch(error: Error) {
    this.setState({ error: String(error.message), at: this.props.reset });
  }
  render() {
    if (this.state.error && this.state.at === this.props.reset) return <p class="error">Fehler: {this.state.error}</p>;
    return this.props.children;
  }
}

interface ChainProps {
  plan: Plan;
  request: PlanRequest;
  item: ItemId;
  config: GameConfig;
  forced: RecipeId[];
  setForced: (f: RecipeId[]) => void;
  supply: ItemId[];
  setSupply: (s: ItemId[]) => void;
  rate: number;
  setRate: (rate: number) => void;
}

/** Step 1: recipes, resources, supply, alternates and by-products. */
function ChainView({ plan, request, item, config, forced, setForced, supply, setSupply, rate, setRate }: ChainProps) {
  const extras = useMemo(() => byproducts(plan), [plan]);
  const whole = wholeRates(plan, item, rate);
  const force = (recipe: RecipeId) => setForced([...forced.filter((f) => mainProduct(f) !== mainProduct(recipe)), recipe]);
  const release = (recipe: RecipeId) => setForced(forced.filter((f) => f !== recipe));
  return (
    <section>
      <h2>1. Produktionskette</h2>
      <table>
        <thead>
          <tr><th>Rezept</th><th>Maschine</th><th class="num">Anzahl (100 %)</th><th /></tr>
        </thead>
        <tbody>
          {plan.steps.map((s) => (
            <tr>
              <td>
                {recipeName(s.recipe)}
                {gameData.recipes[s.recipe].alternate && <span class="tag">Alternative</span>}
                {forced.includes(s.recipe) && <span class="tag">erzwungen</span>}
              </td>
              <td>{machineName(gameData.recipes[s.recipe].machine)}</td>
              <td class="num">{fmt(s.machines)}</td>
              <td>
                {mainProduct(s.recipe) !== item && (
                  <button type="button" class="small" onClick={() => setSupply([...supply, mainProduct(s.recipe)])}>
                    zuliefern
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {whole.length > 0 && (
        <p>
          Ganze Maschinen bei:{' '}
          {whole.map((w) => (
            <button type="button" class="small" onClick={() => setRate(w.rate)}>
              {fmt(w.rate)} /min ({recipeName(w.recipe)}: {w.machines})
            </button>
          ))}
        </p>
      )}
      <p>Rohstoffe: {rates(plan.resources) || '–'}</p>
      {Object.keys(plan.supplied).length > 0 && (
        <p>
          Zulieferung:{' '}
          {Object.entries(plan.supplied).map(([id, v]) => (
            <span class="chip">
              {fmt(v)} {itemName(id)}/min
              <button type="button" class="small" title="selbst herstellen" onClick={() => setSupply(supply.filter((s) => s !== id))}>
                selbst bauen
              </button>
            </span>
          ))}
        </p>
      )}

      {forced.length > 0 && (
        <p>
          Erzwungen:{' '}
          {forced.map((f) => (
            <span class="chip">
              {recipeName(f)}
              <button type="button" class="small" onClick={() => release(f)}>lösen</button>
            </span>
          ))}
        </p>
      )}
      <Variants plan={plan} request={request} config={config} force={force} />

      {extras.length > 0 && (
        <>
          <p>Nebenprodukte:</p>
          <ul>
            {extras.map((b) => (
              <li>
                {itemName(b.item)} {fmt(b.rate)}/min aus {recipeName(b.from)}:{' '}
                {b.to.length > 0 && `bleibt im Kreislauf (→ ${b.to.map((t) => recipeName(t.recipe)).join(', ')})`}
                {b.to.length > 0 && b.surplus > 0 && ', '}
                {b.surplus > 0 && <span class="warn">{fmt(b.surplus)}/min verwerten</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {Object.keys(plan.surplus).length > 0 && <p class="warn">Überschuss: {rates(plan.surplus)}</p>}
    </section>
  );
}

const signed = (n: number, unit = '') => `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}${unit}`;

function effectText(e: Effect): string {
  const parts = [
    ...(Math.abs(e.machines) > 0.005 ? [`${signed(e.machines)} Maschinen`] : []),
    ...(e.steps !== 0 ? [`${signed(e.steps)} ${Math.abs(e.steps) === 1 ? 'Schritt' : 'Schritte'}`] : []),
    ...(Math.abs(e.powerMW) > 0.05 ? [`${signed(e.powerMW, ' MW')}`] : []),
    ...Object.entries(e.inputs).map(([id, d]) => `${signed(d)} ${itemName(id)}/min`),
  ];
  return parts.join(', ') || 'gleichwertig';
}

/**
 * Other recipes per product with a summary of what forcing each would change.
 * Each variant is a solve of its own (up to 100 ms with the step penalty), so
 * they run one after the other and the page stays usable.
 */
function Variants({ plan, request, config, force }: { plan: Plan; request: PlanRequest; config: GameConfig; force: (r: RecipeId) => void }) {
  // With "so viel wie verfügbar" the variants are compared at the same rate.
  const fixed = useMemo(() => ({ ...request, maximize: false, rate: plan.rate }), [request, plan]);
  const products = useMemo(() => alternatives(fixed, plan, new Set(config.alternates)), [fixed, plan, config.alternates]);
  const [effects, setEffects] = useState<Record<RecipeId, Pick<RecipeOption, 'effect' | 'error'>>>({});
  useEffect(() => {
    setEffects({});
    const queue = products.flatMap((p) => p.options.map((o) => o.recipe));
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      const recipe = queue.shift();
      if (!recipe) return;
      const result = optionEffect(fixed, plan, recipe);
      setEffects((e) => ({ ...e, [recipe]: result }));
      timer = setTimeout(next, 0);
    };
    timer = setTimeout(next, 0);
    return () => clearTimeout(timer);
  }, [products]);
  if (products.length === 0) return null;
  const count = products.reduce((n, p) => n + p.options.length, 0);
  return (
    <details class="variants" open>
      <summary>Rezeptvarianten ({count}): was sich ändert, wenn man sie erzwingt</summary>
      {products.map((p) => (
        <div>
          <p>
            <strong>{itemName(p.item)}</strong>
            <span class="hint"> jetzt: {p.current.map(recipeName).join(', ')}</span>
          </p>
          <ul>
            {p.options.map((o) => {
              const r = effects[o.recipe];
              return (
                <li>
                  {recipeName(o.recipe)} <span class="hint">({machineName(gameData.recipes[o.recipe].machine)})</span>
                  {gameData.recipes[o.recipe].alternate && <span class="tag">Alternative</span>}
                  {o.status === 'locked' && <span class="tag">nicht freigeschaltet</span>}
                  {o.status === 'noMachine' && <span class="tag">{machineName(gameData.recipes[o.recipe].machine)} fehlt</span>}
                  {': '}
                  {!r ? <span class="hint">wird gerechnet …</span> : r.error ? <span class="hint">geht nicht ({r.error})</span> : effectText(r.effect!)}
                  {o.status === 'usable' && r?.effect && (
                    <>
                      {' '}
                      <button type="button" class="small" onClick={() => force(o.recipe)}>
                        erzwingen
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </details>
  );
}

interface BuildProps {
  plan: Plan;
  build: BuildPlan;
  opt: BuildOptions;
}

/** Steps 2–4: fit check, groups and build instructions. */
function BuildView({ plan, build, opt }: BuildProps) {
  const unsupported = build.groups.filter((g) => g.unsupported);
  const extras = useMemo(() => byproducts(plan), [plan]);
  const letter = (recipe: string) => String.fromCharCode(65 + build.groups.findIndex((g) => g.recipe === recipe));
  return (
    <>
      <section>
        <h2>3. Passt das in einen Bauplan?</h2>
        <p class={build.singleBlueprint ? 'ok' : 'warn'}>
          {build.singleBlueprint
            ? 'Ja, ein Bauplan, einmal gesetzt.'
            : `Nein: ${build.blueprints === 1 ? 'ein Bauplan' : `${build.blueprints} Baupläne`}, zusammen ${build.placements}-mal gesetzt.`}
        </p>
        {!build.exact && (
          <p class="warn">
            Geht nicht glatt auf: Einige Maschinen laufen untertaktet, weil die Maschinenzahl nicht ganz ist oder sich nicht gleichmäßig auf die Kopien verteilt. Mengen mit ganzen Maschinen stehen unter der Produktionskette.
          </p>
        )}
        {unsupported.length > 0 && (
          <p class="warn">
            Noch nicht generierbar: {unsupported.map((g) => `${recipeName(g.recipe)} (${g.unsupported})`).join('; ')}.
          </p>
        )}
      </section>

      {build.chain ? (
        <ChainSection chain={build.chain} opt={opt} />
      ) : (
        <>
          <section>
            <h2>4. Gruppen</h2>
            <p>Eine Gruppe ist ein Bauplan mit einer Reihe gleicher Maschinen. Er wird so oft gesetzt wie angegeben.</p>
            <div class="groups">
              {build.groups.map((g, i) => (
                <GroupCard group={g} index={i} opt={opt} />
              ))}
            </div>
          </section>

          <section>
            <h2>5. Bauanleitung</h2>
            <ol>
              {Object.keys(plan.supplied).length > 0 && <li>Zuliefern: {rates(plan.supplied)} /min.</li>}
              {build.groups.map((g, i) => (
                <li>{instruction(g, i, opt)}</li>
              ))}
              {extras.map((b) => (
                <li>{byproductInstruction(b, letter)}</li>
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}

function ChainSection({ chain, opt }: { chain: ChainPlan; opt: BuildOptions }) {
  const first = gameData.recipes[chain.stages[0].recipe];
  const last = gameData.recipes[chain.stages[chain.stages.length - 1].recipe];
  const side = opt.feedFrom === 'right' ? 'rechts' : 'links';
  return (
    <>
      <section>
        <h2>4. Gruppen</h2>
        <p>Die ganze Kette passt in einen Bauplan: Jede Reihe speist die nächste.</p>
        <div class="groups">
          <div class="card">
            <h3>Bauplan A: Kette</h3>
            {chain.stages.map((s) => (
              <p>
                {s.perModule} × {machineName(gameData.recipes[s.recipe].machine)} ({recipeName(s.recipe)})
                {s.clock < 99.95 && `, Takt ${fmt(s.clock, 1)} %`}
              </p>
            ))}
            <p>Designer Mk{opt.designer - 3}, Band Mk{opt.beltTier}</p>
            <LayoutView make={() => chainLayout(chain.stages.map((s) => ({ recipe: s.recipe, machines: s.perModule })), opt)} deps={[chain, opt]} />
          </div>
        </div>
      </section>

      <section>
        <h2>5. Bauanleitung</h2>
        <ol>
          <li>
            Bauplan A {chain.copies === 1 ? 'einmal setzen' : `${chain.copies}-mal setzen, jede Kopie mit eigener Zuleitung`}.
          </li>
          <li>
            {Object.keys(first.in).map(itemName).join(' und ')} von {side} zuführen,{' '}
            {Object.keys(last.out).map(itemName).join(' und ')} kommt am Ende der letzten Reihe heraus.
          </li>
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
        <>
          {g.note && <p class="warn">{g.note}</p>}
          <p>Designer Mk{opt.designer - 3}, Band Mk{opt.beltTier}</p>
          <LayoutView make={() => moduleLayout(g.recipe, n, g.options)} deps={[g.recipe, n, g.options]} />
        </>
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

function byproductInstruction(b: Byproduct, letter: (recipe: string) => string) {
  const item = itemName(b.item);
  const source = `Bauplan ${letter(b.from)} (${recipeName(b.from)})`;
  const parts: string[] = [];
  if (b.to.length > 0) {
    const targets = b.to.map((t) => `Bauplan ${letter(t.recipe)} (${recipeName(t.recipe)}, ${fmt(t.rate)}/min)`).join(' und ');
    let text = `${item} aus ${source} in ${targets} einspeisen.`;
    if (b.fresh > 1e-6) {
      text += b.fluid
        ? ` Das Nebenprodukt hat Vorrang vor frischem ${item} (${fmt(b.fresh)}/min): Rücklauf tiefer anschließen, frischer Zufluss kommt von höher (die tiefere Flüssigkeit hat Vorrang).`
        : ` Das Nebenprodukt hat Vorrang vor frischem ${item} (${fmt(b.fresh)}/min): Prioritäts-Merger, Rücklauf auf den Vorrang-Eingang.`;
    }
    parts.push(text);
  }
  if (b.surplus > 0) {
    parts.push(
      b.fluid
        ? `${fmt(b.surplus)}/min ${item} aus ${source} verwerten: weiterverarbeiten oder abfüllen (Packager) und im Sink entsorgen; Flüssigkeiten lassen sich nicht direkt versenken.`
        : `${fmt(b.surplus)}/min ${item} aus ${source} verwerten: weiterverarbeiten oder im Sink entsorgen.`,
    );
  }
  parts.push('Sonst staut sich das Nebenprodukt und hält die Maschinen an.');
  return parts.join(' ');
}
