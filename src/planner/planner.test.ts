import { describe, expect, it } from 'vitest';
import { alternateRecipes, plan, standardRecipes } from './planner';

const machines = (p: ReturnType<typeof plan>, recipe: string) =>
  p.steps.find((s) => s.recipe === recipe)?.machines ?? 0;

describe('planner', () => {
  it('plans iron plates from ore', () => {
    // Iron Plate: 3 ingots -> 2 plates in 6 s = 20 plates/min per constructor.
    const p = plan({ item: 'Desc_IronPlate_C', rate: 60 });
    expect(machines(p, 'Recipe_IronPlate_C')).toBeCloseTo(3);
    // 90 ingots/min, smelter makes 30/min.
    expect(machines(p, 'Recipe_IngotIron_C')).toBeCloseTo(3);
    expect(p.resources.Desc_OreIron_C).toBeCloseTo(90);
    expect(p.surplus).toEqual({});
  });

  it('plans a multi-step product', () => {
    // Modular Frame: 3 RIP + 12 rods -> 2 frames in 60 s = 2/min per assembler.
    const p = plan({ item: 'Desc_ModularFrame_C', rate: 2 });
    expect(machines(p, 'Recipe_ModularFrame_C')).toBeCloseTo(1);
    expect(p.resources.Desc_OreIron_C).toBeGreaterThan(0);
  });

  it('reports by-products as surplus', () => {
    const p = plan({ item: 'Desc_Plastic_C', rate: 20 });
    expect(machines(p, 'Recipe_Plastic_C')).toBeCloseTo(1);
    expect(p.surplus.Desc_HeavyOilResidue_C).toBeCloseTo(10);
  });

  it('does not convert SAM into other resources by default', () => {
    const p = plan({ item: 'Desc_ModularFrameHeavy_C', rate: 2 });
    expect(p.resources.Desc_SAM_C).toBeUndefined();
    expect(p.resources.Desc_Stone_C).toBeGreaterThan(0);
  });

  it('uses alternate recipes only when allowed', () => {
    const p = plan({ item: 'Desc_IronPlate_C', rate: 60 });
    expect(p.steps.every((s) => !s.recipe.startsWith('Recipe_Alternate_'))).toBe(true);
  });

  it('rejects unknown items', () => {
    expect(() => plan({ item: 'Desc_Nothing_C', rate: 1 })).toThrow();
  });

  it('takes supplied items as delivered, except the target', () => {
    const p = plan({ item: 'Desc_ModularFrame_C', rate: 10, supplied: ['Desc_IronIngot_C', 'Desc_ModularFrame_C'] });
    expect(machines(p, 'Recipe_IngotIron_C')).toBe(0);
    expect(p.supplied.Desc_IronIngot_C).toBeCloseTo(240);
    expect(p.resources).toEqual({});
    expect(machines(p, 'Recipe_ModularFrame_C')).toBeCloseTo(5);
  });

  it('uses a forced recipe for its product', () => {
    const p = plan({ item: 'Desc_IronPlateReinforced_C', rate: 10, forced: ['Recipe_Alternate_Screw_C'] });
    expect(machines(p, 'Recipe_Alternate_Screw_C')).toBeGreaterThan(0);
    expect(machines(p, 'Recipe_Screw_C')).toBe(0);
  });

  it('weighs rare resources more with the scarcity criterion', () => {
    const recipes = [...standardRecipes(), ...alternateRecipes()];
    const rare = plan({ item: 'Desc_ModularFrame_C', rate: 10, recipes, criterion: 'scarcity' });
    const few = plan({ item: 'Desc_ModularFrame_C', rate: 10, recipes, criterion: 'machines' });
    const count = (q: typeof rare) => q.steps.reduce((sum, s) => sum + s.machines, 0);
    expect(count(few)).toBeLessThan(count(rare));
  });
});

describe('available amounts', () => {
  it('names the limit a plan exceeds', () => {
    // 60 plates need 90 ore/min.
    expect(() => plan({ item: 'Desc_IronPlate_C', rate: 60, available: { Desc_OreIron_C: 30 } })).toThrow(/Ore Iron 90\/min nötig, 30\/min verfügbar/);
  });

  it('maximizes the target from the available amounts', () => {
    // Wire: 15 copper ingots -> 30 wire per minute and constructor.
    const p = plan({ item: 'Desc_Wire_C', rate: 0, maximize: true, supplied: ['Desc_CopperIngot_C'], available: { Desc_CopperIngot_C: 240 } });
    expect(p.rate).toBeCloseTo(480);
    expect(p.supplied.Desc_CopperIngot_C).toBeCloseTo(240);
  });

  it('refuses to maximize without a limit', () => {
    expect(() => plan({ item: 'Desc_Wire_C', rate: 0, maximize: true })).toThrow(/Ohne Grenze: Wire lässt sich beliebig viel herstellen aus Ore Copper/);
  });
});

describe('extra costs', () => {
  const recipes = [...standardRecipes(), ...alternateRecipes()];

  it('drops small side chains with a step penalty', () => {
    const lp = plan({ item: 'Desc_ModularFrameHeavy_C', rate: 5, recipes });
    const fewer = plan({ item: 'Desc_ModularFrameHeavy_C', rate: 5, recipes, stepPenalty: 0.01 });
    expect(fewer.steps.length).toBeLessThan(lp.steps.length);
    expect(fewer.steps.every((s) => s.machines > 0.1)).toBe(true);
  });

  it('keeps forced recipes under a step penalty', () => {
    const p = plan({ item: 'Desc_IronPlateReinforced_C', rate: 10, forced: ['Recipe_Alternate_Screw_C'], stepPenalty: 0.5 });
    expect(machines(p, 'Recipe_Alternate_Screw_C')).toBeGreaterThan(0);
  });

  it('weighs machines on top of resources', () => {
    const count = (q: ReturnType<typeof plan>) => q.steps.reduce((sum, s) => sum + s.machines, 0);
    const plain = plan({ item: 'Desc_ModularFrame_C', rate: 10, recipes });
    const costly = plan({ item: 'Desc_ModularFrame_C', rate: 10, recipes, machineCost: 50 });
    expect(count(costly)).toBeLessThan(count(plain));
  });
});
