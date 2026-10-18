// Dump a blueprint as JSON for inspection.
// Usage: npm run -s poc:dump -- <path/to/Name.sbp> > out.json

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Parser } from '@etothepii/satisfactory-file-parser';

const sbpPath = process.argv[2];
const toArrayBuffer = (buf: Buffer) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const blueprint = Parser.ParseBlueprintFiles(
  basename(sbpPath, '.sbp'),
  toArrayBuffer(readFileSync(sbpPath)),
  toArrayBuffer(readFileSync(sbpPath + 'cfg')),
);
console.log(Parser.JSONStringifyModified(blueprint, 1));
