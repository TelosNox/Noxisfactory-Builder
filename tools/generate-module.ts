// Generate a row module blueprint (src/generator/row.ts) from the command line.
//
// Usage: npm run generate:row -- <recipe> <machines> <designer 4|5|6> <belt tier> [left|right] [forward|reverse] [floor 0|4|6|8] [outDir]
// Example: npm run generate:row -- Recipe_IronPlate_C 4 4 3
//
// Templates come from the blueprint folders in TEMPLATE_DIRS (mod-free sessions).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Parser } from '@etothepii/satisfactory-file-parser';
import { layoutToBlueprint } from '../src/blueprint/write';
import { blueprintName } from '../src/blueprint/name';
import { TemplateLibrary } from '../src/blueprint/templates';
import { moduleLayout } from '../src/build/buildPlan';
import { FLOORS, type Floor } from '../src/generator/floor';
import { validate } from '../src/generator/validate';

const BLUEPRINTS = join(process.env.LOCALAPPDATA ?? '', 'FactoryGame/Saved/SaveGames/blueprints');
const TEMPLATE_DIRS = ['1.1 Spass', 'Bananendödels'].map((d) => join(BLUEPRINTS, d));

const [recipe, machines, designer, tier, feedFrom = 'left', output = 'forward', floorArg = '0', outDir = 'data/poc'] = process.argv.slice(2);
if (!recipe || !machines || !designer || !tier) {
  console.error('usage: npm run generate:row -- <recipe> <machines> <designer 4|5|6> <belt tier> [left|right] [forward|reverse] [floor 0|4|6|8] [outDir]');
  process.exit(1);
}

if (feedFrom !== 'left' && feedFrom !== 'right') throw new Error(`feed side must be left or right, got ${feedFrom}`);
if (output !== 'forward' && output !== 'reverse') throw new Error(`output must be forward or reverse, got ${output}`);
const floor = +floorArg;
if (floor && !(FLOORS as readonly number[]).includes(floor)) throw new Error(`floor must be 0, 4, 6 or 8, got ${floorArg}`);
const layout = moduleLayout(recipe, +machines, { designer: +designer, beltTier: +tier, feedFrom, output, floor: (floor || undefined) as Floor | undefined });
const problems = validate(layout);
if (problems.length) {
  console.error('layout invalid:\n  ' + problems.join('\n  '));
  process.exit(1);
}

const toArrayBuffer = (buf: Buffer) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const library = new TemplateLibrary();
for (const dir of TEMPLATE_DIRS) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sbp'))) {
    const path = join(dir, file);
    library.add(Parser.ParseBlueprintFiles(basename(file, '.sbp'), toArrayBuffer(readFileSync(path)), toArrayBuffer(readFileSync(path + 'cfg'))));
  }
}

const name = blueprintName({ recipe, machines: +machines, beltTier: +tier, feedFrom, output, floor });
const details = `${recipe}, ${machines} Maschinen, Band Mk${tier}, Zuführung ${feedFrom}, Ausgang ${output}${floor ? `, Logistic Floor ${floor} m` : ''}`;
const blueprint = layoutToBlueprint(layout, library, name, `Erzeugt von Noxisfactory Builder (${details})`);
let header: Uint8Array = new Uint8Array();
const chunks: Uint8Array[] = [];
const { configFileBinary } = Parser.WriteBlueprintFiles(blueprint, (h) => (header = h), (c) => chunks.push(c));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${name}.sbp`), Buffer.concat([header, ...chunks]));
writeFileSync(join(outDir, `${name}.sbpcfg`), new Uint8Array(configFileBinary));
console.log(`wrote ${join(outDir, name)}.sbp/.sbpcfg: ${layout.parts.length} buildings, ${layout.belts.length} belts`);
