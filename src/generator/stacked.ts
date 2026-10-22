// Row module on the ground for machines with several belt inputs: the feed
// lines run stacked above each other in front of the inputs (docs/concept.md,
// "Reihe, Zuleitungen gestapelt über den Eingängen").
//
// Side view across the row (input side left):
//
//   ──S───┐                9 m   lane 3
//   ──S───┤                7 m   lane 2
//   ──S─┐ │                5 m   lane 1: splitter, down lift into the port
//       │ │ M M M M
//   ──S─┴─┴──────          1 m   lane 0: belt straight to the port
//
// Lane 0 lies at port height. The other lanes start 4 m higher (shortest
// snapped lift) and stack in 2 m steps. Each lane has its splitter in line
// with its input; the splitter port snaps to the top of a lift that comes down
// 2 m in front of the input port. Output as in row.ts (merger line at port
// height behind the machines).

import { gameData } from '../planner/gameData';
import { buildingGeometry, type Vec3 } from './geometry';
import { LIFT_REACH, type Belt, type Layout, type Lift, type Part } from './layout';
import { BELT_SPEED, MERGER, SPLITTER, type RowRequest } from './row';

const SPLITTER_HALF = 2;
const STUB = 2;
/** Shortest lift between two snapped ends. */
const MIN_LIFT = 4;
const LEVEL_GAP = 2;

const flowYaw = (dir: number) => (dir > 0 ? 0 : 180);

export function generateStackedRow(req: RowRequest): Layout {
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
  const used = Object.keys(recipe.in).length;
  if (used > inputs.length) throw new Error(`${cls}: recipe needs ${used} inputs`);
  const lanesNeeded = inputs.slice(0, used).sort((a, b) => a.position[0] - b.position[0]);
  const [output] = outputs;

  const speed = BELT_SPEED[req.beltTier];
  if (!speed) throw new Error(`unknown belt tier ${req.beltTier}`);
  const perMinute = (amount: number) => (amount * 60) / recipe.durationS;
  const rates = [...Object.values(recipe.in), ...Object.values(recipe.out)].map((a) => perMinute(a) * req.machines);
  if (req.machines > 1 && Math.max(...rates) > speed) {
    throw new Error(`belt Mk${req.beltTier} carries ${speed}/min, row needs ${Math.max(...rates)}/min`);
  }

  const hard = geo.clearance.filter((b) => b.type === 'CT_Default');
  const minX = Math.min(...hard.map((b) => b.min[0]));
  const maxX = Math.max(...hard.map((b) => b.max[0]));
  const maxY = Math.max(...hard.map((b) => b.max[1]));
  const width = maxX - minX;
  if (width < 2 * SPLITTER_HALF) throw new Error(`${cls} is narrower than a splitter`);

  const portZ = inputs[0].position[2];
  const portY = inputs[0].position[1];
  const liftY = portY - LIFT_REACH;
  // Splitter port snaps to the lift top: splitter 1 m + 2 m in front of the lift.
  const laneY = liftY - 1 - LIFT_REACH;
  const laneZ = (j: number) => (j === 0 ? portZ : portZ + MIN_LIFT + LEVEL_GAP * (j - 1));
  const feedDir = (req.feedFrom ?? 'left') === 'left' ? 1 : -1;
  const outDir = req.output === 'reverse' ? -feedDir : feedDir;
  // Splitter side port towards +Y (the machine) for the flow direction.
  const towardsMachine = feedDir > 0 ? 'Output2' : 'Output3';
  const machineToMerger = outDir > 0 ? 'Input3' : 'Input2';
  const liftCls = `Build_ConveyorLiftMk${req.beltTier}_C`;
  const beltCls = `Build_ConveyorBeltMk${req.beltTier}_C`;
  const mergerY = Math.ceil(maxY + SPLITTER_HALF);

  const parts: Part[] = [];
  const belts: Belt[] = [];
  const lifts: Lift[] = [];
  const splitterX: number[][] = lanesNeeded.map(() => []);
  const mergerX: number[] = [];
  const base = Math.round(-(width * req.machines) / 2 - minX);

  for (let i = 0; i < req.machines; i++) {
    const slot = feedDir > 0 ? i : req.machines - 1 - i;
    const pos: Vec3 = { x: base + slot * width, y: 0, z: 0 };
    parts.push({ id: `M${i}`, cls, pos, yaw: 0, recipe: req.recipe });

    lanesNeeded.forEach((input, j) => {
      const x = pos.x + input.position[0];
      const z = laneZ(j);
      const s = `S${j}_${i}`;
      splitterX[j].push(x);
      parts.push({ id: s, cls: SPLITTER, pos: { x, y: laneY, z }, yaw: flowYaw(feedDir) });
      if (j === 0) {
        belts.push({
          id: `in${j}_${i}`, cls: beltCls, from: { x, y: laneY + 1, z }, to: { x, y: portY, z: portZ },
          fromPort: { part: s, port: towardsMachine }, toPort: { part: `M${i}`, port: input.name },
        });
      } else {
        // Down lift: bottom faces the machine (+Y, yaw 90), top faces the splitter (-Y).
        lifts.push({
          id: `L${j}_${i}`, cls: liftCls, pos: { x, y: liftY, z: portZ }, height: z - portZ, down: true,
          yaw: 90, topYaw: 180, topLink: { part: s, port: towardsMachine }, bottomLink: { part: `M${i}`, port: input.name },
        });
      }
    });

    const outX = pos.x + output.position[0];
    mergerX.push(outX);
    parts.push({ id: `J${i}`, cls: MERGER, pos: { x: outX, y: mergerY, z: portZ }, yaw: flowYaw(outDir) });
    belts.push({
      id: `out${i}`, cls: beltCls,
      from: { x: outX, y: output.position[1], z: portZ }, to: { x: outX, y: mergerY - 1, z: portZ },
      fromPort: { part: `M${i}`, port: output.name }, toPort: { part: `J${i}`, port: machineToMerger },
    });
  }

  for (let i = 1; i < req.machines; i++) {
    lanesNeeded.forEach((_, j) => {
      const z = laneZ(j);
      belts.push({
        id: `line${j}_${i}`, cls: beltCls,
        from: { x: splitterX[j][i - 1] + feedDir, y: laneY, z },
        to: { x: splitterX[j][i] - feedDir, y: laneY, z },
        fromPort: { part: `S${j}_${i - 1}`, port: 'Output1' }, toPort: { part: `S${j}_${i}`, port: 'Input1' },
      });
    });
    const [up, down] = outDir === feedDir ? [i - 1, i] : [i, i - 1];
    belts.push({
      id: `collect${i}`, cls: beltCls,
      from: { x: mergerX[up] + outDir, y: mergerY, z: portZ }, to: { x: mergerX[down] - outDir, y: mergerY, z: portZ },
      fromPort: { part: `J${up}`, port: 'Output1' }, toPort: { part: `J${down}`, port: 'Input1' },
    });
  }

  // Auto-connect stubs on the feed entry side (row.ts).
  const entry = (x: number, length: number) => x - feedDir * length;
  lanesNeeded.forEach((_, j) => {
    const z = laneZ(j);
    belts.push({
      id: `feed${j}`, cls: beltCls,
      from: { x: entry(splitterX[j][0], 1 + STUB), y: laneY, z }, to: { x: entry(splitterX[j][0], 1), y: laneY, z },
      toPort: { part: `S${j}_0`, port: 'Input1' },
    });
  });
  const outerEnd = { x: entry(mergerX[0], 1 + STUB), y: mergerY, z: portZ };
  const portEnd = { x: entry(mergerX[0], 1), y: mergerY, z: portZ };
  belts.push(
    outDir === feedDir
      ? { id: 'collect0', cls: beltCls, from: outerEnd, to: portEnd, toPort: { part: 'J0', port: 'Input1' } }
      : { id: 'collect0', cls: beltCls, from: portEnd, to: outerEnd, fromPort: { part: 'J0', port: 'Output1' } },
  );

  // Center across the row on the 1 m grid.
  const dy = -Math.round((laneY - SPLITTER_HALF + mergerY + SPLITTER_HALF) / 2);
  const move = (v: Vec3): Vec3 => ({ ...v, y: v.y + dy });
  return {
    designer: req.designer,
    parts: parts.map((p) => ({ ...p, pos: move(p.pos) })),
    belts: belts.map((b) => ({ ...b, from: move(b.from), to: move(b.to) })),
    lifts: lifts.map((l) => ({ ...l, pos: move(l.pos) })),
  };
}
