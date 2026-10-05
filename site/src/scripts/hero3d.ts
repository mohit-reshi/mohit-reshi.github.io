import type { Color } from 'three';
import { $, on, idle, reducedMotion, type Cleanup, type Init } from './util';

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
/** The 3D hero is skipped for reduced motion, low-power devices, Save-Data and when WebGL is missing: the CSS bars stay. */
export function shouldRun3D() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (reducedMotion()) return false;
  if ((nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2) return false;
  if (nav.connection?.saveData) return false;
  if (matchMedia('(max-width: 36rem)').matches) return false;
  return webglOk();
}

const COLS = 40, ROWS = 20;

export const initHero: Init = () => {
  const hostEl = $('[data-hero3d]');
  const heroEl = $('[data-hero]');
  if (!hostEl || !heroEl || !shouldRun3D()) return;
  const host: HTMLElement = hostEl, hero: HTMLElement = heroEl;
  let dispose: Cleanup | null = null, cancelled = false;
  idle(async () => {
    const THREE = await import('three');
    if (cancelled) return;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    camera.position.set(0, 15, 30); camera.lookAt(0, 0.6, 0);
    const geo = new THREE.BoxGeometry(0.62, 1, 0.62); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, COLS * ROWS);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    const palette: Color[] = [];
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      palette.length = 0;
      ['--viz-3', '--viz-2', '--viz-1'].forEach((v) => palette.push(new THREE.Color(cs.getPropertyValue(v).trim() || '#ffc83d')));
    };
    readColors();
    const mo = new MutationObserver(readColors);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    let w = 1, h = 1;
    const resize = () => { const r = host.getBoundingClientRect(); w = Math.max(1, r.width); h = Math.max(1, r.height); renderer.setSize(w, h, false); camera.aspect = w / h; camera.position.z = w / h < 1 ? 44 : 30; scene.position.x = w / h < 1 ? 0 : Math.min(9, 3 + (w / h) * 2); camera.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(host);
    let px = 0.3, pz = 0.5, tx = 0.3, tz = 0.5, visible = true, raf = 0, first = true;
    const off: Cleanup[] = [];
    off.push(on(window, 'pointermove', (e: PointerEvent) => { const r = host.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width; tz = (e.clientY - r.top) / r.height; }, { passive: true }));
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }); io.observe(host);
    off.push(on(document, 'visibilitychange', () => { if (!document.hidden && visible && !raf) raf = requestAnimationFrame(frame); }));
    const t0 = performance.now();
    function frame(now: number) {
      raf = 0;
      if (!visible || document.hidden) return;
      const t = (now - t0) / 1000;
      px += (tx - px) * 0.06; pz += (tz - pz) * 0.06;
      const scroll = Math.min(1, scrollY / Math.max(1, host.clientHeight));
      for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
        const x = (i - COLS / 2) * 0.9, z = (j - ROWS / 2) * 0.9;
        const wave = Math.sin(i * 0.38 + t * 0.9) * 0.5 + Math.cos(j * 0.55 - t * 0.7) * 0.5 + Math.sin((i + j) * 0.21 + t * 0.4);
        const d = Math.hypot(i / COLS - px, (j / ROWS - pz) * 0.55);
        const bump = Math.exp(-d * d * 28) * 4.2;
        const height = Math.max(0.1, (0.8 + wave * 0.6 + bump * 0.8) * (1 - scroll * 0.7));
        dummy.position.set(x, 0, z); dummy.scale.set(1, height, 1); dummy.updateMatrix();
        mesh.setMatrixAt(i * ROWS + j, dummy.matrix);
        const k = Math.min(1, height / 3.5);
        color.copy(palette[0]).lerp(k < 0.5 ? palette[1] : palette[2], k < 0.5 ? k * 2 : (k - 0.5) * 2);
        color.multiplyScalar(0.55 + k * 0.6);
        mesh.setColorAt(i * ROWS + j, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.rotation.y = (px - 0.5) * 0.25;
      renderer.render(scene, camera);
      if (first) { first = false; hero.setAttribute('data-3d', 'on'); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    dispose = () => { cancelAnimationFrame(raf); raf = 0; visible = false; io.disconnect(); ro.disconnect(); mo.disconnect(); off.forEach((f) => f()); geo.dispose(); mat.dispose(); mesh.dispose(); renderer.dispose(); renderer.domElement.remove(); hero.removeAttribute('data-3d'); };
  });
  return () => { cancelled = true; dispose?.(); };
};
