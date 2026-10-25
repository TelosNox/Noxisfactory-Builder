// Game progress from a save file: the recipe manager lists every unlocked
// recipe, build recipes included (belts, pipes, poles, Blueprint Designer).
// Parsing runs in a worker (saveWorker.ts); this part maps class names only.

import { alternateRecipes } from '../planner/planner';
import { gameData, type RecipeId } from '../planner/gameData';
import type { GameConfig } from './config';

export type SaveProgress = Pick<GameConfig, 'designer' | 'beltTier' | 'pipeTier' | 'poleTier' | 'alternates' | 'lockedMachines'>;

export interface SaveUnlocks {
  sessionName: string | null;
  recipes: string[];
}

/** Highest tier whose build recipe is unlocked. */
function highest(recipes: Set<string>, tiers: [number, string][], fallback: number) {
  return tiers.reduce((best, [tier, id]) => (recipes.has(id) && tier > best ? tier : best), fallback);
}

export function progressFromRecipes(unlocked: string[]): SaveProgress {
  const recipes = new Set(unlocked);
  const alternates = new Set(alternateRecipes());
  return {
    // Mk1 designer: 4 x 4 foundations, Mk2: 5 x 5, Mk3: 6 x 6.
    designer: highest(recipes, [[4, 'Recipe_BlueprintDesigner_C'], [5, 'Recipe_BlueprintDesigner_Mk2_C'], [6, 'Recipe_BlueprintDesigner_Mk3_C']], 4),
    beltTier: highest(recipes, [1, 2, 3, 4, 5, 6].map((t) => [t, `Recipe_ConveyorBeltMk${t}_C`]), 1),
    pipeTier: highest(recipes, [[1, 'Recipe_Pipeline_C'], [2, 'Recipe_PipelineMK2_C']], 1),
    poleTier: highest(recipes, [1, 2, 3].map((t) => [t, `Recipe_PowerPoleMk${t}_C`]), 1),
    alternates: unlocked.filter((id): id is RecipeId => alternates.has(id)).sort(),
    // By the building's build recipe (names differ: Recipe_SmelterMk1_C builds the Foundry).
    lockedMachines: Object.keys(gameData.machines)
      .filter((m) => {
        const path = gameData.buildings[m]?.recipe;
        return path && !recipes.has(path.slice(path.lastIndexOf('.') + 1));
      })
      .sort(),
  };
}

/** Reads a save file in a worker; rejects with a message for the user. */
export function readSave(file: File): Promise<SaveUnlocks> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./saveWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SaveUnlocks | { error: string }>) => {
      worker.terminate();
      if ('error' in e.data) reject(new Error(e.data.error));
      else resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Spielstand konnte nicht gelesen werden.'));
    };
    file.arrayBuffer().then((buffer) => worker.postMessage({ name: file.name, buffer }, [buffer]), reject);
  });
}
