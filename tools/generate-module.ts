// Generate a row module blueprint (src/generator/row.ts) from the command line.
//
// Usage: npm run generate:row -- <recipe> <machines> <designer 4|5|6> <belt tier> [left|right] [forward|reverse] [outDir]
// Example: npm run generate:row -- Recipe_IronPlate_C 4 4 3
//
// Templates come from the blueprint folders in TEMPLATE_DIRS (mod-free sessions).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Parser } from '@etothepii/satisfactory-file-parser';
import { layoutToBlueprint } from '../src/blueprint/write';
import { TemplateLibrary } from '../src/blueprint/templates';
import { generateRow } from '../src/generator/row';
import { validate } from '../src/generator/validate';

const BLUEPRINTS = join(process.env.LOCALAPPDATA ?? '', 'FactoryGame/Saved/SaveGames/blueprints');
const TEMPLATE_DIRS = ['1.1 Spass', 'Bananendödels'].map((d) => join(BLUEPRINTS, d));

const [recipe, machines, designer, tier, feedFrom = 'left', output = 'forward', outDir = 'data/poc'] = process.argv.slice(2);
if (!recipe || !machines || !designer || !tier) {
  console.error('usage: npm run generate:row -- <recipe> <machines> <designer 4|5|6> <belt tier> [left|right] [forward|reverse] [outDir]');
  process.exit(1);
}

if (feedFrom !== 'left' && feedFrom !== 'right') throw new Error(`feed side must be left or right, got ${feedFrom}`);
if (output !== 'forward' && output !== 'reverse') throw new Error(`output must be forward or reverse, got ${output}`);
const layout = generateRow({ recipe, machines: +machines, designer: +designer, beltTier: +tier, feedFrom, output });
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

const name = `Gen ${recipe.replace(/^Recipe_|_C$/g, '')} x${machines} Mk${tier} ${feedFrom} ${output}`;
const blueprint = layoutToBlueprint(layout, library, name, `Erzeugt von tools/generate-module.ts (${recipe}, ${machines} Maschinen)`);
let header: Uint8Array = new Uint8Array();
const chunks: Uint8Array[] = [];
const { configFileBinary } = Parser.WriteBlueprintFiles(blueprint, (h) => (header = h), (c) => chunks.push(c));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${name}.sbp`), Buffer.concat([header, ...chunks]));
writeFileSync(join(outDir, `${name}.sbpcfg`), new Uint8Array(configFileBinary));
console.log(`wrote ${join(outDir, name)}.sbp/.sbpcfg: ${layout.parts.length} buildings, ${layout.belts.length} belts`);
