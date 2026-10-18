// PoC stage 2: modify an existing blueprint.
//
// Takes "Konstruktor Straight" (constructor between a splitter and a merger)
// and moves the merger 2 m further away from the constructor. The merger's
// stub belt moves with it, the belt from the constructor output to the merger
// is lengthened from 3 m to 5 m.
//
// Usage: npm run poc:modify -- <path/to/Konstruktor Straight.sbp> [outDir]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Parser, SaveEntity } from '@etothepii/satisfactory-file-parser';

const [sbpPath, outDir = 'data/poc'] = process.argv.slice(2);
const toArrayBuffer = (buf: Buffer) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const blueprint = Parser.ParseBlueprintFiles(
  basename(sbpPath, '.sbp'),
  toArrayBuffer(readFileSync(sbpPath)),
  toArrayBuffer(readFileSync(sbpPath + 'cfg')),
);

const entities = blueprint.objects.filter((o): o is SaveEntity => o.type === 'SaveEntity');
const byName = (suffix: string) => {
  const found = entities.find((e) => e.instanceName.endsWith(suffix));
  if (!found) throw new Error(`no entity ${suffix}`);
  return found;
};

const SHIFT = -200; // cm along world X, away from the constructor

const merger = byName('Build_ConveyorAttachmentMerger_C_2146215771');
const stub = byName('Build_ConveyorBeltMk5_C_2146213863');
merger.transform.translation.x += SHIFT;
stub.transform.translation.x += SHIFT;

// Output belt: actor rotated -90° yaw, so local -Y is world -X.
// Spline runs from the constructor output (local 0,0) to the merger input.
// Inner tangents are half the segment length, end tangents have length 1
// (as written by the game).
const outputBelt = byName('Build_ConveyorBeltMk5_C_2146214618');
const points = (outputBelt.properties.mSplineData as any).values;
const length = 300 - SHIFT;
const vec = (y: number) => ({ x: 0, y, z: 0 });
const set = (point: any, location: number, arrive: number, leave: number) => {
  point.properties.Location.value = vec(location);
  point.properties.ArriveTangent.value = vec(arrive);
  point.properties.LeaveTangent.value = vec(leave);
};
set(points[0], 0, -1, -length / 2);
set(points[1], -length, -length / 2, -1);

const outName = 'PoC Konstruktor laengeres Band';
blueprint.name = outName;
blueprint.config.description = 'Erzeugt von tools/poc/modify.ts';
let header: Uint8Array = new Uint8Array();
const chunks: Uint8Array[] = [];
const { configFileBinary } = Parser.WriteBlueprintFiles(blueprint, (h) => (header = h), (c) => chunks.push(c));

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${outName}.sbp`), Buffer.concat([header, ...chunks]));
writeFileSync(join(outDir, `${outName}.sbpcfg`), new Uint8Array(configFileBinary));
console.log(`wrote ${join(outDir, outName)}.sbp/.sbpcfg`);
