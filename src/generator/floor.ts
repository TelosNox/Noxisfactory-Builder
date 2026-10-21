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
//     outside in front of the lift row (at most 2 inputs).
// Output on top of the foundation as in row.ts, or with `outputBelow` down
// through a passthrough to a merger line at 1 m: under the output edge of the
// machine if the feed lanes leave room, otherwise outside in front of the lift.
// References: blueprints "Manufaktor Straight" and "Fabrikator Simple"
// (docs/geometry.md, Unterboden).

import { gameData } from '../planner/gameData';
import { buildingGeometry, type Vec3 } from './geometry';
import { LIFT_REACH, PASSTHROUGH, type Belt, type Layout, type Lift, type Part } from './layout';
import { BELT_SPEED, MERGER, SPLITTER, type RowRequest } from './row';

export const FLOORS = [4, 6, 8] as const;
export type Floor = (typeof FLOORS)[number];

export interface FloorRowRequest extends RowRequest {
  floor: Floor;
  /**
   * Output line below the floor too (lift down through a passthrough to a
   * merger line at 1 m) instead of on top of the foundation.
   */
  outputBelow?: boolean;
}

const SPLITTER_HALF = 2;
const STUB = 2;
/** Lane spacing: splitter port 1 m, 2 m to the branch lift, lift 1 m, belt 1 m. */
const LANE_GAP = 5;
/** Foundation thickness; the passthrough sits in its middle. */
const FOUNDATION_THICKNESS = 1;
const LEVEL_1 = 1;
const LEVEL_2 = 3;

const flowYaw = (dir: number) => (dir > 0 ? 0 : 180);

/** Belt levels below a floor: 1, 3, 5 m with the belt top (z + 1) under the foundation. */
export const floorLevels = (floor: number) => Math.floor((floor - FOUNDATION_THICKNESS - 2) / 2) + 1;

export function generateFloorRow(req: FloorRowRequest): Layout {
  const recipe = gameData.recipes[req.recipe];
  if (!recipe) throw new Error(`unknown recipe ${req.recipe}`);
  const cls = recipe.machine;
  const geo = buildingGeometry(cls);
  const ports = geo.connections.filter((c) => c.kind === 'belt');
  const inputs = ports.filter((c) => c.direction !== 'FCD_OUTPUT');
  const outputs = ports.filter((c) => c.direction === 'FCD_OUTPUT');
  if (inputs.length < 1 || outputs.length !== 1) throw new Error(`${cls}: only machines with one belt output are supported`);
  if (inputs.some((p) => p.yaw !== 270 || p.position[1] !== inputs[0].position[1]) || outputs[0].yaw !== 90) {
    throw new Error(`${cls}: unexpected port directions`);
  }
  // Only the inputs the recipe uses get a lane.
  const used = Object.keys(recipe.in).length;
  if (used > inputs.length) throw new Error(`${cls}: recipe needs ${used} inputs`);
  const lanesNeeded = inputs.slice(0, used).sort((a, b) => a.position[0] - b.position[0]);
  const [output] = outputs;

  const levels = floorLevels(req.floor);
  if (levels < 1) throw new Error(`floor ${req.floor} m has no room for belts`);
  if (levels === 1 && used > 2) throw new Error(`${cls}: ${used} inputs need a floor of 6 m or more`);

  // Belt capacity per ingredient and for the product.
  const speed = BELT_SPEED[req.beltTier];
  if (!speed) throw new Error(`unknown belt tier ${req.beltTier}`);
  const perMinute = (amount: number) => (amount * 60) / recipe.durationS;
  const rates = [...Object.values(recipe.in), ...Object.values(recipe.out)].map((a) => perMinute(a) * req.machines);
  if (Math.max(...rates) > speed) throw new Error(`belt Mk${req.beltTier} carries ${speed}/min, row needs ${Math.max(...rates)}/min`);

  const hard = geo.clearance.filter((b) => b.type === 'CT_Default');
  const minX = Math.min(...hard.map((b) => b.min[0]));
  const maxX = Math.max(...hard.map((b) => b.max[0]));
  const maxY = Math.max(...hard.map((b) => b.max[1]));
  const width = maxX - minX;
  if (width < 2 * SPLITTER_HALF) throw new Error(`${cls} is narrower than a splitter`);

  const F = req.floor;
  const passZ = F - FOUNDATION_THICKNESS / 2;
  const portZ = F + output.position[2];
  const liftY = Math.floor(inputs[0].position[1] - LIFT_REACH);
  const feedDir = (req.feedFrom ?? 'left') === 'left' ? 1 : -1;
  const outDir = req.output === 'reverse' ? -feedDir : feedDir;
  // Splitter side ports towards -Y / +Y for the flow direction.
  const towards = (dy: number) => ((dy < 0) === feedDir > 0 ? 'Output3' : 'Output2');
  const machineToMerger = outDir > 0 ? 'Input3' : 'Input2';
  const liftCls = `Build_ConveyorLiftMk${req.beltTier}_C`;
  const beltCls = `Build_ConveyorBeltMk${req.beltTier}_C`;

  // Lanes: [y, branch direction, crosses other lanes].
  const lanes = lanesNeeded.map((_, j) =>
    levels === 1
      ? j === 0
        ? { y: liftY + LANE_GAP - 2, dir: -1, cross: false }
        : { y: liftY - (LANE_GAP - 2), dir: 1, cross: false }
      : { y: liftY + LANE_GAP - 2 + LANE_GAP * j, dir: -1, cross: j > 0 },
  );

  // Output: merger line on the foundation or below the floor.
  const outLiftY = Math.ceil(output.position[1] + LIFT_REACH);
  const inward = outLiftY - (LANE_GAP - 2);
  // Merger and lane splitters are 4 × 4 m: 4 m between their lines is enough.
  const outIn = lanes.every((l) => Math.abs(l.y - inward) >= 2 * SPLITTER_HALF);
  const below = req.outputBelow
    ? { y: outIn ? inward : outLiftY + (LANE_GAP - 2), towardsLift: outIn ? 1 : -1 }
    : undefined;
  const mergerY = below ? below.y : Math.ceil(maxY + SPLITTER_HALF);
  const mergerZ = below ? LEVEL_1 : portZ;
  // Merger side port facing the incoming belt or lift (+Y side is Input2 at yaw 0).
  const mergerSide = (dy: number) => ((dy > 0) === outDir > 0 ? 'Input2' : 'Input3');

  const parts: Part[] = [];
  const belts: Belt[] = [];
  const lifts: Lift[] = [];
  const splitterX: number[][] = lanes.map(() => []);
  const mergerX: number[] = [];
  // Machine origin on the 1 m grid, so the input ports are too.
  const base = Math.round(-(width * req.machines) / 2 - minX);

  for (let i = 0; i < req.machines; i++) {
    const slot = feedDir > 0 ? i : req.machines - 1 - i;
    const pos: Vec3 = { x: base + slot * width, y: 0, z: F };
    parts.push({ id: `M${i}`, cls, pos, yaw: 0, recipe: req.recipe });

    lanesNeeded.forEach((input, j) => {
      const lane = lanes[j];
      const x = pos.x + input.position[0];
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
        yaw: 90, topYaw: 0, bottomPassthrough: pass, topLink: { part: `M${i}`, port: input.name },
      });
    });

    const outX = pos.x + output.position[0];
    mergerX.push(outX);
    parts.push({ id: `J${i}`, cls: MERGER, pos: { x: outX, y: mergerY, z: mergerZ }, yaw: flowYaw(outDir) });
    if (below) {
      // Down from the output port into the passthrough, then down to the merger.
      // Bottom ends face the merger, top ends the machine (-Y, yaw 270).
      const pass = `Q${i}`;
      parts.push({ id: pass, cls: PASSTHROUGH, pos: { x: outX, y: outLiftY, z: passZ }, yaw: 0 });
      lifts.push({
        id: `O${i}a`, cls: liftCls, pos: { x: outX, y: outLiftY, z: passZ }, height: portZ - passZ, down: true,
        yaw: 270, topYaw: 0, topLink: { part: `M${i}`, port: output.name }, bottomPassthrough: pass,
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
        from: { x: outX, y: output.position[1], z: portZ }, to: { x: outX, y: mergerY - 1, z: portZ },
        fromPort: { part: `M${i}`, port: output.name }, toPort: { part: `J${i}`, port: machineToMerger },
      });
    }
  }

  for (let i = 1; i < req.machines; i++) {
    lanes.forEach((lane, j) => {
      belts.push({
        id: `line${j}_${i}`, cls: beltCls,
        from: { x: splitterX[j][i - 1] + feedDir, y: lane.y, z: LEVEL_1 },
        to: { x: splitterX[j][i] - feedDir, y: lane.y, z: LEVEL_1 },
        fromPort: { part: `S${j}_${i - 1}`, port: 'Output1' }, toPort: { part: `S${j}_${i}`, port: 'Input1' },
      });
    });
    const [up, down] = outDir === feedDir ? [i - 1, i] : [i, i - 1];
    belts.push({
      id: `collect${i}`, cls: beltCls,
      from: { x: mergerX[up] + outDir, y: mergerY, z: mergerZ }, to: { x: mergerX[down] - outDir, y: mergerY, z: mergerZ },
      fromPort: { part: `J${up}`, port: 'Output1' }, toPort: { part: `J${down}`, port: 'Input1' },
    });
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
  const outerEnd = { x: entry(mergerX[0], 1 + STUB), y: mergerY, z: mergerZ };
  const portEnd = { x: entry(mergerX[0], 1), y: mergerY, z: mergerZ };
  belts.push(
    outDir === feedDir
      ? { id: 'collect0', cls: beltCls, from: outerEnd, to: portEnd, toPort: { part: 'J0', port: 'Input1' } }
      : { id: 'collect0', cls: beltCls, from: portEnd, to: outerEnd, fromPort: { part: 'J0', port: 'Output1' } },
  );

  // Center across the row on the 1 m grid (row.ts centers along it).
  const ys = [...lanes.map((l) => l.y - SPLITTER_HALF), liftY - 1, mergerY + SPLITTER_HALF, below ? outLiftY + 1 : mergerY];
  const dy = -Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
  const move = (v: Vec3): Vec3 => ({ ...v, y: v.y + dy });
  return {
    designer: req.designer,
    parts: parts.map((p) => ({ ...p, pos: move(p.pos) })),
    belts: belts.map((b) => ({ ...b, from: move(b.from), to: move(b.to) })),
    lifts: lifts.map((l) => ({ ...l, pos: move(l.pos) })),
  };
}
