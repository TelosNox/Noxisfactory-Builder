import { describe, expect, it } from 'vitest';
import { generateRow } from './row';
import { validate } from './validate';

describe('row module', () => {
  it('builds a valid row of constructors', () => {
    const layout = generateRow({ recipe: 'Recipe_IronPlate_C', machines: 4, designer: 4, beltTier: 3 });
    expect(layout.parts.filter((p) => p.cls === 'Build_ConstructorMk1_C')).toHaveLength(4);
    expect(validate(layout)).toEqual([]);
  });

  it('builds a valid row of smelters', () => {
    const layout = generateRow({ recipe: 'Recipe_IngotIron_C', machines: 5, designer: 4, beltTier: 3 });
    expect(validate(layout)).toEqual([]);
  });

  it('puts both auto-connect stubs on the -X side, open ports on +X', () => {
    const layout = generateRow({ recipe: 'Recipe_IngotIron_C', machines: 3, designer: 4, beltTier: 3 });
    for (const [id, part] of [
      ['feed', 'S0'],
      ['collect0', 'J0'],
    ]) {
      const stub = layout.belts.find((b) => b.id === id)!;
      expect(stub.fromPort).toBeUndefined();
      expect(stub.toPort).toEqual({ part, port: 'Input1' });
      expect(stub.to.x - stub.from.x).toBeCloseTo(2);
    }
    const used = (part: string, port: string) =>
      layout.belts.some((b) => [b.fromPort, b.toPort].some((r) => r?.part === part && r.port === port));
    expect(used('S2', 'Output1')).toBe(false);
    expect(used('J2', 'Output1')).toBe(false);
  });

  it('rejects rows that exceed the belt', () => {
    // 4 constructors need 4 x 30 ingots/min = 120 > 60 (Mk1).
    expect(() => generateRow({ recipe: 'Recipe_IronPlate_C', machines: 4, designer: 4, beltTier: 1 })).toThrow(/carries/);
  });

  it('reports rows that do not fit the designer', () => {
    const layout = generateRow({ recipe: 'Recipe_IronPlate_C', machines: 5, designer: 4, beltTier: 5 });
    expect(validate(layout).length).toBeGreaterThan(0);
  });

  it('rejects machines with several inputs', () => {
    expect(() => generateRow({ recipe: 'Recipe_ModularFrame_C', machines: 1, designer: 4, beltTier: 1 })).toThrow(/one belt input/);
  });
});
