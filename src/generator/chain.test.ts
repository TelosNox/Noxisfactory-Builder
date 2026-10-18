import { describe, expect, it } from 'vitest';
import { generateChain } from './chain';
import { validate } from './validate';

describe('chain module', () => {
  it('links smelters to constructors in one valid layout', () => {
    for (const feedFrom of ['left', 'right'] as const) {
      const layout = generateChain({
        designer: 5,
        beltTier: 3,
        feedFrom,
        stages: [{ recipe: 'Recipe_IngotIron_C', machines: 3 }, { recipe: 'Recipe_IronPlate_C', machines: 3 }],
      });
      expect(validate(layout), feedFrom).toEqual([]);
      const link = layout.belts.find((b) => b.id === 'ABlink')!;
      expect(link.fromPort).toEqual({ part: 'AJ2', port: 'Output1' });
      expect(link.toPort).toEqual({ part: 'BS0', port: 'Input1' });
      expect(layout.belts.some((b) => b.id === 'Bfeed')).toBe(false);
    }
  });
});
