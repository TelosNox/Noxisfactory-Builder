// Top view of a layout. Seen from the input side: -Y (feed side) at the bottom,
// -X ("left") on the left. 1 unit = 1 m.

import { gameData } from '../planner/gameData';
import { worldBoxes } from '../generator/geometry';
import { FOUNDATION, halfSize, type Layout } from '../generator/layout';
import { MERGER, SPLITTER } from '../generator/row';

const kind = (cls: string) => (cls === SPLITTER ? 'splitter' : cls === MERGER ? 'merger' : 'machine');
const short = (cls: string) =>
  (gameData.machines[cls]?.name ?? cls).replace(/ Mk ?\d+$/, '');

export function Preview({ layout }: { layout: Layout }) {
  const half = halfSize(layout);
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
        worldBoxes(p.cls, p.pos, p.yaw).map((b) => (
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
      {layout.belts.map((b) => (
        <line class={'belt' + (b.fromPort && b.toPort ? '' : ' stub')} x1={b.from.x} y1={-b.from.y} x2={b.to.x} y2={-b.to.y} marker-end="url(#arrow)">
          <title>{b.id}</title>
        </line>
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
