// Other recipes per product of a plan and what each would change: the plan is
// solved again with that recipe forced, the summary is the difference in
// machines, power, steps, raw resources and supplied items.

import { gameData, type ItemId, type RecipeId } from '../planner/gameData';
import { plan as solvePlan, recipesFor, type Plan, type PlanRequest } from '../planner/planner';

export interface Effect {
  machines: number;
  powerMW: number;
  steps: number;
  /** Change per raw resource and supplied item, items/min (only changes). */
  inputs: Record<ItemId, number>;
}

export interface RecipeOption {
  recipe: RecipeId;
  /** usable; alternate not unlocked; machine not unlocked. */
  status: 'usable' | 'locked' | 'noMachine';
  effect?: Effect;
  /** Why the plan fails with this recipe. */
  error?: string;
}

export interface ProductOptions {
  item: ItemId;
  current: RecipeId[];
  options: RecipeOption[];
}

const mainProduct = (recipe: RecipeId) => Object.keys(gameData.recipes[recipe].out)[0];

export function power(p: Plan): number {
  return p.steps.reduce((sum, s) => {
    const recipe = gameData.recipes[s.recipe];
    return sum + s.machines * (recipe.powerMW?.max ?? gameData.machines[recipe.machine]?.powerMW ?? 0);
  }, 0);
}

const machines = (p: Plan) => p.steps.reduce((sum, s) => sum + s.machines, 0);

export function effect(base: Plan, other: Plan): Effect {
  const inputs: Record<ItemId, number> = {};
  const before = { ...base.resources, ...base.supplied };
  const after = { ...other.resources, ...other.supplied };
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const d = (after[id] ?? 0) - (before[id] ?? 0);
    if (Math.abs(d) > 0.005) inputs[id] = d;
  }
  return { machines: machines(other) - machines(base), powerMW: power(other) - power(base), steps: other.steps.length - base.steps.length, inputs };
}

/**
 * For every product the plan makes: the other recipes for it (standard and
 * alternates, unlocked or not). Their effect comes from `optionEffect`, one
 * solve each; with the step penalty that takes up to 100 ms per recipe, so the
 * page runs them one after the other.
 */
export function alternatives(request: PlanRequest, base: Plan, unlocked: Set<RecipeId>): ProductOptions[] {
  const locked = new Set(request.lockedMachines ?? []);
  const products = [...new Set(base.steps.map((s) => mainProduct(s.recipe)))];
  return products
    .map((item) => {
      const current = base.steps.filter((s) => mainProduct(s.recipe) === item).map((s) => s.recipe);
      const options = recipesFor(item)
        .filter((r) => !current.includes(r))
        .map((recipe): RecipeOption => {
          const r = gameData.recipes[recipe];
          return { recipe, status: r.alternate && !unlocked.has(recipe) ? 'locked' : locked.has(r.machine) ? 'noMachine' : 'usable' };
        });
      return { item, current, options };
    })
    .filter((p) => p.options.length > 0);
}

/** The plan with `recipe` forced for its product, compared to `base`. */
export function optionEffect(request: PlanRequest, base: Plan, recipe: RecipeId): Pick<RecipeOption, 'effect' | 'error'> {
  const forced = [...(request.forced ?? []).filter((f) => mainProduct(f) !== mainProduct(recipe)), recipe];
  try {
    return { effect: effect(base, solvePlan({ ...request, forced })) };
  } catch (error) {
    return { error: String((error as Error).message) };
  }
}
