// Simple module: one row of identical machines with one belt input and one
// belt output each (e.g. Constructor, Smelter).
//
//   input line  ──▶ S ──▶ S ──▶ S        splitters in front of the input ports
//                   │     │     │
//                   M     M     M        machines, boxes touching side by side
//                   │     │     │
//   output line     M ──▶ M ──▶ M ──▶    mergers behind the output ports
//
// The feed runs along +X. The output line runs along +X too, or back along -X
// ('reverse') so products leave next to the feed entry. The row is extended at
// the end of the feed: belt stubs sit on the -X side (the side of the feed
// entry), so the game auto-connects copies added at +X. Everything stands on the floor (z = 0); belts run at port height.
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

export interface RowRequest {
  recipe: string;
  machines: number;
  /** Blueprint Designer size in foundations: 4 (Mk1), 5 (Mk2), 6 (Mk3). */
  designer: number;
  /** Belt tier 1–6. */
  beltTier: number;
  /**
   * Flow of the output line. 'forward' (default): along the feed, products
   * leave at the far end. 'reverse': back towards the start of the feed, so
   * products leave where the raw materials arrive.
   */
  output?: 'reverse' | 'forward';
}

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
  if (inRate > speed || outRate > speed) {
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

  const reverse = req.output === 'reverse';
  // Merger turned by 180° for a reverse line: Input1 then faces +X, Output1 -X,
  // and Input2 faces the machine.
  const mergerYaw = reverse ? 180 : 0;
  const mergerFromMachine = reverse ? 'Input2' : 'Input3';

  const rowStart = Math.round(-(width * req.machines) / 2); // 1 m grid
  const beltClass = `Build_ConveyorBeltMk${req.beltTier}_C`;
  const z = input.position[2];

  const parts: Part[] = [];
  const beltList: Belt[] = [];
  const splitterY = minY - SPLITTER_HALF;
  const mergerY = maxY + SPLITTER_HALF;

  for (let i = 0; i < req.machines; i++) {
    const pos: Vec3 = { x: rowStart + i * width - minX, y: 0, z: 0 };
    const machine = `M${i}`;
    const splitter = `S${i}`;
    const merger = `J${i}`;
    const inX = pos.x + input.position[0];
    const outX = pos.x + output.position[0];
    parts.push({ id: machine, cls, pos, yaw: 0, recipe: req.recipe });
    parts.push({ id: splitter, cls: SPLITTER, pos: { x: inX, y: splitterY, z }, yaw: 0 });
    parts.push({ id: merger, cls: MERGER, pos: { x: outX, y: mergerY, z }, yaw: mergerYaw });

    // Splitter Output2 (+Y side) to machine input; machine output to the merger's -Y input.
    beltList.push({
      id: `in${i}`,
      cls: beltClass,
      from: { x: inX, y: splitterY + 1, z },
      to: { x: inX, y: input.position[1], z },
      fromPort: { part: splitter, port: 'Output2' },
      toPort: { part: machine, port: input.name },
    });
    beltList.push({
      id: `out${i}`,
      cls: beltClass,
      from: { x: outX, y: output.position[1], z },
      to: { x: outX, y: mergerY - 1, z },
      fromPort: { part: machine, port: output.name },
      toPort: { part: merger, port: mergerFromMachine },
    });

    if (i > 0) {
      const prevIn = parts.find((p) => p.id === `S${i - 1}`)!.pos.x;
      const prevOut = parts.find((p) => p.id === `J${i - 1}`)!.pos.x;
      beltList.push({
        id: `line${i}`,
        cls: beltClass,
        from: { x: prevIn + 1, y: splitterY, z },
        to: { x: inX - 1, y: splitterY, z },
        fromPort: { part: `S${i - 1}`, port: 'Output1' },
        toPort: { part: splitter, port: 'Input1' },
      });
      beltList.push(
        reverse
          ? {
              id: `collect${i}`,
              cls: beltClass,
              from: { x: outX - 1, y: mergerY, z },
              to: { x: prevOut + 1, y: mergerY, z },
              fromPort: { part: merger, port: 'Output1' },
              toPort: { part: `J${i - 1}`, port: 'Input1' },
            }
          : {
              id: `collect${i}`,
              cls: beltClass,
              from: { x: prevOut + 1, y: mergerY, z },
              to: { x: outX - 1, y: mergerY, z },
              fromPort: { part: `J${i - 1}`, port: 'Output1' },
              toPort: { part: merger, port: 'Input1' },
            },
      );
    }
  }

  // Stub belts for the game's auto-connect. Auto-connect starts from the open
  // belt ends of the blueprint being placed and looks for matching open ports
  // in the existing one. A row is extended at the end of the feed (+X), so the
  // feed entry never moves: all stubs sit on the -X side of a copy, and the +X
  // ends of both lines stay open ports for the next copy. Stubs are 2 m.
  //   feed:    stub ends open, flows into S0.Input1
  //   forward: stub ends open, flows into J0.Input1
  //   reverse: stub starts at J0.Output1 and ends open; this is where the
  //            products leave the first module, next to the feed entry
  const stub = 2;
  const firstSplitter = parts.find((p) => p.id === 'S0')!;
  const firstMerger = parts.find((p) => p.id === 'J0')!;
  beltList.push({
    id: 'feed',
    cls: beltClass,
    from: { x: firstSplitter.pos.x - 1 - stub, y: splitterY, z },
    to: { x: firstSplitter.pos.x - 1, y: splitterY, z },
    toPort: { part: 'S0', port: 'Input1' },
  });
  beltList.push(
    reverse
      ? {
          id: 'collect0',
          cls: beltClass,
          from: { x: firstMerger.pos.x - 1, y: mergerY, z },
          to: { x: firstMerger.pos.x - 1 - stub, y: mergerY, z },
          fromPort: { part: 'J0', port: 'Output1' },
        }
      : {
          id: 'collect0',
          cls: beltClass,
          from: { x: firstMerger.pos.x - 1 - stub, y: mergerY, z },
          to: { x: firstMerger.pos.x - 1, y: mergerY, z },
          toPort: { part: 'J0', port: 'Input1' },
        },
  );

  return { designer: req.designer, parts, belts: beltList };
}
