// Blueprint preview with a switch between top view and 3D view.

import { lazy, Suspense } from 'preact/compat';
import { useMemo, useState } from 'preact/hooks';
import type { Layout } from '../generator/layout';
import { Preview } from './Preview';

const Preview3D = lazy(() => import('./Preview3D').then((m) => ({ default: m.Preview3D })));

export function LayoutView({ make, deps }: { make: () => Layout; deps: unknown[] }) {
  const layout = useMemo(make, deps);
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  return (
    <div>
      <div class="switch">
        <button type="button" class={mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')}>Draufsicht</button>
        <button type="button" class={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>3D</button>
      </div>
      {mode === '2d' ? (
        <Preview layout={layout} />
      ) : (
        <Suspense fallback={<p class="hint">3D wird geladen …</p>}>
          <Preview3D layout={layout} />
        </Suspense>
      )}
    </div>
  );
}
