// Turns a layout into a blueprint object (parser model). Serialization to
// .sbp/.sbpcfg is done by the caller with Parser.WriteBlueprintFiles.

import type { Blueprint, SaveEntity } from '@etothepii/satisfactory-file-parser';
import { gameData } from '../planner/gameData';
import type { Vec3 } from '../generator/geometry';
import { beltLength, liftPorts, type Layout } from '../generator/layout';
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
/** Lift cost: one build recipe per started 4 m of height (docs/blueprint.md). */
const liftSegments = (height: number) => Math.ceil(height / 4 - 1e-6);

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

  // Lifts: bottom end ConveyorAny0, top end ConveyorAny1 (docs/geometry.md, Unterboden).
  const ref = (pathName: string) => ({ levelName: pathName ? 'Persistent_Level' : '', pathName });
  const passthroughEnds = new Map<string, { below?: SaveObject; above?: SaveObject }>();
  for (const lift of layout.lifts ?? []) {
    const parts = library.instantiate(lift.cls, nextId++);
    const entity = parts[0] as SaveEntity;
    entity.transform = { rotation: yawQuaternion(lift.yaw), translation: cm(lift.pos), scale3d: { x: 1, y: 1, z: 1 } };
    const props = entity.properties as Record<string, any>;
    const top: Record<string, unknown> = {
      Translation: {
        type: 'StructProperty',
        name: 'Translation',
        propertyTagType: { name: 'StructProperty', children: [{ name: 'Vector', children: [] }] },
        value: { x: 0, y: 0, z: lift.height * CM },
      },
    };
    if (lift.topYaw % 360 !== 0) {
      top.Rotation = {
        type: 'StructProperty',
        name: 'Rotation',
        propertyTagType: { name: 'StructProperty', children: [{ name: 'Quat', children: [] }] },
        value: yawQuaternion(lift.topYaw),
      };
    }
    props.mTopTransform = {
      type: 'StructProperty',
      name: 'mTopTransform',
      propertyTagType: { name: 'StructProperty', children: [{ name: 'Transform', children: [] }] },
      value: { type: 'Transform', properties: top },
    };
    const passName = (id?: string) => (id ? byPart.get(id)![0].instanceName : '');
    props.mSnappedPassthroughs = {
      type: 'ArrayProperty',
      name: 'mSnappedPassthroughs',
      propertyTagType: { name: 'ArrayProperty', children: [{ name: 'ObjectProperty', children: [] }] },
      values: [ref(passName(lift.bottomPassthrough)), ref(passName(lift.topPassthrough))],
    };
    // Downward lifts are saved reversed: input (ConveyorAny0) at the top.
    if (lift.down) {
      props.mIsReversed = { type: 'BoolProperty', name: 'mIsReversed', propertyTagType: { name: 'BoolProperty', children: [] }, value: true };
    } else {
      delete props.mIsReversed;
    }
    const end = liftPorts(lift);
    if (lift.bottomLink) connect(component(parts, end.bottom), component(byPart.get(lift.bottomLink.part)!, lift.bottomLink.port));
    if (lift.topLink) connect(component(parts, end.top), component(byPart.get(lift.topLink.part)!, lift.topLink.port));
    if (lift.topPassthrough) {
      const ends = passthroughEnds.get(lift.topPassthrough) ?? {};
      passthroughEnds.set(lift.topPassthrough, { ...ends, below: component(parts, end.top) });
    }
    if (lift.bottomPassthrough) {
      const ends = passthroughEnds.get(lift.bottomPassthrough) ?? {};
      passthroughEnds.set(lift.bottomPassthrough, { ...ends, above: component(parts, end.bottom) });
    }
    byPart.set(lift.id, parts);
    objects.push(...parts);
    charge(lift.cls, liftSegments(lift.height));
  }
  // Lifts meeting in a passthrough are connected to each other and to the passthrough.
  for (const [id, { below, above }] of passthroughEnds) {
    if (!below || !above) throw new Error(`passthrough ${id} needs a lift below and above`);
    connect(below, above);
    const props = byPart.get(id)![0].properties as Record<string, any>;
    const objectProperty = (name: string, target: SaveObject) => ({
      type: 'ObjectProperty',
      name,
      propertyTagType: { name: 'ObjectProperty', children: [] },
      value: ref(target.instanceName),
    });
    props.mBottomSnappedConnection = objectProperty('mBottomSnappedConnection', below);
    props.mTopSnappedConnection = objectProperty('mTopSnappedConnection', above);
    props.mSnappedBuildingThickness = {
      type: 'FloatProperty',
      name: 'mSnappedBuildingThickness',
      propertyTagType: { name: 'FloatProperty', children: [] },
      value: 100,
    };
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
