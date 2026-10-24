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
  /** Rotation around the building's X axis before `yaw`, multiple of 90 (e.g. a junction tilted up). */
  roll?: number;
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

/**
 * Conveyor lift. Items flow upward (bottom end ConveyorAny0, top end
 * ConveyorAny1) or, with `down`, downward (top end ConveyorAny0, bottom end
 * ConveyorAny1; saved as mIsReversed). An end snapped to a port (no belt
 * between) sits about 2 m in front of that port.
 */
export interface Lift {
  id: string;
  cls: string;
  /** Bottom end. */
  pos: Vec3;
  height: number;
  /** Items flow from the top end down. */
  down?: boolean;
  /** Direction the bottom end faces, degrees. */
  yaw: number;
  /** Direction of the top end relative to `yaw`. */
  topYaw: number;
  /** Port the bottom or top end is snapped to directly. */
  bottomLink?: PortRef;
  topLink?: PortRef;
  /** Foundation passthrough (part id) the bottom or top end sits in. */
  bottomPassthrough?: string;
  topPassthrough?: string;
}

/**
 * Pipe from `from` to `to`. Pipes have no direction. If the ends differ in
 * height, the pipe runs 1 m straight at each end and bends in between.
 * From a floor passthrough (`fromPassthrough`) it leaves vertically: straight
 * down, or up 1 m, a bend to horizontal and straight into `to` (reference
 * "Raffinerie Simple").
 */
export interface Pipe {
  id: string;
  cls: string;
  from: Vec3;
  to: Vec3;
  fromPort?: PortRef;
  toPort?: PortRef;
  /** Pipe passthrough (part id) the `from` end sits in. */
  fromPassthrough?: string;
}

/** Power line between two power connections (machine or pole). */
export interface Wire {
  id: string;
  from: PortRef;
  to: PortRef;
}

export interface Layout {
  /** Blueprint Designer size in foundations (4, 5 or 6). */
  designer: number;
  parts: Part[];
  belts: Belt[];
  lifts?: Lift[];
  pipes?: Pipe[];
  wires?: Wire[];
}

export const PASSTHROUGH = 'Build_FoundationPassthrough_Lift_C';
export const LIFT_REACH = 2;

/** Connection name of the bottom and top end. */
export const liftPorts = (l: Lift) =>
  l.down ? { bottom: 'ConveyorAny1', top: 'ConveyorAny0' } : { bottom: 'ConveyorAny0', top: 'ConveyorAny1' };

export const liftEnd = (l: Lift, port: string): Vec3 =>
  port === liftPorts(l).top ? { ...l.pos, z: l.pos.z + l.height } : l.pos;

export const PIPE_PASSTHROUGH = 'Build_FoundationPassthrough_Pipe_C';
/** Pipe ends sit 0.25 m above and below the passthrough center. */
export const PIPE_PASSTHROUGH_END = 0.25;

/** Corner points of a pipe, for clearance and previews. */
export function pipePath(p: Pipe): Vec3[] {
  const flat = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y);
  if (Math.abs(p.to.z - p.from.z) < 1e-6 || flat < 1e-6) return [p.from, p.to];
  const along = (f: number, z: number) => ({
    x: p.from.x + ((p.to.x - p.from.x) / flat) * f,
    y: p.from.y + ((p.to.y - p.from.y) / flat) * f,
    z,
  });
  if (p.fromPassthrough) return [p.from, { ...p.from, z: p.to.z }, p.to];
  return [p.from, along(1, p.from.z), along(flat - 1, p.to.z), p.to];
}

export const FOUNDATION = 8;

export const halfSize = (layout: Pick<Layout, 'designer'>) => (layout.designer * FOUNDATION) / 2;

export const beltLength = (b: Belt) => Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y, b.to.z - b.from.z);
