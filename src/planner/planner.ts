// Production planner: chooses recipes and machine counts for a target rate.
//
// Linear program over one variable per recipe (machines at 100 % clock) and
// one supply variable per raw resource and per supplied item:
//   for every item:      production - consumption (+ supply) >= demand
//   minimize:            cost of the chosen criterion + small machine term
// Surplus of by-products is allowed; it shows up in `surplus`.
//
// Criteria (docs/planner.md, Kriterien):
//   scarcity   raw resources weighted by how rare they are on the map
//   resources  all raw resources count the same
//   machines   number of machines
//   power      power use at 100 % clock
// Supplied items (e.g. ingots from a central smelter) cost nothing: the plan
// takes them as delivered and never produces them, except the target item.
// Raw resources and supplied items may have an upper limit (build site);
// with `maximize` the plan makes as much of the target as the limits allow.
// A forced recipe is the only one allowed for its main product.

import { solve, type Constraint, type Solution } from 'yalps';
import { gameData, ratePerMinute, type GameData, type ItemId, type MachineId, type RecipeId } from './gameData';

export interface PlanRequest {
  /** Target item and rate in items/min (fluids in m³/min). Ignored with `maximize`. */
  item: ItemId;
  rate: number;
  /** Recipes the player may use. Default: all standard (non-alternate) recipes. */
  recipes?: RecipeId[];
  /** What "optimal" means. Default: scarcity. */
  criterion?: Criterion;
  /** Items delivered from outside, not produced here (ignored for the target item). */
  supplied?: ItemId[];
  /** Recipes that must make their main product (alternates or standard ones). */
  forced?: RecipeId[];
  /** Machines not unlocked yet: their recipes are left out, except forced ones. */
  lockedMachines?: MachineId[];
  /**
   * Cost of water relative to iron ore. The map has water without limit, but
   * placing extractors depends on the site. Default 0.01: practically free.
   */
  water?: number;
  /** Upper limit per raw resource or supplied item at the build site, items/min. */
  available?: Record<ItemId, number>;
  /** Make as much of the target as the available amounts allow. */
  maximize?: boolean;
  /** Extra cost per machine and per MW, in iron ore/min (on top of the criterion). */
  machineCost?: number;
  powerCost?: number;
  /**
   * Extra cost per recipe used, as a share of the plan's cost (0.02: 2 %).
   * Drops small side chains that save less than that.
   */
  stepPenalty?: number;
}

/** Water presets for the UI: free, like iron ore, avoid. */
export const WATER = { free: 0.01, normal: 1, avoid: 10 } as const;

export type Criterion = 'scarcity' | 'resources' | 'machines' | 'power';

export interface PlanStep {
  recipe: RecipeId;
  /** Number of machines at 100 % (fractional). */
  machines: number;
}

export interface Plan {
  /** Target rate, items/min (the maximum with `maximize`). */
  rate: number;
  steps: PlanStep[];
  /** Raw resources consumed, items/min. */
  resources: Record<ItemId, number>;
  /** Supplied items to deliver, items/min. */
  supplied: Record<ItemId, number>;
  /** Produced beyond demand (by-products), items/min. */
  surplus: Record<ItemId, number>;
}

/**
 * Maximum extraction rate of the whole map per resource, items/min (fluids
 * m³/min), all nodes with Miner Mk3 / extractors at 250 %. Source: Satisfactory
 * Wiki, node counts per purity at 300 / 600 / 1200 per node (fluids 150 / 300 /
 * 600), cross-checked with SatisfactoryTools' default weights. Water is unlimited.
 */
export const WORLD_LIMIT: Record<ItemId, number> = {
  Desc_OreIron_C: 92100,
  Desc_Stone_C: 69300,
  Desc_OreCopper_C: 36900,
  Desc_Coal_C: 42300,
  Desc_OreGold_C: 15000,
  Desc_RawQuartz_C: 13500,
  Desc_Sulfur_C: 10800,
  Desc_OreBauxite_C: 12300,
  Desc_OreUranium_C: 2100,
  Desc_SAM_C: 10200,
  Desc_LiquidOil_C: 12600,
  Desc_NitrogenGas_C: 12000,
};

/** Cost per unit of raw resource; water is practically free. */
function resourceWeight(id: ItemId, criterion: Criterion, water: number): number {
  if (id === 'Desc_Water_C') return criterion === 'machines' || criterion === 'power' ? water * 1e-3 : water;
  if (criterion === 'scarcity') return WORLD_LIMIT.Desc_OreIron_C / (WORLD_LIMIT[id] ?? WORLD_LIMIT.Desc_OreIron_C);
  if (criterion === 'resources') return 1;
  return 1e-3; // machines, power: resources only break ties
}
const MACHINE_WEIGHT = 1e-4;
const EPSILON = 1e-6;
const mainProduct = (data: GameData, id: RecipeId) => Object.keys(data.recipes[id].out)[0];

/**
 * Standard recipes without alternates. Converter recipes are left out: they turn
 * SAM into other resources, and with equal resource weights the solver would use
 * them to avoid mining ordinary ore.
 */
/** Alternate recipes the planner may offer (no converter recipes, see standardRecipes). */
export function alternateRecipes(data: GameData = gameData): RecipeId[] {
  return Object.keys(data.recipes).filter(
    (id) => data.recipes[id].alternate && data.recipes[id].machine !== 'Build_Converter_C',
  );
}

/** Recipes for the same main product, standard and alternates. */
export function recipesFor(item: ItemId, data: GameData = gameData): RecipeId[] {
  return Object.keys(data.recipes).filter(
    (id) => data.recipes[id].machine !== 'Build_Converter_C' && mainProduct(data, id) === item,
  );
}

export function standardRecipes(data: GameData = gameData): RecipeId[] {
  return Object.keys(data.recipes).filter(
    (id) => !data.recipes[id].alternate && data.recipes[id].machine !== 'Build_Converter_C',
  );
}

type Variables = Map<string, Map<string, number>>;

/** LP: one variable per recipe (machines), raw resource and supplied item. */
function buildModel(request: PlanRequest, data: GameData, rate: number) {
  const criterion = request.criterion ?? 'scarcity';
  const forced = request.forced ?? [];
  for (const id of forced) if (!data.recipes[id]) throw new Error(`unknown recipe ${id}`);
  // A forced recipe replaces all others for its main product.
  const forcedFor = new Map(forced.map((id) => [mainProduct(data, id), id]));
  const supplied = new Set((request.supplied ?? []).filter((id) => id !== request.item && data.items[id]));
  const locked = new Set(request.lockedMachines ?? []);
  // Supplied items come from outside only, also when their amount is limited.
  const recipeIds = [
    ...new Set([...(request.recipes ?? standardRecipes(data)).filter((id) => !locked.has(data.recipes[id]?.machine)), ...forced]),
  ].filter((id) => {
    const owner = forcedFor.get(mainProduct(data, id));
    return (!owner || owner === id) && !supplied.has(mainProduct(data, id));
  });
  const variables: Variables = new Map();
  const constraints = new Map<string, Constraint>();

  for (const id of recipeIds) {
    const recipe = data.recipes[id];
    if (!recipe) throw new Error(`unknown recipe ${id}`);
    const machine = data.machines[recipe.machine];
    const power = recipe.powerMW?.max ?? machine?.powerMW ?? 0;
    const cost =
      (criterion === 'machines' ? 1 : criterion === 'power' ? power + MACHINE_WEIGHT : MACHINE_WEIGHT) +
      (request.machineCost ?? 0) +
      (request.powerCost ?? 0) * power;
    const coefficients = new Map<string, number>([['cost', cost]]);
    const add = (item: ItemId, value: number) => coefficients.set(item, (coefficients.get(item) ?? 0) + value);
    for (const [item, amount] of Object.entries(recipe.out)) add(item, ratePerMinute(recipe, amount));
    for (const [item, amount] of Object.entries(recipe.in)) add(item, -ratePerMinute(recipe, amount));
    variables.set(`recipe:${id}`, coefficients);
  }

  for (const [id, item] of Object.entries(data.items)) {
    constraints.set(id, { min: id === request.item ? rate : 0 });
    const kind = supplied.has(id) ? 'supplied' : item.resource ? 'resource' : undefined;
    if (!kind) continue;
    const cost = kind === 'supplied' ? 0 : resourceWeight(id, criterion, request.water ?? WATER.free);
    const coefficients = new Map([[id, 1], ['cost', cost]]);
    const limit = request.available?.[id];
    if (limit !== undefined) {
      coefficients.set(`limit:${id}`, 1);
      constraints.set(`limit:${id}`, { max: limit });
    }
    variables.set(`${kind}:${id}`, coefficients);
  }
  if (!data.items[request.item]) throw new Error(`unknown item ${request.item}`);
  return { variables, constraints };
}

const itemName = (data: GameData, id: ItemId) => data.items[id]?.name ?? id;

/** A failed plan; `items` are the inputs whose available amount matters. */
export class PlanError extends Error {
  constructor(message: string, readonly items: ItemId[] = []) {
    super(message);
  }
}
const round = (n: number) => Math.round(n * 100) / 100;

/** Highest rate of the target the available amounts allow. */
function maxRate(request: PlanRequest, data: GameData): number {
  const { variables, constraints } = buildModel(request, data, 0);
  variables.set('target', new Map([[request.item, -1], ['made', 1]]));
  const solution = solve({ direction: 'maximize', objective: 'made', constraints, variables });
  const name = itemName(data, request.item);
  if (solution.status === 'unbounded') {
    // Which unlimited inputs carry it: solve again with a huge cap on them.
    for (const [key, coefficients] of variables) {
      const id = key.split(':')[1];
      if (/^(resource|supplied):/.test(key) && request.available?.[id] === undefined) {
        coefficients.set(`cap:${id}`, 1);
        constraints.set(`cap:${id}`, { max: 1e7 });
      }
    }
    const capped = solve({ direction: 'maximize', objective: 'made', constraints, variables });
    const open = capped.variables.filter(([key, v]) => /^(resource|supplied):/.test(key) && v > 1e6).map(([key]) => key.split(':')[1]);
    const names = open.map((id) => itemName(data, id)).join(', ');
    throw new PlanError(`Ohne Grenze: ${name} lässt sich beliebig viel herstellen${open.length ? ` aus ${names}` : ''}. Verfügbare Mengen dafür angeben.`, open);
  }
  if (solution.status !== 'optimal' || solution.result < EPSILON) {
    throw new PlanError(`Aus den verfügbaren Mengen entsteht kein ${name}.`, Object.keys(request.available ?? {}));
  }
  return solution.result;
}

/** Why a plan with limits fails: which limits the plan without them exceeds. */
function diagnose(request: PlanRequest, data: GameData, rate: number): PlanError {
  const name = itemName(data, request.item);
  const unproducible = new PlanError(`Kein Plan für ${name}: mit den freigeschalteten Rezepten nicht herstellbar.`);
  if (!request.available || Object.keys(request.available).length === 0) return unproducible;
  let free: Plan;
  try {
    free = plan({ ...request, available: undefined, maximize: false, rate }, data);
  } catch {
    return unproducible;
  }
  const short = Object.entries(request.available)
    .map(([id, limit]) => [id, limit, free.resources[id] ?? free.supplied[id] ?? 0] as const)
    .filter(([, limit, need]) => need > limit + EPSILON);
  const text = short.map(([id, limit, need]) => `${itemName(data, id)} ${round(need)}/min nötig, ${round(limit)}/min verfügbar`);
  return new PlanError(
    `Reicht nicht für ${round(rate)}/min ${name}: ${text.join('; ') || 'die verfügbaren Mengen passen nicht zusammen'}.`,
    [...new Set([...Object.keys(request.available), ...Object.keys(free.resources), ...Object.keys(free.supplied)])],
  );
}

export function plan(request: PlanRequest, data: GameData = gameData): Plan {
  // Slightly below the maximum keeps the cost solve feasible despite float noise.
  const rate = request.maximize ? maxRate(request, data) * (1 - 1e-9) : request.rate;
  const { variables, constraints } = buildModel(request, data, rate);
  let solution = solve({ direction: 'minimize', objective: 'cost', constraints, variables });
  if (solution.status !== 'optimal') {
    throw solution.status === 'infeasible' ? diagnose(request, data, rate) : new PlanError(`Kein Plan für ${itemName(data, request.item)}: ${solution.status}`);
  }
  if ((request.stepPenalty ?? 0) > 0) {
    const keep = new Set((request.forced ?? []).map((id) => `recipe:${id}`));
    solution = dropSmallSteps(solution, variables, constraints, request.stepPenalty!, keep);
  }
  return readSolution(solution, variables, request.item, rate);
}

/**
 * Drops small steps: every recipe used costs `share` of the original plan's
 * cost extra. Tries the used recipes from the fewest machines up, each time
 * without that recipe, and keeps the plan without it when cost plus charges
 * go down (a replacement may need other recipes). Found greedily with plain LPs; an exact integer program (binary per
 * recipe) takes seconds for large chains. Forced recipes stay.
 */
function dropSmallSteps(lp: Solution<string>, variables: Variables, constraints: Map<string, Constraint>, share: number, keep: Set<string>): Solution<string> {
  const charge = share * lp.result;
  const total = (sol: Solution<string>) => sol.result + charge * sol.variables.filter(([n, v]) => n.startsWith('recipe:') && v > EPSILON).length;
  const vars = new Map(variables);
  const kept = new Set(keep);
  let best = lp;
  for (;;) {
    const candidate = best.variables
      .filter(([name, v]) => name.startsWith('recipe:') && v > EPSILON && !kept.has(name))
      .sort((a, b) => a[1] - b[1])[0]?.[0];
    if (!candidate) return best;
    const without = new Map(vars);
    without.delete(candidate);
    const next = solve({ direction: 'minimize', objective: 'cost', constraints, variables: without });
    if (next.status === 'optimal' && total(next) < total(best)) {
      vars.delete(candidate);
      best = next;
    } else {
      kept.add(candidate);
    }
  }
}

function readSolution(solution: Solution<string>, variables: Variables, target: ItemId, rate: number): Plan {
  const steps: PlanStep[] = [];
  const resources: Record<ItemId, number> = {};
  const delivered: Record<ItemId, number> = {};
  const net = new Map<ItemId, number>();
  for (const [name, value] of solution.variables) {
    if (value < EPSILON) continue;
    const [kind, id] = name.split(':');
    if (kind === 'resource' || kind === 'supplied') {
      (kind === 'resource' ? resources : delivered)[id] = value;
      net.set(id, (net.get(id) ?? 0) + value);
      continue;
    }
    steps.push({ recipe: id, machines: value });
    for (const [item, r] of variables.get(name)!) {
      if (item !== 'cost') net.set(item, (net.get(item) ?? 0) + r * value);
    }
  }

  const surplus: Record<ItemId, number> = {};
  for (const [item, value] of net) {
    const extra = value - (item === target ? rate : 0);
    if (extra > EPSILON) surplus[item] = extra;
  }
  steps.sort((a, b) => a.recipe.localeCompare(b.recipe));
  return { rate, steps, resources, supplied: delivered, surplus };
}
