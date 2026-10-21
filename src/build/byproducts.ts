// By-products of a plan (docs/planner.md, Nebenprodukte).
//
// A by-product is every output of a recipe except its main product (the first
// output). It either stays in the production cycle (another step consumes it,
// e.g. water from Aluminum Scrap feeding Alumina Solution) or leaves the plan
// as surplus that has to be processed or sunk.
//
// A recycled by-product must have priority over fresh supply of the same item,
// otherwise it backs up and stops the machines that produce it:
//   belts:  priority merger, recycled belt on the priority input;
//   fluids: the lower inflow has priority, so the recycled pipe joins low and
//           the fresh supply comes from higher up.

import { gameData, ratePerMinute, type ItemId, type RecipeId } from '../planner/gameData';
import type { Plan } from '../planner/planner';

const EPS = 1e-6;

export interface Byproduct {
  item: ItemId;
  /** Recipe that produces it as a by-product. */
  from: RecipeId;
  /** Produced, items/min (fluids m³/min). */
  rate: number;
  /** Recycled into these steps, items/min each. */
  to: { recipe: RecipeId; rate: number }[];
  /** Fresh supply of the same item into those steps (raw resource or main product of another step). */
  fresh: number;
  /** Left over: process further or sink. */
  surplus: number;
  fluid: boolean;
}

export const isFluid = (item: ItemId) => ['liquid', 'gas'].includes(gameData.items[item]?.form);
const mainProduct = (recipe: RecipeId) => Object.keys(gameData.recipes[recipe].out)[0];

export function byproducts(plan: Plan): Byproduct[] {
  const flow = (recipe: RecipeId, machines: number, side: 'in' | 'out') =>
    Object.entries(gameData.recipes[recipe][side]).map(([item, amount]) => ({
      recipe,
      item,
      rate: ratePerMinute(gameData.recipes[recipe], amount) * machines,
    }));
  const produced = plan.steps.flatMap((s) => flow(s.recipe, s.machines, 'out'));
  const consumed = plan.steps.flatMap((s) => flow(s.recipe, s.machines, 'in'));

  const result: Byproduct[] = [];
  // What consumers of an item still take after earlier by-products were routed.
  const open = new Map(consumed.map((c) => [`${c.recipe}|${c.item}`, c.rate]));
  for (const p of produced) {
    if (p.item === mainProduct(p.recipe) || p.rate < EPS) continue;
    let left = p.rate;
    const to: Byproduct['to'] = [];
    for (const c of consumed) {
      if (c.item !== p.item || c.recipe === p.recipe || left < EPS) continue;
      const key = `${c.recipe}|${c.item}`;
      const take = Math.min(left, open.get(key)!);
      if (take < EPS) continue;
      open.set(key, open.get(key)! - take);
      left -= take;
      to.push({ recipe: c.recipe, rate: take });
    }
    result.push({ item: p.item, from: p.recipe, rate: p.rate, to, fresh: 0, surplus: left < EPS ? 0 : left, fluid: isFluid(p.item) });
  }
  // Whatever the consumers still need after all by-products comes fresh.
  for (const b of result) b.fresh = b.to.reduce((sum, t) => sum + open.get(`${t.recipe}|${b.item}`)!, 0);
  return result;
}
