import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Parser, type SaveEntity } from '@etothepii/satisfactory-file-parser';
import { progressFromRecipes } from './savegame';
import { unlockedRecipes } from './saveRecipes';

const manager = (typePath: string, names: string[]) =>
  ({ typePath, properties: { mAvailableRecipes: { values: names.map((n) => ({ pathName: `/Game/X/${n}.${n}` })) } } }) as unknown as SaveEntity;

describe('save game progress', () => {
  it('maps build recipes to tiers and keeps unlocked alternates', () => {
    const p = progressFromRecipes([
      'Recipe_ConveyorBeltMk1_C',
      'Recipe_ConveyorBeltMk3_C',
      'Recipe_PipelineMK2_C',
      'Recipe_PowerPoleMk2_C',
      'Recipe_BlueprintDesigner_C',
      'Recipe_SmelterBasicMk1_C',
      'Recipe_ConstructorMk1_C',
      'Recipe_AssemblerMk1_C',
      'Recipe_SmelterMk1_C',
      'Recipe_Alternate_PureIronIngot_C',
      'Recipe_IronPlate_C',
    ]);
    expect(p).toMatchObject({ designer: 4, beltTier: 3, pipeTier: 2, poleTier: 2, alternates: ['Recipe_Alternate_PureIronIngot_C'] });
    // Recipe_SmelterMk1_C builds the Foundry, the smelter is Recipe_SmelterBasicMk1_C.
    expect(p.lockedMachines).not.toContain('Build_FoundryMk1_C');
    expect(p.lockedMachines).not.toContain('Build_SmelterMk1_C');
    expect(p.lockedMachines).toContain('Build_Blender_C');
  });

  it('falls back to the lowest tiers without build recipes', () => {
    expect(progressFromRecipes([])).toMatchObject({ designer: 4, beltTier: 1, pipeTier: 1, poleTier: 1, alternates: [] });
  });

  it('reads the recipe manager of current and older saves', () => {
    expect(unlockedRecipes([manager('/Script/FactoryGame.FGRecipeManager', ['Recipe_Wire_C'])])).toEqual(['Recipe_Wire_C']);
    expect(unlockedRecipes([manager('/Game/X/BP_RecipeManager.BP_RecipeManager_C', ['Recipe_Wire_C'])])).toEqual(['Recipe_Wire_C']);
    expect(unlockedRecipes([])).toBeNull();
  });

  // Runs only on a machine with Satisfactory saves (not in CI).
  const dir = join(process.env.LOCALAPPDATA ?? '', 'FactoryGame/Saved/SaveGames');
  const save = existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: 'utf8' }).find((f) => f.endsWith('.sav') && !f.includes('ServerManager'))
    : undefined;
  it.skipIf(!save)('reads a real save', () => {
    const buf = readFileSync(join(dir, save!));
    const parsed = Parser.ParseSave('test', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const recipes = unlockedRecipes(Object.values(parsed.levels).flatMap((l) => l.objects))!;
    expect(recipes).toContain('Recipe_ConveyorBeltMk1_C');
    expect(progressFromRecipes(recipes).beltTier).toBeGreaterThanOrEqual(1);
  });
});
