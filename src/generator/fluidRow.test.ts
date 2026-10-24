import { describe, expect, it } from 'vitest';
import { gameData } from '../planner/gameData';
import { generateFluidRow, PIPE_Z } from './fluidRow';
import { validate } from './validate';

const refineryAndPackager = Object.entries(gameData.recipes)
  .filter(([, r]) => !r.alternate && ['Build_OilRefinery_C', 'Build_Packager_C'].includes(r.machine))
  .map(([id]) => id);

describe('fluid row', () => {
  it('builds valid rows for all refinery and packager recipes', () => {
    expect(refineryAndPackager.length).toBeGreaterThan(30);
    for (const recipe of refineryAndPackager) {
      for (const feedFrom of ['left', 'right'] as const) {
        for (const output of ['forward', 'reverse'] as const) {
          const layout = generateFluidRow({ recipe, machines: 2, designer: 6, beltTier: 5, pipeTier: 2, feedFrom, output });
          expect(validate(layout), `${recipe} ${feedFrom} ${output}`).toEqual([]);
        }
      }
    }
  });

  it('stacks the pipe line above the belt line and turns the refinery', () => {
    // Fuel: crude oil in by pipe, fuel out by pipe, polymer resin out by belt.
    const layout = generateFluidRow({ recipe: 'Recipe_LiquidFuel_C', machines: 2, designer: 4, beltTier: 3, pipeTier: 1 });
    expect(layout.parts.find((p) => p.id === 'M0')!.yaw).toBe(180);
    const t = layout.parts.find((p) => p.id === 'T0_0')!;
    expect(t.pos.z).toBe(PIPE_Z);
    const merger = layout.parts.find((p) => p.id === 'J0')!;
    const u = layout.parts.find((p) => p.id === 'U0')!;
    expect(u.pos.y).toBe(merger.pos.y);
    expect(layout.parts.some((p) => p.id === 'S0_0')).toBe(false); // no solid input
  });

  it('checks pipe capacity', () => {
    // Plastic: 30 m³/min crude oil per refinery; 11 exceed a Mk1 pipe (300).
    expect(() => generateFluidRow({ recipe: 'Recipe_Plastic_C', machines: 11, designer: 6, beltTier: 6, pipeTier: 1 })).toThrow(/pipe Mk1/);
  });

  it('builds blenders on the ground: pipes low, belts above by lift', () => {
    for (const feedFrom of ['left', 'right'] as const) {
      for (const output of ['forward', 'reverse'] as const) {
        const layout = generateFluidRow({ recipe: 'Recipe_CoolingSystem_C', machines: 2, designer: 5, beltTier: 3, pipeTier: 1, feedFrom, output });
        expect(validate(layout), `${feedFrom} ${output}`).toEqual([]);
      }
    }
    const layout = generateFluidRow({ recipe: 'Recipe_CoolingSystem_C', machines: 1, designer: 5, beltTier: 3, pipeTier: 1 });
    expect(['T0_0', 'T1_0', 'S0_0', 'S1_0'].map((id) => layout.parts.find((p) => p.id === id)!.pos.z)).toEqual([1.75, 3.75, 7, 9]);
    expect(layout.lifts!.every((l) => l.down)).toBe(true);
  });
});
