import { describe, expect, it } from 'vitest';
import { floorLevels, generateFloorRow } from './floor';
import { validate } from './validate';

describe('logistics floor row', () => {
  it('has one belt level at 4 m, two at 6 m, three at 8 m', () => {
    expect([4, 6, 8].map(floorLevels)).toEqual([1, 2, 3]);
  });

  it('builds valid assembler rows for every floor and feed side', () => {
    for (const floor of [4, 6, 8] as const) {
      for (const feedFrom of ['left', 'right'] as const) {
        const layout = generateFloorRow({ recipe: 'Recipe_IronPlateReinforced_C', machines: 3, designer: 4, beltTier: 3, floor, feedFrom });
        expect(validate(layout), `${floor} ${feedFrom}`).toEqual([]);
      }
    }
  });

  it('feeds the second input from outside at 4 m and across at 3 m from 6 m', () => {
    const low = generateFloorRow({ recipe: 'Recipe_IronPlateReinforced_C', machines: 1, designer: 4, beltTier: 3, floor: 4 });
    expect(low.belts.some((b) => b.id.startsWith('cross'))).toBe(false);
    const high = generateFloorRow({ recipe: 'Recipe_IronPlateReinforced_C', machines: 1, designer: 4, beltTier: 3, floor: 6 });
    const cross = high.belts.find((b) => b.id === 'cross1_0')!;
    expect(cross.from.z).toBe(3);
    expect(high.lifts!.filter((l) => !l.down && l.topLink?.part === 'M0')).toHaveLength(2);
  });

  it('rejects manufacturers on a 4 m floor', () => {
    expect(() => generateFloorRow({ recipe: 'Recipe_Computer_C', machines: 1, designer: 5, beltTier: 3, floor: 4 })).toThrow(/6 m/);
  });

  it('finds misplaced lifts', () => {
    const layout = generateFloorRow({ recipe: 'Recipe_IronPlateReinforced_C', machines: 1, designer: 4, beltTier: 3, floor: 6 });
    layout.lifts![0].pos.y += 1;
    expect(validate(layout).some((p) => p.includes('not snapped'))).toBe(true);
  });

  it('puts the output line below the floor by default', () => {
    for (const floor of [4, 6, 8] as const) {
      for (const output of ['forward', 'reverse'] as const) {
        const layout = generateFloorRow({ recipe: 'Recipe_IronPlateReinforced_C', machines: 3, designer: 4, beltTier: 3, floor, output });
        expect(validate(layout), `${floor} ${output}`).toEqual([]);
        expect(layout.parts.filter((p) => p.id.startsWith('J')).every((p) => p.pos.z === 1)).toBe(true);
        expect(layout.lifts!.filter((l) => l.down)).toHaveLength(6);
      }
    }
  });

  it('puts the output merger under the machine when the lanes leave room', () => {
    const layout = generateFloorRow({ recipe: 'Recipe_IronPlateReinforced_C', machines: 1, designer: 4, beltTier: 3, floor: 6 });
    const merger = layout.parts.find((p) => p.id === 'J0')!;
    const lift = layout.lifts!.find((l) => l.id === 'O0b')!;
    expect(merger.pos.y).toBeLessThan(lift.pos.y);
  });
});
