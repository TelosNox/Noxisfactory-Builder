import { describe, expect, it } from 'vitest';
import { plan } from '../planner/planner';
import { byproducts } from './byproducts';

describe('by-products', () => {
  it('recycles water and silica in the aluminum chain', () => {
    const list = byproducts(plan({ item: 'Desc_AluminumIngot_C', rate: 60 }));
    const water = list.find((b) => b.item === 'Desc_Water_C')!;
    expect(water.from).toBe('Recipe_AluminumScrap_C');
    expect(water.to.map((t) => t.recipe)).toEqual(['Recipe_AluminaSolution_C']);
    expect(water.fluid).toBe(true);
    expect(water.surplus).toBe(0);
    expect(water.fresh).toBeGreaterThan(0);
    const silica = list.find((b) => b.item === 'Desc_Silica_C')!;
    expect(silica.to.map((t) => t.recipe)).toEqual(['Recipe_IngotAluminum_C']);
    expect(silica.fresh).toBeCloseTo(50); // Foundry needs 75, 25 come from the solution
  });

  it('reports surplus that has to be processed or sunk', () => {
    const [silica] = byproducts(plan({ item: 'Desc_AluminaSolution_C', rate: 120 }));
    expect(silica.item).toBe('Desc_Silica_C');
    expect(silica.to).toEqual([]);
    expect(silica.surplus).toBeCloseTo(50);
  });
});
