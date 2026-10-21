// Blueprint names: the game cuts them at 32 characters.

export const MAX_NAME = 32;

export interface NameParts {
  recipe: string;
  machines: number;
  beltTier: number;
  feedFrom?: 'left' | 'right';
  output?: 'forward' | 'reverse';
  floor?: number;
  outputOnTop?: boolean;
  /** Power: 'P1'–'P3' poles, 'D' daisy chain, nothing without power. */
  power?: 'none' | 'daisy' | 'poles';
  poleTier?: number;
}

/**
 * Short name like "IronPlateReinforced x2 B3 LF F6": machines, belt tier,
 * feed side (L/R) and output (F forward, R reverse), logistics floor
 * ("F6", "F6o" with the output on top of the foundation).
 * The recipe part is shortened so the whole name fits.
 */
const powerTag = (p: NameParts) =>
  p.power === 'none' ? '' : p.power === 'daisy' ? ' D' : ` P${p.poleTier ?? 1}`;

export function blueprintName(p: NameParts): string {
  const side = (p.feedFrom ?? 'left') === 'left' ? 'L' : 'R';
  const out = (p.output ?? 'forward') === 'forward' ? 'F' : 'R';
  const tail = ` x${p.machines} B${p.beltTier} ${side}${out}${p.floor ? ` F${p.floor}${p.outputOnTop ? 'o' : ''}` : ''}${powerTag(p)}`;
  const recipe = p.recipe.replace(/^Recipe_|_C$/g, '').replace(/_/g, '');
  return recipe.slice(0, MAX_NAME - tail.length) + tail;
}
