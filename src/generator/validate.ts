// Checks a layout against the placement rules in docs/geometry.md.
// Returns a list of problems; empty means the layout should build without warnings.

import { buildingGeometry, overlaps, portPosition, worldBoxes, type Vec3 } from './geometry';
import { beltLength, halfSize, LIFT_REACH, liftEnd, liftPorts, type Belt, type Layout, type Lift, type Pipe } from './layout';

const MIN_BELT = 2;
const BELT_HALF_WIDTH = 1;
const BELT_HEIGHT = 2;
const EPS = 1e-6;
const PIPE_HALF_WIDTH = 0.6;

const near = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-3;

/** Volume a straight belt occupies: 2 m wide, 2 m high from its centerline down to its supports. */
export function beltBox(b: Belt) {
  const lo = (k: 'x' | 'y') => Math.min(b.from[k], b.to[k]);
  const hi = (k: 'x' | 'y') => Math.max(b.from[k], b.to[k]);
  const alongX = Math.abs(b.to.x - b.from.x) > Math.abs(b.to.y - b.from.y);
  return {
    min: {
      x: lo('x') - (alongX ? 0 : BELT_HALF_WIDTH),
      y: lo('y') - (alongX ? BELT_HALF_WIDTH : 0),
      z: Math.min(b.from.z, b.to.z) - BELT_HEIGHT / 2,
    },
    max: {
      x: hi('x') + (alongX ? 0 : BELT_HALF_WIDTH),
      y: hi('y') + (alongX ? BELT_HALF_WIDTH : 0),
      z: Math.max(b.from.z, b.to.z) + BELT_HEIGHT / 2,
    },
  };
}

/** Volume of a lift: 2 × 2 m column from 1 m below its bottom end to its top end. */
export function liftBox(l: Lift) {
  return {
    min: { x: l.pos.x - 1, y: l.pos.y - 1, z: l.pos.z - 1 },
    max: { x: l.pos.x + 1, y: l.pos.y + 1, z: l.pos.z + l.height },
  };
}

/**
 * Volume of a pipe, 1.2 m thick. A pipe whose ends differ in height runs 1 m
 * straight at each end and bends in between (generator): three boxes.
 */
export function pipeBoxes(p: Pipe) {
  const r = PIPE_HALF_WIDTH;
  const box = (a: Vec3, b: Vec3) => ({
    min: { x: Math.min(a.x, b.x) - r, y: Math.min(a.y, b.y) - r, z: Math.min(a.z, b.z) - r },
    max: { x: Math.max(a.x, b.x) + r, y: Math.max(a.y, b.y) + r, z: Math.max(a.z, b.z) + r },
  });
  if (Math.abs(p.from.z - p.to.z) < EPS) return [box(p.from, p.to)];
  const length = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y);
  const along = (from: Vec3, f: number, z: number) => ({
    x: from.x + ((p.to.x - p.from.x) / length) * f,
    y: from.y + ((p.to.y - p.from.y) / length) * f,
    z,
  });
  const a = along(p.from, 1, p.from.z);
  const b = along(p.from, length - 1, p.to.z);
  return [box(p.from, a), box(a, b), box(b, p.to)];
}

export function validate(layout: Layout): string[] {
  const problems: string[] = [];
  const half = halfSize(layout);
  const parts = new Map(layout.parts.map((p) => [p.id, p]));
  const lifts = new Map((layout.lifts ?? []).map((l) => [l.id, l]));
  const boxes = layout.parts.map((p) => ({ part: p, boxes: worldBoxes(p.cls, p.pos, p.yaw) }));

  // Buildings: no overlap of hard or soft boxes, inside the designer.
  for (let i = 0; i < boxes.length; i++) {
    for (const box of boxes[i].boxes) {
      if (box.min.x < -half - EPS || box.max.x > half + EPS || box.min.y < -half - EPS || box.max.y > half + EPS) {
        problems.push(`${boxes[i].part.id} reaches outside the designer`);
      }
      if (box.type === 'CT_Default' && box.max.z > 2 * half + EPS) problems.push(`${boxes[i].part.id} is too high for the designer`);
    }
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].boxes.some((a) => boxes[j].boxes.some((b) => overlaps(a, b)))) {
        problems.push(`${boxes[i].part.id} overlaps ${boxes[j].part.id}`);
      }
    }
  }

  for (const belt of layout.belts) {
    if (beltLength(belt) < MIN_BELT - EPS) problems.push(`${belt.id} is shorter than ${MIN_BELT} m`);
    for (const p of [belt.from, belt.to]) {
      if (Math.abs(p.x) > half + EPS || Math.abs(p.y) > half + EPS) problems.push(`${belt.id} ends outside the designer`);
    }
    // Belt ends must sit on the ports they connect to.
    for (const [ref, end] of [
      [belt.fromPort, belt.from],
      [belt.toPort, belt.to],
    ] as const) {
      if (!ref) continue;
      const lift = lifts.get(ref.part);
      if (lift) {
        if (!near(liftEnd(lift, ref.port), end)) problems.push(`${belt.id} does not end at ${ref.part}.${ref.port}`);
        continue;
      }
      const part = parts.get(ref.part);
      if (!part) {
        problems.push(`${belt.id} connects to unknown part ${ref.part}`);
        continue;
      }
      if (!near(portPosition(part.cls, ref.port, part.pos, part.yaw), end)) {
        problems.push(`${belt.id} does not end at ${ref.part}.${ref.port}`);
      }
    }
    // No belt inside a foreign box (connected parts excepted).
    const connected = new Set([belt.fromPort?.part, belt.toPort?.part]);
    const box = beltBox(belt);
    for (const { part, boxes: partBoxes } of boxes) {
      if (!connected.has(part.id) && partBoxes.some((b) => overlaps(b, box))) {
        problems.push(`${belt.id} runs through ${part.id}`);
      }
    }
    for (const lift of lifts.values()) {
      if (!connected.has(lift.id) && overlaps(liftBox(lift), box)) problems.push(`${belt.id} runs through ${lift.id}`);
    }
  }

  // Lifts: inside the designer, clear of foreign buildings and other lift columns,
  // snapped ends 2 m in front of their port.
  const all = [...lifts.values()];
  for (const lift of all) {
    const box = liftBox(lift);
    if (box.min.x < -half - EPS || box.max.x > half + EPS || box.min.y < -half - EPS || box.max.y > half + EPS) {
      problems.push(`${lift.id} reaches outside the designer`);
    }
    const own = new Set([lift.bottomLink?.part, lift.topLink?.part, lift.bottomPassthrough, lift.topPassthrough]);
    for (const { part, boxes: partBoxes } of boxes) {
      if (!own.has(part.id) && partBoxes.some((b) => overlaps(b, box))) problems.push(`${lift.id} overlaps ${part.id}`);
    }
    for (const other of all) {
      const sameColumn = other.pos.x === lift.pos.x && other.pos.y === lift.pos.y;
      if (other.id > lift.id && !sameColumn && overlaps(liftBox(other), box)) problems.push(`${lift.id} overlaps ${other.id}`);
    }
    const ends = liftPorts(lift);
    for (const [link, port] of [
      [lift.bottomLink, ends.bottom],
      [lift.topLink, ends.top],
    ] as const) {
      if (!link) continue;
      const part = parts.get(link.part);
      if (!part) {
        problems.push(`${lift.id} links to unknown part ${link.part}`);
        continue;
      }
      const p = portPosition(part.cls, link.port, part.pos, part.yaw);
      const end = liftEnd(lift, port);
      const reach = Math.hypot(p.x - end.x, p.y - end.y);
      if (Math.abs(p.z - end.z) > EPS || Math.abs(reach - LIFT_REACH) > 0.5) {
        problems.push(`${lift.id} is not snapped to ${link.part}.${link.port}`);
      }
    }
  }

  // Pipes: ends on their ports, inside the designer, not through foreign buildings
  // or belts. Straight pipes between ports must be at least 1 m long.
  for (const pipe of layout.pipes ?? []) {
    for (const p of [pipe.from, pipe.to]) {
      if (Math.abs(p.x) > half + EPS || Math.abs(p.y) > half + EPS) problems.push(`${pipe.id} ends outside the designer`);
    }
    for (const [ref, end] of [
      [pipe.fromPort, pipe.from],
      [pipe.toPort, pipe.to],
    ] as const) {
      if (!ref) continue;
      const part = parts.get(ref.part);
      if (!part) problems.push(`${pipe.id} connects to unknown part ${ref.part}`);
      else if (!near(portPosition(part.cls, ref.port, part.pos, part.yaw), end)) problems.push(`${pipe.id} does not end at ${ref.part}.${ref.port}`);
    }
    const connected = new Set([pipe.fromPort?.part, pipe.toPort?.part]);
    const own = pipeBoxes(pipe);
    for (const { part, boxes: partBoxes } of boxes) {
      if (!connected.has(part.id) && partBoxes.some((b) => own.some((o) => overlaps(b, o)))) problems.push(`${pipe.id} runs through ${part.id}`);
    }
    for (const belt of layout.belts) {
      if (own.some((o) => overlaps(beltBox(belt), o))) problems.push(`${pipe.id} runs through ${belt.id}`);
    }
  }

  // Power lines connect power connections of buildings in the layout.
  for (const wire of layout.wires ?? []) {
    for (const ref of [wire.from, wire.to]) {
      const part = parts.get(ref.part);
      const ok = part && buildingGeometry(part.cls).connections.some((c) => c.kind === 'power' && c.name === ref.port);
      if (!ok) problems.push(`${wire.id} connects to unknown power connection ${ref.part}.${ref.port}`);
    }
  }
  return problems;
}
