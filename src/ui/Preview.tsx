// Top view of a layout. Seen from the input side: -Y (feed side) at the bottom,
// -X ("left") on the left. 1 unit = 1 m.

import { gameData } from '../planner/gameData';
import { portPosition, worldBoxes } from '../generator/geometry';
import { FOUNDATION, halfSize, PASSTHROUGH, PIPE_PASSTHROUGH, type Layout, type PortRef } from '../generator/layout';
import { MERGER, SPLITTER } from '../generator/row';

const kind = (cls: string) =>
  cls === SPLITTER ? 'splitter' : cls === MERGER ? 'merger' : cls === PASSTHROUGH || cls === PIPE_PASSTHROUGH ? 'passthrough' : /PowerPole/.test(cls) ? 'pole' : /Junction/.test(cls) ? 'junction' : 'machine';
const short = (cls: string) =>
  (gameData.machines[cls]?.name ?? cls).replace(/ Mk ?\d+$/, '');

export function wireEnd(layout: Layout, ref: PortRef) {
  const part = layout.parts.find((p) => p.id === ref.part)!;
  return portPosition(part.cls, ref.port, part.pos, part.yaw, part.roll);
}

export function Preview({ layout }: { layout: Layout }) {
  const half = halfSize(layout);
  // Things below the machines' base are drawn dashed (logistics floor).
  const floorZ = Math.min(...layout.parts.filter((p) => kind(p.cls) === 'machine').map((p) => p.pos.z));
  const pad = 2;
  const foundations = Array.from({ length: layout.designer + 1 }, (_, i) => -half + i * FOUNDATION);
  return (
    <svg class="preview" viewBox={`${-half - pad} ${-half - pad} ${2 * (half + pad)} ${2 * (half + pad)}`}>
      <defs>
        <marker id="arrow" viewBox="0 0 4 4" refX="2" refY="2" markerWidth="1.6" markerHeight="1.6" orient="auto">
          <path d="M0,0 L4,2 L0,4 z" class="arrow" />
        </marker>
      </defs>
      <rect class="designer" x={-half} y={-half} width={2 * half} height={2 * half} />
      {foundations.map((v) => (
        <>
          <line class="grid" x1={v} y1={-half} x2={v} y2={half} />
          <line class="grid" x1={-half} y1={v} x2={half} y2={v} />
        </>
      ))}
      {layout.parts.map((p) =>
        worldBoxes(p.cls, p.pos, p.yaw, p.roll).map((b) => (
          <rect
            class={`${kind(p.cls)} ${b.type === 'CT_Soft' ? 'soft' : 'hard'}`}
            x={b.min.x}
            y={-b.max.y}
            width={b.max.x - b.min.x}
            height={b.max.y - b.min.y}
          >
            <title>{`${p.id}: ${short(p.cls)}`}</title>
          </rect>
        )),
      )}
      {(layout.lifts ?? []).map((l) => (
        <rect class="lift" x={l.pos.x - 1} y={-l.pos.y - 1} width={2} height={2}>
          <title>{`${l.id}: Lift ${l.pos.z}–${l.pos.z + l.height} m`}</title>
        </rect>
      ))}
      {layout.belts.map((b) => (
        <line class={'belt' + (b.fromPort && b.toPort ? '' : ' stub') + (b.from.z < floorZ ? ' below' : '')} x1={b.from.x} y1={-b.from.y} x2={b.to.x} y2={-b.to.y} marker-end="url(#arrow)">
          <title>{b.id}</title>
        </line>
      ))}
      {(layout.pipes ?? []).map((p) => (
        <line class={'pipe' + ((p.fromPort || p.fromPassthrough) && p.toPort ? '' : ' stub')} x1={p.from.x} y1={-p.from.y} x2={p.to.x} y2={-p.to.y}>
          <title>{p.id}</title>
        </line>
      ))}
      {(layout.wires ?? []).map((w) => {
        const a = wireEnd(layout, w.from);
        const b = wireEnd(layout, w.to);
        return (
          <line class="wire" x1={a.x} y1={-a.y} x2={b.x} y2={-b.y}>
            <title>{w.id}</title>
          </line>
        );
      })}
      {layout.parts
        .filter((p) => kind(p.cls) === 'pole')
        .map((p) => (
          <circle class="pole" cx={p.pos.x} cy={-p.pos.y} r={0.6}>
            <title>{`${p.id}: Strommast`}</title>
          </circle>
        ))}
      {layout.parts
        .filter((p) => kind(p.cls) === 'machine')
        .map((p) => (
          <text class="label" x={p.pos.x} y={-p.pos.y}>
            {short(p.cls)}
          </text>
        ))}
    </svg>
  );
}
