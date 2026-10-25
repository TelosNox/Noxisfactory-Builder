import { describe, expect, it } from 'vitest';
import { plan } from '../planner/planner';
import { buildPlan, wholeRates } from './buildPlan';

describe('build plan', () => {
  it('splits iron plates into modules and chains', () => {
    const b = buildPlan(plan({ item: 'Desc_IronPlate_C', rate: 120 }), { designer: 4, beltTier: 3 });
    const plates = b.groups.find((g) => g.recipe === 'Recipe_IronPlate_C')!;
    expect(plates.copies * plates.perModule).toBeGreaterThanOrEqual(6);
    expect(plates.chains.reduce((a, c) => a + c, 0)).toBe(plates.copies);
    expect(b.groups[0].recipe).toBe('Recipe_IngotIron_C'); // smelting first
  });

  it('fits a small plan into one blueprint', () => {
    const b = buildPlan(plan({ item: 'Desc_IronPlate_C', rate: 20 }), { designer: 4, beltTier: 1 });
    const plates = b.groups.find((g) => g.recipe === 'Recipe_IronPlate_C')!;
    expect(plates).toMatchObject({ perModule: 1, copies: 1 });
  });

  it('marks recipes the generator cannot build', () => {
    // Quantum Encoder: belt inputs not in one line for lifts
    const b = buildPlan({ rate: 1, steps: [{ recipe: 'Recipe_SuperpositionOscillator_C', machines: 1 }], resources: {}, supplied: {}, surplus: {} }, { designer: 6, beltTier: 5, pipeTier: 2 });
    expect(b.groups.find((g) => g.recipe === 'Recipe_SuperpositionOscillator_C')!.unsupported).toBeTruthy();
  });
});

describe('line limit', () => {
  it('clocks a machine down when one line cannot carry its full rate', () => {
    const build = buildPlan(plan({ item: 'Desc_AluminaSolution_C', rate: 120 }), { designer: 6, beltTier: 1, feedFrom: 'left', output: 'forward' });
    const g = build.groups[0];
    expect(g.unsupported).toBeUndefined();
    expect([g.perModule, g.copies, g.maxClock]).toEqual([1, 2, 50]);
    expect(build.exact).toBe(true);
  });
});

describe('several inputs on the ground', () => {
  it('builds machines with several inputs on the ground with stacked lanes', () => {
    const build = buildPlan(plan({ item: 'Desc_Computer_C', rate: 10 }), { designer: 6, beltTier: 3 });
    const boards = build.groups.find((g) => g.recipe === 'Recipe_CircuitBoard_C')!;
    const computers = build.groups.find((g) => g.recipe === 'Recipe_Computer_C')!;
    expect([boards.unsupported, boards.options.floor]).toEqual([undefined, undefined]);
    expect([computers.unsupported, computers.options.floor]).toEqual([undefined, undefined]);
  });
});

describe('chain plan', () => {
  it('puts smelter and constructor into one blueprint', () => {
    const b = buildPlan(plan({ item: 'Desc_IronPlate_C', rate: 20 }), { designer: 6, beltTier: 1 });
    expect(b.singleBlueprint).toBe(true);
    expect(b.chain!.stages.map((s) => s.recipe)).toEqual(['Recipe_IngotIron_C', 'Recipe_IronPlate_C']);
  });

  it('places the chain several times when the belt is the limit', () => {
    // 3 smelters + 3 constructors, Mk1 belt carries 2 smelters: 2 x (2 + 2) at 75 %.
    const b = buildPlan(plan({ item: 'Desc_IronPlate_C', rate: 60 }), { designer: 4, beltTier: 1 });
    expect(b.chain!.copies).toBe(2);
    expect(b.exact).toBe(false);
  });

  it('keeps one blueprint per recipe for branching chains', () => {
    const b = buildPlan(plan({ item: 'Desc_ModularFrame_C', rate: 2 }), { designer: 6, beltTier: 3 });
    expect(b.chain).toBeUndefined();
  });
});

describe('whole machine rates', () => {
  it('offers the rates where the target step runs on whole machines', () => {
    // 50 plates/min: 2.5 constructors at 20/min each.
    const p = plan({ item: 'Desc_IronPlate_C', rate: 50, supplied: ['Desc_IronIngot_C'] });
    expect(wholeRates(p, 'Desc_IronPlate_C', 50).map((r) => [r.rate, r.machines])).toEqual([
      [40, 2],
      [60, 3],
    ]);
  });

  it('includes direct predecessors but nothing further back', () => {
    // 5 RIP/min: 1 assembler, 1.5 plate and 1.5 screw constructors (ingots supplied):
    // whole at 10/3 and 20/3 per minute, the same for both predecessors.
    const p = plan({ item: 'Desc_IronPlateReinforced_C', rate: 5, supplied: ['Desc_IronIngot_C'] });
    const rates = wholeRates(p, 'Desc_IronPlateReinforced_C', 5);
    expect(rates.map((r) => r.rate)).toEqual([10 / 3, 20 / 3]);
    expect(rates.every((r) => ['Recipe_IronPlate_C', 'Recipe_Screw_C'].includes(r.recipe))).toBe(true);
    const deep = plan({ item: 'Desc_IronPlateReinforced_C', rate: 5 });
    expect(wholeRates(deep, 'Desc_IronPlateReinforced_C', 5).some((r) => r.recipe === 'Recipe_IngotIron_C')).toBe(false);
  });

  it('offers nothing when the target and its predecessors are whole', () => {
    const p = plan({ item: 'Desc_IronPlate_C', rate: 60, supplied: ['Desc_IronIngot_C'] });
    expect(wholeRates(p, 'Desc_IronPlate_C', 60)).toEqual([]);
  });
});
