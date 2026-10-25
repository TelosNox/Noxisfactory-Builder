import { describe, expect, it } from 'vitest';
import { alternateRecipes, plan, standardRecipes } from '../planner/planner';
import { alternatives, optionEffect } from './alternatives';

describe('alternatives', () => {
  const recipes = [...standardRecipes(), 'Recipe_Alternate_DilutedPackagedFuel_C', 'Recipe_Alternate_HeavyOilResidue_C'];
  const request = { item: 'Desc_LiquidFuel_C', rate: 60, recipes, criterion: 'machines' as const };
  const base = plan(request);
  const unlocked = new Set(['Recipe_Alternate_DilutedPackagedFuel_C', 'Recipe_Alternate_HeavyOilResidue_C']);

  it('offers standard recipes and alternates for the products of the plan', () => {
    // With few machines the refinery makes fuel from oil directly.
    expect(base.steps.map((s) => s.recipe)).toEqual(['Recipe_LiquidFuel_C']);
    const fuel = alternatives(request, base, unlocked).find((p) => p.item === 'Desc_LiquidFuel_C')!;
    const status = Object.fromEntries(fuel.options.map((o) => [o.recipe, o.status]));
    expect(status.Recipe_UnpackageFuel_C).toBe('usable');
    expect(status.Recipe_ResidualFuel_C).toBe('usable');
    expect(status.Recipe_Alternate_DilutedFuel_C).toBe('locked');
  });

  it('sums up what forcing a recipe changes', () => {
    // Packaged route: 22.5 oil instead of 90, 60 water, more machines and steps.
    const { effect } = optionEffect(request, base, 'Recipe_UnpackageFuel_C');
    expect(effect!.inputs.Desc_LiquidOil_C).toBeCloseTo(-67.5);
    expect(effect!.inputs.Desc_Water_C).toBeCloseTo(60);
    expect(effect!.machines).toBeGreaterThan(0);
    expect(effect!.steps).toBe(3);
  });

  it('reports a recipe the plan cannot use', () => {
    const all = { ...request, recipes: [...standardRecipes(), ...alternateRecipes()] };
    const { error } = optionEffect({ ...all, available: { Desc_LiquidOil_C: 30 } }, base, 'Recipe_LiquidFuel_C');
    expect(error).toMatch(/Reicht nicht/);
  });
});
