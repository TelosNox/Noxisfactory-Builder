import { describe, expect, it } from 'vitest';
import { plan } from '../planner/planner';
import { buildPlan, suggestRates } from './buildPlan';

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
    const b = buildPlan(plan({ item: 'Desc_ModularFrame_C', rate: 2 }), { designer: 4, beltTier: 3 });
    expect(b.groups.find((g) => g.recipe === 'Recipe_ModularFrame_C')!.unsupported).toMatch(/one belt input/);
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

describe('rate suggestions', () => {
  it('offers the nearest rates that divide evenly', () => {
    const s = suggestRates({ item: 'Desc_IronPlate_C', rate: 60 }, { designer: 4, beltTier: 1 });
    // 1 copy of 2 + 2 makes 40/min, 2 copies make 80/min.
    expect(s.map((x) => x.rate)).toEqual([40, 80]);
    expect(s.every((x) => x.build.exact)).toBe(true);
  });
});
