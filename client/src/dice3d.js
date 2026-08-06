// Standalone 3D dice engine — no dependencies beyond three.js.
//
// createDiceStage(canvas, opts) -> { roll, setStyle, setQuality, resize, dispose }
// roll(dice) where dice = [{ sides, value, variant }] — values come from YOUR
// server (server/dice.js), the animation just lands on them.
//
// Supported: d4, d6 (pips), d8, d10, d12, d20, and d100 — a d100 spec is
// expanded into a percentile pair (tens die 00–90 + units die 0–9).

import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const DIE_R = 0.62;
const TRAY_X = 2.7;
const TRAY_Z = 1.55;

// Art size per solid, sized to sit inside each face's incircle.
const FACE_ART = { 4: 0.40, 6: 0.52, 8: 0.36, 10: 0.36, 12: 0.44, 20: 0.28 };
// Quad faces size off the face's own inscribed square instead — a kite's usable
// area is much smaller than its extents suggest.
const QUAD_ART = { 6: 0.74, 10: 0.72 };

/* ---------- geometry ---------- */

// Pentagonal trapezohedron — the real d10 solid: ten congruent kite faces.
// Two rings of k vertices offset by half a step, plus two apexes. The apex
// height is solved so each kite is planar.
function trapezohedron(k = 5, r = 1, h = 1) {
  const cosb = Math.cos(Math.PI / k);
  const c = h / (1 + (2 * cosb) / (1 - cosb));
  const upper = [], lower = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    const b = a + Math.PI / k;
    upper.push(new THREE.Vector3(Math.cos(a) * r, c, Math.sin(a) * r));
    lower.push(new THREE.Vector3(Math.cos(b) * r, -c, Math.sin(b) * r));
  }
  const A = new THREE.Vector3(0, h, 0);
  const B = new THREE.Vector3(0, -h, 0);
  const pts = [];
  for (let i = 0; i < k; i++) {
    const u0 = upper[i], u1 = upper[(i + 1) % k];
    const l0 = lower[i], l1 = lower[(i + 1) % k];
    pts.push(A, u0, l0, A, l0, u1);       // upper kite
    pts.push(B, u1, l0, B, l1, u1);       // lower kite — reversed vs. the upper
    // kite's winding: B is a mirrored apex, so the same vertex order would
    // flip the outward normal (this made half the d10's faces invisible,
    // and split each broken kite into two mismatched triangle-halves).
  }
  const geo = fromPoints(pts);
  // Safety net for any future hand-derived solid: flip any triangle whose
  // normal points inward relative to the origin-centred convex shape.
  const pos = geo.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), ctr = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); cc.fromBufferAttribute(pos, i + 2);
    const n = ab.subVectors(b, a).clone().cross(ac.subVectors(cc, a));
    ctr.copy(a).add(b).add(cc);
    if (n.dot(ctr) < 0) {
      pos.setXYZ(i + 1, cc.x, cc.y, cc.z);
      pos.setXYZ(i + 2, b.x, b.y, b.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function fromPoints(pts) {
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
  g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}

function baseGeometry(sides) {
  // toNonIndexed(): facesOf() assumes every 3 consecutive vertices form one
  // triangle. Three's built-in polyhedra are indexed (shared vertices), so
  // read raw they produce garbage triangles — only one face came out right.
  const nonIndexed = (g) => (g.index ? g.toNonIndexed() : g);
  switch (sides) {
    case 4: return nonIndexed(new THREE.TetrahedronGeometry(1.15));
    case 6: return nonIndexed(new THREE.BoxGeometry(1.12, 1.12, 1.12));
    case 8: return nonIndexed(new THREE.OctahedronGeometry(1.05));
    case 10: return trapezohedron(5, 1, 1);
    case 12: return nonIndexed(new THREE.DodecahedronGeometry(1));
    default: return nonIndexed(new THREE.IcosahedronGeometry(1));
  }
}

// Cluster coplanar triangles into logical faces, with centroid + outward normal.
function facesOf(geo) {
  const pos = geo.attributes.position;
  const faces = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const n = ab.subVectors(b, a).clone().cross(ac.subVectors(c, a)).normalize();
    let f = faces.find((f) => f.n.dot(n) > 0.996);
    if (!f) { f = { n: n.clone(), pts: [] }; faces.push(f); }
    f.pts.push(a.clone(), b.clone(), c.clone());
  }
  for (const f of faces) {
    // Unique corners only: a quad face is two triangles sharing a diagonal, so
    // the raw triangle points double-count two corners.
    const uniq = [];
    for (const p of f.pts) {
      if (!uniq.some((q) => q.distanceToSquared(p) < 1e-8)) uniq.push(p);
    }
    const avg = new THREE.Vector3();
    uniq.forEach((p) => avg.add(p));
    avg.multiplyScalar(1 / uniq.length);
    if (f.n.dot(avg) < 0) f.n.negate(); // solids are convex and origin-centred

    // Order the corners cyclically in the face plane. Triangle-soup order is
    // not polygon order (a box quad comes out a,b,d,c), and every measurement
    // below assumes a simple polygon.
    const e1 = uniq[0].clone().sub(avg).addScaledVector(f.n, -uniq[0].clone().sub(avg).dot(f.n)).normalize();
    const e2 = f.n.clone().cross(e1).normalize();
    const poly = uniq.slice().sort((p, q) => {
      const dp = p.clone().sub(avg), dq = q.clone().sub(avg);
      return Math.atan2(dp.dot(e2), dp.dot(e1)) - Math.atan2(dq.dot(e2), dq.dot(e1));
    });

    // Area-weighted centroid. For a triangle or a regular polygon this equals
    // the vertex average; for a kite (every d10 face) the average sits well
    // off toward the apex, which is what threw the d10 and d100 numerals.
    let area = 0;
    const ctr = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (let i = 1; i < poly.length - 1; i++) {
      const A = poly[0], B = poly[i], C = poly[i + 1];
      const w = tmp.subVectors(B, A).clone().cross(new THREE.Vector3().subVectors(C, A)).length() / 2;
      area += w;
      ctr.addScaledVector(A.clone().add(B).add(C).multiplyScalar(1 / 3), w);
    }
    ctr.multiplyScalar(1 / area);
    f.center = ctr;

    // Largest square that fits: inradius measured from the true centroid.
    let inr = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const ed = q.clone().sub(p);
      const t = Math.max(0, Math.min(1, ctr.clone().sub(p).dot(ed) / ed.dot(ed)));
      inr = Math.min(inr, ctr.distanceTo(p.clone().addScaledVector(ed, t)));
    }
    f.fit = inr * Math.SQRT2;

    // In-plane "up" derived from the face itself, so glyph roll is a property
    // of the face rather than of world space. On a kite that is the symmetry
    // axis (through the corner furthest from the centre); on a square it is an
    // edge normal, which keeps d6 pip grids square to the face.
    let up = null;
    if (poly.length === 4) {
      const d = poly.map((p) => p.distanceTo(ctr));
      const hi = d.indexOf(Math.max(...d)), lo = Math.min(...d);
      up = (Math.max(...d) - lo) / Math.max(...d) > 0.05
        ? poly[hi].clone().sub(ctr)
        : poly[0].clone().add(poly[1]).multiplyScalar(0.5).sub(ctr);
      up.addScaledVector(f.n, -up.dot(f.n));
      if (up.lengthSq() > 1e-9) up.normalize(); else up = null;
    }
    f.up = up;
  }
  return faces;
}

// 1..n with opposite faces summing to n+1 where an antipode exists.
function numberFaces(faces) {
  const n = faces.length;
  const val = new Array(n).fill(0);
  const used = new Set();
  for (let i = 0; i < n; i++) {
    if (val[i]) continue;
    let v = 1; while (used.has(v)) v++;
    val[i] = v; used.add(v);
    const j = faces.findIndex((f, k) => !val[k] && f.n.dot(faces[i].n) < -0.99);
    if (j >= 0) { const w = n + 1 - v; if (!used.has(w)) { val[j] = w; used.add(w); } }
  }
  faces.forEach((f, i) => { f.value = val[i]; });
  return faces;
}

/* ---------- face art ---------- */

const texCache = new Map();
const S = 128;

function newFaceCanvas() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  return cv;
}

function finish(cv, key) {
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function glyphTexture(text, fg) {
  const key = `t|${text}|${fg}`;
  if (texCache.has(key)) return texCache.get(key);
  const cv = newFaceCanvas();
  const ctx = cv.getContext("2d");
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = text.length > 2 ? 54 : text.length > 1 ? 70 : 88;
  ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(text, S / 2, S / 2 + 4);
  if (text === "6" || text === "9") {
    ctx.fillRect(S / 2 - 22, S / 2 + size * 0.42, 44, 6);
  }
  return finish(cv, key);
}

const PIP_LAYOUT = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.24, 0.24], [0.5, 0.5], [0.76, 0.76]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

function pipTexture(value, fg) {
  const key = `p|${value}|${fg}`;
  if (texCache.has(key)) return texCache.get(key);
  const cv = newFaceCanvas();
  const ctx = cv.getContext("2d");
  ctx.fillStyle = fg;
  const r = value >= 6 ? 11 : 13;
  for (const [x, y] of PIP_LAYOUT[value] || []) {
    ctx.beginPath();
    ctx.arc(x * S, y * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(cv, key);
}

/* ---------- visual styles ---------- */

export const STYLES = {
  felt: {
    label: "Felt & Bone",
    bg: "#14161c",
    floor: "#221f2a",
    accent: "#5b8def",
    shadows: true,
    bounce: 0.42,
    tumble: 1150,
    body: () => new THREE.MeshStandardMaterial({ color: "#efe7d6", roughness: 0.42, metalness: 0.05 }),
    bodyStress: () => new THREE.MeshStandardMaterial({ color: "#e0603f", roughness: 0.4, metalness: 0.05 }),
    glyph: "#1b1a1e",
    glyphStress: "#2a0f08",
    edges: null,
    lights: (scene) => {
      scene.add(new THREE.HemisphereLight("#cdd6ff", "#2a2130", 0.55));
      const key = new THREE.DirectionalLight("#fff3e0", 2.1);
      key.position.set(2.6, 6, 3.2);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1; key.shadow.camera.far = 18;
      key.shadow.camera.left = -6; key.shadow.camera.right = 6;
      key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
      scene.add(key);
      const fill = new THREE.DirectionalLight("#8fa8ff", 0.5);
      fill.position.set(-3, 2.5, -2);
      scene.add(fill);
    },
  },
  terminal: {
    label: "Cold Storage",
    bg: "#000603",
    floor: "#03120a",
    accent: "#33ff7a",
    shadows: false,
    bounce: 0.08,
    tumble: 820,
    grid: "#145c37",
    body: () => new THREE.MeshBasicMaterial({ color: "#02170c" }),
    bodyStress: () => new THREE.MeshBasicMaterial({ color: "#200604" }),
    glyph: "#7dffb3",
    glyphStress: "#ff8f7a",
    edges: "#33ff7a",
    edgesStress: "#ff5d47",
    lights: (scene) => { scene.add(new THREE.AmbientLight("#ffffff", 1)); },
  },
  neon: {
    label: "Neon Rain",
    bg: "#080a11",
    floor: "#0c0f18",
    accent: "#ffb257",
    shadows: true,
    bounce: 0.3,
    tumble: 1450,
    floorMetal: true,
    body: () => new THREE.MeshStandardMaterial({ color: "#141a26", roughness: 0.12, metalness: 0.75 }),
    bodyStress: () => new THREE.MeshStandardMaterial({ color: "#2a1420", roughness: 0.12, metalness: 0.75 }),
    glyph: "#ffe9c9",
    glyphStress: "#ffb9a8",
    edges: null,
    lights: (scene) => {
      scene.add(new THREE.AmbientLight("#3a4a6a", 0.5));
      const warm = new THREE.SpotLight("#ffa53d", 90, 16, 0.7, 0.6);
      warm.position.set(4, 5.5, 2.5);
      warm.castShadow = true;
      warm.shadow.mapSize.set(1024, 1024);
      scene.add(warm);
      const cool = new THREE.SpotLight("#3fd0ff", 60, 16, 0.8, 0.7);
      cool.position.set(-4.5, 4, -2);
      scene.add(cool);
      const rim = new THREE.DirectionalLight("#7f5cff", 0.6);
      rim.position.set(0, 1.5, -5);
      scene.add(rim);
    },
  },
};

/* ---------- percentile expansion ---------- */

// A d100 result becomes two physical d10s: a tens die reading 00–90 and a
// units die reading 0–9, so 90 + 0 shows as 90 and 00 + 0 as 100.
export function expandSpecs(specs) {
  const out = [];
  for (const s of specs) {
    if (s.sides !== 100) { out.push(s); continue; }
    const v = Math.min(100, Math.max(1, s.value));
    const tensDigit = Math.floor(v / 10) % 10;
    const unitsDigit = v % 10;
    out.push({ sides: 10, value: tensDigit === 0 ? 10 : tensDigit, variant: s.variant, kind: "tens" });
    out.push({ sides: 10, value: unitsDigit === 0 ? 10 : unitsDigit, variant: s.variant, kind: "units" });
  }
  return out;
}

function faceLabel(spec, faceValue) {
  if (spec.kind === "tens") return faceValue === 10 ? "00" : String(faceValue * 10);
  if (spec.kind === "units") return faceValue === 10 ? "0" : String(faceValue);
  return String(faceValue);
}

/* ---------- stage ---------- */

export function createDiceStage(canvas, opts = {}) {
  let style = STYLES[opts.style] || STYLES.felt;
  let quality = opts.quality || "high";
  const onSettled = opts.onSettled || (() => {});

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", alpha: false });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 4.6, 5.1);
  camera.lookAt(0, 0.2, 0);

  const shapeCache = new Map();
  function shapeFor(sides) {
    if (!shapeCache.has(sides)) {
      const geo = baseGeometry(sides);
      geo.scale(DIE_R, DIE_R, DIE_R);
      shapeCache.set(sides, { geo, faces: numberFaces(facesOf(geo)) });
    }
    return shapeCache.get(sides);
  }

  let world = new THREE.Group();
  let dice = [];
  let raf = null;
  let t0 = 0;
  let settledFired = false;

  function buildWorld() {
    scene.clear();
    world = new THREE.Group();
    scene.add(world);
    scene.background = new THREE.Color(style.bg);
    renderer.shadowMap.enabled = !!style.shadows && quality !== "low";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    style.lights(scene);

    const floorMat = style.floorMetal
      ? new THREE.MeshStandardMaterial({ color: style.floor, roughness: 0.18, metalness: 0.85 })
      : new THREE.MeshStandardMaterial({ color: style.floor, roughness: 0.95, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = !!style.shadows;
    world.add(floor);

    if (style.grid) {
      const grid = new THREE.GridHelper(24, 24, style.grid, style.grid);
      grid.position.y = 0.002;
      grid.material.opacity = 0.5;
      grid.material.transparent = true;
      world.add(grid);
    }
  }

  function makeDie(spec) {
    const { geo, faces } = shapeFor(spec.sides);
    const stress = spec.variant === "stress";
    const ink = stress ? style.glyphStress || style.glyph : style.glyph;
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(geo, stress ? style.bodyStress() : style.body());
    mesh.castShadow = !!style.shadows;
    grp.add(mesh);

    if (style.edges) {
      grp.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 1),
        new THREE.LineBasicMaterial({ color: stress ? style.edgesStress : style.edges })
      ));
    }

    const pips = spec.sides === 6;
    for (const f of faces) {
      const sz = f.up ? f.fit * (QUAD_ART[spec.sides] || 0.78) : (FACE_ART[spec.sides] || 0.4);
      // FrontSide, no slope-scaled polygon offset: with DoubleSide and a -4
      // factor the near-edge-on planes on the far side of the die were pulled
      // clear through the body and drawn over the front face.
      const mat = new THREE.MeshBasicMaterial({
        map: pips ? pipTexture(f.value, ink) : glyphTexture(faceLabel(spec, f.value), ink),
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: -2,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), mat);
      plane.renderOrder = 1;
      // Explicit orthonormal basis with the face normal as +Z. setFromUnitVectors
      // and lookAt both pick an arbitrary roll (or degenerate) on axis-aligned
      // faces, which is why the d6's top and bottom came out wrong.
      const zAxis = f.n.clone();
      let xAxis, yAxis;
      if (f.up) {
        yAxis = f.up.clone();
        xAxis = yAxis.clone().cross(zAxis).normalize();
        yAxis = zAxis.clone().cross(xAxis).normalize();
      } else {
        xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis);
        if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0);
        xAxis.normalize();
        yAxis = zAxis.clone().cross(xAxis).normalize();
      }
      plane.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
      plane.position.copy(f.center).addScaledVector(f.n, 0.014);
      grp.add(plane);
    }

    const target = faces.find((f) => f.value === spec.value) || faces[0];
    return { grp, targetNormal: target.n.clone() };
  }

  function roll(rawSpecs) {
    const specs = expandSpecs(rawSpecs);
    cancelAnimationFrame(raf);
    dice.forEach((d) => world.remove(d.grp));
    dice = [];
    settledFired = false;

    const n = specs.length;
    const cols = Math.min(n, n > 12 ? 7 : n > 6 ? 5 : n);
    const rows = Math.ceil(n / cols);
    specs.forEach((spec, i) => {
      const { grp, targetNormal } = makeDie(spec);
      const col = i % cols, row = Math.floor(i / cols);
      const rest = new THREE.Vector3(
        cols === 1 ? 0 : (col / (cols - 1) - 0.5) * TRAY_X * 1.7,
        DIE_R * 0.92,
        rows === 1 ? 0 : (row / (rows - 1) - 0.5) * TRAY_Z * 1.5
      );
      grp.position.set(-TRAY_X - 0.6 + Math.random() * 0.7, 3.4 + Math.random() * 1.6, (Math.random() - 0.5) * TRAY_Z);
      grp.quaternion.random();
      world.add(grp);

      const yaw = new THREE.Quaternion().setFromAxisAngle(UP, Math.random() * Math.PI * 2);
      const align = new THREE.Quaternion().setFromUnitVectors(targetNormal, UP);
      dice.push({
        grp,
        rest,
        spec,
        vel: new THREE.Vector3(3.4 + Math.random() * 2.2, 0.4, (Math.random() - 0.5) * 2.4),
        ang: new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22),
        goal: yaw.multiply(align),
        startQuat: null,
        startPos: null,
        tumbleEnd: style.tumble + i * 45,
      });
    });

    t0 = performance.now();
    loop.last = null;
    loop();
  }

  const G = 16;
  const SEP = DIE_R * 1.75;
  const tmp = new THREE.Vector3();

  function separate() {
    for (let i = 0; i < dice.length; i++) {
      for (let j = i + 1; j < dice.length; j++) {
        const a = dice[i].grp.position, b = dice[j].grp.position;
        tmp.subVectors(b, a);
        const dist = tmp.length();
        if (dist > SEP || dist === 0) continue;
        tmp.multiplyScalar((SEP - dist) / dist / 2);
        a.sub(tmp); b.add(tmp);
        dice[i].vel.addScaledVector(tmp, -6);
        dice[j].vel.addScaledVector(tmp, 6);
        dice[i].ang.multiplyScalar(0.94);
        dice[j].ang.multiplyScalar(0.94);
      }
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const elapsed = now - t0;
    const dt = Math.min(0.032, (now - (loop.last || now)) / 1000);
    loop.last = now;

    let allDone = dice.length > 0;
    let anyTumbling = false;
    for (const d of dice) {
      if (elapsed < d.tumbleEnd) {
        allDone = false;
        anyTumbling = true;
        d.vel.y -= G * dt;
        d.grp.position.addScaledVector(d.vel, dt);
        if (d.grp.position.y < DIE_R) {
          d.grp.position.y = DIE_R;
          d.vel.y = Math.abs(d.vel.y) * style.bounce;
          d.vel.x *= 0.78; d.vel.z *= 0.78;
          d.ang.multiplyScalar(0.72);
        }
        if (Math.abs(d.grp.position.x) > TRAY_X) { d.grp.position.x = Math.sign(d.grp.position.x) * TRAY_X; d.vel.x *= -0.55; }
        if (Math.abs(d.grp.position.z) > TRAY_Z) { d.grp.position.z = Math.sign(d.grp.position.z) * TRAY_Z; d.vel.z *= -0.55; }
        const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(d.ang.x * dt, d.ang.y * dt, d.ang.z * dt));
        d.grp.quaternion.premultiply(spin);
      } else {
        if (!d.startQuat) { d.startQuat = d.grp.quaternion.clone(); d.startPos = d.grp.position.clone(); }
        const k = Math.min(1, (elapsed - d.tumbleEnd) / 420);
        const e = 1 - Math.pow(1 - k, 3);
        d.grp.quaternion.slerpQuaternions(d.startQuat, d.goal, e);
        d.grp.position.lerpVectors(d.startPos, d.rest, e);
        if (k < 1) allDone = false;
      }
    }
    if (anyTumbling) separate();

    renderer.render(scene, camera);

    if (allDone && !settledFired) {
      settledFired = true;
      onSettled();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function idle() {
        raf = requestAnimationFrame(idle);
        renderer.render(scene, camera);
      });
    }
  }

  function resize() {
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 360;
    renderer.setPixelRatio(quality === "low" ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  buildWorld();
  resize();

  return {
    roll,
    resize,
    accent: () => style.accent,
    setStyle(name) {
      style = STYLES[name] || style;
      shapeCache.clear();
      texCache.clear();
      cancelAnimationFrame(raf);
      dice = [];
      buildWorld();
      resize();
    },
    setQuality(q) { quality = q; buildWorld(); resize(); },
    dispose() { cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
