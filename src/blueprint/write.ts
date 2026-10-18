// Turns a layout into a blueprint object (parser model). Serialization to
// .sbp/.sbpcfg is done by the caller with Parser.WriteBlueprintFiles.

import type { Blueprint, SaveEntity } from '@etothepii/satisfactory-file-parser';
import { gameData } from '../planner/gameData';
import type { Vec3 } from '../generator/geometry';
import { beltLength, type Layout } from '../generator/layout';
import { LEVEL_PREFIX, type SaveObject, type TemplateLibrary } from './templates';

const CM = 100;
const cm = (v: Vec3) => ({ x: v.x * CM, y: v.y * CM, z: v.z * CM });

function yawQuaternion(yaw: number) {
  const r = (yaw * Math.PI) / 360;
  return { x: 0, y: 0, z: Math.sin(r), w: Math.cos(r) };
}

function objectRef(target: SaveObject) {
  return {
    type: 'ObjectProperty',
    name: 'mConnectedComponent',
    propertyTagType: { name: 'ObjectProperty', children: [] },
    value: { levelName: 'Persistent_Level', pathName: target.instanceName },
  };
}

/** Belt cost: one build recipe per started 2 m (docs/blueprint.md). */
const beltSegments = (length: number) => Math.ceil(length / 2 - 1e-6);

export function layoutToBlueprint(layout: Layout, library: TemplateLibrary, name: string, description = ''): Blueprint {
  const source = library.newest;
  if (!source) throw new Error('template library is empty');

  let nextId = 2_000_000_000;
  const objects: SaveObject[] = [];
  const byPart = new Map<string, SaveObject[]>();
  const costs = new Map<string, number>();
  const recipes = new Set<string>();

  const charge = (cls: string, times = 1) => {
    const building = gameData.buildings[cls];
    if (!building) throw new Error(`no build recipe for ${cls}`);
    recipes.add(building.recipe);
    for (const [item, amount] of Object.entries(building.cost)) costs.set(item, (costs.get(item) ?? 0) + amount * times);
  };
  const component = (owner: SaveObject[], port: string) => {
    const found = owner.find((o) => o.instanceName.endsWith(`.${port}`));
    if (!found) throw new Error(`no component ${port} in ${owner[0].instanceName}`);
    return found;
  };
  const connect = (a: SaveObject, b: SaveObject) => {
    (a.properties as Record<string, unknown>).mConnectedComponent = objectRef(b);
    (b.properties as Record<string, unknown>).mConnectedComponent = objectRef(a);
  };

  for (const part of layout.parts) {
    const parts = library.instantiate(part.cls, nextId++);
    (parts[0] as SaveEntity).transform = {
      rotation: yawQuaternion(part.yaw),
      translation: cm(part.pos),
      scale3d: { x: 1, y: 1, z: 1 },
    };
    byPart.set(part.id, parts);
    objects.push(...parts);
    charge(part.cls);
  }

  for (const belt of layout.belts) {
    const parts = library.instantiate(belt.cls, nextId++);
    const entity = parts[0] as SaveEntity;
    entity.transform = { rotation: yawQuaternion(0), translation: cm(belt.from), scale3d: { x: 1, y: 1, z: 1 } };
    // Spline relative to the belt actor; inner tangents half the length, end tangents length 1.
    const length = beltLength(belt) * CM;
    const d = cm({ x: belt.to.x - belt.from.x, y: belt.to.y - belt.from.y, z: belt.to.z - belt.from.z });
    const along = (f: number) => ({ x: (d.x / length) * f, y: (d.y / length) * f, z: (d.z / length) * f });
    const points = (entity.properties.mSplineData as any).values;
    const set = (p: any, location: Vec3, arrive: Vec3, leave: Vec3) => {
      p.properties.Location.value = location;
      p.properties.ArriveTangent.value = arrive;
      p.properties.LeaveTangent.value = leave;
    };
    set(points[0], { x: 0, y: 0, z: 0 }, along(1), along(length / 2));
    set(points[1], d, along(length / 2), along(1));
    points.length = 2;

    if (belt.fromPort) connect(component(parts, 'ConveyorAny0'), component(byPart.get(belt.fromPort.part)!, belt.fromPort.port));
    if (belt.toPort) connect(component(parts, 'ConveyorAny1'), component(byPart.get(belt.toPort.part)!, belt.toPort.port));
    objects.push(...parts);
    charge(belt.cls, beltSegments(beltLength(belt)));
  }

  const itemRef = (item: string) => {
    const path = gameData.itemPaths[item];
    if (!path) throw new Error(`no path for item ${item}`);
    return { levelName: '', pathName: path };
  };

  for (const o of objects) {
    if (!o.instanceName.startsWith(LEVEL_PREFIX)) throw new Error(`unexpected instance name ${o.instanceName}`);
  }

  return {
    name,
    compressionInfo: source.compressionInfo,
    header: {
      ...source.header,
      designerDimension: { x: layout.designer, y: layout.designer, z: layout.designer },
      recipeReferences: [...recipes].map((pathName) => ({ levelName: '', pathName })),
      itemCosts: [...costs].map(([item, amount]) => [itemRef(item), amount] as [ReturnType<typeof itemRef>, number]),
    },
    config: { ...source.config, description },
    objects,
  };
}
