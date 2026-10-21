// Blueprint names: the game cuts them at 32 characters.

export const MAX_NAME = 32;

export interface NameParts {
  recipe: string;
  machines: number;
  beltTier: number;
  feedFrom?: 'left' | 'right';
  output?: 'forward' | 'reverse';
  floor?: number;
  outputBelow?: boolean;
}

/**
 * Short name like "IronPlateReinforced x2 B3 LF F6": machines, belt tier,
 * feed side (L/R) and output (F forward, R reverse), logistics floor
 * ("F6", "F6u" with the output below the floor).
 * The recipe part is shortened so the whole name fits.
 */
export function blueprintName(p: NameParts): string {
  const side = (p.feedFrom ?? 'left') === 'left' ? 'L' : 'R';
  const out = (p.output ?? 'forward') === 'forward' ? 'F' : 'R';
  const tail = ` x${p.machines} B${p.beltTier} ${side}${out}${p.floor ? ` F${p.floor}${p.outputBelow ? 'u' : ''}` : ''}`;
  const recipe = p.recipe.replace(/^Recipe_|_C$/g, '').replace(/_/g, '');
  return recipe.slice(0, MAX_NAME - tail.length) + tail;
}
