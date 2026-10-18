// List which building classes occur in a folder tree of blueprints.
// Skips blueprints containing mod content. For each base game class: number of
// blueprints, newest build version and one example file.
//
// Usage: npm run -s poc:inventory -- <blueprints root>

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Parser } from '@etothepii/satisfactory-file-parser';

const root = process.argv[2];
const toArrayBuffer = (buf: Buffer) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith('.sbp')) yield path;
  }
}

const classes = new Map<string, { count: number; build: number; example: string }>();
const mods = new Set<string>();
const modRoots: string[] = [];
let files = 0;
let failed = 0;
for (const path of walk(root)) {
  files++;
  try {
    const bp = Parser.ParseBlueprintFiles(
      basename(path, '.sbp'),
      toArrayBuffer(readFileSync(path)),
      toArrayBuffer(readFileSync(path + 'cfg')),
    );
    const build = bp.header.buildVersion;
    // Base game content lives under /Game/FactoryGame/ or /Script/; anything else is a mod.
    const isMod = (path: string) => !/^\/(Game\/FactoryGame|Script)\//.test(path);
    const modPaths = [...new Set(bp.objects.map((o) => o.typePath).filter(isMod))];
    if (modPaths.length) {
      mods.add(path.slice(root.length + 1));
      modRoots.push(...modPaths.map((p) => p.split('/').slice(0, 2).join('/')));
      continue; // templates only from blueprints without mod content
    }
    for (const cls of new Set(bp.objects.filter((o) => o.type === 'SaveEntity').map((o) => o.typePath.split('.').pop()!))) {
      const entry = classes.get(cls) ?? { count: 0, build: 0, example: '' };
      entry.count++;
      if (build >= entry.build) Object.assign(entry, { build, example: path.slice(root.length + 1) });
      classes.set(cls, entry);
    }
  } catch (error) {
    failed++;
    console.error(`failed: ${path}: ${String(error).slice(0, 120)}`);
  }
}

console.log(`${files} blueprints, ${failed} failed, ${mods.size} skipped (mod content: ${[...new Set(modRoots)].join(', ')})`);
console.log(`${classes.size} base game classes`);
for (const [cls, e] of [...classes].sort()) console.log(`${cls}\t${e.count}\t${e.build}\t${e.example}`);
