import { describe, expect, it } from 'vitest';
import { generateStackedRow } from './stacked';
import { validate } from './validate';

describe('stacked row on the ground', () => {
  it('builds valid rows for assemblers and manufacturers', () => {
    for (const [recipe, designer] of [['Recipe_IronPlateReinforced_C', 4], ['Recipe_Computer_C', 6]] as const) {
      for (const feedFrom of ['left', 'right'] as const) {
        for (const output of ['forward', 'reverse'] as const) {
          const layout = generateStackedRow({ recipe, machines: 2, designer, beltTier: 3, feedFrom, output });
          expect(validate(layout), `${recipe} ${feedFrom} ${output}`).toEqual([]);
        }
      }
    }
  });

  it('feeds the first input by belt and the others by down lifts from 5 and 7 m', () => {
    const layout = generateStackedRow({ recipe: 'Recipe_Computer_C', machines: 1, designer: 6, beltTier: 3 });
    expect(layout.lifts!.map((l) => l.pos.z + l.height)).toEqual([5, 7]) // Computer uses 3 of 4 inputs;
    expect(layout.lifts!.every((l) => l.down)).toBe(true);
  });
});
