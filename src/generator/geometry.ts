// Building geometry from data/geometry.json (meters, building space) and
// helpers to move it into module space.

import geometryJson from '../../data/geometry.json';

export type Vec3 = { x: number; y: number; z: number };

export interface Box {
  type: 'CT_Default' | 'CT_Soft';
  min: [number, number, number];
  max: [number, number, number];
}

export interface Connection {
  name: string;
  kind: 'belt' | 'pipe' | 'power';
  direction: string | null;
  position: [number, number, number];
  yaw: number;
  pitch: number;
}

export interface BuildingGeometry {
  clearance: Box[];
  connections: Connection[];
}

export const geometry = geometryJson as unknown as Record<string, BuildingGeometry>;

export function buildingGeometry(cls: string): BuildingGeometry {
  const g = geometry[cls];
  if (!g) throw new Error(`no geometry for ${cls}`);
  return g;
}

/** Rotate a point around Z by a multiple of 90°. */
export function rotate(p: Vec3, yaw: number): Vec3 {
  switch (((yaw % 360) + 360) % 360) {
    case 0:
      return { ...p };
    case 90:
      return { x: -p.y, y: p.x, z: p.z };
    case 180:
      return { x: -p.x, y: -p.y, z: p.z };
    case 270:
      return { x: p.y, y: -p.x, z: p.z };
    default:
      throw new Error(`yaw ${yaw} is not a multiple of 90°`);
  }
}

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export interface WorldBox {
  type: Box['type'];
  min: Vec3;
  max: Vec3;
}

/** Clearance boxes of a building placed at `pos` with `yaw`. */
export function worldBoxes(cls: string, pos: Vec3, yaw: number): WorldBox[] {
  return buildingGeometry(cls).clearance.map((b) => {
    const a = add(pos, rotate({ x: b.min[0], y: b.min[1], z: b.min[2] }, yaw));
    const c = add(pos, rotate({ x: b.max[0], y: b.max[1], z: b.max[2] }, yaw));
    return {
      type: b.type,
      min: { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), z: Math.min(a.z, c.z) },
      max: { x: Math.max(a.x, c.x), y: Math.max(a.y, c.y), z: Math.max(a.z, c.z) },
    };
  });
}

/** World position of a named port of a building placed at `pos` with `yaw`. */
export function portPosition(cls: string, port: string, pos: Vec3, yaw: number): Vec3 {
  const c = buildingGeometry(cls).connections.find((x) => x.name === port);
  if (!c) throw new Error(`${cls} has no port ${port}`);
  return add(pos, rotate({ x: c.position[0], y: c.position[1], z: c.position[2] }, yaw));
}

/** Overlap with positive volume; touching faces do not count. */
export function overlaps(a: { min: Vec3; max: Vec3 }, b: { min: Vec3; max: Vec3 }, eps = 1e-6): boolean {
  return (
    a.min.x < b.max.x - eps &&
    b.min.x < a.max.x - eps &&
    a.min.y < b.max.y - eps &&
    b.min.y < a.max.y - eps &&
    a.min.z < b.max.z - eps &&
    b.min.z < a.max.z - eps
  );
}
