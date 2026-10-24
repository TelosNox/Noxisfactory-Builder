// Game progress: what the player has unlocked, set once and changed as the
// game goes on (docs/ui.md, Spielstand). Kept in the browser's localStorage;
// without storage the defaults apply.

import type { ItemId, RecipeId } from '../planner/gameData';
import type { Criterion } from '../planner/planner';

export interface GameConfig {
  /** Largest Blueprint Designer: 4, 5 or 6 foundations. */
  designer: number;
  beltTier: number;
  pipeTier: number;
  power: 'poles' | 'daisy' | 'none';
  poleTier: number;
  /** Unlocked alternate recipes. */
  alternates: RecipeId[];
  /** Items always delivered from outside, unless they are the product itself. */
  supplied: ItemId[];
  criterion: Criterion;
}

/** Ingots usually come from a central smelter (player). */
export const DEFAULT_SUPPLIED: ItemId[] = [
  'Desc_IronIngot_C',
  'Desc_CopperIngot_C',
  'Desc_GoldIngot_C',
  'Desc_SteelIngot_C',
  'Desc_AluminumIngot_C',
];

export const DEFAULT_CONFIG: GameConfig = {
  designer: 4,
  beltTier: 1,
  pipeTier: 1,
  power: 'poles',
  poleTier: 1,
  alternates: [],
  supplied: DEFAULT_SUPPLIED,
  criterion: 'scarcity',
};

const KEY = 'noxisfactory.config';

export function loadConfig(): GameConfig {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: GameConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Private window or blocked storage: the config lasts for this visit.
  }
}
