// Layout model shared by generator, validation and blueprint writer.
// All coordinates in meters, module space, blueprint center at the origin.

import type { Vec3 } from './geometry';

export interface Part {
  id: string;
  /** Building class, e.g. Build_ConstructorMk1_C. */
  cls: string;
  /** Position of the building origin. */
  pos: Vec3;
  /** Rotation around Z in degrees, multiple of 90. */
  yaw: number;
  /** Production recipe for machines (informational for now). */
  recipe?: string;
}

export interface PortRef {
  part: string;
  port: string;
}

export interface Belt {
  id: string;
  cls: string;
  /** Straight belt from `from` to `to`; items flow in this direction. */
  from: Vec3;
  to: Vec3;
  /** Port at the start (belt end ConveyorAny0) and at the end (ConveyorAny1). Open if missing. */
  fromPort?: PortRef;
  toPort?: PortRef;
}

export interface Layout {
  /** Blueprint Designer size in foundations (4, 5 or 6). */
  designer: number;
  parts: Part[];
  belts: Belt[];
}

export const FOUNDATION = 8;

export const halfSize = (layout: Pick<Layout, 'designer'>) => (layout.designer * FOUNDATION) / 2;

export const beltLength = (b: Belt) => Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y, b.to.z - b.from.z);
