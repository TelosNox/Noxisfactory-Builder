// PoC stage 1: parse a blueprint and write it back unchanged.
//
// Usage: npm run poc:roundtrip -- <path/to/Name.sbp> [outDir]
// Writes "<Name> RT.sbp/.sbpcfg" to outDir (default data/poc) and compares the
// decompressed bodies of input and output. Copy the result into the game's
// blueprint folder to check that the game loads it.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Parser } from '@etothepii/satisfactory-file-parser';

const [sbpPath, outDir = 'data/poc'] = process.argv.slice(2);
if (!sbpPath?.endsWith('.sbp')) {
  console.error('usage: npm run poc:roundtrip -- <path/to/Name.sbp> [outDir]');
  process.exit(1);
}

const toArrayBuffer = (buf: Buffer) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const name = basename(sbpPath, '.sbp');
let inputBody: ArrayBufferLike | undefined;
const blueprint = Parser.ParseBlueprintFiles(
  name,
  toArrayBuffer(readFileSync(sbpPath)),
  toArrayBuffer(readFileSync(sbpPath + 'cfg')),
  { onDecompressedBlueprintBody: (body) => (inputBody = body) },
);
console.log(`parsed ${blueprint.objects.length} objects, size ${JSON.stringify(blueprint.header.designerDimension)}`);

const outName = `${name} RT`;
blueprint.name = outName;
let header: Uint8Array = new Uint8Array();
const chunks: Uint8Array[] = [];
let outputBody: ArrayBuffer | undefined;
const { configFileBinary } = Parser.WriteBlueprintFiles(
  blueprint,
  (h) => (header = h),
  (c) => chunks.push(c),
  { onMainFileBinaryBeforeCompressing: (body) => (outputBody = body) },
);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${outName}.sbp`), Buffer.concat([header, ...chunks]));
writeFileSync(join(outDir, `${outName}.sbpcfg`), new Uint8Array(configFileBinary));
console.log(`wrote ${join(outDir, outName)}.sbp/.sbpcfg`);

const a = new Uint8Array(inputBody!);
const b = new Uint8Array(outputBody!);
const firstDiff = a.findIndex((v, i) => v !== b[i]);
if (a.length === b.length && firstDiff === -1) {
  console.log('body identical');
} else {
  console.log(`body differs: length ${a.length} -> ${b.length}, first difference at byte ${firstDiff}`);
}
