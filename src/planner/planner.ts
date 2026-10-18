// Production planner: chooses recipes and machine counts for a target rate.
//
// Linear program over one variable per recipe (machines at 100 % clock) and
// one supply variable per raw resource:
//   for every item:      production - consumption (+ supply) >= demand
//   minimize:            weighted raw resource supply + small machine term
// Surplus of by-products is allowed; it shows up in `surplus`.

import { solve, type Constraint } from 'yalps';
import { gameData, ratePerMinute, type GameData, type ItemId, type RecipeId } from './gameData';

export interface PlanRequest {
  /** Target item and rate in items/min (fluids in m³/min). */
  item: ItemId;
  rate: number;
  /** Recipes the player may use. Default: all standard (non-alternate) recipes. */
  recipes?: RecipeId[];
}

export interface PlanStep {
  recipe: RecipeId;
  /** Number of machines at 100 % (fractional). */
  machines: number;
}

export interface Plan {
  steps: PlanStep[];
  /** Raw resources consumed, items/min. */
  resources: Record<ItemId, number>;
  /** Produced beyond demand (by-products), items/min. */
  surplus: Record<ItemId, number>;
}

/**
 * Cost per unit of raw resource. Water is practically unlimited, so it is
 * cheap; everything else counts equally. Tunable later (e.g. by node scarcity).
 */
const RESOURCE_WEIGHT: Record<ItemId, number> = { Desc_Water_C: 0.01 };
const MACHINE_WEIGHT = 1e-4;
const EPSILON = 1e-6;

/**
 * Standard recipes without alternates. Converter recipes are left out: they turn
 * SAM into other resources, and with equal resource weights the solver would use
 * them to avoid mining ordinary ore.
 */
export function standardRecipes(data: GameData = gameData): RecipeId[] {
  return Object.keys(data.recipes).filter(
    (id) => !data.recipes[id].alternate && data.recipes[id].machine !== 'Build_Converter_C',
  );
}

export function plan(request: PlanRequest, data: GameData = gameData): Plan {
  const recipeIds = request.recipes ?? standardRecipes(data);
  const variables = new Map<string, Map<string, number>>();
  const constraints = new Map<string, Constraint>();

  for (const id of recipeIds) {
    const recipe = data.recipes[id];
    if (!recipe) throw new Error(`unknown recipe ${id}`);
    const coefficients = new Map<string, number>([['cost', MACHINE_WEIGHT]]);
    const add = (item: ItemId, value: number) => coefficients.set(item, (coefficients.get(item) ?? 0) + value);
    for (const [item, amount] of Object.entries(recipe.out)) add(item, ratePerMinute(recipe, amount));
    for (const [item, amount] of Object.entries(recipe.in)) add(item, -ratePerMinute(recipe, amount));
    variables.set(`recipe:${id}`, coefficients);
  }

  for (const [id, item] of Object.entries(data.items)) {
    constraints.set(id, { min: id === request.item ? request.rate : 0 });
    if (item.resource) {
      variables.set(`resource:${id}`, new Map([[id, 1], ['cost', RESOURCE_WEIGHT[id] ?? 1]]));
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
  const net = new Map<ItemId, number>();
  for (const [name, value] of values) {
    if (value < EPSILON) continue;
    const [kind, id] = name.split(':');
    if (kind === 'resource') {
      resources[id] = value;
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
  return { steps, resources, surplus };
}
