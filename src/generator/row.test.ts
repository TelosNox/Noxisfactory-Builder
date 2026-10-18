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

  const used = (layout: ReturnType<typeof generateRow>, part: string, port: string) =>
    layout.belts.some((b) => [b.fromPort, b.toPort].some((r) => r?.part === part && r.port === port));

  it('reverse output: products leave at the feed side, open ports at +X for extension', () => {
    const layout = generateRow({ recipe: 'Recipe_IngotIron_C', machines: 3, designer: 4, beltTier: 3, output: 'reverse' });
    expect(validate(layout)).toEqual([]);
    const feed = layout.belts.find((b) => b.id === 'feed')!;
    expect(feed.fromPort).toBeUndefined();
    expect(feed.toPort).toEqual({ part: 'S0', port: 'Input1' });
    const exit = layout.belts.find((b) => b.id === 'collect0')!;
    expect(exit.fromPort).toEqual({ part: 'J0', port: 'Output1' });
    expect(exit.toPort).toBeUndefined();
    expect(exit.to.x).toBeLessThan(exit.from.x); // flows -X
    expect(used(layout, 'S2', 'Output1')).toBe(false);
    expect(used(layout, 'J2', 'Input1')).toBe(false);
  });

  it('forward output (default): both stubs on -X, open ports on +X', () => {
    const layout = generateRow({ recipe: 'Recipe_IngotIron_C', machines: 3, designer: 4, beltTier: 3 });
    expect(validate(layout)).toEqual([]);
    const stub = layout.belts.find((b) => b.id === 'collect0')!;
    expect(stub.fromPort).toBeUndefined();
    expect(stub.toPort).toEqual({ part: 'J0', port: 'Input1' });
    expect(used(layout, 'J2', 'Output1')).toBe(false);
  });

  it('is valid for every feed side and output direction', () => {
    for (const recipe of ['Recipe_IronPlate_C', 'Recipe_IngotIron_C']) {
      for (const feedFrom of ['left', 'right'] as const) {
        for (const output of ['forward', 'reverse'] as const) {
          const layout = generateRow({ recipe, machines: 3, designer: 4, beltTier: 3, feedFrom, output });
          expect(validate(layout), `${recipe} ${feedFrom} ${output}`).toEqual([]);
        }
      }
    }
  });

  it('feed from the right enters at +X, row extends towards -X', () => {
    const layout = generateRow({ recipe: 'Recipe_IngotIron_C', machines: 3, designer: 4, beltTier: 3, feedFrom: 'right' });
    const feed = layout.belts.find((b) => b.id === 'feed')!;
    const s0 = layout.parts.find((p) => p.id === 'S0')!;
    const s2 = layout.parts.find((p) => p.id === 'S2')!;
    expect(s0.pos.x).toBeGreaterThan(s2.pos.x);
    expect(feed.from.x).toBeGreaterThan(feed.to.x); // flows -X
    expect(used(layout, 'S2', 'Output1')).toBe(false);
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
