import { describe, expect, it } from 'vitest';
import { blueprintName, MAX_NAME } from './name';

describe('blueprint name', () => {
  it('keeps short names whole', () => {
    expect(blueprintName({ recipe: 'Recipe_IronPlate_C', machines: 4, beltTier: 3 })).toBe('IronPlate x4 B3 LF');
  });

  it('shortens the recipe to fit 32 characters', () => {
    const name = blueprintName({ recipe: 'Recipe_IronPlateReinforced_C', machines: 12, beltTier: 3, feedFrom: 'right', output: 'reverse', floor: 6 });
    expect(name.length).toBeLessThanOrEqual(MAX_NAME);
    expect(name.endsWith(' x12 B3 RR F6')).toBe(true);
  });
});
