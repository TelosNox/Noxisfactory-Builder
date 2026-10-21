// Row module for machines with pipes (Refinery, Packager): at most one belt
// and one pipe per side, on the ground.
//
//   feed:   belt line at 1 m and pipe line at 3.75 m stacked on the same track,
//           5 m in front of the input ports; splitter below, T junction above
//   branch: belt from the splitter to the port; pipe from the junction 1 m
//           straight, bend down to port height, straight into the port
//   output: the same on the other side with mergers and T junctions
//
// The machine is turned so that its inputs face -Y (Refinery: 180°). Stubs on
// the feed entry side for auto-connect, pipes like belts (player). Reference:
// blueprint "Raffinerie LI RO Straight" (1.1 Spass), T junctions instead of
// crosses (player). Rules: docs/geometry.md.

import { gameData } from '../planner/gameData';
import { buildingGeometry, rotate, type Connection, type Vec3 } from './geometry';
import type { Belt, Layout, Part, Pipe } from './layout';
import { BELT_SPEED, MERGER, SPLITTER, type RowRequest } from './row';

export const JUNCTION = 'Build_PipelineJunction_T_C';
/** Flow in m³/min per pipe tier. */
export const PIPE_SPEED: Record<number, number> = { 1: 300, 2: 600 };
export const pipeClass = (tier: number) => (tier === 1 ? 'Build_Pipeline_C' : 'Build_PipelineMK2_C');

export interface FluidRowRequest extends RowRequest {
  /** Pipe tier 1–2. */
  pipeTier: number;
}

/** Height of the pipe lines, above the belt lines (reference). */
export const PIPE_Z = 3.75;
/** Distance from the ports to the track of the lines (reference). */
const LINE_GAP = 5;
const STUB = 2;

const flowYaw = (dir: number) => (dir > 0 ? 0 : 180);
const isFluid = (item: string) => ['liquid', 'gas'].includes(gameData.items[item]?.form);

export const hasPipes = (cls: string) => buildingGeometry(cls).connections.some((c) => c.kind === 'pipe');

export function generateFluidRow(req: FluidRowRequest): Layout {
  const recipe = gameData.recipes[req.recipe];
  if (!recipe) throw new Error(`unknown recipe ${req.recipe}`);
  const cls = recipe.machine;
  const geo = buildingGeometry(cls);
  const of = (kind: string, output: boolean) =>
    geo.connections.filter((c) => c.kind === kind && (output ? /OUTPUT|PRODUCER/.test(c.direction ?? '') : !/OUTPUT|PRODUCER/.test(c.direction ?? '')));
  const ins = { belt: of('belt', false), pipe: of('pipe', false) };
  const outs = { belt: of('belt', true), pipe: of('pipe', true) };
  const count = (r: Record<string, number>, fluid: boolean) => Object.keys(r).filter((i) => isFluid(i) === fluid).length;
  const need = {
    beltIn: count(recipe.in, false),
    pipeIn: count(recipe.in, true),
    beltOut: count(recipe.out, false),
    pipeOut: count(recipe.out, true),
  };
  if (need.beltIn > 1 || need.pipeIn > 1 || need.beltOut > 1 || need.pipeOut > 1) {
    throw new Error(`${cls}: only one belt and one pipe per side are supported`);
  }
  if (need.beltIn > ins.belt.length || need.pipeIn > ins.pipe.length || need.beltOut > outs.belt.length || need.pipeOut > outs.pipe.length) {
    throw new Error(`${cls}: recipe needs ports the machine does not have`);
  }

  // Capacity per line.
  const belt = BELT_SPEED[req.beltTier];
  const pipe = PIPE_SPEED[req.pipeTier];
  if (!belt) throw new Error(`unknown belt tier ${req.beltTier}`);
  if (!pipe) throw new Error(`unknown pipe tier ${req.pipeTier}`);
  for (const [item, amount] of [...Object.entries(recipe.in), ...Object.entries(recipe.out)]) {
    const rate = ((amount * 60) / recipe.durationS) * req.machines;
    const limit = isFluid(item) ? pipe : belt;
    if (req.machines > 1 && rate > limit) throw new Error(`${isFluid(item) ? `pipe Mk${req.pipeTier}` : `belt Mk${req.beltTier}`} carries ${limit}/min, row needs ${rate}/min`);
  }

  // Turn the machine so that its inputs face -Y.
  const inputSide = [...ins.belt, ...ins.pipe][0].position[1];
  const yaw = inputSide < 0 ? 0 : 180;
  const at = (c: Connection) => rotate({ x: c.position[0], y: c.position[1], z: c.position[2] }, yaw);
  const hard = geo.clearance.filter((b) => b.type === 'CT_Default');
  const minX = Math.min(...hard.map((b) => (yaw === 0 ? b.min[0] : -b.max[0])));
  const maxX = Math.max(...hard.map((b) => (yaw === 0 ? b.max[0] : -b.min[0])));
  const width = maxX - minX;

  const used = {
    beltIn: need.beltIn ? ins.belt[0] : undefined,
    pipeIn: need.pipeIn ? ins.pipe[0] : undefined,
    beltOut: need.beltOut ? outs.belt[0] : undefined,
    pipeOut: need.pipeOut ? outs.pipe[0] : undefined,
  };
  const inPorts = [used.beltIn, used.pipeIn].filter((c): c is Connection => !!c).map(at);
  const outPorts = [used.beltOut, used.pipeOut].filter((c): c is Connection => !!c).map(at);
  const inLineY = Math.floor(Math.min(...inPorts.map((p) => p.y))) - LINE_GAP;
  const outLineY = Math.ceil(Math.max(...outPorts.map((p) => p.y))) + LINE_GAP;

  const feedDir = (req.feedFrom ?? 'left') === 'left' ? 1 : -1;
  const outDir = req.output === 'reverse' ? -feedDir : feedDir;
  const beltCls = `Build_ConveyorBeltMk${req.beltTier}_C`;
  const pipeCls = pipeClass(req.pipeTier);
  // T junction: Connection2 is the branch (-Y at yaw 0), Connection0/1 face -X/+X (yaw 0).
  const junction = (branchToPlusY: boolean, dir: number) => {
    const yawJ = branchToPlusY ? 180 : 0;
    const plusX = yawJ === 0 ? 'Connection1' : 'Connection0';
    const minusX = yawJ === 0 ? 'Connection0' : 'Connection1';
    return { yaw: yawJ, downstream: dir > 0 ? plusX : minusX, upstream: dir > 0 ? minusX : plusX };
  };
  const jIn = junction(true, feedDir);
  const jOut = junction(false, outDir);

  const parts: Part[] = [];
  const belts: Belt[] = [];
  const pipes: Pipe[] = [];
  const xs: Record<string, number[]> = { S: [], T: [], J: [], U: [] };
  const base = Math.round(-(width * req.machines) / 2 - minX);

  for (let i = 0; i < req.machines; i++) {
    const slot = feedDir > 0 ? i : req.machines - 1 - i;
    const pos: Vec3 = { x: base + slot * width, y: 0, z: 0 };
    const m = `M${i}`;
    parts.push({ id: m, cls, pos, yaw, recipe: req.recipe });
    const world = (c: Connection) => {
      const p = at(c);
      return { x: pos.x + p.x, y: p.y, z: p.z };
    };
    if (used.beltIn) {
      const p = world(used.beltIn);
      xs.S.push(p.x);
      parts.push({ id: `S${i}`, cls: SPLITTER, pos: { x: p.x, y: inLineY, z: p.z }, yaw: flowYaw(feedDir) });
      belts.push({
        id: `in${i}`, cls: beltCls, from: { x: p.x, y: inLineY + 1, z: p.z }, to: p,
        fromPort: { part: `S${i}`, port: feedDir > 0 ? 'Output2' : 'Output3' }, toPort: { part: m, port: used.beltIn.name },
      });
    }
    if (used.pipeIn) {
      const p = world(used.pipeIn);
      xs.T.push(p.x);
      parts.push({ id: `T${i}`, cls: JUNCTION, pos: { x: p.x, y: inLineY, z: PIPE_Z }, yaw: jIn.yaw });
      pipes.push({
        id: `pin${i}`, cls: pipeCls, from: { x: p.x, y: inLineY + 1, z: PIPE_Z }, to: p,
        fromPort: { part: `T${i}`, port: 'Connection2' }, toPort: { part: m, port: used.pipeIn.name },
      });
    }
    if (used.beltOut) {
      const p = world(used.beltOut);
      xs.J.push(p.x);
      parts.push({ id: `J${i}`, cls: MERGER, pos: { x: p.x, y: outLineY, z: p.z }, yaw: flowYaw(outDir) });
      belts.push({
        id: `out${i}`, cls: beltCls, from: p, to: { x: p.x, y: outLineY - 1, z: p.z },
        fromPort: { part: m, port: used.beltOut.name }, toPort: { part: `J${i}`, port: outDir > 0 ? 'Input3' : 'Input2' },
      });
    }
    if (used.pipeOut) {
      const p = world(used.pipeOut);
      xs.U.push(p.x);
      parts.push({ id: `U${i}`, cls: JUNCTION, pos: { x: p.x, y: outLineY, z: PIPE_Z }, yaw: jOut.yaw });
      pipes.push({
        id: `pout${i}`, cls: pipeCls, from: p, to: { x: p.x, y: outLineY - 1, z: PIPE_Z },
        fromPort: { part: m, port: used.pipeOut.name }, toPort: { part: `U${i}`, port: 'Connection2' },
      });
    }
  }

  // Lines between neighbours and stubs on the feed entry side.
  const entry = (x: number, length: number) => x - feedDir * length;
  const beltZ = (id: string) => parts.find((p) => p.id === id)!.pos.z;
  if (used.beltIn) {
    const z = beltZ('S0');
    for (let i = 1; i < req.machines; i++) {
      belts.push({
        id: `line${i}`, cls: beltCls,
        from: { x: xs.S[i - 1] + feedDir, y: inLineY, z }, to: { x: xs.S[i] - feedDir, y: inLineY, z },
        fromPort: { part: `S${i - 1}`, port: 'Output1' }, toPort: { part: `S${i}`, port: 'Input1' },
      });
    }
    belts.push({
      id: 'feed', cls: beltCls,
      from: { x: entry(xs.S[0], 1 + STUB), y: inLineY, z }, to: { x: entry(xs.S[0], 1), y: inLineY, z },
      toPort: { part: 'S0', port: 'Input1' },
    });
  }
  if (used.pipeIn) {
    for (let i = 1; i < req.machines; i++) {
      pipes.push({
        id: `pline${i}`, cls: pipeCls,
        from: { x: xs.T[i - 1] + feedDir, y: inLineY, z: PIPE_Z }, to: { x: xs.T[i] - feedDir, y: inLineY, z: PIPE_Z },
        fromPort: { part: `T${i - 1}`, port: jIn.downstream }, toPort: { part: `T${i}`, port: jIn.upstream },
      });
    }
    pipes.push({
      id: 'pfeed', cls: pipeCls,
      from: { x: entry(xs.T[0], 1 + STUB), y: inLineY, z: PIPE_Z }, to: { x: entry(xs.T[0], 1), y: inLineY, z: PIPE_Z },
      toPort: { part: 'T0', port: jIn.upstream },
    });
  }
  // Output lines: neighbours in flow direction; the stub sits on the feed entry
  // side (forward: flows into the first merger, reverse: leaves there).
  const outLine = <T extends Belt | Pipe>(ids: string, list: number[], z: number, cls: string, down: string, up: string, push: (x: T) => void, prefix: string) => {
    for (let i = 1; i < req.machines; i++) {
      const [a, b] = outDir === feedDir ? [i - 1, i] : [i, i - 1];
      push({
        id: `${prefix}collect${i}`, cls,
        from: { x: list[a] + outDir, y: outLineY, z }, to: { x: list[b] - outDir, y: outLineY, z },
        fromPort: { part: `${ids}${a}`, port: down }, toPort: { part: `${ids}${b}`, port: up },
      } as T);
    }
    const outer = { x: entry(list[0], 1 + STUB), y: outLineY, z };
    const near = { x: entry(list[0], 1), y: outLineY, z };
    push(
      (outDir === feedDir
        ? { id: `${prefix}collect0`, cls, from: outer, to: near, toPort: { part: `${ids}0`, port: up } }
        : { id: `${prefix}collect0`, cls, from: near, to: outer, fromPort: { part: `${ids}0`, port: down } }) as T,
    );
  };
  if (used.beltOut) outLine<Belt>('J', xs.J, beltZ('J0'), beltCls, 'Output1', 'Input1', (b) => belts.push(b), '');
  if (used.pipeOut) outLine<Pipe>('U', xs.U, PIPE_Z, pipeCls, jOut.downstream, jOut.upstream, (p) => pipes.push(p), 'p');

  // Center across the row on the 1 m grid.
  const ys = [inLineY - 2, outLineY + 2];
  const dy = -Math.round((ys[0] + ys[1]) / 2);
  const move = (v: Vec3): Vec3 => ({ ...v, y: v.y + dy });
  return {
    designer: req.designer,
    parts: parts.map((p) => ({ ...p, pos: move(p.pos) })),
    belts: belts.map((b) => ({ ...b, from: move(b.from), to: move(b.to) })),
    pipes: pipes.map((p) => ({ ...p, from: move(p.from), to: move(p.to) })),
  };
}
