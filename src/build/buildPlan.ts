// Build plan: turns a production plan into modules (blueprints) and
// instructions on how to place them.
//
// One group per recipe. A group is one blueprint, placed several times:
//   machines per module = largest row that fits the designer and the belt
//   copies              = modules needed for all machines of the step
//   chains              = copies joined by auto-connect share one feed line,
//                         so a chain carries at most one belt of input/output
// Recipes the generator cannot build yet stay in the plan with a reason.
//
// If the steps form a straight line (each step eats only what the previous one
// makes), the whole plan may fit one chain blueprint (chain.ts), placed once or
// a few times with their own feed lines. That is preferred over one blueprint
// per recipe.

import { gameData, ratePerMinute, type ItemId, type RecipeId } from '../planner/gameData';
import type { Plan } from '../planner/planner';
import { BELT_SPEED, generateRow } from '../generator/row';
import { validate } from '../generator/validate';
import { generateChain } from '../generator/chain';

export interface BuildOptions {
  /** Blueprint Designer size in foundations: 4, 5, 6. */
  designer: number;
  /** Highest belt tier 1–6. */
  beltTier: number;
  feedFrom?: 'left' | 'right';
  output?: 'forward' | 'reverse';
}

export interface Group {
  recipe: RecipeId;
  /** Machines the plan needs at 100 % (fractional). */
  machinesExact: number;
  /** Set when the generator cannot build this recipe as a module yet. */
  unsupported?: string;
  /** Machines in one module (one blueprint). */
  perModule: number;
  /** How often the blueprint is placed. */
  copies: number;
  /** Feed lines: copies are split into this many chains of auto-connected modules. */
  chains: number[];
  /** Clock speed in % so the built machines match the plan exactly. */
  clock: number;
  /** Items/min per machine at 100 %. */
  inputs: Record<ItemId, number>;
  outputs: Record<ItemId, number>;
  /** Position in the build order: 0 consumes only raw resources. */
  stage: number;
}

export interface ChainPlan {
  /** How often the chain blueprint is placed, each copy with its own feed line. */
  copies: number;
  /** In build order; machines per copy and clock in %. */
  stages: { recipe: RecipeId; perModule: number; clock: number }[];
}

export interface BuildPlan {
  groups: Group[];
  /** Whole plan as one chain blueprint, if it fits. */
  chain?: ChainPlan;
  /** Whole plan fits a single blueprint placed once. */
  singleBlueprint: boolean;
  blueprints: number;
  placements: number;
}

const EPS = 1e-6;
const MAX_ROW = 30;
const MAX_CHAIN_COPIES = 8;

/** Largest valid row for this recipe, or an error message. */
export function maxRow(recipe: RecipeId, opt: BuildOptions): number | string {
  let best = 0;
  for (let n = 1; n <= MAX_ROW; n++) {
    let ok: boolean;
    try {
      ok = validate(generateRow({ recipe, machines: n, ...opt })).length === 0;
    } catch (error) {
      if (n === 1) return String((error as Error).message);
      break;
    }
    if (!ok) {
      if (n === 1) return `passt nicht in den Designer Mk${opt.designer - 3}`;
      break;
    }
    best = n;
  }
  return best;
}

function perMachine(recipe: RecipeId, side: 'in' | 'out'): Record<ItemId, number> {
  const r = gameData.recipes[recipe];
  return Object.fromEntries(Object.entries(r[side]).map(([item, amount]) => [item, ratePerMinute(r, amount)]));
}

/** Stage of each step: longest path from raw resources. */
function stages(plan: Plan): Map<RecipeId, number> {
  const producers = new Map<ItemId, RecipeId[]>();
  for (const s of plan.steps) {
    for (const item of Object.keys(gameData.recipes[s.recipe].out)) {
      producers.set(item, [...(producers.get(item) ?? []), s.recipe]);
    }
  }
  const result = new Map<RecipeId, number>();
  const visit = (recipe: RecipeId, path: Set<RecipeId>): number => {
    if (result.has(recipe)) return result.get(recipe)!;
    if (path.has(recipe)) return 0; // cycle, e.g. recycled by-products
    path.add(recipe);
    let stage = 0;
    for (const item of Object.keys(gameData.recipes[recipe].in)) {
      for (const p of producers.get(item) ?? []) stage = Math.max(stage, visit(p, path) + 1);
    }
    path.delete(recipe);
    result.set(recipe, stage);
    return stage;
  };
  for (const s of plan.steps) visit(s.recipe, new Set());
  return result;
}

export function buildPlan(plan: Plan, opt: BuildOptions): BuildPlan {
  const stage = stages(plan);
  const speed = BELT_SPEED[opt.beltTier];
  const groups: Group[] = plan.steps.map((step) => {
    const inputs = perMachine(step.recipe, 'in');
    const outputs = perMachine(step.recipe, 'out');
    const needed = Math.max(1, Math.ceil(step.machines - EPS));
    const base = {
      recipe: step.recipe,
      machinesExact: step.machines,
      inputs,
      outputs,
      stage: stage.get(step.recipe) ?? 0,
    };
    const row = maxRow(step.recipe, opt);
    if (typeof row === 'string') {
      return { ...base, unsupported: row, perModule: needed, copies: 1, chains: [1], clock: (100 * step.machines) / needed };
    }
    // Identical copies: spread the machines evenly instead of a short last module.
    const copies = Math.ceil(needed / row);
    const perModule = Math.ceil(needed / copies);
    const machines = perModule * copies;
    // One chain carries one belt: limited by the strongest ingredient or product.
    const strongest = Math.max(...Object.values(inputs), ...Object.values(outputs));
    const perChain = Math.max(1, Math.floor((speed + EPS) / (strongest * perModule)));
    const chains: number[] = [];
    for (let left = copies; left > 0; left -= perChain) chains.push(Math.min(perChain, left));
    return { ...base, perModule, copies, chains, clock: (100 * step.machines) / machines };
  });
  groups.sort((a, b) => a.stage - b.stage || a.recipe.localeCompare(b.recipe));
  const chain = groups.length > 1 ? chainPlan(groups, opt) : undefined;
  if (chain) return { groups, chain, singleBlueprint: chain.copies === 1, blueprints: 1, placements: chain.copies };
  const placements = groups.reduce((sum, g) => sum + g.copies, 0);
  return {
    groups,
    singleBlueprint: groups.length === 1 && placements === 1 && !groups[0].unsupported,
    blueprints: groups.length,
    placements,
  };
}

/** Groups as one chain blueprint: straight line of steps, fewest copies that fit. */
export function chainPlan(groups: Group[], opt: BuildOptions): ChainPlan | undefined {
  if (opt.output === 'reverse' || groups.some((g) => g.unsupported)) return undefined;
  for (let k = 1; k < groups.length; k++) {
    const made = Object.keys(groups[k - 1].outputs);
    const eaten = Object.keys(groups[k].inputs);
    if (made.length !== 1 || eaten.length !== 1 || made[0] !== eaten[0]) return undefined;
  }
  for (let copies = 1; copies <= MAX_CHAIN_COPIES; copies++) {
    const stages = groups.map((g) => {
      const perModule = Math.max(1, Math.ceil(g.machinesExact / copies - EPS));
      return { recipe: g.recipe, perModule, clock: (100 * g.machinesExact) / (perModule * copies) };
    });
    try {
      const layout = generateChain({ ...opt, stages: stages.map((s) => ({ recipe: s.recipe, machines: s.perModule })) });
      if (validate(layout).length === 0) return { copies, stages };
    } catch {
      // belt too slow for this many machines per row: try more copies
    }
  }
  return undefined;
}
