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
// takes them as delivered instead of producing them, except the target item.
// A forced recipe is the only one allowed for its main product.

import { solve, type Constraint } from 'yalps';
import { gameData, ratePerMinute, type GameData, type ItemId, type RecipeId } from './gameData';

export interface PlanRequest {
  /** Target item and rate in items/min (fluids in m³/min). */
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
  /**
   * Cost of water relative to iron ore. The map has water without limit, but
   * placing extractors depends on the site. Default 0.01: practically free.
   */
  water?: number;
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
 * Wiki, "Resource node" / world totals for 1.0 *(prüfen)*. Water is unlimited.
 */
export const WORLD_LIMIT: Record<ItemId, number> = {
  Desc_OreIron_C: 92100,
  Desc_Stone_C: 69900,
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

export function plan(request: PlanRequest, data: GameData = gameData): Plan {
  const criterion = request.criterion ?? 'scarcity';
  const forced = request.forced ?? [];
  for (const id of forced) if (!data.recipes[id]) throw new Error(`unknown recipe ${id}`);
  // A forced recipe replaces all others for its main product.
  const forcedFor = new Map(forced.map((id) => [mainProduct(data, id), id]));
  const recipeIds = [...new Set([...(request.recipes ?? standardRecipes(data)), ...forced])].filter((id) => {
    const owner = forcedFor.get(mainProduct(data, id));
    return !owner || owner === id;
  });
  const supplied = new Set((request.supplied ?? []).filter((id) => id !== request.item && data.items[id]));
  const variables = new Map<string, Map<string, number>>();
  const constraints = new Map<string, Constraint>();

  for (const id of recipeIds) {
    const recipe = data.recipes[id];
    if (!recipe) throw new Error(`unknown recipe ${id}`);
    const machine = data.machines[recipe.machine];
    const cost =
      criterion === 'machines' ? 1 : criterion === 'power' ? (recipe.powerMW?.max ?? machine?.powerMW ?? 0) + MACHINE_WEIGHT : MACHINE_WEIGHT;
    const coefficients = new Map<string, number>([['cost', cost]]);
    const add = (item: ItemId, value: number) => coefficients.set(item, (coefficients.get(item) ?? 0) + value);
    for (const [item, amount] of Object.entries(recipe.out)) add(item, ratePerMinute(recipe, amount));
    for (const [item, amount] of Object.entries(recipe.in)) add(item, -ratePerMinute(recipe, amount));
    variables.set(`recipe:${id}`, coefficients);
  }

  for (const [id, item] of Object.entries(data.items)) {
    constraints.set(id, { min: id === request.item ? request.rate : 0 });
    if (supplied.has(id)) {
      variables.set(`supplied:${id}`, new Map([[id, 1], ['cost', 0]]));
    } else if (item.resource) {
      variables.set(`resource:${id}`, new Map([[id, 1], ['cost', resourceWeight(id, criterion, request.water ?? WATER.free)]]));
    }
  }
  if (!data.items[request.item]) throw new Error(`unknown item ${request.item}`);

  const solution = solve({ direction: 'minimize', objective: 'cost', constraints, variables });
  if (solution.status !== 'optimal') {
    throw new Error(`no plan for ${request.item}: ${solution.status}`);
  }

  const values = new Map(solution.variables);
  const steps: PlanStep[] = [];
  const resources: Record<ItemId, number> = {};
  const delivered: Record<ItemId, number> = {};
  const net = new Map<ItemId, number>();
  for (const [name, value] of values) {
    if (value < EPSILON) continue;
    const [kind, id] = name.split(':');
    if (kind === 'resource' || kind === 'supplied') {
      (kind === 'resource' ? resources : delivered)[id] = value;
      net.set(id, (net.get(id) ?? 0) + value);
      continue;
    }
    steps.push({ recipe: id, machines: value });
    for (const [item, rate] of variables.get(name)!) {
      if (item !== 'cost') net.set(item, (net.get(item) ?? 0) + rate * value);
    }
  }

  const surplus: Record<ItemId, number> = {};
  for (const [item, value] of net) {
    const extra = value - (item === request.item ? request.rate : 0);
    if (extra > EPSILON) surplus[item] = extra;
  }
  steps.sort((a, b) => a.recipe.localeCompare(b.recipe));
  return { steps, resources, supplied: delivered, surplus };
}
