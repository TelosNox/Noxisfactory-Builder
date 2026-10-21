import { describe, expect, it } from 'vitest';
import { generateFloorRow } from './floor';
import { generateFluidRow } from './fluidRow';
import { addPower, machinesPerPole } from './power';
import { generateRow } from './row';
import { validate } from './validate';

describe('power', () => {
  it('feeds at most half of a pole’s connections', () => {
    expect([1, 2, 3].map(machinesPerPole)).toEqual([2, 4, 5]);
  });

  it('places valid poles for every tier, on the ground and on a logistics floor', () => {
    for (const poleTier of [1, 2, 3]) {
      const row = addPower(generateRow({ recipe: 'Recipe_IngotIron_C', machines: 5, designer: 4, beltTier: 3 }), { mode: 'poles', poleTier });
      expect(validate(row), `row Mk${poleTier}`).toEqual([]);
      const poles = row.parts.filter((p) => p.cls.includes('PowerPole'));
      expect(poles).toHaveLength(Math.ceil(5 / machinesPerPole(poleTier)));
      // one wire per machine plus links between poles
      expect(row.wires).toHaveLength(5 + poles.length - 1);
      const floor = addPower(generateFloorRow({ recipe: 'Recipe_IronPlateReinforced_C', machines: 3, designer: 4, beltTier: 3, floor: 6 }), { mode: 'poles', poleTier });
      expect(validate(floor), `floor Mk${poleTier}`).toEqual([]);
      expect(floor.parts.filter((p) => p.cls.includes('PowerPole')).every((p) => p.pos.z === 6)).toBe(true);
    }
  });

  it('chains machines with daisy chain and no poles', () => {
    const row = addPower(generateRow({ recipe: 'Recipe_IngotIron_C', machines: 4, designer: 4, beltTier: 3 }), { mode: 'daisy' });
    expect(row.parts.some((p) => p.cls.includes('PowerPole'))).toBe(false);
    expect(row.wires).toHaveLength(3);
    expect(validate(row)).toEqual([]);
  });

  it('puts the pole on the side of the power connections, at the start of the feed', () => {
    // Smelter and Constructor: connection on the input side (-Y), Refinery: on the output side (+Y).
    const smelters = addPower(generateRow({ recipe: 'Recipe_IngotIron_C', machines: 4, designer: 4, beltTier: 3 }), { mode: 'poles', poleTier: 2 });
    const constructors = addPower(generateRow({ recipe: 'Recipe_IronPlate_C', machines: 3, designer: 4, beltTier: 3 }), { mode: 'poles', poleTier: 2 });
    const pole = (l: typeof smelters) => l.parts.find((p) => p.id === 'E0')!.pos;
    const m0 = (l: typeof smelters) => l.parts.find((p) => p.id === 'M0')!.pos;
    const refineries = addPower(generateFluidRow({ recipe: 'Recipe_Plastic_C', machines: 2, designer: 4, beltTier: 3, pipeTier: 1 }), { mode: 'poles', poleTier: 2 });
    expect(pole(smelters).y).toBeLessThan(0);
    expect(pole(constructors).y).toBeLessThan(0);
    expect(pole(refineries).y).toBeGreaterThan(0);
    // within the row (copies are placed end to end), next to the first machine
    expect(Math.abs(pole(smelters).x - m0(smelters).x)).toBeLessThanOrEqual(2.5);
    expect(Math.abs(pole(constructors).x - m0(constructors).x)).toBeLessThanOrEqual(4);
  });
});
