// Power for a layout (docs/geometry.md, Strom).
//
//   poles: one pole per group of machines, on the floor next to the group's
//          power connections. A pole feeds at most half of its connections
//          (rounded up: Mk1 2, Mk2 4, Mk3 5); the rest stay free for the
//          supply line and links between poles. Poles of a layout are chained.
//   daisy: no poles, each machine is wired to the next (needs the research
//          "Verbesserte Stromanschlüsse"). The player wires the first machine.
// Wires to and between blueprints are left to the player.

import { buildingGeometry, overlaps, portPosition, worldBoxes, type Vec3 } from './geometry';
import { halfSize, type Layout, type Part, type Wire } from './layout';
import { beltBox, liftBox } from './validate';

export type PowerMode = 'poles' | 'daisy';

export interface PowerOptions {
  mode: PowerMode;
  /** Pole tier 1–3 (mode 'poles'). */
  poleTier?: number;
}

/** Connections per pole tier (mMaxNumConnectionLinks, FModel export). */
export const POLE_LINKS: Record<number, number> = { 1: 4, 2: 7, 3: 10 };
export const poleClass = (tier: number) => `Build_PowerPoleMk${tier}_C`;
/** Machines one pole feeds without daisy chain. */
export const machinesPerPole = (tier: number) => Math.ceil(POLE_LINKS[tier] / 2);

const powerPort = (cls: string) => buildingGeometry(cls).connections.find((c) => c.kind === 'power');

export function addPower(layout: Layout, opt: PowerOptions): Layout {
  const machines = layout.parts.filter((p) => powerPort(p.cls));
  const port = (p: Part) => ({ part: p.id, port: powerPort(p.cls)!.name });
  const wires: Wire[] = [];

  if (opt.mode === 'daisy') {
    for (let i = 1; i < machines.length; i++) {
      wires.push({ id: `W${i}`, from: port(machines[i - 1]), to: port(machines[i]) });
    }
    return { ...layout, wires };
  }

  const tier = opt.poleTier ?? 1;
  if (!POLE_LINKS[tier]) throw new Error(`unknown pole tier ${tier}`);
  const cls = poleClass(tier);
  const size = machinesPerPole(tier);
  const parts = [...layout.parts];
  let previous: Part | undefined;
  for (let g = 0; g * size < machines.length; g++) {
    const group = machines.slice(g * size, (g + 1) * size);
    const pole: Part = { id: `E${g}`, cls, pos: placePole(cls, group, { ...layout, parts }), yaw: 0 };
    parts.push(pole);
    for (const m of group) wires.push({ id: `W${g}_${m.id}`, from: port(pole), to: port(m) });
    if (previous) wires.push({ id: `W${g}`, from: port(previous), to: port(pole) });
    previous = pole;
  }
  return { ...layout, parts, wires };
}

/** Does the segment a–b pass through the box (slab test)? */
function crosses(a: Vec3, b: Vec3, box: { min: Vec3; max: Vec3 }): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) {
      if (a[k] <= box.min[k] || a[k] >= box.max[k]) return false;
      continue;
    }
    let lo = (box.min[k] - a[k]) / d;
    let hi = (box.max[k] - a[k]) / d;
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(t0, lo);
    t1 = Math.min(t1, hi);
    if (t0 >= t1) return false;
  }
  return true;
}

/**
 * Free spot on the 1 m grid on the level the machines stand on (ground or
 * logistics floor). Wires must not run through machines: that puts the pole on
 * the side of the power connections (Smelter: output side, Constructor: input
 * side). The pole stays within the length of the machine row so copies can be
 * placed end to end. Among clean spots the one closest to the first machine's
 * connection wins, i.e. at the start of the feed.
 */
function placePole(cls: string, group: Part[], layout: Layout): Vec3 {
  const ports = group.map((m) => portPosition(m.cls, powerPort(m.cls)!.name, m.pos, m.yaw));
  const z = Math.min(...group.map((m) => m.pos.z));
  const head = buildingGeometry(cls).connections.find((c) => c.kind === 'power')!.position[2];
  const half = halfSize(layout);
  const blocked = [
    ...layout.parts.flatMap((p) => worldBoxes(p.cls, p.pos, p.yaw)),
    ...layout.belts.map(beltBox),
    ...(layout.lifts ?? []).map(liftBox),
  ];
  // Machine bodies, shrunk a little so a wire may end on the surface of its own machine.
  const bodies = layout.parts
    .filter((p) => powerPort(p.cls))
    .flatMap((p) => worldBoxes(p.cls, p.pos, p.yaw).filter((b) => b.type === 'CT_Default'))
    .map((b) => ({
      min: { x: b.min.x + 0.3, y: b.min.y + 0.3, z: b.min.z + 0.3 },
      max: { x: b.max.x - 0.3, y: b.max.y - 0.3, z: b.max.z - 0.3 },
    }));
  // Stay within the length of the machine row: copies are placed end to end
  // along the row (X), a pole beyond its ends would push them apart.
  const rowMin = Math.max(-half + 1, Math.min(...bodies.map((b) => b.min.x)));
  const rowMax = Math.min(half - 1, Math.max(...bodies.map((b) => b.max.x)));
  let best: { pos: Vec3; score: number } | undefined;
  for (let x = Math.ceil(rowMin); x <= Math.floor(rowMax); x++) {
    for (let y = Math.ceil(-half + 1); y <= half - 1; y++) {
      const pos = { x, y, z };
      if (worldBoxes(cls, pos, 0).some((b) => blocked.some((o) => overlaps(b, o)))) continue;
      const top = { x, y, z: z + head };
      const through = ports.filter((p) => bodies.some((b) => crosses(top, p, b))).length;
      const score = through * 1000 + Math.hypot(x - ports[0].x, y - ports[0].y);
      if (!best || score < best.score) best = { pos, score };
    }
  }
  if (!best) throw new Error('no free spot for a power pole');
  return best.pos;
}
