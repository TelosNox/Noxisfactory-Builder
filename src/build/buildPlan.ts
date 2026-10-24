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
import { plan as planChain, type Plan, type PlanRequest } from '../planner/planner';
import { BELT_SPEED, generateRow } from '../generator/row';
import { validate } from '../generator/validate';
import { generateChain } from '../generator/chain';
import { generateFloorRow, type Floor } from '../generator/floor';
import { generateStackedRow } from '../generator/stacked';
import { generateFluidRow, hasPipes, PIPE_SPEED } from '../generator/fluidRow';
import { addPower, type PowerMode } from '../generator/power';
import type { Layout } from '../generator/layout';

export interface BuildOptions {
  /** Blueprint Designer size in foundations: 4, 5, 6. */
  designer: number;
  /** Highest belt tier 1–6. */
  beltTier: number;
  feedFrom?: 'left' | 'right';
  output?: 'forward' | 'reverse';
  /** Logistics floor height in m; feed lines run underneath. None if missing. */
  floor?: Floor;
  /** With a logistics floor: output line on the foundation instead of below like the feed. */
  outputOnTop?: boolean;
  /** Power: poles (default), daisy chain or none. */
  power?: PowerMode | 'none';
  /** Highest pole tier 1–3, default 1. */
  poleTier?: number;
  /** Highest pipe tier 1–2, default 1. */
  pipeTier?: number;
}

const withPower = (layout: Layout, opt: BuildOptions) =>
  opt.power === 'none' ? layout : addPower(layout, { mode: opt.power ?? 'poles', poleTier: opt.poleTier ?? 1 });

/** Row layout for these options: on the floor or on a logistics floor, with power. */
export function moduleLayout(recipe: RecipeId, machines: number, opt: BuildOptions): Layout {
  const { floor, outputOnTop, power, poleTier, pipeTier, ...rest } = opt;
  if (hasPipes(gameData.recipes[recipe].machine)) {
    return withPower(
      floor
        ? generateFloorRow({ ...rest, recipe, machines, floor, outputOnTop, pipeTier: pipeTier ?? 1 })
        : generateFluidRow({ ...rest, recipe, machines, pipeTier: pipeTier ?? 1 }),
      opt,
    );
  }
  return withPower(
    floor
      ? generateFloorRow({ ...rest, recipe, machines, floor, outputOnTop })
      : Object.keys(gameData.recipes[recipe].in).length > 1
        ? generateStackedRow({ ...rest, recipe, machines })
        : generateRow({ ...rest, recipe, machines }),
    opt,
  );
}

/** Chain layout for these options, with power. */
export function chainLayout(stages: { recipe: RecipeId; machines: number }[], opt: BuildOptions): Layout {
  const { floor, outputOnTop, power, poleTier, pipeTier, ...rest } = opt;
  return withPower(generateChain({ ...rest, stages }), opt);
}

export interface Group {
  /** Options this group is built with (may differ from the request, see `note`). */
  options: BuildOptions;
  /** Why the group deviates from the requested options. */
  note?: string;
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
  /** Highest clock in % the lines allow for one machine. */
  maxClock: number;
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
  /** Every machine runs at 100 %; otherwise some are clocked down. */
  exact: boolean;
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
      ok = validate(moduleLayout(recipe, n, opt)).length === 0;
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

/** Capacity of the line carrying this item: belt or pipe. */
const lineSpeed = (item: ItemId, opt: BuildOptions) =>
  ['liquid', 'gas'].includes(gameData.items[item]?.form) ? PIPE_SPEED[opt.pipeTier ?? 1] : BELT_SPEED[opt.beltTier];

export function buildPlan(plan: Plan, opt: BuildOptions): BuildPlan {
  const stage = stages(plan);
  const groups: Group[] = plan.steps.map((step) => {
    const inputs = perMachine(step.recipe, 'in');
    const outputs = perMachine(step.recipe, 'out');
    // A machine that needs more than one line carries is limited by the line.
    const load = Math.max(
      ...[...Object.entries(inputs), ...Object.entries(outputs)].map(([item, rate]) => rate / lineSpeed(item, opt)),
    );
    const maxClock = 100 * Math.min(1, 1 / load);
    const needed = Math.max(1, Math.ceil((step.machines * 100) / maxClock - EPS));
    const base = {
      recipe: step.recipe,
      machinesExact: step.machines,
      inputs,
      outputs,
      stage: stage.get(step.recipe) ?? 0,
    };
    // A group that cannot be built on the logistics floor (too high for the
    // designer, pipes) is built on the ground and says so.
    let options = opt;
    let note: string | undefined;
    let row = maxRow(step.recipe, opt);
    if (typeof row === 'string' && opt.floor) {
      const ground = { ...opt, floor: undefined };
      const alt = maxRow(step.recipe, ground);
      if (typeof alt === 'number') {
        options = ground;
        note = `ohne Logistic Floor gebaut: ${row}`;
        row = alt;
      }
    }
    if (maxClock < 100 - EPS) {
      note = [note, `Linie begrenzt eine Maschine auf ${+maxClock.toFixed(1)} % Takt (heruntertakten oder unterversorgt laufen lassen)`].filter(Boolean).join('; ');
    }
    if (typeof row === 'string') {
      return { ...base, options, note, maxClock, unsupported: row, perModule: needed, copies: 1, chains: [1], clock: (100 * step.machines) / needed };
    }
    // Fewest identical copies. If the machines do not divide evenly, the spare
    // capacity is clocked down and the plan is not exact (see suggestRates).
    const copies = Math.ceil(needed / row);
    const perModule = Math.ceil(needed / copies);
    const machines = perModule * copies;
    // One chain carries one belt: limited by the strongest ingredient or product.
    const perChain = Math.max(1, Math.floor((1 + EPS) / (Math.min(1, load) * perModule)));
    const chains: number[] = [];
    for (let left = copies; left > 0; left -= perChain) chains.push(Math.min(perChain, left));
    return { ...base, options, note, maxClock, perModule, copies, chains, clock: (100 * step.machines) / machines };
  });
  groups.sort((a, b) => a.stage - b.stage || a.recipe.localeCompare(b.recipe));
  const chain = groups.length > 1 ? chainPlan(groups, opt) : undefined;
  const full = (clock: number) => clock > 100 - 1e-4;
  if (chain) {
    const exact = chain.stages.every((s) => full(s.clock));
    return { groups, chain, exact, singleBlueprint: chain.copies === 1, blueprints: 1, placements: chain.copies };
  }
  const placements = groups.reduce((sum, g) => sum + g.copies, 0);
  return {
    groups,
    exact: groups.every((g) => g.clock > g.maxClock - 1e-4),
    singleBlueprint: groups.length === 1 && placements === 1 && !groups[0].unsupported,
    blueprints: groups.length,
    placements,
  };
}

/** Groups as one chain blueprint: straight line of steps, fewest copies that fit. */
export function chainPlan(groups: Group[], opt: BuildOptions): ChainPlan | undefined {
  // Chains on a logistics floor are not built yet: feed below, output on top.
  if (opt.floor || opt.output === 'reverse' || groups.some((g) => g.unsupported || g.maxClock < 100 || hasPipes(gameData.recipes[g.recipe].machine))) return undefined;
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
      const layout = chainLayout(stages.map((s) => ({ recipe: s.recipe, machines: s.perModule })), opt);
      if (validate(layout).length === 0) return { copies, stages };
    } catch {
      // belt too slow for this many machines per row: try more copies
    }
  }
  return undefined;
}

/** Fraction p/q close to x, denominator up to 1000. */
function fraction(x: number): [number, number] {
  for (let q = 1; q <= 1000; q++) {
    const p = Math.round(x * q);
    if (Math.abs(p / q - x) < 1e-6 * Math.max(1, x)) return [p, q];
  }
  return [Math.round(x * 1000), 1000];
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Smallest rate at which every step needs a whole number of machines at 100 %.
 * Exact rates are its multiples.
 */
export function unitRate(plan: Plan, rate: number): number {
  // machines_i = c_i * rate with c_i = p_i/q_i; whole for rate = k * q_i/p_i.
  let num = 1;
  let den = 0;
  for (const s of plan.steps) {
    const [p, q] = fraction(s.machines / rate);
    if (p === 0) continue;
    num = (num * q) / gcd(num, q); // lcm of q_i
    den = gcd(den, p); // gcd of p_i
  }
  return den ? num / den : rate;
}

export interface RateSuggestion {
  rate: number;
  build: BuildPlan;
}

/** Nearest exact rates below and above the request, with their build plans. */
export function suggestRates(req: PlanRequest, opt: BuildOptions, tries = 50): RateSuggestion[] {
  const unit = unitRate(planChain(req), req.rate);
  const at = (m: number): RateSuggestion | undefined => {
    if (m <= 0) return undefined;
    const rate = m * unit;
    const build = buildPlan(planChain({ ...req, rate }), opt);
    return build.exact ? { rate, build } : undefined;
  };
  const result: RateSuggestion[] = [];
  const base = req.rate / unit;
  for (let m = Math.ceil(base - EPS) - (Number.isInteger(base) ? 1 : 0), i = 0; m > 0 && i < tries; m--, i++) {
    const s = at(m);
    if (s) {
      result.push(s);
      break;
    }
  }
  for (let m = Math.floor(base + EPS) + 1, i = 0; i < tries; m++, i++) {
    const s = at(m);
    if (s) {
      result.push(s);
      break;
    }
  }
  return result;
}
