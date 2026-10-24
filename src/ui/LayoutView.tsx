// Blueprint preview with a switch between top view and 3D view.

import type { FunctionComponent } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Layout } from '../generator/layout';
import { Preview } from './Preview';

// three.js is loaded only when a 3D view is opened. (preact/compat lazy +
// Suspense stayed on the fallback on the first load.)
type View3D = FunctionComponent<{ layout: Layout }>;
let loaded: View3D | undefined;
function use3D(active: boolean): View3D | undefined {
  const [view, setView] = useState<View3D | undefined>(loaded);
  useEffect(() => {
    if (!active || view) return;
    import('./Preview3D').then((m) => {
      loaded = m.Preview3D;
      setView(() => m.Preview3D);
    });
  }, [active]);
  return view;
}

export function LayoutView({ make, deps }: { make: () => Layout; deps: unknown[] }) {
  const layout = useMemo(() => {
    try {
      return make();
    } catch (error) {
      return String((error as Error).message);
    }
  }, deps);
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const View3D = use3D(mode === '3d');
  if (typeof layout === 'string') return <p class="warn">Vorschau: {layout}</p>;
  return (
    <div>
      <div class="switch">
        <button type="button" class={mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')}>Draufsicht</button>
        <button type="button" class={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>3D</button>
      </div>
      {mode === '2d' ? (
        <Preview layout={layout} />
      ) : View3D ? (
        <View3D layout={layout} />
      ) : (
        <p class="hint">3D wird geladen …</p>
      )}
    </div>
  );
}
