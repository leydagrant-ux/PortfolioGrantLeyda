/**
 * Orbitable STL viewers, and the wireframe hero background.
 *
 * Each <div class="viewer" data-model="..."> gets its own renderer, created lazily when
 * it scrolls into view and disposed when it scrolls well clear. That keeps several
 * viewers on one page cheap — only what you can see is running.
 *
 * The STLs are exported from SolidWorks in part-local millimetres, so each part arrives
 * with its minimum corner at the origin. We recentre on load and report the real
 * bounding-box dimensions, converted to inches, next to the model.
 */

import * as THREE from '../vendor/three/three.module.min.js';
import { STLLoader } from '../vendor/three/STLLoader.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const MM_PER_IN = 25.4;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/** Reads a CSS custom property off :root, so the 3D matches the active theme. */
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

class PartViewer {
  constructor(el) {
    this.el = el;
    this.canvas = el.querySelector('canvas');
    this.url = el.dataset.model;
    this.live = false;
    this.disposed = false;
    this.spin = el.dataset.spin !== 'false' && !reduced.matches;
    this.raf = 0;
  }

  start() {
    if (this.live || this.disposed) return;
    this.live = true;

    const w = this.canvas.clientWidth || 400;
    const h = this.canvas.clientHeight || 300;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 20000);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.85;
    // Let the page keep scrolling; zoom is on pinch and the +/- of a trackpad gesture
    // only after the user has actually grabbed the model.
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 0.7;

    this.controls.addEventListener('start', () => {
      this.spin = false;
      this.el.dataset.touched = 'true';
    });

    this.addLights();
    this.load();

    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize, { passive: true });

    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  addLights() {
    // Studio three-point: a key from front-right high, a cool fill from the left, and a
    // rim from behind to separate the silhouette from the dark ground.
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1, 1.4, 1.1);

    const fill = new THREE.DirectionalLight(0x9fd8ff, 0.85);
    fill.position.set(-1.3, 0.2, 0.6);

    const rim = new THREE.DirectionalLight(0xffffff, 1.5);
    rim.position.set(-0.4, 0.7, -1.4);

    this.scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.55));
  }

  load() {
    new STLLoader().load(
      this.url,
      (geo) => {
        if (this.disposed) return;

        geo.computeVertexNormals();
        geo.computeBoundingBox();

        const bb = geo.boundingBox;
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bb.getSize(size);
        bb.getCenter(center);

        // Recentre on the origin so orbit rotates about the part, not about a far corner.
        geo.translate(-center.x, -center.y, -center.z);

        const mat = new THREE.MeshStandardMaterial({
          color: 0x9aa7b4,
          metalness: 0.62,
          roughness: 0.42,
          flatShading: false,
        });

        this.mesh = new THREE.Mesh(geo, mat);
        // STLs come out of SolidWorks Z-up; three.js is Y-up.
        this.mesh.rotation.x = -Math.PI / 2;
        this.scene.add(this.mesh);

        this.wire = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, 32),
          new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar('--accent', '#35d6f2')) }),
        );
        this.wire.rotation.x = -Math.PI / 2;
        this.wire.visible = false;
        this.scene.add(this.wire);

        this.frame(size);
        this.reportDims(size);
        this.wireTools();
      },
      undefined,
      () => this.fail(),
    );
  }

  /**
   * Pulls the camera back just far enough to fit the part with a little air around it.
   *
   * Fitting on the largest single dimension leaves long thin parts — a 36 in plate that
   * is 1.3 in thick — as a sliver in the middle of the frame. Fit on the bounding-sphere
   * radius instead, and check the horizontal field of view as well as the vertical, since
   * these canvases are wider than they are tall.
   */
  frame(size) {
    const radius = size.length() * 0.5;
    const fovV = (this.camera.fov * Math.PI) / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
    const dist = Math.max(radius / Math.sin(fovV / 2), radius / Math.sin(fovH / 2)) * 1.06;

    this.camera.position.set(dist * 0.72, dist * 0.5, dist * 0.72);
    this.camera.near = dist / 100;
    this.camera.far = dist * 12;
    this.camera.updateProjectionMatrix();

    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = dist * 0.35;
    this.controls.maxDistance = dist * 3;
    this.controls.update();
  }

  reportDims(size) {
    const host = this.el.querySelector('[data-dims]');
    if (!host) return;
    const inch = (mm) => (mm / MM_PER_IN).toFixed(1);
    host.innerHTML =
      `<span>L <b>${inch(size.x)}"</b></span>` +
      `<span>W <b>${inch(size.y)}"</b></span>` +
      `<span>H <b>${inch(size.z)}"</b></span>`;
  }

  wireTools() {
    const wireBtn = this.el.querySelector('[data-wire]');
    if (wireBtn) {
      wireBtn.addEventListener('click', () => {
        const on = wireBtn.getAttribute('aria-pressed') !== 'true';
        wireBtn.setAttribute('aria-pressed', String(on));
        this.wire.visible = on;
        this.mesh.visible = !on;
      });
    }

    const resetBtn = this.el.querySelector('[data-reset]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.mesh.geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        this.mesh.geometry.boundingBox.getSize(size);
        this.frame(size);
        this.spin = !reduced.matches;
        delete this.el.dataset.touched;
      });
    }
  }

  fail() {
    this.el.querySelector('[data-dims]')?.replaceChildren(
      document.createTextNode('Model unavailable'),
    );
    this.stop();
  }

  resize() {
    if (!this.live) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    if (!this.live) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.spin && this.mesh) this.mesh.rotation.z += 0.0032;
    if (this.spin && this.wire) this.wire.rotation.z += 0.0032;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  stop() {
    if (!this.live) return;
    this.live = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
  }

  dispose() {
    this.stop();
    this.disposed = true;
    this.controls?.dispose();
    this.scene?.traverse((o) => {
      o.geometry?.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material?.dispose();
    });
    this.renderer?.dispose();
  }
}

/* -------------------------------------------------------------------------- */

export function initViewers() {
  const nodes = [...document.querySelectorAll('.viewer[data-model]')];
  if (!nodes.length) return;

  if (!webglAvailable()) {
    nodes.forEach((el) => {
      const c = el.querySelector('canvas');
      const fb = el.dataset.fallback;
      if (fb && c) {
        const img = document.createElement('img');
        img.src = fb;
        img.alt = el.dataset.name || '3D model preview';
        c.replaceWith(img);
      }
      el.querySelector('[data-dims]')?.replaceChildren(
        document.createTextNode('3D preview needs WebGL'),
      );
      el.querySelector('.viewer__tools')?.remove();
    });
    return;
  }

  const viewers = new Map(nodes.map((el) => [el, new PartViewer(el)]));

  // Failsafe, matching the scroll-reveal one: if the observer never reports back — an
  // embedded webview that isn't compositing, say — start every viewer rather than leave
  // a page of empty boxes. The geometry here is small enough that running all of them is
  // an acceptable worst case.
  const failsafe = setTimeout(() => viewers.forEach((v) => v.start()), 1500);

  const io = new IntersectionObserver(
    (entries) => {
      clearTimeout(failsafe);
      entries.forEach((e) => {
        const v = viewers.get(e.target);
        if (!v) return;
        if (e.isIntersecting) v.start();
        else v.stop();
      });
    },
    { rootMargin: '220px 0px' },
  );

  nodes.forEach((el) => io.observe(el));
}

/* -------------------------------------------------------------------------- */
/* Hero background                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The living hero: the rotator plate as a slowly turning wireframe on a drafting grid,
 * with a touch of parallax from the pointer. Purely decorative, so it bails out quietly
 * whenever it would be unwelcome — reduced motion, no WebGL, or a coarse pointer on a
 * small screen where the battery cost is not worth it.
 */
export function initHeroStage(modelUrl) {
  const stage = document.querySelector('[data-hero-stage]');
  if (!stage) return;

  if (reduced.matches || !webglAvailable() || innerWidth < 720) return;

  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 20000);

  const group = new THREE.Group();
  scene.add(group);

  const size = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  new STLLoader().load(
    modelUrl,
    (geo) => {
      geo.computeBoundingBox();
      const c = new THREE.Vector3();
      const s = new THREE.Vector3();
      geo.boundingBox.getCenter(c);
      geo.boundingBox.getSize(s);
      geo.translate(-c.x, -c.y, -c.z);

      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 24),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(cssVar('--accent', '#35d6f2')),
          transparent: true,
          opacity: 0.5,
        }),
      );
      wire.rotation.x = -Math.PI / 2;
      group.add(wire);

      const radius = Math.max(s.x, s.y, s.z) * 0.5;
      const dist = (radius / Math.sin((camera.fov * Math.PI) / 180 / 2)) * 1.35;
      camera.position.set(dist * 0.55, dist * 0.42, dist * 0.8);
      camera.lookAt(0, 0, 0);
      camera.far = dist * 10;
      camera.updateProjectionMatrix();
      size();
    },
    undefined,
    () => stage.remove(),
  );

  let px = 0;
  let py = 0;
  addEventListener(
    'pointermove',
    (e) => {
      px = (e.clientX / innerWidth - 0.5) * 0.28;
      py = (e.clientY / innerHeight - 0.5) * 0.18;
    },
    { passive: true },
  );

  let running = true;
  const io = new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
  });
  io.observe(stage);

  size();
  addEventListener('resize', size, { passive: true });

  const loop = () => {
    requestAnimationFrame(loop);
    if (!running) return;
    group.rotation.y += 0.0016;
    // Ease toward the pointer rather than snapping; keeps it feeling like mass.
    group.rotation.x += (py - group.rotation.x) * 0.04;
    group.position.x += (px * 40 - group.position.x) * 0.04;
    renderer.render(scene, camera);
  };
  loop();
}
