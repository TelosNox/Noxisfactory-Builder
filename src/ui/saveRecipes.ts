// Unlocked recipes in a parsed save (used by saveWorker.ts, kept apart for tests).

import type { SaveComponent, SaveEntity } from '@etothepii/satisfactory-file-parser';

interface Reference {
  pathName?: string;
}

/** Recipe class names of the recipe manager (current saves: FGRecipeManager, older: BP_RecipeManager_C). */
export function unlockedRecipes(objects: (SaveEntity | SaveComponent)[]): string[] | null {
  const manager = objects.find((o) => o.typePath.endsWith('.FGRecipeManager') || o.typePath.endsWith('.BP_RecipeManager_C'));
  if (!manager) return null;
  const property = manager.properties.mAvailableRecipes as { values?: Reference[] } | undefined;
  return (property?.values ?? [])
    .map((r) => r?.pathName ?? '')
    .map((path) => path.slice(path.lastIndexOf('.') + 1))
    .filter((name) => name.length > 0);
}
