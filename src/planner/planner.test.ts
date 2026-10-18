import { describe, expect, it } from 'vitest';
import { plan } from './planner';

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
});
