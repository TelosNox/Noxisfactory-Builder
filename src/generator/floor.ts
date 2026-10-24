// Row module on a logistics floor: machines stand on a foundation level at
// height `floor` (4, 6 or 8 m), the feed lines run underneath.
//
// Side view across the row (input side left), floor 6 m:
//
//     lift ─┐ M M M M        machine on the foundation (top at 6 m)
//   ════════╪═══════════     foundation with lift passthrough (5–6 m)
//     lift  │ ┌──── 3 m      cross pieces from the branch lift to the passthrough
//           │ │
//     ──────┴─┴──── 1 m      feed lanes along the row, one per input
//
// One lane per input, side by side (never stacked: other products of the
// factory must be able to cross the floor). Each lane has its splitter right
// below its input; the splitters form a staircase. The branch goes towards the
// input side into a lift, through the passthrough and up to the input port.
//   - The lane next to the lift row goes straight up.
//   - Lanes further in go up to 3 m first and cross the others there.
//   - With a 4 m floor there is only one belt level: one lane inside, one
//     outside in front of the lift row (at most 2 belt inputs).
// Output below the floor like the feed: down through a passthrough to a merger
// line at 1 m, under the output edge of the machine if the feed lanes leave
// room, otherwise outside in front of the lift. With `outputOnTop` the merger
// line runs on the foundation as in row.ts.
//
// Pipes (Refinery, Packager, Blender): one pipe lane per fluid at 1.75 m,
// outside the belt lanes, 4 m or more in front of the ports. A T junction
// tilted up sits on the lane below a pipe passthrough; a vertical pipe goes up
// into the passthrough, above the floor the pipe rises 1 m, bends and runs
// into the port (reference "Raffinerie Simple", Bananendödels). 4 m instead of
// the reference's 3 m keeps the lane clear of the lift row.
// References: blueprints "Manufaktor Straight", "Fabrikator Simple" and
// "Raffinerie Simple" (docs/geometry.md, Unterboden).

import { gameData } from '../planner/gameData';
import { buildingGeometry, rotate, type Connection, type Vec3 } from './geometry';
import { LIFT_REACH, PASSTHROUGH, PIPE_PASSTHROUGH, PIPE_PASSTHROUGH_END, type Belt, type Layout, type Lift, type Part, type Pipe } from './layout';
import { BELT_SPEED, MERGER, SPLITTER, type RowRequest } from './row';
import { isFluid, JUNCTION, PIPE_SPEED, PIPE_Z, pipeClass } from './fluidRow';

export const FLOORS = [4, 6, 8] as const;
export type Floor = (typeof FLOORS)[number];

export interface FloorRowRequest extends RowRequest {
  floor: Floor;
  /** Output line on top of the foundation instead of below the floor like the feed. */
  outputOnTop?: boolean;
  /** Pipe tier 1–2 for machines with pipes. */
  pipeTier?: number;
}

const SPLITTER_HALF = 2;
const STUB = 2;
/** Lane spacing: splitter port 1 m, 2 m to the branch lift, lift 1 m, belt 1 m. */
const LANE_GAP = 5;
/** Foundation thickness; the passthrough sits in its middle. */
const FOUNDATION_THICKNESS = 1;
const LEVEL_1 = 1;
const LEVEL_2 = 3;
/** Pipe lanes below the floor (junction center, reference). */
const PIPE_LEVEL = 1.75;
/** Pipe passthrough in front of the port, and between pipe lanes. */
const PIPE_REACH = 4;
const PIPE_LANE_GAP = 2;
/** Junction tilted so that its branch (Connection2) points up. */
const UP = 270;

const flowYaw = (dir: number) => (dir > 0 ? 0 : 180);

/** Belt levels below a floor: 1, 3, 5 m with the belt top (z + 1) under the foundation. */
export const floorLevels = (floor: number) => Math.floor((floor - FOUNDATION_THICKNESS - 2) / 2) + 1;

export function generateFloorRow(req: FloorRowRequest): Layout {
  const recipe = gameData.recipes[req.recipe];
  if (!recipe) throw new Error(`unknown recipe ${req.recipe}`);
  const cls = recipe.machine;
  const geo = buildingGeometry(cls);
  const output = (c: Connection) => /OUTPUT|PRODUCER/.test(c.direction ?? '');
  const of = (kind: string, out: boolean) => geo.connections.filter((c) => c.kind === kind && output(c) === out);
  const solid = (r: Record<string, number>) => Object.keys(r).filter((i) => !isFluid(i)).length;
  const fluid = (r: Record<string, number>) => Object.keys(r).filter((i) => isFluid(i)).length;
  const need = { beltIn: solid(recipe.in), pipeIn: fluid(recipe.in), beltOut: solid(recipe.out), pipeOut: fluid(recipe.out) };
  const all = { beltIn: of('belt', false), pipeIn: of('pipe', false), beltOut: of('belt', true), pipeOut: of('pipe', true) };
  if (need.beltOut > 1 || need.pipeOut > 1) throw new Error(`${cls}: only one belt and one pipe output are supported`);
  for (const k of Object.keys(need) as (keyof typeof need)[]) {
    if (need[k] > all[k].length) throw new Error(`${cls}: recipe needs ports the machine does not have`);
  }

  // Turn the machine so that its inputs face -Y.
  const inputSide = [...all.beltIn, ...all.pipeIn][0].position[1];
  const yaw = inputSide < 0 ? 0 : 180;
  const at = (c: Connection) => ({ ...rotate({ x: c.position[0], y: c.position[1], z: c.position[2] }, yaw), name: c.name });
  const facing = (c: Connection) => (c.yaw + yaw) % 360;
  if ([...all.beltIn, ...all.pipeIn].some((c) => facing(c) !== 270) || [...all.beltOut, ...all.pipeOut].some((c) => facing(c) !== 90)) {
    throw new Error(`${cls}: unexpected port directions`);
  }
  const beltIns = all.beltIn.slice(0, need.beltIn).map(at).sort((a, b) => a.x - b.x);
  const pipeIns = all.pipeIn.slice(0, need.pipeIn).map(at).sort((a, b) => a.x - b.x);
  const beltOut = need.beltOut ? at(all.beltOut[0]) : undefined;
  const pipeOut = need.pipeOut ? at(all.pipeOut[0]) : undefined;
  if (beltIns.some((p) => p.y !== beltIns[0].y)) throw new Error(`${cls}: belt inputs not in one line`);

  const levels = floorLevels(req.floor);
  if (levels < 1) throw new Error(`floor ${req.floor} m has no room for belts`);
  if (levels === 1 && beltIns.length > 2) throw new Error(`${cls}: ${beltIns.length} inputs need a floor of 6 m or more`);

  // Capacity per line: belt or pipe.
  const speed = BELT_SPEED[req.beltTier];
  if (!speed) throw new Error(`unknown belt tier ${req.beltTier}`);
  const pipeSpeed = PIPE_SPEED[req.pipeTier ?? 1];
  if ((need.pipeIn || need.pipeOut) && !pipeSpeed) throw new Error(`unknown pipe tier ${req.pipeTier}`);
  if (req.machines > 1) {
    for (const [item, amount] of [...Object.entries(recipe.in), ...Object.entries(recipe.out)]) {
      const rate = ((amount * 60) / recipe.durationS) * req.machines;
      const limit = isFluid(item) ? pipeSpeed : speed;
      if (rate > limit) throw new Error(`${isFluid(item) ? `pipe Mk${req.pipeTier ?? 1}` : `belt Mk${req.beltTier}`} carries ${limit}/min, row needs ${rate}/min`);
    }
  }

  const hard = geo.clearance
    .filter((b) => b.type === 'CT_Default')
    .map((b) => {
      const a = rotate({ x: b.min[0], y: b.min[1], z: b.min[2] }, yaw);
      const c = rotate({ x: b.max[0], y: b.max[1], z: b.max[2] }, yaw);
      return { minX: Math.min(a.x, c.x), maxX: Math.max(a.x, c.x), maxY: Math.max(a.y, c.y) };
    });
  const minX = Math.min(...hard.map((b) => b.minX));
  const maxX = Math.max(...hard.map((b) => b.maxX));
  const maxY = Math.max(...hard.map((b) => b.maxY));
  const width = maxX - minX;
  if (width < 2 * SPLITTER_HALF) throw new Error(`${cls} is narrower than a splitter`);

  const F = req.floor;
  const passZ = F - FOUNDATION_THICKNESS / 2;
  const inPortY = Math.min(...[...beltIns, ...pipeIns].map((p) => p.y));
  const liftY = Math.floor((beltIns[0]?.y ?? inPortY) - LIFT_REACH);
  const feedDir = (req.feedFrom ?? 'left') === 'left' ? 1 : -1;
  const outDir = req.output === 'reverse' ? -feedDir : feedDir;
  // Splitter side ports towards -Y / +Y for the flow direction.
  const towards = (dy: number) => ((dy < 0) === feedDir > 0 ? 'Output3' : 'Output2');
  const machineToMerger = outDir > 0 ? 'Input3' : 'Input2';
  const liftCls = `Build_ConveyorLiftMk${req.beltTier}_C`;
  const beltCls = `Build_ConveyorBeltMk${req.beltTier}_C`;
  const pipeCls = pipeClass(req.pipeTier ?? 1);

  // Lanes: [y, branch direction, crosses other lanes].
  const lanes = beltIns.map((_, j) =>
    levels === 1
      ? j === 0
        ? { y: liftY + LANE_GAP - 2, dir: -1, cross: false }
        : { y: liftY - (LANE_GAP - 2), dir: 1, cross: false }
      : { y: liftY + LANE_GAP - 2 + LANE_GAP * j, dir: -1, cross: j > 0 },
  );
  // Pipe lanes outside the lift row and an outside belt lane (splitter 4 × 4 m).
  const outsideBelt = lanes.some((l) => l.dir > 0);
  const pipeLaneY = (k: number) =>
    Math.floor(inPortY) - PIPE_REACH - (outsideBelt ? PIPE_REACH : 0) - PIPE_LANE_GAP * k;

  // Output: merger line on the foundation or below the floor.
  const outPortY = Math.max(...[beltOut, pipeOut].filter((p) => !!p).map((p) => p!.y));
  const outLiftY = Math.ceil((beltOut?.y ?? outPortY) + LIFT_REACH);
  const inward = outLiftY - (LANE_GAP - 2);
  // Merger and lane splitters are 4 × 4 m: 4 m between their lines is enough.
  const outIn = lanes.every((l) => Math.abs(l.y - inward) >= 2 * SPLITTER_HALF);
  const below = !req.outputOnTop
    ? { y: outIn ? inward : outLiftY + (LANE_GAP - 2), towardsLift: outIn ? 1 : -1 }
    : undefined;
  // On the foundation the pipe line shares the track with the merger line (fluidRow.ts).
  const mergerY = below ? below.y : Math.max(Math.ceil(maxY + SPLITTER_HALF), pipeOut ? Math.ceil(outPortY) + LANE_GAP : -Infinity);
  const mergerZ = below ? LEVEL_1 : F + (beltOut?.z ?? 1);
  // Pipe output: below the floor outside the merger, or on the foundation next to the merger line.
  const pipeOutY = below
    ? Math.ceil(outPortY) + PIPE_REACH + (below.towardsLift < 0 ? PIPE_REACH : 0)
    : mergerY;
  // Merger side port facing the incoming belt or lift (+Y side is Input2 at yaw 0).
  const mergerSide = (dy: number) => ((dy > 0) === outDir > 0 ? 'Input2' : 'Input3');
  // Junction ports along the line: Connection0 faces -X, Connection1 +X (yaw 0, also tilted).
  const along = (dir: number) => ({ down: dir > 0 ? 'Connection1' : 'Connection0', up: dir > 0 ? 'Connection0' : 'Connection1' });

  const parts: Part[] = [];
  const belts: Belt[] = [];
  const lifts: Lift[] = [];
  const pipes: Pipe[] = [];
  const splitterX: number[][] = lanes.map(() => []);
  const junctionX: number[][] = pipeIns.map(() => []);
  const mergerX: number[] = [];
  const outJunctionX: number[] = [];
  // Machine origin on the 1 m grid, so the input ports are too.
  const base = Math.round(-(width * req.machines) / 2 - minX);

  for (let i = 0; i < req.machines; i++) {
    const slot = feedDir > 0 ? i : req.machines - 1 - i;
    const pos: Vec3 = { x: base + slot * width, y: 0, z: F };
    const m = `M${i}`;
    parts.push({ id: m, cls, pos, yaw, recipe: req.recipe });
    const world = (p: Vec3) => ({ x: pos.x + p.x, y: p.y, z: F + p.z });

    beltIns.forEach((input, j) => {
      const lane = lanes[j];
      const x = pos.x + input.x;
      const portZ = F + input.z;
      const s = `S${j}_${i}`;
      splitterX[j].push(x);
      parts.push({ id: s, cls: SPLITTER, pos: { x, y: lane.y, z: LEVEL_1 }, yaw: flowYaw(feedDir) });
      const pass = `P${j}_${i}`;
      parts.push({ id: pass, cls: PASSTHROUGH, pos: { x, y: liftY, z: passZ }, yaw: 0 });
      // Bottom of a lift faces where items come from: +Y is yaw 90, -Y is 270.
      const from = lane.dir < 0 ? 90 : 270;
      if (!lane.cross) {
        lifts.push({
          id: `L${j}_${i}a`, cls: liftCls, pos: { x, y: liftY, z: LEVEL_1 }, height: passZ - LEVEL_1,
          yaw: from, topYaw: 0, bottomLink: { part: s, port: towards(lane.dir) }, topPassthrough: pass,
        });
      } else {
        const y = lane.y - 1 - LIFT_REACH;
        lifts.push({
          id: `L${j}_${i}a`, cls: liftCls, pos: { x, y, z: LEVEL_1 }, height: LEVEL_2 - LEVEL_1,
          yaw: 90, topYaw: 180, bottomLink: { part: s, port: towards(-1) },
        });
        belts.push({
          id: `cross${j}_${i}`, cls: beltCls, from: { x, y, z: LEVEL_2 }, to: { x, y: liftY, z: LEVEL_2 },
          fromPort: { part: `L${j}_${i}a`, port: 'ConveyorAny1' }, toPort: { part: `L${j}_${i}b`, port: 'ConveyorAny0' },
        });
        lifts.push({
          id: `L${j}_${i}b`, cls: liftCls, pos: { x, y: liftY, z: LEVEL_2 }, height: passZ - LEVEL_2,
          yaw: 90, topYaw: 0, topPassthrough: pass,
        });
      }
      lifts.push({
        id: `L${j}_${i}c`, cls: liftCls, pos: { x, y: liftY, z: passZ }, height: portZ - passZ,
        yaw: 90, topYaw: 0, bottomPassthrough: pass, topLink: { part: m, port: input.name },
      });
    });

    pipeIns.forEach((input, k) => {
      const port = world(input);
      const y = pipeLaneY(k);
      junctionX[k].push(port.x);
      const t = `T${k}_${i}`;
      const pass = `R${k}_${i}`;
      parts.push({ id: t, cls: JUNCTION, pos: { x: port.x, y, z: PIPE_LEVEL }, yaw: 0, roll: UP });
      parts.push({ id: pass, cls: PIPE_PASSTHROUGH, pos: { x: port.x, y, z: passZ }, yaw: 0 });
      pipes.push(
        { id: `pup${k}_${i}`, cls: pipeCls, from: { x: port.x, y, z: passZ - PIPE_PASSTHROUGH_END }, to: { x: port.x, y, z: PIPE_LEVEL + 1 }, fromPassthrough: pass, toPort: { part: t, port: 'Connection2' } },
        { id: `pin${k}_${i}`, cls: pipeCls, from: { x: port.x, y, z: passZ + PIPE_PASSTHROUGH_END }, to: port, fromPassthrough: pass, toPort: { part: m, port: input.name } },
      );
    });

    if (beltOut) {
      const outX = pos.x + beltOut.x;
      const portZ = F + beltOut.z;
      mergerX.push(outX);
      parts.push({ id: `J${i}`, cls: MERGER, pos: { x: outX, y: mergerY, z: mergerZ }, yaw: flowYaw(outDir) });
      if (below) {
        // Down from the output port into the passthrough, then down to the merger.
        // Bottom ends face the merger, top ends the machine (-Y, yaw 270).
        const pass = `Q${i}`;
        parts.push({ id: pass, cls: PASSTHROUGH, pos: { x: outX, y: outLiftY, z: passZ }, yaw: 0 });
        lifts.push({
          id: `O${i}a`, cls: liftCls, pos: { x: outX, y: outLiftY, z: passZ }, height: portZ - passZ, down: true,
          yaw: 270, topYaw: 0, topLink: { part: m, port: beltOut.name }, bottomPassthrough: pass,
        });
        const bottomYaw = below.towardsLift > 0 ? 270 : 90;
        lifts.push({
          id: `O${i}b`, cls: liftCls, pos: { x: outX, y: outLiftY, z: LEVEL_1 }, height: passZ - LEVEL_1, down: true,
          yaw: bottomYaw, topYaw: (270 - bottomYaw + 360) % 360, topPassthrough: pass,
          bottomLink: { part: `J${i}`, port: mergerSide(below.towardsLift) },
        });
      } else {
        // On the foundation, as in row.ts.
        belts.push({
          id: `out${i}`, cls: beltCls,
          from: { x: outX, y: beltOut.y, z: portZ }, to: { x: outX, y: mergerY - 1, z: portZ },
          fromPort: { part: m, port: beltOut.name }, toPort: { part: `J${i}`, port: machineToMerger },
        });
      }
    }

    if (pipeOut) {
      const port = world(pipeOut);
      outJunctionX.push(port.x);
      const u = `U${i}`;
      if (below) {
        const pass = `V${i}`;
        parts.push({ id: u, cls: JUNCTION, pos: { x: port.x, y: pipeOutY, z: PIPE_LEVEL }, yaw: 0, roll: UP });
        parts.push({ id: pass, cls: PIPE_PASSTHROUGH, pos: { x: port.x, y: pipeOutY, z: passZ }, yaw: 0 });
        pipes.push(
          { id: `pout${i}`, cls: pipeCls, from: { x: port.x, y: pipeOutY, z: passZ + PIPE_PASSTHROUGH_END }, to: port, fromPassthrough: pass, toPort: { part: m, port: pipeOut.name } },
          { id: `pdown${i}`, cls: pipeCls, from: { x: port.x, y: pipeOutY, z: passZ - PIPE_PASSTHROUGH_END }, to: { x: port.x, y: pipeOutY, z: PIPE_LEVEL + 1 }, fromPassthrough: pass, toPort: { part: u, port: 'Connection2' } },
        );
      } else {
        // On the foundation as in fluidRow.ts: junction above the merger line, branch towards the machine.
        parts.push({ id: u, cls: JUNCTION, pos: { x: port.x, y: pipeOutY, z: F + PIPE_Z }, yaw: 0 });
        pipes.push({
          id: `pout${i}`, cls: pipeCls, from: port, to: { x: port.x, y: pipeOutY - 1, z: F + PIPE_Z },
          fromPort: { part: m, port: pipeOut.name }, toPort: { part: u, port: 'Connection2' },
        });
      }
    }
  }

  const pipeOutZ = below ? PIPE_LEVEL : F + PIPE_Z;
  for (let i = 1; i < req.machines; i++) {
    lanes.forEach((lane, j) => {
      belts.push({
        id: `line${j}_${i}`, cls: beltCls,
        from: { x: splitterX[j][i - 1] + feedDir, y: lane.y, z: LEVEL_1 },
        to: { x: splitterX[j][i] - feedDir, y: lane.y, z: LEVEL_1 },
        fromPort: { part: `S${j}_${i - 1}`, port: 'Output1' }, toPort: { part: `S${j}_${i}`, port: 'Input1' },
      });
    });
    pipeIns.forEach((_, k) => {
      const y = pipeLaneY(k);
      pipes.push({
        id: `pline${k}_${i}`, cls: pipeCls,
        from: { x: junctionX[k][i - 1] + feedDir, y, z: PIPE_LEVEL }, to: { x: junctionX[k][i] - feedDir, y, z: PIPE_LEVEL },
        fromPort: { part: `T${k}_${i - 1}`, port: along(feedDir).down }, toPort: { part: `T${k}_${i}`, port: along(feedDir).up },
      });
    });
    const [up, down] = outDir === feedDir ? [i - 1, i] : [i, i - 1];
    if (beltOut) {
      belts.push({
        id: `collect${i}`, cls: beltCls,
        from: { x: mergerX[up] + outDir, y: mergerY, z: mergerZ }, to: { x: mergerX[down] - outDir, y: mergerY, z: mergerZ },
        fromPort: { part: `J${up}`, port: 'Output1' }, toPort: { part: `J${down}`, port: 'Input1' },
      });
    }
    if (pipeOut) {
      pipes.push({
        id: `pcollect${i}`, cls: pipeCls,
        from: { x: outJunctionX[up] + outDir, y: pipeOutY, z: pipeOutZ }, to: { x: outJunctionX[down] - outDir, y: pipeOutY, z: pipeOutZ },
        fromPort: { part: `U${up}`, port: along(outDir).down }, toPort: { part: `U${down}`, port: along(outDir).up },
      });
    }
  }

  // Auto-connect stubs on the feed entry side (row.ts).
  const entry = (x: number, length: number) => x - feedDir * length;
  lanes.forEach((lane, j) => {
    belts.push({
      id: `feed${j}`, cls: beltCls,
      from: { x: entry(splitterX[j][0], 1 + STUB), y: lane.y, z: LEVEL_1 },
      to: { x: entry(splitterX[j][0], 1), y: lane.y, z: LEVEL_1 },
      toPort: { part: `S${j}_0`, port: 'Input1' },
    });
  });
  pipeIns.forEach((_, k) => {
    const y = pipeLaneY(k);
    pipes.push({
      id: `pfeed${k}`, cls: pipeCls,
      from: { x: entry(junctionX[k][0], 1 + STUB), y, z: PIPE_LEVEL }, to: { x: entry(junctionX[k][0], 1), y, z: PIPE_LEVEL },
      toPort: { part: `T${k}_0`, port: along(feedDir).up },
    });
  });
  // Output stubs: forward flows into the first merger, reverse leaves there.
  const stub = <T extends Belt | Pipe>(id: string, x: number, y: number, z: number, cls: string, ref: string, down: string, up: string): T => {
    const outer = { x: entry(x, 1 + STUB), y, z };
    const near = { x: entry(x, 1), y, z };
    return (outDir === feedDir
      ? { id, cls, from: outer, to: near, toPort: { part: ref, port: up } }
      : { id, cls, from: near, to: outer, fromPort: { part: ref, port: down } }) as T;
  };
  if (beltOut) belts.push(stub<Belt>('collect0', mergerX[0], mergerY, mergerZ, beltCls, 'J0', 'Output1', 'Input1'));
  if (pipeOut) pipes.push(stub<Pipe>('pcollect0', outJunctionX[0], pipeOutY, pipeOutZ, pipeCls, 'U0', along(outDir).down, along(outDir).up));

  // Center across the row on the 1 m grid (row.ts centers along it).
  const ys = [
    ...lanes.map((l) => l.y - SPLITTER_HALF),
    ...pipeIns.map((_, k) => pipeLaneY(k) - 1.2),
    liftY - 1,
    mergerY + SPLITTER_HALF,
    below ? outLiftY + 1 : mergerY,
    ...(pipeOut ? [pipeOutY + 1.2] : []),
  ];
  const dy = -Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
  const move = (v: Vec3): Vec3 => ({ ...v, y: v.y + dy });
  return {
    designer: req.designer,
    parts: parts.map((p) => ({ ...p, pos: move(p.pos) })),
    belts: belts.map((b) => ({ ...b, from: move(b.from), to: move(b.to) })),
    lifts: lifts.map((l) => ({ ...l, pos: move(l.pos) })),
    ...(pipes.length ? { pipes: pipes.map((p) => ({ ...p, from: move(p.from), to: move(p.to) })) } : {}),
  };
}
