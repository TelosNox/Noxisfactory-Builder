// PoC stage 3: build a blueprint from scratch.
//
// Object templates (constructor, belt with their components) are cloned from
// an existing blueprint; layout, names, connections, header and config are
// generated. Result: a constructor at the origin with a 4 m input belt and a
// 4 m output belt, both ending open at the far end.
//
// Usage: npm run poc:generate -- <path/to/Konstruktor Straight.sbp> [outDir]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Blueprint, Parser, SaveComponent, SaveEntity } from '@etothepii/satisfactory-file-parser';

type SaveObject = SaveEntity | SaveComponent;
type Vec = { x: number; y: number; z: number };

const [templatePath, outDir = 'data/poc'] = process.argv.slice(2);
const toArrayBuffer = (buf: Buffer) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const source = Parser.ParseBlueprintFiles(
  basename(templatePath, '.sbp'),
  toArrayBuffer(readFileSync(templatePath)),
  toArrayBuffer(readFileSync(templatePath + 'cfg')),
);

// --- templates -------------------------------------------------------------

const LEVEL = 'Persistent_Level:PersistentLevel.';

/** Entity of the given class plus its components, as JSON for cloning. */
function template(classSuffix: string): { name: string; json: string } {
  const entity = source.objects.find(
    (o) => o.type === 'SaveEntity' && o.typePath.endsWith(classSuffix),
  ) as SaveEntity | undefined;
  if (!entity) throw new Error(`no template for ${classSuffix}`);
  const parts = source.objects.filter(
    (o) => o === entity || (o.type === 'SaveComponent' && o.parentEntityName === entity.instanceName),
  );
  return { name: entity.instanceName.slice(LEVEL.length), json: JSON.stringify(parts) };
}

let nextId = 2_000_000_000;

/** Clone a template under a fresh instance name; connections are cleared. */
function instantiate(t: { name: string; json: string }): SaveObject[] {
  const name = t.name.replace(/_\d+$/, `_${nextId++}`);
  const objects: SaveObject[] = JSON.parse(t.json.split(t.name).join(name));
  for (const o of objects) delete (o.properties as Record<string, unknown>).mConnectedComponent;
  return objects;
}

const entityOf = (objects: SaveObject[]) => objects[0] as SaveEntity;
const component = (objects: SaveObject[], name: string) => {
  const found = objects.find((o) => o.instanceName.endsWith(`.${name}`));
  if (!found) throw new Error(`no component ${name}`);
  return found;
};

function connect(a: SaveObject, b: SaveObject) {
  const ref = (target: SaveObject) => ({
    type: 'ObjectProperty',
    name: 'mConnectedComponent',
    propertyTagType: { name: 'ObjectProperty', children: [] },
    value: { levelName: 'Persistent_Level', pathName: target.instanceName },
  });
  (a.properties as Record<string, unknown>).mConnectedComponent = ref(b);
  (b.properties as Record<string, unknown>).mConnectedComponent = ref(a);
}

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

function place(objects: SaveObject[], translation: Vec, rotation = IDENTITY) {
  entityOf(objects).transform = { rotation, translation, scale3d: { x: 1, y: 1, z: 1 } };
}

/** Straight belt from `from` to `to` (world cm), items flow from → to. */
function belt(t: { name: string; json: string }, from: Vec, to: Vec): SaveObject[] {
  const objects = instantiate(t);
  place(objects, from);
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const length = Math.hypot(d.x, d.y, d.z);
  const scaled = (f: number) => ({ x: (d.x / length) * f, y: (d.y / length) * f, z: (d.z / length) * f });
  const points = (entityOf(objects).properties.mSplineData as any).values;
  const set = (p: any, location: Vec, arrive: Vec, leave: Vec) => {
    p.properties.Location.value = location;
    p.properties.ArriveTangent.value = arrive;
    p.properties.LeaveTangent.value = leave;
  };
  set(points[0], { x: 0, y: 0, z: 0 }, scaled(1), scaled(length / 2));
  set(points[1], d, scaled(length / 2), scaled(1));
  points.length = 2;
  return objects;
}

// --- layout ----------------------------------------------------------------

const constructorT = template('Build_ConstructorMk1_C');
const beltT = template('Build_ConveyorBeltMk5_C');

// Constructor unrotated: Input0 at (0, -300, 100) facing -Y, Output0 at (0, 300, 100).
const constructor = instantiate(constructorT);
place(constructor, { x: 0, y: 0, z: 0 });
const input = belt(beltT, { x: 0, y: -700, z: 100 }, { x: 0, y: -300, z: 100 });
const output = belt(beltT, { x: 0, y: 300, z: 100 }, { x: 0, y: 700, z: 100 });
connect(component(input, 'ConveyorAny1'), component(constructor, 'Input0'));
connect(component(constructor, 'Output0'), component(output, 'ConveyorAny0'));

// --- header and config -----------------------------------------------------

const ref = (pathName: string) => ({ levelName: '', pathName });
const item = (name: string) => ref(`/Game/FactoryGame/Resource/Parts/${name}/Desc_${name}.Desc_${name}_C`);

const blueprint: Blueprint = {
  name: 'PoC Generiert Konstruktor',
  compressionInfo: source.compressionInfo,
  header: {
    ...source.header,
    designerDimension: { x: 4, y: 4, z: 4 },
    recipeReferences: [
      ref('/Game/FactoryGame/Recipes/Buildings/Recipe_ConstructorMk1.Recipe_ConstructorMk1_C'),
      ref('/Game/FactoryGame/Recipes/Buildings/Recipe_ConveyorBeltMk5.Recipe_ConveyorBeltMk5_C'),
    ],
    // Constructor: 2 reinforced plates, 8 cable. Belt Mk5: 1 aluminum plate per
    // started 2 m (derived from the template's costs), 2 belts x 4 m.
    itemCosts: [
      [item('IronPlateReinforced'), 2],
      [item('Cable'), 8],
      [item('AluminumPlate'), 4],
    ],
  },
  config: { ...source.config, description: 'Erzeugt von tools/poc/generate.ts' },
  objects: [...constructor, ...input, ...output],
};

let header: Uint8Array = new Uint8Array();
const chunks: Uint8Array[] = [];
const { configFileBinary } = Parser.WriteBlueprintFiles(blueprint, (h) => (header = h), (c) => chunks.push(c));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${blueprint.name}.sbp`), Buffer.concat([header, ...chunks]));
writeFileSync(join(outDir, `${blueprint.name}.sbpcfg`), new Uint8Array(configFileBinary));
console.log(`wrote ${join(outDir, blueprint.name)}.sbp/.sbpcfg with ${blueprint.objects.length} objects`);
