import recipesJson from '../../data/recipes.json';

export type ItemId = string;
export type RecipeId = string;
export type MachineId = string;

export interface Item {
  name: string;
  form: 'solid' | 'liquid' | 'gas' | 'other';
  /** Raw resource mined or extracted from the world. */
  resource: boolean;
}

export interface Machine {
  name: string;
  powerMW: number;
  powerExponent: number;
  variablePower: boolean;
}

export interface Recipe {
  name: string;
  alternate: boolean;
  machine: MachineId;
  durationS: number;
  /** Amount per cycle; fluids in m³. */
  in: Record<ItemId, number>;
  out: Record<ItemId, number>;
  powerMW?: { min: number; max: number };
}

export interface GameData {
  items: Record<ItemId, Item>;
  machines: Record<MachineId, Machine>;
  recipes: Record<RecipeId, Recipe>;
}

export const gameData = recipesJson as GameData;

/** Items per minute that one machine at 100 % moves for this recipe. */
export function ratePerMinute(recipe: Recipe, amount: number): number {
  return (amount * 60) / recipe.durationS;
}
