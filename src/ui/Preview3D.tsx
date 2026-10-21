// 3D view of a layout with three.js, loaded on demand.
// Game axes (X, Y, Z up) map to three.js as (X, Z, -Y), so the camera from
// above shows the same picture as the top view (feed side at the bottom).

import { useEffect, useRef, useState } from 'preact/hooks';
import type * as Three from 'three';
import { buildingGeometry, worldBoxes } from '../generator/geometry';
import { wireEnd } from './Preview';
import { FOUNDATION, halfSize, PASSTHROUGH, type Layout } from '../generator/layout';
import { MERGER, SPLITTER } from '../generator/row';

const COLORS = {
  machine: 0x8aa9c9,
  splitter: 0xe8b35a,
  merger: 0x7cc47f,
  belt: 0x555555,
  stub: 0xe07b00,
  lift: 0x7a5a9a,
  passthrough: 0x999999,
  foundation: 0xb0b0a8,
  designer: 0xe07b00,
  pole: 0x6b5b3a,
  wire: 0xd4a017,
};

export function Preview3D({ layout }: { layout: Layout }) {
  const host = useRef<HTMLDivElement>(null);
  const [showFloor, setShowFloor] = useState(true);
  const floorZ = Math.min(...layout.parts.filter((p) => ![SPLITTER, MERGER, PASSTHROUGH].includes(p.cls) && !/PowerPole/.test(p.cls)).map((p) => p.pos.z));
  const hasFloor = floorZ > 0;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      if (disposed || !host.current) return;
      const el = host.current;
      const width = el.clientWidth;
      const height = Math.round(width * 0.75);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 1000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(width, height);
      el.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.5);
      sun.position.set(30, 60, 20);
      scene.add(sun);

      const v = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
      const materials = new Map<string, Three.Material>();
      const material = (color: number, opacity = 1) => {
        const key = `${color}/${opacity}`;
        if (!materials.has(key)) {
          materials.set(key, new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1 }));
        }
        return materials.get(key)!;
      };
      /** Axis-aligned box from game-space min/max. */
      const box = (min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }, mat: Three.Material) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(max.x - min.x, max.z - min.z, max.y - min.y), mat);
        mesh.position.copy(v((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2));
        scene.add(mesh);
        return mesh;
      };
      const edges = (mesh: Three.Mesh, color = 0x333333) => {
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color }));
        lines.position.copy(mesh.position);
        scene.add(lines);
      };

      // Buildings.
      for (const p of layout.parts) {
        if (p.cls === SPLITTER || p.cls === MERGER) {
          const c = p.cls === SPLITTER ? COLORS.splitter : COLORS.merger;
          edges(box({ x: p.pos.x - 1, y: p.pos.y - 1, z: p.pos.z - 1 }, { x: p.pos.x + 1, y: p.pos.y + 1, z: p.pos.z + 0.6 }, material(c)));
        } else if (/PowerPole/.test(p.cls)) {
          const top = buildingGeometry(p.cls).connections.find((c) => c.kind === 'power')!.position[2];
          box({ x: p.pos.x - 0.3, y: p.pos.y - 0.3, z: p.pos.z }, { x: p.pos.x + 0.3, y: p.pos.y + 0.3, z: p.pos.z + top + 0.4 }, material(COLORS.pole));
        } else if (p.cls === PASSTHROUGH) {
          box({ x: p.pos.x - 1, y: p.pos.y - 1, z: p.pos.z - 0.55 }, { x: p.pos.x + 1, y: p.pos.y + 1, z: p.pos.z + 0.55 }, material(COLORS.passthrough));
        } else {
          for (const b of worldBoxes(p.cls, p.pos, p.yaw).filter((b) => b.type === 'CT_Default')) {
            edges(box(b.min, b.max, material(COLORS.machine, 0.85)), 0x3d5f80);
          }
        }
      }

      // Belts: flat strips with an arrow in the middle.
      for (const b of layout.belts) {
        const stub = !(b.fromPort && b.toPort);
        const a = v(b.from.x, b.from.y, b.from.z - 0.3);
        const c = v(b.to.x, b.to.y, b.to.z - 0.3);
        const length = a.distanceTo(c);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, length), material(stub ? COLORS.stub : COLORS.belt));
        strip.position.copy(a.clone().add(c).multiplyScalar(0.5));
        strip.lookAt(c);
        scene.add(strip);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 12), material(0xffffff));
        arrow.position.copy(strip.position).add(new THREE.Vector3(0, 0.3, 0));
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
        scene.add(arrow);
      }

      // Power lines.
      for (const w of layout.wires ?? []) {
        const a = wireEnd(layout, w.from);
        const b = wireEnd(layout, w.to);
        const geometry = new THREE.BufferGeometry().setFromPoints([v(a.x, a.y, a.z), v(b.x, b.y, b.z)]);
        scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: COLORS.wire })));
      }

      // Lifts: columns.
      for (const l of layout.lifts ?? []) {
        edges(box({ x: l.pos.x - 0.8, y: l.pos.y - 0.8, z: l.pos.z - 0.5 }, { x: l.pos.x + 0.8, y: l.pos.y + 0.8, z: l.pos.z + l.height }, material(COLORS.lift)), 0x3d2a55);
      }

      // Foundation level of a logistics floor (not part of the blueprint).
      const half = halfSize(layout);
      if (hasFloor && showFloor) {
        box({ x: -half, y: -half, z: floorZ - 1 }, { x: half, y: half, z: floorZ - 0.02 }, material(COLORS.foundation, 0.35));
      }

      // Camera framing the content (before designer and grid are added).
      const content = new THREE.Box3().setFromObject(scene);

      // Designer: wire cube and foundation grid on the ground.
      const size = layout.designer * FOUNDATION;
      const cube = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
        new THREE.LineBasicMaterial({ color: COLORS.designer }),
      );
      cube.position.set(0, size / 2, 0);
      scene.add(cube);
      const grid = new THREE.GridHelper(size, layout.designer, 0x999999, 0xcccccc);
      scene.add(grid);

      // Camera from the front left (feed side), looking at the content.
      const target = content.getCenter(new THREE.Vector3());
      const radius = content.getSize(new THREE.Vector3()).length() / 2;
      const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
      camera.position.copy(target).add(new THREE.Vector3(-0.55, 0.6, 0.9).normalize().multiplyScalar(distance));
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(target);
      controls.update();
      const render = () => renderer.render(scene, camera);
      controls.addEventListener('change', render);
      render();

      const resize = new ResizeObserver(() => {
        const w = el.clientWidth;
        const h = Math.round(w * 0.75);
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      });
      resize.observe(el);

      cleanup = () => {
        resize.disconnect();
        controls.dispose();
        scene.traverse((o) => (o as Three.Mesh).geometry?.dispose());
        materials.forEach((m) => m.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [layout, showFloor]);

  return (
    <div class="preview3d">
      <div ref={host} />
      {hasFloor && (
        <label class="inline">
          <input type="checkbox" checked={showFloor} onChange={(e) => setShowFloor(e.currentTarget.checked)} />
          Foundation-Ebene zeigen
        </label>
      )}
      <p class="hint">Ziehen: drehen, Rechtsklick: verschieben, Mausrad: zoomen.</p>
    </div>
  );
}
