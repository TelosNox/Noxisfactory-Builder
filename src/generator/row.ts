// Simple module: one row of identical machines with one belt input and one
// belt output each (e.g. Constructor, Smelter).
//
//   input line  ──▶ S ──▶ S ──▶ S        splitters in front of the input ports
//                   │     │     │
//                   M     M     M        machines, boxes touching side by side
//                   │     │     │
//   output line     M ──▶ M ──▶ M ──▶    mergers behind the output ports
//
// Machines stand in a row along X with their input side at -Y. "Left" and
// "right" are seen from the input side, looking at the machines (+Y): left is
// -X. The feed enters from the chosen side and runs along the row; the output
// line runs the same way, or back ('reverse') so products leave next to the
// feed entry. The row is extended at the end of the feed: belt stubs sit on the
// feed entry side, so the game auto-connects copies added at the other end.
// Everything stands on the floor (z = 0); belts run at port height.
// Rules: docs/geometry.md.

import { gameData } from '../planner/gameData';
import { buildingGeometry, type Vec3 } from './geometry';
import type { Belt, Layout, Part } from './layout';

export const SPLITTER = 'Build_ConveyorAttachmentSplitter_C';
export const MERGER = 'Build_ConveyorAttachmentMerger_C';

/** Belt speed in items/min per tier. */
export const BELT_SPEED: Record<number, number> = { 1: 60, 2: 120, 3: 270, 4: 480, 5: 780, 6: 1200 };

/** Half width of the splitter/merger footprint (soft box 4 × 4 m). */
const SPLITTER_HALF = 2;
/** Auto-connect stub length (minimum belt length). */
const STUB = 2;

export interface RowRequest {
  recipe: string;
  machines: number;
  /** Blueprint Designer size in foundations: 4 (Mk1), 5 (Mk2), 6 (Mk3). */
  designer: number;
  /** Belt tier 1–6. */
  beltTier: number;
  /** Side the feed enters from, seen from the input side. Default 'left'. */
  feedFrom?: 'left' | 'right';
  /**
   * Flow of the output line. 'forward' (default): along the feed, products
   * leave at the far end. 'reverse': back towards the start of the feed, so
   * products leave where the raw materials arrive.
   */
  output?: 'reverse' | 'forward';
}

/**
 * Splitter and merger ports by world direction for yaw 0 and 180.
 * Splitter: Input1 -X, Output1 +X, Output2 +Y, Output3 -Y (yaw 0).
 * Merger:   Input1 -X, Output1 +X, Input2 +Y, Input3 -Y (yaw 0).
 * Turned by 180° the X and Y sides swap.
 */
const flowYaw = (dir: number) => (dir > 0 ? 0 : 180);

export function generateRow(req: RowRequest): Layout {
  const recipe = gameData.recipes[req.recipe];
  if (!recipe) throw new Error(`unknown recipe ${req.recipe}`);
  const cls = recipe.machine;
  const geo = buildingGeometry(cls);

  const belts = geo.connections.filter((c) => c.kind === 'belt');
  const inputs = belts.filter((c) => c.direction !== 'FCD_OUTPUT');
  const outputs = belts.filter((c) => c.direction === 'FCD_OUTPUT');
  if (inputs.length !== 1 || outputs.length !== 1) {
    throw new Error(`${cls}: only machines with one belt input and one belt output are supported`);
  }
  const [input] = inputs;
  const [output] = outputs;
  if (input.yaw !== 270 || output.yaw !== 90) throw new Error(`${cls}: unexpected port directions`);

  // Belt capacity: the line carries the sum of all machines.
  const speed = BELT_SPEED[req.beltTier];
  if (!speed) throw new Error(`unknown belt tier ${req.beltTier}`);
  const perMinute = (amount: number) => (amount * 60) / recipe.durationS;
  const inRate = perMinute(Object.values(recipe.in)[0]) * req.machines;
  const outRate = perMinute(Object.values(recipe.out)[0]) * req.machines;
  // A single machine may need more than the line carries: it then runs
  // clocked down (or undersupplied), see buildPlan.
  if (req.machines > 1 && (inRate > speed || outRate > speed)) {
    throw new Error(`belt Mk${req.beltTier} carries ${speed}/min, row needs ${Math.max(inRate, outRate)}/min`);
  }

  // Footprint of the machine's hard boxes in X and Y.
  const hard = geo.clearance.filter((b) => b.type === 'CT_Default');
  const minX = Math.min(...hard.map((b) => b.min[0]));
  const maxX = Math.max(...hard.map((b) => b.max[0]));
  const minY = Math.min(...hard.map((b) => b.min[1]));
  const maxY = Math.max(...hard.map((b) => b.max[1]));
  const width = maxX - minX;
  if (width < 2 * SPLITTER_HALF) throw new Error(`${cls} is narrower than a splitter`);

  // Flow directions along X: +1 or -1.
  const feedDir = (req.feedFrom ?? 'left') === 'left' ? 1 : -1;
  const outDir = req.output === 'reverse' ? -feedDir : feedDir;
  const splitterToMachine = feedDir > 0 ? 'Output2' : 'Output3';
  const machineToMerger = outDir > 0 ? 'Input3' : 'Input2';

  const rowStart = Math.round(-(width * req.machines) / 2); // 1 m grid
  const beltClass = `Build_ConveyorBeltMk${req.beltTier}_C`;
  const z = input.position[2];
  const splitterY = minY - SPLITTER_HALF;
  const mergerY = maxY + SPLITTER_HALF;

  const parts: Part[] = [];
  const beltList: Belt[] = [];
  const splitterX: number[] = [];
  const mergerX: number[] = [];

  // Machines are numbered along the feed: M0 is next to the feed entry.
  for (let i = 0; i < req.machines; i++) {
    const slot = feedDir > 0 ? i : req.machines - 1 - i;
    const pos: Vec3 = { x: rowStart + slot * width - minX, y: 0, z: 0 };
    const inX = pos.x + input.position[0];
    const outX = pos.x + output.position[0];
    splitterX.push(inX);
    mergerX.push(outX);
    parts.push({ id: `M${i}`, cls, pos, yaw: 0, recipe: req.recipe });
    parts.push({ id: `S${i}`, cls: SPLITTER, pos: { x: inX, y: splitterY, z }, yaw: flowYaw(feedDir) });
    parts.push({ id: `J${i}`, cls: MERGER, pos: { x: outX, y: mergerY, z }, yaw: flowYaw(outDir) });

    beltList.push({
      id: `in${i}`,
      cls: beltClass,
      from: { x: inX, y: splitterY + 1, z },
      to: { x: inX, y: input.position[1], z },
      fromPort: { part: `S${i}`, port: splitterToMachine },
      toPort: { part: `M${i}`, port: input.name },
    });
    beltList.push({
      id: `out${i}`,
      cls: beltClass,
      from: { x: outX, y: output.position[1], z },
      to: { x: outX, y: mergerY - 1, z },
      fromPort: { part: `M${i}`, port: output.name },
      toPort: { part: `J${i}`, port: machineToMerger },
    });
  }

  // Lines between neighbors. Output1 sits on the downstream side, Input1 upstream.
  for (let i = 1; i < req.machines; i++) {
    beltList.push({
      id: `line${i}`,
      cls: beltClass,
      from: { x: splitterX[i - 1] + feedDir, y: splitterY, z },
      to: { x: splitterX[i] - feedDir, y: splitterY, z },
      fromPort: { part: `S${i - 1}`, port: 'Output1' },
      toPort: { part: `S${i}`, port: 'Input1' },
    });
    const [up, down] = outDir === feedDir ? [i - 1, i] : [i, i - 1];
    beltList.push({
      id: `collect${i}`,
      cls: beltClass,
      from: { x: mergerX[up] + outDir, y: mergerY, z },
      to: { x: mergerX[down] - outDir, y: mergerY, z },
      fromPort: { part: `J${up}`, port: 'Output1' },
      toPort: { part: `J${down}`, port: 'Input1' },
    });
  }

  // Auto-connect stubs on the feed entry side. Auto-connect starts from the open
  // belt ends of the blueprint being placed and looks for matching open ports in
  // the existing one; the far ends of both lines stay open ports.
  //   feed:            stub ends open, flows into S0.Input1
  //   output forward:  stub ends open, flows into J0.Input1
  //   output reverse:  stub starts at J0.Output1 and ends open; products of the
  //                    first module leave here, next to the feed entry
  const entry = (x: number, length: number) => x - feedDir * length;
  beltList.push({
    id: 'feed',
    cls: beltClass,
    from: { x: entry(splitterX[0], 1 + STUB), y: splitterY, z },
    to: { x: entry(splitterX[0], 1), y: splitterY, z },
    toPort: { part: 'S0', port: 'Input1' },
  });
  const outerEnd = { x: entry(mergerX[0], 1 + STUB), y: mergerY, z };
  const portEnd = { x: entry(mergerX[0], 1), y: mergerY, z };
  beltList.push(
    outDir === feedDir
      ? { id: 'collect0', cls: beltClass, from: outerEnd, to: portEnd, toPort: { part: 'J0', port: 'Input1' } }
      : { id: 'collect0', cls: beltClass, from: portEnd, to: outerEnd, fromPort: { part: 'J0', port: 'Output1' } },
  );

  return { designer: req.designer, parts, belts: beltList };
}
