// Checks a layout against the placement rules in docs/geometry.md.
// Returns a list of problems; empty means the layout should build without warnings.

import { overlaps, portPosition, worldBoxes, type Vec3 } from './geometry';
import { beltLength, halfSize, type Belt, type Layout } from './layout';

const MIN_BELT = 2;
const BELT_HALF_WIDTH = 1;
const BELT_HEIGHT = 2;
const EPS = 1e-6;

const near = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-3;

/** Volume a straight belt occupies: 2 m wide, 2 m high from its centerline down to its supports. */
function beltBox(b: Belt) {
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

export function validate(layout: Layout): string[] {
  const problems: string[] = [];
  const half = halfSize(layout);
  const parts = new Map(layout.parts.map((p) => [p.id, p]));
  const boxes = layout.parts.map((p) => ({ part: p, boxes: worldBoxes(p.cls, p.pos, p.yaw) }));

  // Buildings: no overlap of hard or soft boxes, inside the designer.
  for (let i = 0; i < boxes.length; i++) {
    for (const box of boxes[i].boxes) {
      if (box.min.x < -half - EPS || box.max.x > half + EPS || box.min.y < -half - EPS || box.max.y > half + EPS) {
        problems.push(`${boxes[i].part.id} reaches outside the designer`);
      }
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
  }
  return problems;
}
