/* Terminus hero scene ‚Äî 3D wireframe intermodal yard on <canvas>.
   World units are meters: X runs down the corridor (receding upper-right on screen),
   Y is up, Z runs across the yard (increasing toward screen-left). */
(function () {
'use strict';

/* ---------------------------------------------------------------- setup */

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const hero = canvas.parentElement;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEBUG = /[?&]debug/.test(location.search);

let W = 0, H = 0, DPR = 1, halfW = 0, halfH = 0, focal = 1;
let bgGrad = null;

/* seeded rng so the yard layout is identical every load */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- camera */

const CAM = {
  x: -43, y: 30, z: -46,
  yaw: 64 * Math.PI / 180,     // rotation about Y; forward = (sin yaw, 0, cos yaw)
  pitch: 13.8 * Math.PI / 180, // down-tilt
  fov: 46 * Math.PI / 180
};
const NEAR = 0.6;
const par = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0 }; // pointer parallax

/* dev handle for live camera tuning from the console */
window.TUNE = {
  CAM,
  set(patch) {
    Object.assign(CAM, patch);
    focal = (H / 2) / Math.tan(CAM.fov / 2);
  },
  get() {
    return { x: CAM.x, y: CAM.y, z: CAM.z, yaw: +(CAM.yaw * 180 / Math.PI).toFixed(2), pitch: +(CAM.pitch * 180 / Math.PI).toFixed(2), fov: +(CAM.fov * 180 / Math.PI).toFixed(1) };
  },
  air() {
    return { active: aircraft.active, t: +aircraft.t.toFixed(1), az: +aircraft.az.toFixed(3), dir: aircraft.dir, pos: aircraft.pos().map(v => +v.toFixed(1)) };
  },
  rail() {
    return rail.list.map(c => ({
      state: c.state, x: +c.x.toFixed(1), v: +c.v.toFixed(2),
      loaded: c.cars.map(car => car.loaded ? 1 : 0).join('')
    }));
  },
  train() {
    return { x: +train.x.toFixed(1), v: +train.v.toFixed(2), gap: +train.gap.toFixed(1) };
  },
  fork() {
    return { z: +forklift.z.toFixed(2), dir: forklift.dir, phase: forklift.phase,
      carry: forklift.carry, lift: +forklift.lift.toFixed(2),
      A: forklift.stacks.A.n, B: forklift.stacks.B.n };
  }
};

let vCY = 1, vSY = 0, vCP = 1, vSP = 0; // view rotation scalars, updated per frame

function computeView(t) {
  const drift = REDUCED ? 0 : Math.sin(t * 0.05) * 0.0022;
  const yaw = CAM.yaw + par.yaw + drift;
  const pitch = CAM.pitch + par.pitch;
  vCY = Math.cos(yaw); vSY = Math.sin(yaw);
  vCP = Math.cos(pitch); vSP = Math.sin(pitch);
}

/* world -> camera space */
function toCam(x, y, z, out) {
  const tx = x - CAM.x, ty = y - CAM.y, tz = z - CAM.z;
  const x1 = tx * vCY - tz * vSY;
  const z1 = tx * vSY + tz * vCY;
  out[0] = x1;
  out[1] = ty * vCP + z1 * vSP;
  out[2] = -ty * vSP + z1 * vCP;
}

const _a = [0, 0, 0], _b = [0, 0, 0];

/* draws one world-space segment into the current path (with near clip) */
function pathSeg(x1, y1, z1, x2, y2, z2) {
  toCam(x1, y1, z1, _a); toCam(x2, y2, z2, _b);
  let ax = _a[0], ay = _a[1], az = _a[2];
  let bx = _b[0], by = _b[1], bz = _b[2];
  if (az < NEAR && bz < NEAR) return;
  if (az < NEAR) {
    const t = (NEAR - az) / (bz - az);
    ax += (bx - ax) * t; ay += (by - ay) * t; az = NEAR;
  } else if (bz < NEAR) {
    const t = (NEAR - bz) / (az - bz);
    bx += (ax - bx) * t; by += (ay - by) * t; bz = NEAR;
  }
  const sax = halfW + ax * focal / az, say = halfH - ay * focal / az;
  const sbx = halfW + bx * focal / bz, sby = halfH - by * focal / bz;
  ctx.moveTo(sax, say);
  ctx.lineTo(sbx, sby);
}

/* project a single world point -> [sx, sy, camZ] or null */
function projPoint(x, y, z) {
  toCam(x, y, z, _a);
  if (_a[2] < NEAR) return null;
  return [halfW + _a[0] * focal / _a[2], halfH - _a[1] * focal / _a[2], _a[2]];
}

function dist(x, y, z) {
  const dx = x - CAM.x, dy = y - CAM.y, dz = z - CAM.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const FOG_NEAR = 60, FOG_FAR = 620, FOG_MIN = 0.14;
function fog(d) {
  if (d <= FOG_NEAR) return 1;
  if (d >= FOG_FAR) return FOG_MIN;
  return 1 - (1 - FOG_MIN) * (d - FOG_NEAR) / (FOG_FAR - FOG_NEAR);
}

/* ---------------------------------------------------------------- styles */

const STYLES = {
  mount:   { c: '150,180,255', a: 0.17, w: 1,    nofog: true },
  mount2:  { c: '140,170,250', a: 0.10, w: 1,    nofog: true },
  mountNear: { c: '158,188,255', a: 0.23, w: 1,  nofog: true },
  grid:    { c: '150,180,255', a: 0.062, w: 1 },
  gridMaj: { c: '155,185,255', a: 0.11, w: 1 },
  road:    { c: '165,190,255', a: 0.20, w: 1 },
  tie:     { c: '150,180,255', a: 0.14, w: 1 },
  rail:    { c: '178,202,255', a: 0.34, w: 1.1 },
  faint:   { c: '150,175,235', a: 0.14, w: 1 },
  dim:     { c: '162,187,242', a: 0.27, w: 1 },
  struct:  { c: '190,209,255', a: 0.5,  w: 1 },
  veh:     { c: '206,221,255', a: 0.72, w: 1.15, glow: true },
  vehDim:  { c: '180,200,250', a: 0.36, w: 1 },
  wheel:   { c: '196,213,253', a: 0.66, w: 1 },
  redDim:  { c: '255,70,70',  a: 0.5,  w: 1 },
  red:     { c: '255,58,58',  a: 0.95, w: 1.45, glow: true }
};
const STYLE_ORDER = ['mount2', 'mount', 'mountNear', 'grid', 'gridMaj', 'road', 'tie', 'rail',
  'faint', 'dim', 'struct', 'veh', 'vehDim', 'wheel', 'redDim', 'red'];

function strokeStyled(style, fogMul) {
  const s = STYLES[style];
  const f = s.nofog ? 1 : fogMul;
  if (s.glow) {
    ctx.lineWidth = 5;
    ctx.globalAlpha = Math.min(1, s.a * 0.18 * f);
    ctx.strokeStyle = 'rgb(' + s.c + ')';
    ctx.stroke();
  }
  ctx.lineWidth = s.w;
  ctx.globalAlpha = Math.min(1, s.a * f);
  ctx.strokeStyle = 'rgb(' + s.c + ')';
  ctx.stroke();
}

/* ---------------------------------------------------------------- geometry helpers */

function seg(a, x1, y1, z1, x2, y2, z2) { a.push(x1, y1, z1, x2, y2, z2); }

function box(a, x0, y0, z0, x1, y1, z1) {
  seg(a, x0, y0, z0, x1, y0, z0); seg(a, x1, y0, z0, x1, y0, z1);
  seg(a, x1, y0, z1, x0, y0, z1); seg(a, x0, y0, z1, x0, y0, z0);
  seg(a, x0, y1, z0, x1, y1, z0); seg(a, x1, y1, z0, x1, y1, z1);
  seg(a, x1, y1, z1, x0, y1, z1); seg(a, x0, y1, z1, x0, y1, z0);
  seg(a, x0, y0, z0, x0, y1, z0); seg(a, x1, y0, z0, x1, y1, z0);
  seg(a, x1, y0, z1, x1, y1, z1); seg(a, x0, y0, z1, x0, y1, z1);
}

function rectZ(a, z, x0, y0, x1, y1) {
  seg(a, x0, y0, z, x1, y0, z); seg(a, x1, y0, z, x1, y1, z);
  seg(a, x1, y1, z, x0, y1, z); seg(a, x0, y1, z, x0, y0, z);
}

function rectX(a, x, z0, y0, z1, y1) {
  seg(a, x, y0, z0, x, y0, z1); seg(a, x, y0, z1, x, y1, z1);
  seg(a, x, y1, z1, x, y1, z0); seg(a, x, y1, z0, x, y0, z0);
}

/* circle in the X-Y plane (a rolling wheel) */
function circleZ(a, cx, cy, cz, r, n) {
  n = n || 10;
  let px = cx + r, py = cy;
  for (let i = 1; i <= n; i++) {
    const t = i / n * Math.PI * 2;
    const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
    seg(a, px, py, cz, x, y, cz);
    px = x; py = y;
  }
}

/* arc in the X-Y plane (wheel fenders) */
function arcZ(a, cx, cy, cz, r, n, a0, a1) {
  let px = cx + r * Math.cos(a0), py = cy + r * Math.sin(a0);
  for (let i = 1; i <= n; i++) {
    const t = a0 + (a1 - a0) * i / n;
    const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
    seg(a, px, py, cz, x, y, cz);
    px = x; py = y;
  }
}

/* horizontal circle in the X-Z plane (roof fans) */
function circleY(a, cx, cy, cz, r, n) {
  n = n || 10;
  let px = cx + r, pz = cz;
  for (let i = 1; i <= n; i++) {
    const t = i / n * Math.PI * 2;
    const x = cx + r * Math.cos(t), z = cz + r * Math.sin(t);
    seg(a, px, cy, pz, x, cy, z);
    px = x; pz = z;
  }
}

/* circle in the Z-Y plane (brake wheels on car ends) */
function circleX(a, cx, cy, cz, r, n) {
  n = n || 8;
  let pz = cz + r, py = cy;
  for (let i = 1; i <= n; i++) {
    const t = i / n * Math.PI * 2;
    const z = cz + r * Math.cos(t), y = cy + r * Math.sin(t);
    seg(a, cx, py, pz, cx, y, z);
    pz = z; py = y;
  }
}

/* wheel with rim + hub, plus an inboard rim and tread ties so the tire reads
   as a cylinder (spokes are emitted dynamically); wf = width as a fraction of
   the radius ‚Äî default suits rubber tires, rail wheels pass a slimmer value */
function wheelPro(det, x, y, z, r, wf) {
  circleZ(det, x, y, z, r, 10);
  circleZ(det, x, y, z, r * 0.42, 7);
  const zi = z - Math.sign(z || 1) * r * (wf || 0.5);
  circleZ(det, x, y, zi, r, 8);
  for (let i = 0; i < 4; i++) {
    const t = i / 4 * Math.PI * 2 + 0.55;
    const wx = x + r * Math.cos(t), wy = y + r * Math.sin(t);
    seg(det, wx, wy, z, wx, wy, zi);
  }
}

/* container box with corrugation ribs, side rails, corner posts and (level 2)
   door-end lock rods; level: 0 sparse, 1 standard, 2 full detail */
function container(main, det, x0, y0, z0, L, H, Wd, level) {
  if (level === undefined) level = 1;
  box(main, x0, y0, z0, x0 + L, y0 + H, z0 + Wd);
  const step = level >= 2 ? 1.15 : level === 1 ? 1.5 : 2.1;
  for (let x = x0 + 0.75; x < x0 + L - 0.6; x += step) {
    seg(det, x, y0 + 0.14, z0, x, y0 + H - 0.14, z0);
    seg(det, x, y0 + 0.14, z0 + Wd, x, y0 + H - 0.14, z0 + Wd);
  }
  if (level >= 1) {
    /* top/bottom side rails + corner posts */
    for (const zz of [z0, z0 + Wd]) {
      seg(det, x0 + 0.2, y0 + 0.26, zz, x0 + L - 0.2, y0 + 0.26, zz);
      seg(det, x0 + 0.2, y0 + H - 0.26, zz, x0 + L - 0.2, y0 + H - 0.26, zz);
      seg(det, x0 + 0.18, y0, zz, x0 + 0.18, y0 + H, zz);
      seg(det, x0 + L - 0.18, y0, zz, x0 + L - 0.18, y0 + H, zz);
    }
  }
  if (level >= 2) {
    /* door end (-X): lock rods + handle */
    for (const fr of [0.18, 0.38, 0.62, 0.82]) {
      seg(det, x0, y0 + 0.16, z0 + Wd * fr, x0, y0 + H - 0.16, z0 + Wd * fr);
    }
    seg(det, x0, y0 + H * 0.42, z0 + Wd * 0.12, x0, y0 + H * 0.42, z0 + Wd * 0.44);
  }
}

/* ---------------------------------------------------------------- static world */

const chunks = {}; // styleKey -> [{arr, fog}]
STYLE_ORDER.forEach(k => chunks[k] = []);

function addChunk(style, arr, rx, ry, rz) {
  if (!arr.length) return;
  chunks[style].push({ arr: new Float32Array(arr), fog: fog(dist(rx, ry, rz)) });
}

const glowsStatic = []; // {x,y,z,r,kind:'white'|'red',i, blink?, phase}
const groundDots = [];  // faint static red markers

/* yard lanes (z): truck road -13, main train track -6, crane cut track 4,
   staging pad 12; the crane portal spans z -2..18 at x = 26 */
const CRANE = { x: 26, z0: -2, z1: 18, top: 17.4, girderY: 15.5, trolleyY: 14.55 };
const TRACK_MAIN = -6, TRACK_CUT = 4, PAD_Z = 12, ROAD_Z = -13, ROAD2_Z = -34, ROAD3_Z = -41;
const rng = mulberry32(7);

function buildWorld() {
  /* --- ground grid, tiled for distance fog --- */
  for (let tx = -80; tx < 360; tx += 40) {
    for (let tz = -70; tz < 150; tz += 40) {
      const minor = [], major = [];
      for (let x = tx; x < tx + 40; x += 4) {
        (x % 20 === 0 ? major : minor).push(x, 0, tz, x, 0, tz + 40);
      }
      for (let z = tz; z < tz + 40; z += 4) {
        (z % 20 === 0 ? major : minor).push(tx, 0, z, tx + 40, 0, z);
      }
      addChunk('grid', minor, tx + 20, 0, tz + 20);
      addChunk('gridMaj', major, tx + 20, 0, tz + 20);
    }
  }

  /* --- rail tracks --- */
  for (const z of [TRACK_MAIN, TRACK_CUT]) {
    for (let x = -80; x < 380; x += 40) {
      const r = [], t = [];
      seg(r, x, 0.05, z - 0.75, x + 40, 0.05, z - 0.75);
      seg(r, x, 0.05, z + 0.75, x + 40, 0.05, z + 0.75);
      for (let tx = x; tx < x + 40; tx += 2.8) seg(t, tx, 0.02, z - 1.15, tx, 0.02, z + 1.15);
      addChunk('rail', r, x + 20, 0, z);
      addChunk('tie', t, x + 20, 0, z);
    }
  }

  /* --- truck roads (gate road mid-yard, exit lane + inbound lane near the viewer) --- */
  for (const rz of [ROAD_Z, ROAD2_Z, ROAD3_Z]) {
    for (let x = -80; x < 380; x += 40) {
      const r = [];
      seg(r, x, 0.02, rz + 2.5, x + 40, 0.02, rz + 2.5);
      seg(r, x, 0.02, rz - 2.5, x + 40, 0.02, rz - 2.5);
      for (let dx = x; dx < x + 40; dx += 6.2) seg(r, dx, 0.02, rz, dx + 2.6, 0.02, rz);
      addChunk('road', r, x + 20, 0, rz);
    }
  }
  /* stop bar + gate hut */
  {
    const g = [], hut = [];
    seg(g, 132, 0.03, ROAD_Z + 2.5, 132, 0.03, ROAD_Z - 2.5);
    addChunk('road', g, 132, 0, ROAD_Z);
    box(hut, 133.2, 0, -19.6, 136.2, 3, -16.6);
    rectX(hut, 133.18, -18.9, 1.2, -17.3, 2.4);
    seg(hut, 133.0, 3, -19.8, 136.4, 3, -16.4);
    addChunk('struct', hut, 134.7, 1.5, -18);
    glowsStatic.push({ x: 133.15, y: 2.7, z: -18.1, r: 0.3, kind: 'white', i: 0.55, phase: 2.1 });
    lightPools.push({ x: 132.6, z: -17.5, r: 3.6, i: fog(dist(132.6, 0, -17.5)) * 0.7 });
  }

  /* --- crane runway guides --- */
  {
    const r = [];
    for (const z of [CRANE.z0, CRANE.z1]) {
      seg(r, CRANE.x - 45, 0.02, z - 0.9, CRANE.x + 45, 0.02, z - 0.9);
      seg(r, CRANE.x - 45, 0.02, z + 0.9, CRANE.x + 45, 0.02, z + 0.9);
    }
    addChunk('faint', r, CRANE.x, 0, 8);
  }

  /* --- mountains: four fractal ridge layers built across the view azimuth,
         with facet hatching, slope ticks, a contour echo line, and beacon towers --- */
  {
    const layers = [
      { D: 1300, amp: 112, ph: 3.9, style: 'mount2', hatch: false, bud: 0 },
      { D: 950, amp: 68, ph: 1.7, style: 'mount', hatch: true, bud: 1 },
      { D: 760, amp: 40, ph: 5.2, style: 'mountNear', hatch: true, echo: true, bud: 2 },
      { D: 620, amp: 22, ph: 8.1, style: 'mountNear', hatch: false, bud: 0 }
    ];
    let beaconTotal = 0;
    for (const L of layers) {
      const m = [], facets = [];
      const pts = [];
      for (let az = CAM.yaw - 0.85; az <= CAM.yaw + 0.85; az += 0.011) {
        const k = az * 26;
        const h = Math.max(2.5, L.amp * (0.48
          + 0.3 * Math.sin(k * 0.41 + L.ph)
          + 0.2 * Math.sin(k * 0.83 + L.ph * 2.1)
          + 0.12 * Math.sin(k * 1.7 + L.ph * 0.7)
          + 0.07 * Math.sin(k * 3.3 + L.ph * 1.9)
          + 0.045 * Math.sin(k * 5.1 + L.ph * 2.7)));
        pts.push([CAM.x + Math.sin(az) * L.D, h, CAM.z + Math.cos(az) * L.D]);
      }
      for (let i = 1; i < pts.length; i++) {
        seg(m, pts[i - 1][0], pts[i - 1][1], pts[i - 1][2], pts[i][0], pts[i][1], pts[i][2]);
      }
      /* topographic echo line tracing under the crest */
      if (L.echo) {
        for (let i = 1; i < pts.length; i++) {
          seg(facets, pts[i - 1][0], pts[i - 1][1] * 0.86, pts[i - 1][2],
            pts[i][0], pts[i][1] * 0.86, pts[i][2]);
        }
      }
      if (L.hatch) {
        let layerBeacons = 0, lastPeak = -9;
        for (let i = 3; i < pts.length - 3; i++) {
          const p = pts[i];
          /* short slope ticks give the faces a hatched texture */
          if (i % 5 === 0) {
            seg(facets, p[0], p[1], p[2], pts[i + 1][0], pts[i + 1][1] * 0.78, pts[i + 1][2]);
          }
          if (p[1] > pts[i - 1][1] && p[1] > pts[i + 1][1]
            && p[1] > L.amp * 0.42 && i - lastPeak >= 6) {
            lastPeak = i;
            /* descending facet strokes from each significant peak */
            seg(facets, p[0], p[1], p[2], pts[i - 3][0], pts[i - 3][1] * 0.42, pts[i - 3][2]);
            seg(facets, p[0], p[1], p[2], pts[i + 3][0], pts[i + 3][1] * 0.42, pts[i + 3][2]);
            /* shoulder line under the crest */
            seg(facets, pts[i - 2][0], pts[i - 2][1] * 0.72, pts[i - 2][2],
              pts[i + 2][0], pts[i + 2][1] * 0.72, pts[i + 2][2]);
            /* comm towers with blinking beacons on the tallest peaks */
            if (p[1] > L.amp * 0.8 && layerBeacons < L.bud) {
              seg(m, p[0], p[1], p[2], p[0], p[1] + L.D * 0.014, p[2]);
              seg(facets, p[0] - L.D * 0.004, p[1], p[2], p[0], p[1] + L.D * 0.009, p[2]);
              seg(facets, p[0] + L.D * 0.004, p[1], p[2], p[0], p[1] + L.D * 0.009, p[2]);
              glowsStatic.push({
                x: p[0], y: p[1] + L.D * 0.014, z: p[2], r: L.D * 0.004,
                kind: 'red', i: 0.55, blink: 3.4, phase: beaconTotal * 1.6
              });
              layerBeacons++;
              beaconTotal++;
            }
          }
        }
      }
      const cx = CAM.x + Math.sin(CAM.yaw) * L.D, cz = CAM.z + Math.cos(CAM.yaw) * L.D;
      addChunk(L.style, m, cx, 30, cz);
      addChunk('mount2', facets, cx, 20, cz);
    }
  }

  /* --- warehouse on the left (+Z) side of the corridor, clear of both truck roads;
         the rail lines run along its dock face like a rail-served shed --- */
  {
    const main = [], det = [], red = [];
    box(main, 128, 0, 17, 154, 9.6, 117);
    for (let z = 21; z < 115; z += 7.3) seg(det, 128, 0, z, 128, 6.9, z);      // cladding ribs
    seg(det, 128, 9.15, 17, 128, 9.15, 117);                                   // parapet
    seg(det, 128, 7.3, 18, 128, 7.3, 116);                                     // clerestory band
    seg(det, 128, 8.5, 18, 128, 8.5, 116);
    for (let z = 20; z < 116; z += 3.65) seg(det, 128, 7.3, z, 128, 8.5, z);   // mullions
    for (let z = 22; z < 113; z += 9.7) {                                      // dock doors
      rectX(main, 127.94, z, 0, z + 3.7, 4.5);
      for (const dy of [1.1, 2.2, 3.3]) seg(det, 127.94, dy, z, 127.94, dy, z + 3.7); // roll-up slats
    }
    seg(det, 127.5, 5.15, 21, 127.5, 5.15, 113);                               // dock canopy
    for (let z = 22; z < 113; z += 9.7) {
      seg(det, 127.5, 5.15, z + 1.85, 128, 5.85, z + 1.85);
    }
    seg(det, 124, 0.02, 19, 124, 0.02, 115);                                   // dock apron
    for (let i = 0; i < 8; i++) {                                              // roof units
      const z = 23 + i * 11, x = 134 + (i % 3) * 6;
      box(det, x, 9.6, z, x + 2.3, 11, z + 3.1);
    }
    for (const pz of [41, 85]) {                                               // roof vent pipes
      seg(det, 137, 9.6, pz, 137, 11.6, pz);
      circleY(det, 137, 11.6, pz, 0.32, 6);
    }
    rectX(red, 127.88, 105, 6.8, 107.6, 9.0);                                  // red logo mark
    seg(red, 127.88, 6.25, 105.2, 127.88, 6.25, 107.4);                        // logo underline
    addChunk('struct', main, 141, 5, 67);
    addChunk('dim', det, 141, 5, 67);
    addChunk('red', red, 128, 8, 106);
    glowsStatic.push({ x: 127.8, y: 7.9, z: 106.3, r: 0.5, kind: 'red', i: 0.5, blink: 4.5, phase: 1.2 });

    /* dim annex warehouse tucked behind it */
    const annex = [];
    box(annex, 172, 0, 24, 200, 8, 96);
    for (let z = 28; z < 92; z += 9) seg(annex, 172, 0, z, 172, 8, z);
    addChunk('faint', annex, 186, 4, 60);

    /* faint depot silhouette far right, beyond the exit lane */
    const depot = [];
    box(depot, 210, 0, -72, 292, 7, -50);
    for (let x = 216; x < 288; x += 12) seg(depot, x, 0, -50, x, 7, -50);
    addChunk('faint', depot, 250, 3, -60);
  }

  /* --- container stacks --- */
  function stackRun(xStart, z, n, hMax, styleMain, styleDet) {
    const main = [], det = [];
    let x = xStart;
    for (let i = 0; i < n; i++) {
      const tiers = 1 + (rng() < 0.45 ? 1 : 0) * (hMax > 1 ? 1 : 0);
      for (let t = 0; t < tiers; t++) container(main, det, x, t * 2.65, z, 12.2, 2.6, 2.55);
      if (rng() < 0.16) {
        groundDots.push({ x: x + 12.2, y: tiers * 2.65 + 0.05, z: z, small: true });
      }
      x += 12.65;
    }
    addChunk(styleMain, main, xStart + n * 6.3, 2, z);
    addChunk(styleDet, det, xStart + n * 6.3, 2, z);
    return x;
  }
  /* left block (screen-left of the crane, +Z side), leaving the tractor aisle x 52..68 clear */
  for (const z of [24, 30, 36, 42]) {
    let x = 30 + rng() * 6;
    while (x < 105) {
      const n = 1 + Math.floor(rng() * 3);
      const runEnd = x + n * 12.65;
      if (x < 68 && runEnd > 50) { x = 70; continue; }
      x = stackRun(x, z, n, 2, 'struct', 'dim') + (7 + rng() * 14);
    }
  }
  /* right rows (viewer side of the road, -Z) */
  for (const z of [-21, -27]) {
    let x = 62 + rng() * 12;
    while (x < 165) {
      const n = 1 + Math.floor(rng() * 2);
      x = stackRun(x, z, n, 2, 'struct', 'dim') + (10 + rng() * 20);
    }
  }
  /* faint far row near the warehouse */
  for (let x = 60; x < 120; x += 27 + rng() * 9) stackRun(x, 52, 1, 1, 'dim', 'faint');

  /* --- light poles --- */
  function pole(x, z, h, heads) {
    const m = [], d = [];
    seg(m, x, 0, z, x, h, z);
    box(d, x - 0.32, 0, z - 0.32, x + 0.32, 0.55, z + 0.32);
    seg(d, x - 1.5, h - 0.45, z, x + 1.5, h - 0.45, z);
    seg(d, x - 1.1, h - 0.45, z, x, h - 1.4, z);
    seg(d, x + 1.1, h - 0.45, z, x, h - 1.4, z);
    const hx = heads === 3 ? [-1.25, 0, 1.25] : [-1.25, 1.25];
    for (const off of hx) {
      box(d, x + off - 0.28, h - 0.72, z - 0.18, x + off + 0.28, h - 0.45, z + 0.18);
      glowsStatic.push({ x: x + off, y: h - 0.6, z: z, r: 0.55, kind: 'white', i: 0.75, phase: rng() * 6 });
    }
    lightPools.push({ x, z, r: h * 0.55, i: fog(dist(x, 0, z)) });
    addChunk('struct', m, x, h / 2, z);
    addChunk('dim', d, x, h, z);
  }
  pole(24, 44, 20, 2);     // tall foreground-left mast
  pole(60, -20, 12, 2);
  pole(120, -18, 12, 2);
  pole(185, -14, 12, 2);
  pole(100, 40, 14, 2);
  pole(150, -20, 12, 2);
  pole(250, 8, 13, 3);

  /* --- forklift parked by the left stacks --- */
  {
    const f = [], d = [];
    const fx = 32, fz = 20;
    box(f, fx, 0.4, fz, fx + 2.7, 1.6, fz + 1.8);                    // body
    seg(d, fx + 0.15, 1.6, fz + 0.15, fx + 0.15, 1.6, fz + 1.65);    // counterweight seam
    /* overhead guard: 4 posts + top frame */
    for (const gp of [[0.5, 0.25], [0.5, 1.55], [2.3, 0.25], [2.3, 1.55]]) {
      seg(d, fx + gp[0], 1.6, fz + gp[1], fx + gp[0], 2.95, fz + gp[1]);
    }
    seg(d, fx + 0.5, 2.95, fz + 0.25, fx + 2.3, 2.95, fz + 0.25);
    seg(d, fx + 0.5, 2.95, fz + 1.55, fx + 2.3, 2.95, fz + 1.55);
    seg(d, fx + 0.5, 2.95, fz + 0.25, fx + 0.5, 2.95, fz + 1.55);
    seg(d, fx + 2.3, 2.95, fz + 0.25, fx + 2.3, 2.95, fz + 1.55);
    /* mast with crossbars + forks */
    seg(f, fx + 2.7, 0.3, fz + 0.2, fx + 2.7, 3.3, fz + 0.2);
    seg(f, fx + 2.7, 0.3, fz + 1.6, fx + 2.7, 3.3, fz + 1.6);
    for (const my of [1.1, 2.1, 3.3]) seg(d, fx + 2.7, my, fz + 0.2, fx + 2.7, my, fz + 1.6);
    seg(f, fx + 2.78, 0.32, fz + 0.35, fx + 3.95, 0.32, fz + 0.35);
    seg(f, fx + 2.78, 0.32, fz + 1.45, fx + 3.95, 0.32, fz + 1.45);
    seg(d, fx + 2.78, 0.32, fz + 0.35, fx + 2.78, 0.95, fz + 0.35);  // fork heels
    seg(d, fx + 2.78, 0.32, fz + 1.45, fx + 2.78, 0.95, fz + 1.45);
    const fw = [];
    wheelPro(fw, fx + 0.7, 0.42, fz, 0.42);
    wheelPro(fw, fx + 2.1, 0.42, fz, 0.42);
    wheelPro(fw, fx + 0.7, 0.42, fz + 1.8, 0.42);
    wheelPro(fw, fx + 2.1, 0.42, fz + 1.8, 0.42);
    addChunk('struct', f, fx, 1, fz);
    addChunk('dim', d, fx, 1, fz);
    addChunk('wheel', fw, fx, 0.5, fz);
  }

  /* --- parked trailers nosed up to the warehouse docks --- */
  for (const pz of [23, 41]) {
    const t = [], d = [];
    box(t, 113, 1.35, pz, 127.6, 4.2, pz + 2.6);
    for (let x = 114.2, e = 126.6; x < e; x += 1.55) seg(d, x, 1.35, pz, x, 4.2, pz);
    seg(d, 115.5, 0, pz + 0.5, 115.5, 1.35, pz + 0.5);
    seg(d, 115.5, 0, pz + 2.1, 115.5, 1.35, pz + 2.1);
    addChunk('struct', t, 120, 2.5, pz);
    addChunk('dim', d, 120, 2.5, pz);
  }

  /* --- maintenance building filling the left mid-ground --- */
  {
    const main = [], det = [], red = [];
    box(main, 25, 0, 62, 50, 6.5, 82);
    for (let x = 27.5; x < 49; x += 4.2) seg(det, x, 0, 62, x, 4.6, 62);       // cladding ribs
    seg(det, 25, 6.1, 62, 50, 6.1, 62);                                        // parapet
    seg(det, 26, 4.8, 62, 49, 4.8, 62);                                        // window band
    seg(det, 26, 5.7, 62, 49, 5.7, 62);
    for (let x = 26; x < 49.5; x += 2.1) seg(det, x, 4.8, 62, x, 5.7, 62);     // mullions
    rectZ(main, 61.97, 28, 0, 32.5, 3.8);                                      // roll-up door
    for (const dy of [1.25, 2.5]) seg(det, 28, dy, 61.97, 32.5, dy, 61.97);    // door slats
    rectZ(det, 61.97, 34.5, 0, 35.6, 2.2);                                     // person door
    for (const wz of [66, 71, 76]) rectX(det, 24.97, wz, 3.2, wz + 2.4, 4.6);  // end-wall windows
    box(det, 30, 6.5, 68, 33, 7.6, 71);                                        // roof units
    box(det, 40, 6.5, 73, 42.4, 7.4, 75.4);
    seg(det, 45, 6.5, 66, 45, 8.6, 66);                                        // vent stack
    seg(main, 27, 6.5, 79, 27, 9.4, 79);                                       // antenna mast
    glowsStatic.push({ x: 27, y: 9.5, z: 79, r: 0.3, kind: 'red', i: 0.5, blink: 3.0, phase: 2.4 });
    glowsStatic.push({ x: 30.2, y: 4.1, z: 61.9, r: 0.3, kind: 'white', i: 0.45, phase: 3.7 });
    lightPools.push({ x: 30.2, z: 60.8, r: 3.4, i: fog(dist(30.2, 0, 60.8)) * 0.7 });
    rectZ(red, 61.94, 44.8, 4.7, 46.6, 5.9);                                   // red mark
    addChunk('struct', main, 37, 3, 72);
    addChunk('dim', det, 37, 3, 72);
    addChunk('red', red, 45.7, 5.3, 62);
  }

  /* --- gantry crane (static red frame) --- */
  buildCraneStatic();

  /* --- scattered red ground markers --- */
  for (let i = 0; i < 13; i++) {
    groundDots.push({ x: -10 + rng() * 210, y: 0.06, z: -30 + rng() * 80 });
  }

  buildStars();
}

function buildCraneStatic() {
  const red = [], dim = [];
  const CX = CRANE.x;
  const legBotHalf = 2.5, legTopHalf = 1.55, yBot = 1.15, yTop = 15.5;
  const legX = fr => {
    const t = (fr - yBot) / (yTop - yBot);
    return legBotHalf + (legTopHalf - legBotHalf) * t;
  };

  for (const zE of [CRANE.z0, CRANE.z1]) {
    /* tapered chords with full truss lattice (rungs + X bracing) */
    seg(red, CX - legBotHalf, yBot, zE, CX - legTopHalf, yTop, zE);
    seg(red, CX + legBotHalf, yBot, zE, CX + legTopHalf, yTop, zE);
    let prevY = yBot;
    for (let y = yBot + 1.8; y <= yTop + 0.01; y += 1.8) {
      const h = legX(y), ph = legX(prevY);
      seg(red, CX - h, y, zE, CX + h, y, zE);
      seg(dim, CX - ph, prevY, zE, CX + h, y, zE);
      seg(dim, CX + ph, prevY, zE, CX - h, y, zE);
      prevY = y;
    }
    /* sill beam + wheel bogies (rim + hub) */
    box(red, CX - 3.3, 0.75, zE - 0.55, CX + 3.3, 1.35, zE + 0.55);
    for (const bx of [CX - 2.55, CX + 2.55]) {
      box(dim, bx - 0.95, 0.15, zE - 0.42, bx + 0.95, 0.78, zE + 0.42);
      for (const wx of [bx - 0.48, bx + 0.48]) {
        circleZ(red, wx, 0.5, zE, 0.5, 10);
        circleZ(dim, wx, 0.5, zE, 0.22, 7);
      }
    }
    glowsStatic.push({ x: CX, y: yTop + 0.15, z: zE, r: 0.4, kind: 'red', i: 0.65, blink: 2.6, phase: zE * 0.4 });
  }

  /* access ladder up the near leg */
  seg(dim, CX - 2.78, 1.4, CRANE.z0, CX - 2.78, 15.3, CRANE.z0);
  seg(dim, CX - 3.06, 1.4, CRANE.z0, CX - 3.06, 15.3, CRANE.z0);
  for (let y = 2.0; y < 15.3; y += 1.35) seg(dim, CX - 3.06, y, CRANE.z0, CX - 2.78, y, CRANE.z0);

  /* twin girders as lattice trusses + top lacing (walkway cross bars) */
  for (const gx of [CX - 1.5, CX + 1.5]) {
    box(red, gx - 0.42, CRANE.girderY, CRANE.z0 - 0.8, gx + 0.42, 17.2, CRANE.z1 + 0.8);
    const face = gx < CX ? gx - 0.42 : gx + 0.42;
    let flip = 1;
    for (let z = CRANE.z0 - 0.8; z < CRANE.z1 + 0.79; z += 2.2) {
      seg(dim, face, CRANE.girderY, z, face, 17.2, z);
      seg(dim, face, flip > 0 ? CRANE.girderY : 17.2, z, face, flip > 0 ? 17.2 : CRANE.girderY, z + 2.2);
      flip = -flip;
    }
  }
  for (let z = CRANE.z0; z < CRANE.z1 + 0.5; z += 2.2) {
    seg(dim, CX - 1.5, 17.2, z, CX + 1.5, 17.2, z);
  }
  /* girder end ties */
  for (const z of [CRANE.z0 - 0.8, CRANE.z1 + 0.8]) {
    seg(red, CX - 1.92, CRANE.girderY, z, CX + 1.92, CRANE.girderY, z);
    seg(red, CX - 1.92, 17.2, z, CX + 1.92, 17.2, z);
  }
  /* portal knee braces from legs into the girders */
  for (const zE of [CRANE.z0, CRANE.z1]) {
    const dir = zE === CRANE.z0 ? 1 : -1;
    const h13 = legX(13);
    seg(red, CX - h13, 13, zE, CX - 1.5, CRANE.girderY, zE + dir * 2.4);
    seg(red, CX + h13, 13, zE, CX + 1.5, CRANE.girderY, zE + dir * 2.4);
  }

  /* machinery house toward the +Z end (screen-left): door, vents, railing */
  box(red, CX - 2.3, 17.2, 13.6, CX + 2.3, 19.35, 17.1);
  rectX(dim, CX - 2.31, 14.2, 17.5, 15.2, 18.9);
  for (const vy of [18.1, 18.45, 18.8]) seg(dim, CX - 1.5, vy, 17.11, CX - 0.3, vy, 17.11);
  box(dim, CX - 1.4, 19.35, 14.3, CX - 0.2, 20.05, 15.5);
  for (const rz of [13.7, 17.0]) {
    for (const rx of [CX - 2.2, CX + 2.2]) seg(dim, rx, 19.35, rz, rx, 19.95, rz);
    seg(dim, CX - 2.2, 19.95, rz, CX + 2.2, 19.95, rz);
  }
  seg(dim, CX + 1.3, 19.35, 16.4, CX + 1.3, 20.5, 16.4);
  glowsStatic.push({ x: CX + 1.3, y: 20.6, z: 16.4, r: 0.42, kind: 'red', i: 0.8, blink: 2.6, phase: 0 });

  addChunk('red', red, CX, 9, 8);
  addChunk('redDim', dim, CX, 9, 8);
}

/* --- stars --- */
const stars = [];
function buildStars() {
  const R = 1500;
  for (let i = 0; i < 128; i++) {
    const az = CAM.yaw + (rng() - 0.5) * 2.2;
    const el = 0.05 + rng() * 0.65;
    stars.push({
      x: CAM.x + R * Math.sin(az) * Math.cos(el),
      y: CAM.y + R * Math.sin(el),
      z: CAM.z + R * Math.cos(az) * Math.cos(el),
      s: rng() < 0.18 ? 2 : 1,
      a: 0.25 + rng() * 0.55,
      tw: 0.5 + rng() * 2,
      ph: rng() * 6.3,
      red: rng() < 0.07
    });
  }
  /* denser band low over the mountain ridges */
  for (let i = 0; i < 95; i++) {
    const az = CAM.yaw + (rng() - 0.5) * 2.2;
    const el = 0.04 + rng() * 0.18;
    stars.push({
      x: CAM.x + R * Math.sin(az) * Math.cos(el),
      y: CAM.y + R * Math.sin(el),
      z: CAM.z + R * Math.cos(az) * Math.cos(el),
      s: 1,
      a: 0.18 + rng() * 0.42,
      tw: 0.5 + rng() * 2,
      ph: rng() * 6.3,
      red: rng() < 0.08
    });
  }
}

/* ---------------------------------------------------------------- vehicle templates (local coords, facing +X) */

function buildTruckTemplate() {
  const veh = [], det = [], whl = [];
  /* ---- tractor: hood, grille, bumper, fenders */
  box(veh, 6.9, 1.1, -1.05, 9.4, 2.45, 1.05);
  rectX(det, 9.41, -0.78, 1.32, 0.78, 2.32);                   // grille frame
  seg(det, 9.41, 1.62, -0.78, 9.41, 1.62, 0.78);               // grille bars
  seg(det, 9.41, 1.92, -0.78, 9.41, 1.92, 0.78);
  box(veh, 9.45, 0.62, -1.18, 9.72, 1.12, 1.18);               // bumper
  arcZ(det, 7.85, 0.6, -1.12, 0.8, 8, 0.3, Math.PI - 0.3);     // front fenders
  arcZ(det, 7.85, 0.6, 1.12, 0.8, 8, 0.3, Math.PI - 0.3);
  seg(det, 8.2, 2.45, -1.05, 8.2, 2.45, 1.05);                 // hood seam
  /* cab */
  box(veh, 5.1, 1.0, -1.28, 6.9, 3.45, 1.28);
  seg(det, 6.9, 2.5, -1.12, 6.9, 3.28, -1.02);                 // windshield
  seg(det, 6.9, 2.5, 1.12, 6.9, 3.28, 1.02);
  seg(det, 6.9, 2.5, -1.12, 6.9, 2.5, 1.12);
  seg(det, 6.9, 3.28, -1.02, 6.9, 3.28, 1.02);
  rectZ(det, 1.29, 5.5, 2.5, 6.55, 3.2);                       // door windows
  rectZ(det, -1.29, 5.5, 2.5, 6.55, 3.2);
  seg(det, 5.85, 1.15, -1.29, 5.85, 3.1, -1.29);               // door seams
  seg(det, 5.85, 1.15, 1.29, 5.85, 3.1, 1.29);
  seg(det, 6.0, 0.72, -1.32, 6.7, 0.72, -1.32);                // cab steps
  seg(det, 6.0, 0.72, 1.32, 6.7, 0.72, 1.32);
  for (const s of [-1, 1]) {                                   // mirrors
    seg(det, 6.92, 2.45, 1.28 * s, 7.1, 2.95, 1.62 * s);
    seg(det, 7.1, 2.6, 1.62 * s, 7.1, 3.05, 1.62 * s);
  }
  for (const s of [-1.22, 1.22]) {                             // twin stacks + shields
    seg(det, 5.2, 3.45, s, 5.2, 4.6, s);
    seg(det, 5.03, 3.45, s, 5.03, 4.3, s);
  }
  box(det, 5.5, 0.5, -1.32, 7.2, 1.05, -0.98);                 // fuel tanks
  box(det, 5.5, 0.5, 0.98, 7.2, 1.05, 1.32);
  seg(det, -1.2, 0.98, -0.9, 5.1, 0.98, -0.9);                 // frame rails
  seg(det, -1.2, 0.98, 0.9, 5.1, 0.98, 0.9);
  box(det, 2.2, 1.02, -0.75, 3.6, 1.24, 0.75);                 // fifth wheel
  /* ---- trailer */
  box(veh, -9.3, 1.5, -1.3, 4.4, 4.35, 1.3);
  for (let x = -8.75; x < 4.1; x += 1.2) {                     // corrugation ribs
    seg(det, x, 1.64, -1.3, x, 4.21, -1.3);
    seg(det, x, 1.64, 1.3, x, 4.21, 1.3);
  }
  for (const s of [-1.3, 1.3]) {                               // top/bottom rails
    seg(det, -9.1, 1.64, s, 4.2, 1.64, s);
    seg(det, -9.1, 4.21, s, 4.2, 4.21, s);
  }
  rectX(det, -9.31, -1.12, 1.66, 1.12, 4.18);                  // rear door frame
  for (const fz of [-0.82, -0.32, 0.32, 0.82]) {               // door lock rods
    seg(det, -9.31, 1.72, fz, -9.31, 4.12, fz);
  }
  seg(det, -9.31, 2.65, -0.5, -9.31, 2.65, 0.5);               // rod handles
  seg(det, -9.2, 0.55, -0.95, -9.2, 1.5, -0.95);               // underride guard
  seg(det, -9.2, 0.55, 0.95, -9.2, 1.5, 0.95);
  seg(det, -9.2, 0.55, -0.95, -9.2, 0.55, 0.95);
  seg(det, -0.6, 0.55, -0.98, -0.6, 1.5, -0.98);               // landing gear
  seg(det, -0.6, 0.55, 0.98, -0.6, 1.5, 0.98);
  seg(det, -0.6, 0.92, -0.98, -0.6, 0.92, 0.98);
  const wheels = [
    { x: 7.85, y: 0.6, z: -1.15, r: 0.6 }, { x: 7.85, y: 0.6, z: 1.15, r: 0.6 },
    { x: 4.5, y: 0.55, z: -1.15, r: 0.55 }, { x: 4.5, y: 0.55, z: 1.15, r: 0.55 },
    { x: 3.2, y: 0.55, z: -1.15, r: 0.55 }, { x: 3.2, y: 0.55, z: 1.15, r: 0.55 },
    { x: -6.5, y: 0.5, z: -1.15, r: 0.5 }, { x: -6.5, y: 0.5, z: 1.15, r: 0.5 },
    { x: -7.7, y: 0.5, z: -1.15, r: 0.5 }, { x: -7.7, y: 0.5, z: 1.15, r: 0.5 }
  ];
  for (const w of wheels) wheelPro(whl, w.x, w.y, w.z, w.r);
  return { veh, det, whl, wheels,
    lightsF: [[9.74, 0.95, -0.85], [9.74, 0.95, 0.85]],
    lightsM: [[6.92, 3.52, -0.45], [6.92, 3.56, 0], [6.92, 3.52, 0.45]],   // cab roof markers
    lightsR: [[-9.35, 1.75, -1.15], [-9.35, 1.75, 1.15]],
    lightsRM: [[-9.32, 4.26, -1.22], [-9.32, 4.26, 1.22]] };               // trailer top markers
}

function buildLocoTemplate() {
  const veh = [], det = [], whl = [];
  /* frame deck + pilots (plow front) */
  box(veh, -9.5, 1.0, -1.5, 9.5, 1.35, 1.5);
  seg(veh, 9.5, 1.0, -1.5, 10.05, 0.35, -1.1);
  seg(veh, 9.5, 1.0, 1.5, 10.05, 0.35, 1.1);
  seg(veh, 10.05, 0.35, -1.1, 10.05, 0.35, 1.1);
  seg(det, 9.5, 1.0, 0, 10.05, 0.35, 0);
  seg(veh, -9.5, 1.0, -1.5, -9.9, 0.45, -1.15);
  seg(veh, -9.5, 1.0, 1.5, -9.9, 0.45, 1.15);
  seg(veh, -9.9, 0.45, -1.15, -9.9, 0.45, 1.15);
  /* corner steps */
  for (const sx of [9.2, -9.2]) {
    const d = sx > 0 ? 0.45 : -0.45;
    for (const sz of [-1.46, 1.46]) {
      seg(det, sx, 0.55, sz, sx + d, 0.55, sz);
      seg(det, sx, 0.85, sz, sx + d * 0.7, 0.85, sz);
    }
  }
  /* long hood with panel seams + radiator grilles */
  box(veh, -8.9, 1.35, -1.3, 3.2, 3.75, 1.3);
  for (let x = -7.4; x < 3; x += 1.75) {
    seg(det, x, 1.5, -1.3, x, 3.6, -1.3);
    seg(det, x, 1.5, 1.3, x, 3.6, 1.3);
  }
  for (let i = 0; i < 5; i++) {
    seg(det, -8.6 + i * 0.32, 2.85, -1.3, -8.35 + i * 0.32, 3.55, -1.3);
    seg(det, -8.6 + i * 0.32, 2.85, 1.3, -8.35 + i * 0.32, 3.55, 1.3);
  }
  box(det, -6.6, 3.75, -0.95, -4.4, 4.18, 0.95);               // dynamic brake blister
  circleY(det, -7.95, 3.78, 0, 0.78, 10);                      // roof fans
  circleY(det, -2.9, 3.78, 0, 0.72, 10);
  circleY(det, -1.35, 3.78, 0, 0.72, 10);
  box(det, 0.5, 3.75, -0.32, 1.15, 4.2, 0.32);                 // exhaust stack
  /* cab: split windshield, side windows, horn */
  box(veh, 3.2, 1.35, -1.5, 5.9, 4.3, 1.5);
  seg(det, 5.9, 3.3, -1.28, 5.9, 4.08, -1.18);
  seg(det, 5.9, 3.3, 1.28, 5.9, 4.08, 1.18);
  seg(det, 5.9, 3.3, 0, 5.9, 4.08, 0);
  seg(det, 5.9, 3.3, -1.28, 5.9, 3.3, 1.28);
  seg(det, 5.9, 4.08, -1.18, 5.9, 4.08, 1.18);
  rectZ(det, 1.51, 3.6, 3.05, 4.75, 3.8);
  rectZ(det, -1.51, 3.6, 3.05, 4.75, 3.8);
  box(det, 4.3, 4.3, -0.28, 4.95, 4.55, 0.28);                 // horn cluster
  /* nose (short hood) with number board */
  box(veh, 5.9, 1.35, -1.15, 8.9, 2.6, 1.15);
  rectX(det, 8.91, -0.55, 2.12, 0.55, 2.5);
  box(det, 6.15, 2.6, -0.85, 7.35, 2.95, 0.85);
  /* handrails with stanchions */
  for (const s of [-1.44, 1.44]) {
    seg(det, -9.3, 2.1, s, 9.3, 2.1, s);
    for (let x = -9.0; x <= 9.2; x += 1.85) seg(det, x, 1.35, s, x, 2.1, s);
  }
  /* chamfered fuel tank */
  box(det, -2.4, 0.5, -1.12, 2.4, 1.0, 1.12);
  seg(det, -2.4, 0.5, -1.12, -2.9, 0.78, -1.12);
  seg(det, 2.4, 0.5, -1.12, 2.9, 0.78, -1.12);
  seg(det, -2.4, 0.5, 1.12, -2.9, 0.78, 1.12);
  seg(det, 2.4, 0.5, 1.12, 2.9, 0.78, 1.12);
  /* bogies: shaped sideframes + 3 axles each, rim + hub */
  const wheels = [];
  for (const bc of [-5.2, 4.9]) {
    for (const s of [-1.32, 1.32]) {
      seg(det, bc - 2.0, 0.9, s, bc + 2.0, 0.9, s);
      seg(det, bc - 2.0, 0.9, s, bc - 1.6, 0.42, s);
      seg(det, bc + 2.0, 0.9, s, bc + 1.6, 0.42, s);
      seg(det, bc - 1.6, 0.42, s, bc + 1.6, 0.42, s);
    }
    for (const dx of [-1.4, 0, 1.4]) {
      wheels.push({ x: bc + dx, y: 0.62, z: -1.08, r: 0.62 }, { x: bc + dx, y: 0.62, z: 1.08, r: 0.62 });
    }
  }
  for (const w of wheels) wheelPro(whl, w.x, w.y, w.z, w.r, 0.24);
  return { veh, det, whl, wheels,
    lightsF: [[8.92, 2.35, -0.28], [8.92, 2.35, 0.28], [9.7, 1.15, -0.88], [9.7, 1.15, 0.88]],
    lightsR: [[-9.55, 3.2, 0]] };
}

function buildWellcarTemplate(loaded) {
  const veh = [], det = [], whl = [];
  /* lattice side sills: chords + posts + alternating diagonals */
  for (const s of [-1.3, 1.3]) {
    seg(veh, -7.6, 1.78, s, 7.6, 1.78, s);
    seg(veh, -7.6, 0.62, s, 7.6, 0.62, s);
    seg(veh, -7.6, 0.62, s, -7.6, 1.78, s);
    seg(veh, 7.6, 0.62, s, 7.6, 1.78, s);
    let flip = 1;
    for (let x = -6.2; x < 6.3; x += 1.55) {
      seg(det, x, 0.62, s, x, 1.78, s);
      seg(det, x, flip > 0 ? 0.62 : 1.78, s, x + 1.55, flip > 0 ? 1.78 : 0.62, s);
      flip = -flip;
    }
  }
  /* end cross members + couplers + brake wheel */
  for (const ex of [-7.6, 7.6]) {
    seg(veh, ex, 1.78, -1.3, ex, 1.78, 1.3);
    seg(veh, ex, 0.62, -1.3, ex, 0.62, 1.3);
    seg(det, ex, 1.05, 0, ex + (ex > 0 ? 0.75 : -0.75), 1.05, 0);
  }
  circleX(det, -7.68, 2.15, 0.8, 0.34, 8);
  seg(det, -7.68, 1.78, 0.8, -7.68, 2.15, 0.8);
  /* bogies + wheels with hubs */
  for (const bc of [-6.3, 6.3]) {
    for (const s of [-1.12, 1.12]) {
      seg(det, bc - 1.15, 0.82, s, bc + 1.15, 0.82, s);
      seg(det, bc - 1.15, 0.82, s, bc - 0.85, 0.4, s);
      seg(det, bc + 1.15, 0.82, s, bc + 0.85, 0.4, s);
      seg(det, bc - 0.85, 0.4, s, bc + 0.85, 0.4, s);
    }
  }
  const wheels = [];
  for (const bx of [-7.0, -5.6, 5.6, 7.0]) {
    wheels.push({ x: bx, y: 0.5, z: -1.0, r: 0.5 }, { x: bx, y: 0.5, z: 1.0, r: 0.5 });
  }
  for (const w of wheels) wheelPro(whl, w.x, w.y, w.z, w.r, 0.24);
  if (loaded) container(veh, det, -6.1, 0.75, -1.28, 12.2, 2.6, 2.56, 2);
  return { veh, det, whl, wheels };
}

function buildForkliftTemplate() {
  const veh = [], det = [], whl = [], carr = [], load = [];
  /* body + counterweight */
  box(veh, -1.7, 0.35, -0.75, 0.8, 1.35, 0.75);
  box(veh, -2.15, 0.45, -0.68, -1.7, 1.2, 0.68);
  seg(det, -2.15, 1.2, -0.68, -1.7, 1.35, -0.68);
  seg(det, -2.15, 1.2, 0.68, -1.7, 1.35, 0.68);
  /* seat + steering column */
  box(det, -1.15, 1.35, -0.35, -0.45, 1.78, 0.35);
  seg(det, -0.25, 1.35, 0, -0.08, 1.72, 0);
  /* overhead guard: posts + top frame + slats */
  for (const gp of [[0.55, -0.62], [0.55, 0.62], [-1.05, -0.62], [-1.05, 0.62]]) {
    seg(det, gp[0], 1.35, gp[1], gp[0], 2.5, gp[1]);
  }
  seg(det, 0.55, 2.5, -0.62, 0.55, 2.5, 0.62);
  seg(det, -1.05, 2.5, -0.62, -1.05, 2.5, 0.62);
  seg(det, 0.55, 2.5, -0.62, -1.05, 2.5, -0.62);
  seg(det, 0.55, 2.5, 0.62, -1.05, 2.5, 0.62);
  seg(det, 0.0, 2.5, -0.62, 0.0, 2.5, 0.62);
  seg(det, -0.55, 2.5, -0.62, -0.55, 2.5, 0.62);
  /* mast: outer uprights + inner rails + crossbars + tilt cylinders */
  seg(veh, 0.92, 0.12, -0.55, 0.92, 3.2, -0.55);
  seg(veh, 0.92, 0.12, 0.55, 0.92, 3.2, 0.55);
  seg(det, 0.8, 0.12, -0.4, 0.8, 3.05, -0.4);
  seg(det, 0.8, 0.12, 0.4, 0.8, 3.05, 0.4);
  for (const my of [0.8, 1.6, 2.4, 3.2]) seg(det, 0.92, my, -0.55, 0.92, my, 0.55);
  seg(det, -0.2, 0.6, -0.66, 0.85, 1.1, -0.55);
  seg(det, -0.2, 0.6, 0.66, 0.85, 1.1, 0.55);
  const wheels = [
    { x: 0.45, y: 0.45, z: -0.72, r: 0.45 }, { x: 0.45, y: 0.45, z: 0.72, r: 0.45 },
    { x: -1.45, y: 0.36, z: -0.6, r: 0.36 }, { x: -1.45, y: 0.36, z: 0.6, r: 0.36 }
  ];
  for (const w of wheels) wheelPro(whl, w.x, w.y, w.z, w.r);
  /* carriage (translated to mast height per frame): backrest + fork blades */
  rectX(carr, 0.88, -0.55, 0.12, 0.55, 1.18);
  seg(carr, 0.88, 0.12, -0.18, 0.88, 1.18, -0.18);
  seg(carr, 0.88, 0.12, 0.18, 0.88, 1.18, 0.18);
  for (const fz of [-0.4, 0.4]) {
    seg(carr, 0.88, 0.55, fz, 1.0, 0.1, fz);
    seg(carr, 1.0, 0.1, fz, 2.18, 0.1, fz);
  }
  /* palletised crate load with strapping cross */
  seg(load, 1.02, 0.18, -0.55, 2.14, 0.18, -0.55);
  seg(load, 1.02, 0.18, 0.55, 2.14, 0.18, 0.55);
  box(load, 1.05, 0.26, -0.52, 2.11, 1.3, 0.52);
  seg(load, 1.05, 0.26, -0.52, 2.11, 1.3, -0.52);
  seg(load, 1.05, 1.3, -0.52, 2.11, 0.26, -0.52);
  return { veh, det, whl, wheels, carr, load, beacon: [-1.05, 2.62, 0] };
}

/* yard truck with skeletal container chassis ‚Äî origin at the container centre, facing +X */
function buildYardTruckTemplate() {
  const veh = [], det = [], whl = [];
  /* skeletal chassis: spine rails + cross members + gooseneck */
  for (const s of [-0.55, 0.55]) {
    seg(veh, -6.6, 1.15, s, 6.6, 1.15, s);
    seg(det, -6.6, 0.95, s, 6.6, 0.95, s);
    seg(veh, 6.6, 1.15, s, 7.4, 1.32, s);
  }
  for (const cx of [-6.3, -3.2, 0, 3.2, 6.3]) seg(det, cx, 1.15, -0.55, cx, 1.15, 0.55);
  for (const px of [-6.1, 6.1]) {                              // twist-lock posts
    seg(det, px, 1.15, -0.6, px, 1.34, -0.6);
    seg(det, px, 1.15, 0.6, px, 1.34, 0.6);
  }
  box(det, -6.0, 0.5, -1.0, -3.9, 0.95, 1.0);                  // rear bogie frame
  seg(det, -6.55, 0.55, -0.9, -6.55, 1.15, -0.9);              // underrun
  seg(det, -6.55, 0.55, 0.9, -6.55, 1.15, 0.9);
  /* cab-over tractor */
  box(veh, 9.3, 0.95, -1.2, 11.5, 3.3, 1.2);
  rectX(det, 11.51, -0.95, 1.85, 0.95, 3.0);                   // windshield
  rectZ(det, 1.21, 9.7, 1.9, 10.9, 2.75);                      // side windows
  rectZ(det, -1.21, 9.7, 1.9, 10.9, 2.75);
  seg(det, 9.3, 3.3, -0.9, 9.3, 4.05, -0.9);                   // exhaust
  box(det, 7.2, 0.85, -1.0, 11.6, 1.12, 1.0);                  // tractor frame
  box(det, 7.5, 1.12, -0.8, 9.0, 1.34, 0.8);                   // fifth wheel
  seg(veh, 11.65, 0.7, -1.1, 11.65, 0.7, 1.1);                 // bumper
  const wheels = [
    { x: 10.7, y: 0.55, z: -1.05, r: 0.55 }, { x: 10.7, y: 0.55, z: 1.05, r: 0.55 },
    { x: 8.2, y: 0.55, z: -1.05, r: 0.55 }, { x: 8.2, y: 0.55, z: 1.05, r: 0.55 },
    { x: -4.4, y: 0.5, z: -1.05, r: 0.5 }, { x: -4.4, y: 0.5, z: 1.05, r: 0.5 },
    { x: -5.6, y: 0.5, z: -1.05, r: 0.5 }, { x: -5.6, y: 0.5, z: 1.05, r: 0.5 }
  ];
  for (const w of wheels) wheelPro(whl, w.x, w.y, w.z, w.r);
  return { veh, det, whl, wheels,
    lightsF: [[11.7, 1.05, -0.85], [11.7, 1.05, 0.85]],
    lightsR: [[-6.6, 1.1, -0.6], [-6.6, 1.1, 0.6]],
    beacon: [10.4, 3.42, 0] };
}

const TPL = {
  truck: buildTruckTemplate(),
  loco: buildLocoTemplate(),
  carLoaded: buildWellcarTemplate(true),
  carEmpty: buildWellcarTemplate(false),
  forklift: buildForkliftTemplate(),
  yard: buildYardTruckTemplate()
};

/* container carried by crane / sitting loose ‚Äî local, centered, y0 = 0 */
const TPL_BOX = (() => {
  const main = [], det = [];
  container(main, det, -6.1, 0, -1.28, 12.2, 2.6, 2.56, 2);
  return { main, det };
})();

/* loose palletised crate matching the forklift load ‚Äî centered, y0 at pallet base */
const TPL_CRATE = (() => {
  const a = [];
  seg(a, -0.56, 0.18, -0.55, 0.56, 0.18, -0.55);
  seg(a, -0.56, 0.18, 0.55, 0.56, 0.18, 0.55);
  box(a, -0.53, 0.26, -0.52, 0.53, 1.3, 0.52);
  seg(a, -0.53, 0.26, -0.52, 0.53, 1.3, -0.52);
  seg(a, -0.53, 1.3, -0.52, 0.53, 0.26, -0.52);
  return a;
})();

/* ---------------------------------------------------------------- dynamic drawing */

/* transform local segs (optional roll about X, yaw about Y, translate) into current path */
function pathSegsTf(arr, px, py, pz, yaw, roll) {
  const cy = Math.cos(yaw || 0), sy = Math.sin(yaw || 0);
  const cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
  const hasRoll = !!roll;
  for (let i = 0; i < arr.length; i += 6) {
    let lx1 = arr[i], ly1 = arr[i + 1], lz1 = arr[i + 2];
    let lx2 = arr[i + 3], ly2 = arr[i + 4], lz2 = arr[i + 5];
    if (hasRoll) {
      let t = ly1 * cr - lz1 * sr; lz1 = ly1 * sr + lz1 * cr; ly1 = t;
      t = ly2 * cr - lz2 * sr; lz2 = ly2 * sr + lz2 * cr; ly2 = t;
    }
    const wx1 = lx1 * cy + lz1 * sy, wz1 = -lx1 * sy + lz1 * cy;
    const wx2 = lx2 * cy + lz2 * sy, wz2 = -lx2 * sy + lz2 * cy;
    pathSeg(wx1 + px, ly1 + py, wz1 + pz, wx2 + px, ly2 + py, wz2 + pz);
  }
}

const spokeScratch = [];
function emitSpokes(wheels, roll) {
  spokeScratch.length = 0;
  for (const w of wheels) {
    const a = roll % (Math.PI * 2);
    const c = Math.cos(a) * w.r * 0.82, s = Math.sin(a) * w.r * 0.82;
    seg(spokeScratch, w.x + c, w.y + s, w.z, w.x - c, w.y - s, w.z);
    seg(spokeScratch, w.x - s, w.y + c, w.z, w.x + s, w.y - c, w.z);
  }
  return spokeScratch;
}

/* draw a vehicle template at pose */
function drawVehicle(tpl, px, py, pz, yaw, wheelRoll, fogMul) {
  ctx.beginPath();
  pathSegsTf(tpl.veh, px, py, pz, yaw, 0);
  strokeStyled('veh', fogMul);
  ctx.beginPath();
  pathSegsTf(tpl.det, px, py, pz, yaw, 0);
  strokeStyled('vehDim', fogMul);
  /* wheels draw fainter so their dense circles match the body's visual weight */
  if (tpl.whl) {
    ctx.beginPath();
    pathSegsTf(tpl.whl, px, py, pz, yaw, 0);
    if (tpl.wheels && wheelRoll !== null) pathSegsTf(emitSpokes(tpl.wheels, wheelRoll), px, py, pz, yaw, 0);
    strokeStyled('wheel', fogMul);
  }
}

/* container with colour lerp between yard-white and system-red */
function drawBoxLerp(px, py, pz, yaw, roll, redT, fogMul) {
  const r = Math.round(190 + (255 - 190) * redT);
  const g = Math.round(209 + (58 - 209) * redT);
  const b = Math.round(255 + (58 - 255) * redT);
  if (redT > 0.05) {
    ctx.beginPath();
    pathSegsTf(TPL_BOX.main, px, py, pz, yaw, roll);
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.18 * redT * fogMul;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.stroke();
  }
  ctx.beginPath();
  pathSegsTf(TPL_BOX.main, px, py, pz, yaw, roll);
  ctx.lineWidth = 1.2 + 0.25 * redT;
  ctx.globalAlpha = Math.min(1, (0.55 + 0.4 * redT) * fogMul);
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.stroke();
  ctx.beginPath();
  pathSegsTf(TPL_BOX.det, px, py, pz, yaw, roll);
  ctx.lineWidth = 1;
  ctx.globalAlpha = Math.min(1, (0.28 + 0.2 * redT) * fogMul);
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.stroke();
}

/* ---------------------------------------------------------------- glow sprites */

function makeGlow(core, mid) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, core);
  grad.addColorStop(0.25, mid);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}
const GLOW_WHITE = makeGlow('rgba(255,255,255,0.95)', 'rgba(170,200,255,0.4)');
const GLOW_RED = makeGlow('rgba(255,140,120,0.95)', 'rgba(255,45,45,0.38)');

const frameGlows = [];
function queueGlow(x, y, z, r, kind, intensity) {
  frameGlows.push({ x, y, z, r, kind, i: intensity });
}

/* --- night lighting: static pools under the lamps + headlight beam wedges --- */
const lightPools = []; // {x, z, r, i} ‚Äî i is pre-multiplied with fog at build time
const frameBeams = [];
function queueBeam(x, z, dir, len, i) {
  frameBeams.push({ x, z, dir, len, i });
}
function drawLighting() {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of lightPools) {
    const c = projPoint(p.x, 0.02, p.z);
    if (!c) continue;
    const rx = Math.min(130, focal * p.r / c[2]);
    if (rx < 3) continue;
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.scale(1, 0.34);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(150,182,255,${0.085 * p.i})`);
    g.addColorStop(1, 'rgba(150,182,255,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }
  for (const b of frameBeams) {
    const p0 = projPoint(b.x, 0.05, b.z - 0.9);
    const p1 = projPoint(b.x, 0.05, b.z + 0.9);
    const p2 = projPoint(b.x + b.dir * b.len, 0.05, b.z + 2.7);
    const p3 = projPoint(b.x + b.dir * b.len, 0.05, b.z - 2.7);
    if (!p0 || !p1 || !p2 || !p3) continue;
    const g = ctx.createLinearGradient(p0[0], p0[1], (p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2);
    g.addColorStop(0, `rgba(175,205,255,${0.06 * b.i})`);
    g.addColorStop(1, 'rgba(175,205,255,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.lineTo(p3[0], p3[1]);
    ctx.closePath();
    ctx.fill();
  }
  frameBeams.length = 0;
  ctx.globalCompositeOperation = 'source-over';
}
function drawGlows(t) {
  ctx.globalCompositeOperation = 'lighter';
  for (const g of glowsStatic) {
    let i = g.i;
    if (g.blink) i *= 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (6.28 / g.blink) + g.phase));
    else i *= 0.9 + 0.1 * Math.sin(t * 1.7 + g.phase);
    queueGlow(g.x, g.y, g.z, g.r, g.kind, i);
  }
  for (const d of groundDots) {
    queueGlow(d.x, d.y, d.z, d.small ? 0.22 : 0.3, 'red', 0.5);
  }
  for (const g of frameGlows) {
    const p = projPoint(g.x, g.y, g.z);
    if (!p) continue;
    const s = Math.min(30, Math.max(2.2, focal * g.r / p[2] * 3.2));
    ctx.globalAlpha = Math.min(1, g.i);
    ctx.drawImage(g.kind === 'red' ? GLOW_RED : GLOW_WHITE, p[0] - s, p[1] - s, s * 2, s * 2);
  }
  frameGlows.length = 0;
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------------------------------------------------------------- actors */

/* --- mainline train: not the crane's customer ‚Äî it rolls straight through
       the yard at track speed, exits, and another one follows after a gap --- */
const train = {
  x: 20, v: 9.5, wheel: 0, gap: 0,
  CARS: 9, CRUISE: 9.5
};
train.update = function (dt) {
  if (this.gap > 0) {
    this.gap -= dt;
    if (this.gap <= 0) {
      this.x = -330 - rng() * 60;
      this.v = this.CRUISE * (0.9 + rng() * 0.25);
    }
    return;
  }
  this.v += (this.CRUISE - this.v) * 0.05 * dt;   // drifts toward track speed, never stops
  this.x += this.v * dt;
  this.wheel += this.v * dt / 0.62;
  const tail = this.x - 18.6 - (this.CARS - 1) * 18.1;
  if (tail > 470) this.gap = 18 + rng() * 30;
};
train.draw = function () {
  if (this.gap > 0) return;
  const f = fog(dist(this.x, 2, TRACK_MAIN));
  if (this.x > -240 && this.x < 480 && f > 0.02) {
    drawVehicle(TPL.loco, this.x, 0, TRACK_MAIN, 0, this.wheel, f);
    queueGlow(this.x + 9.05, 3.0, TRACK_MAIN - 0.3, 0.32, 'white', 0.95 * f);
    queueGlow(this.x + 9.05, 3.0, TRACK_MAIN + 0.3, 0.32, 'white', 0.95 * f);
    queueGlow(this.x + 8.6, 1.75, TRACK_MAIN - 0.95, 0.2, 'white', 0.5 * f);
    queueGlow(this.x + 8.6, 1.75, TRACK_MAIN + 0.95, 0.2, 'white', 0.5 * f);
    queueBeam(this.x + 10.2, TRACK_MAIN, 1, 21, f);
  }
  for (let i = 0; i < this.CARS; i++) {
    const cx = this.x - 18.6 - i * 18.1;
    if (cx < -240 || cx > 480) continue;
    drawVehicle(TPL.carLoaded, cx, 0, TRACK_MAIN, 0, this.wheel * (0.62 / 0.5), fog(dist(cx, 2, TRACK_MAIN)));
  }
};

/* --- rail cuts: a switcher locomotive pulls each string of well cars.
       The working consist indexes forward one car-length per load; once every
       car is loaded it departs up the corridor while a fresh string of
       empties, already waiting behind, pulls in and spots under the hook. --- */
const CAR_OFFS = [-34.8, -17.4, 0, 17.4, 34.8];
const LOCO_OFF = 54;     // switcher couples ahead of the head car: 34.8 (car centre)
                         // + 7.6 (car half) + 0.75 (coupler) + 9.9 (loco rear w/ pilot) + slack
function mkConsist(x, working) {
  return {
    x, v: 0, wheel: 0, fade: working ? 1 : 0,
    state: working ? 'work' : 'approach',   // work|depart|idle|approach|spot
    target: x, delay: 0, pendingAdvance: false,
    /* every consist arrives all-empty: the crane must fill all five spots
       before rail.loadUnderHook() lets it depart */
    cars: CAR_OFFS.map(off => ({ off, loaded: false, redT: 0 }))
  };
}
/* the working consist spots its HEAD car (off +34.8) under the hook, then pulls
   forward one car length per load so the hook works back to the rear car */
const rail = { list: [mkConsist(CRANE.x - 34.8, true), mkConsist(-292, false)] };
rail.activeCut = function () { return this.list.find(c => c.state === 'work') || null; };
rail.carUnderHook = function () {
  const a = this.activeCut();
  if (!a || a.v > 0.05 || a.delay > 0 || a.pendingAdvance) return null;
  let best = null, bd = 2.5;
  for (const c of a.cars) {
    const d = Math.abs(a.x + c.off - CRANE.x);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
};
rail.loadUnderHook = function () {          // called when the crane releases a box
  const a = this.activeCut();
  if (!a) return;
  const car = this.carUnderHook();
  if (car) { car.loaded = true; car.redT = 1; }
  if (a.cars.every(c => c.loaded)) {
    a.state = 'depart';
    a.delay = 3.0;
  } else {
    a.delay = 2.2;
    a.pendingAdvance = true;
  }
};
rail.update = function (dt) {
  for (const c of this.list) {
    if (c.fade < 1 && c.state !== 'idle') c.fade = Math.min(1, c.fade + dt / 2.4);
    for (const car of c.cars) if (car.redT > 0) car.redT = Math.max(0, car.redT - dt / 2.2);
    if (c.delay > 0) {
      c.delay -= dt;
      if (c.delay <= 0 && c.pendingAdvance) {
        c.target = c.x + 17.4;
        c.pendingAdvance = false;
      }
      if (c.delay > 0) continue;
    }
    if (c.state === 'work') {
      const remain = c.target - c.x;
      if (remain > 0.02) {
        const vAllow = Math.sqrt(Math.max(0, 2 * 0.35 * remain));
        c.v = Math.min(1.6, vAllow, c.v + 0.3 * dt);
        c.x += c.v * dt;
        c.wheel += c.v * dt / 0.5;
      } else c.v = 0;
    } else if (c.state === 'depart') {
      c.v = Math.min(6.5, c.v + 0.35 * dt);
      c.x += c.v * dt;
      c.wheel += c.v * dt / 0.5;
      if (c.x > 460) { c.state = 'idle'; c.v = 0; }
    } else if (c.state === 'approach') {
      /* creep toward a hold point behind whatever occupies the track ahead */
      const blocker = this.list.find(o => o !== c &&
        (o.state === 'work' || o.state === 'spot' || (o.state === 'depart' && o.x - 43.8 < 128)));
      if (!blocker) { c.state = 'spot'; continue; }
      /* follow the track ahead, but never chase the departing train past our
         own spot point ‚Äî otherwise we'd have to back up to get under the hook */
      const holdX = Math.min(blocker.x - 43.8 - 6 - (LOCO_OFF + 10.5), CRANE.x - 34.8);
      const remain = holdX - c.x;
      if (remain > 0.05) {
        const vAllow = Math.sqrt(Math.max(0, 2 * 0.3 * remain));
        c.v = Math.min(5.5, vAllow, c.v + 0.25 * dt);
        c.x += c.v * dt;
        c.wheel += c.v * dt / 0.5;
      } else c.v = 0;
    } else if (c.state === 'spot') {
      const remain = (CRANE.x - 34.8) - c.x;   // head car under the hook first
      if (remain > 0.03) {
        const vAllow = Math.sqrt(Math.max(0, 2 * 0.3 * remain));
        c.v = Math.min(4.5, vAllow, c.v + 0.25 * dt);
        c.x += c.v * dt;
        c.wheel += c.v * dt / 0.5;
      } else {
        c.v = 0; c.x = CRANE.x - 34.8; c.target = c.x; c.state = 'work';
      }
    } else if (c.state === 'idle') {
      const other = this.list.find(o => o !== c);
      if (other && other.state === 'work') {
        c.x = -292 - rng() * 20;
        c.v = 0; c.fade = 0; c.target = c.x;
        c.state = 'approach';
        for (const car of c.cars) { car.loaded = false; car.redT = 0; }
      }
    }
  }
};
rail.draw = function () {
  for (const c of this.list) {
    if (c.state === 'idle') continue;
    const locoX = c.x + LOCO_OFF;
    const fL = fog(dist(locoX, 2, TRACK_CUT)) * c.fade;
    if (fL > 0.02) {
      drawVehicle(TPL.loco, locoX, 0, TRACK_CUT, 0, c.wheel * (0.5 / 0.62), fL);
      queueGlow(locoX + 9.05, 3.0, TRACK_CUT - 0.3, 0.3, 'white', 0.9 * fL);
      queueGlow(locoX + 9.05, 3.0, TRACK_CUT + 0.3, 0.3, 'white', 0.9 * fL);
      if (c.v > 0.2) queueBeam(locoX + 10.2, TRACK_CUT, 1, 19, fL);
    }
    for (const car of c.cars) {
      const cx = c.x + car.off;
      const f = fog(dist(cx, 2, TRACK_CUT)) * c.fade;
      if (f < 0.02) continue;
      drawVehicle(TPL.carEmpty, cx, 0, TRACK_CUT, 0, c.wheel, f);
      if (car.loaded) drawBoxLerp(cx, 0.75, TRACK_CUT, 0, 0, car.redT, f);
    }
  }
};

/* --- RTG crane: trolley + hoist + swinging load (real pendulum) --- */
const crane = {
  troZ: 10.5, vT: 1.2, prevVT: 1.2, aT: 0,
  L: 4.6, hoistV: 0,
  theta: 0.045, omega: 0,
  carrying: true, carriedRed: 1,
  seq: 0, dwell: 0,
  /* the work cycle: drop on a railcar (z 4), pick off the delivery truck chassis (z 12) */
  STEPS: [
    { op: 'move', z: TRACK_CUT },
    { op: 'hoist', L: 10.84 },   // container bottom lands on the well-car floor (y 0.75)
    { op: 'release', t: 1.5 },
    { op: 'hoist', L: 4.2 },
    { op: 'move', z: PAD_Z },
    { op: 'hoist', L: 10.34 },   // spreader meets the container on the truck chassis (y 1.25)
    { op: 'attach', t: 1.2 },
    { op: 'hoist', L: 4.6 }
  ]
};
crane.update = function (dt) {
  const step = this.STEPS[this.seq];
  let aCmd = 0;

  if (step.op === 'move') {
    const d = step.z - this.troZ;
    const dir = Math.sign(d);
    const remain = Math.abs(d);
    const vAllow = Math.sqrt(Math.max(0, 2 * 0.55 * remain));
    const vWant = dir * Math.min(2.1, vAllow);
    const dv = vWant - this.vT;
    aCmd = Math.max(-0.55, Math.min(0.55, dv / Math.max(dt, 1e-4)));
    this.vT += aCmd * dt;
    this.troZ += this.vT * dt;
    if (remain < 0.04 && Math.abs(this.vT) < 0.06) { this.vT = 0; this.next(); }
  } else if (step.op === 'hoist') {
    /* interlocks: don't reach for a box until the truck has spotted, and don't
       lower a box until a stationary empty car sits under the hook */
    const pickHold = !this.carrying && step.L > 9 && !delivery.anyParked();
    const dropCar = (this.carrying && step.L > 9) ? rail.carUnderHook() : null;
    const dropHold = this.carrying && step.L > 9 && (!dropCar || dropCar.loaded);
    if (pickHold || dropHold) {
      this.vT = 0;
      this.hoistV = 0;
    } else {
      const speed = this.carrying ? 1.55 : 1.95;
      const d = step.L - this.L;
      const dir = Math.sign(d);
      this.hoistV += Math.max(-1.4 * dt, Math.min(1.4 * dt, dir * speed - this.hoistV));
      this.L += this.hoistV * dt;
      if (Math.abs(step.L - this.L) < 0.05) { this.L = step.L; this.hoistV = 0; this.next(); }
      this.vT = 0;
    }
  } else { // release / attach dwell ‚Äî wait out the countdown AND any residual sway
    this.dwell -= dt;
    this.vT = 0;
    if (this.dwell <= 0 && Math.abs(this.theta) < 0.015 && Math.abs(this.omega) < 0.03) this.next();
  }

  /* pendulum: theta'' = -(g/L) sin(theta) - c*theta' - a_trolley cos(theta)/L
     (damping rises near the box handoff ‚Äî the spreader guides act as anti-sway) */
  this.aT = (this.vT - this.prevVT) / Math.max(dt, 1e-4);
  this.prevVT = this.vT;
  const g = 9.81;
  const settling = step.op === 'release' || step.op === 'attach'
    || (step.op === 'hoist' && step.L > 9 && Math.abs(step.L - this.L) < 2.5);
  this.omega += (-(g / this.L) * Math.sin(this.theta)
    - (settling ? 1.5 : 0.22) * this.omega
    - (this.aT / this.L) * Math.cos(this.theta)) * dt;
  this.theta += this.omega * dt;
  if (this.theta > 0.2) { this.theta = 0.2; this.omega = 0; }
  if (this.theta < -0.2) { this.theta = -0.2; this.omega = 0; }

  if (this.carrying && this.carriedRed < 1) this.carriedRed = Math.min(1, this.carriedRed + dt / 0.6);
};
crane.next = function () {
  const step = this.STEPS[this.seq];
  if (step.op === 'release') {
    rail.loadUnderHook();
    this.carrying = false;
    this.omega += 0.018;
  } else if (step.op === 'attach') {
    this.carrying = true;
    this.carriedRed = 0;
    delivery.onAttach();
    this.omega -= 0.015;
  }
  this.seq = (this.seq + 1) % this.STEPS.length;
  const ns = this.STEPS[this.seq];
  if (ns.op === 'release' || ns.op === 'attach') this.dwell = ns.t;
};
crane.draw = function () {
  const CX = CRANE.x;
  const f = fog(dist(CX, 10, this.troZ));
  /* trolley: frame + hoist block + hanging operator cab */
  const tro = [];
  box(tro, CX - 1.3, CRANE.trolleyY, this.troZ - 1.0, CX + 1.3, 15.45, this.troZ + 1.0);
  box(tro, CX - 0.85, 14.18, this.troZ - 0.5, CX + 0.85, CRANE.trolleyY, this.troZ + 0.5);
  ctx.beginPath();
  pathSegsTf(tro, 0, 0, 0, 0, 0);
  strokeStyled('red', f);
  const troDim = [];
  box(troDim, CX + 1.3, 13.75, this.troZ - 0.45, CX + 1.95, 14.5, this.troZ + 0.45);
  seg(troDim, CX + 1.35, 13.95, this.troZ - 0.45, CX + 1.9, 13.95, this.troZ - 0.45);
  ctx.beginPath();
  pathSegsTf(troDim, 0, 0, 0, 0, 0);
  strokeStyled('redDim', f);

  /* hook point + swung spreader position */
  const hy = CRANE.trolleyY, hz = this.troZ;
  const sy = hy - this.L * Math.cos(this.theta);
  const sz = hz + this.L * Math.sin(this.theta);

  /* cables */
  const cab = [];
  const cr = Math.cos(this.theta), sr = Math.sin(this.theta);
  for (const dx of [-1.05, 1.05]) {
    for (const dz of [-0.75, 0.75]) {
      const ly = 0.06, lz = dz;
      const ry = ly * cr - lz * sr, rz = ly * sr + lz * cr;
      seg(cab, CX + dx, hy + 0.05, hz + dz, CX + dx, sy + ry, sz + rz);
    }
  }
  ctx.beginPath();
  pathSegsTf(cab, 0, 0, 0, 0, 0);
  strokeStyled('redDim', f);

  /* spreader: telescopic beam + twist-lock end blocks */
  const spr = [];
  box(spr, -6.2, -0.36, -1.3, 6.2, 0, 1.3);
  box(spr, -6.32, -0.52, -1.34, -5.55, 0.06, 1.34);
  box(spr, 5.55, -0.52, -1.34, 6.32, 0.06, 1.34);
  seg(spr, -5.5, -0.18, 0, 5.5, -0.18, 0);
  ctx.beginPath();
  pathSegsTf(spr, CX, sy, sz, 0, this.theta);
  strokeStyled('red', f);

  /* carried container */
  if (this.carrying) {
    const off = -0.36 - 2.6;
    const oy = off * cr, oz = off * sr;
    drawBoxLerp(CX, sy + oy, sz + oz, 0, this.theta, this.carriedRed, f);
  }
};

/* --- pad deliveries: yard trucks bring every container the crane picks (z 12 lane).
       Two trucks rotate ‚Äî one departs loaded-empty while the next is inbound. --- */
const delivery = {
  VMAX: 9, ACC: 1.1, BRK: 1.6,
  list: [
    { x: CRANE.x, v: 0, wheel: 0, state: 'parked', loaded: true, delay: 0 },
    { x: 0, v: 0, wheel: 0, state: 'idle', loaded: false, delay: 0 },
    { x: 0, v: 0, wheel: 0, state: 'idle', loaded: false, delay: 0 }
  ]
};
delivery.anyParked = function () {
  return this.list.some(t => t.state === 'parked');
};
delivery.onAttach = function () {
  let sent = false;
  for (const t of this.list) {
    if (t.state === 'parked') {           // crane took its box: leave after unlocking
      t.loaded = false;
      t.state = 'depart';
      t.delay = 1.1;
    } else if (t.state === 'idle' && !sent) {  // send exactly one truck in with the next box
      t.x = -145 - rng() * 25;
      t.v = this.VMAX * 0.6;
      t.loaded = true;
      t.state = 'arrive';
      sent = true;
    }
  }
};
delivery.update = function (dt) {
  for (const t of this.list) {
    if (t.state === 'parked' || t.state === 'idle') continue;
    if (t.delay > 0) { t.delay -= dt; continue; }
    if (t.state === 'arrive') {
      const remain = CRANE.x - t.x;
      const vAllow = Math.sqrt(Math.max(0, 2 * this.BRK * Math.max(0, remain)));
      t.v = Math.min(this.VMAX, vAllow, t.v + this.ACC * dt);
      t.x += t.v * dt;
      t.wheel += t.v * dt / 0.55;
      if (remain <= 0.05 && t.v < 0.3) { t.v = 0; t.x = CRANE.x; t.state = 'parked'; }
    } else { // depart
      t.v = Math.min(this.VMAX, t.v + this.ACC * dt);
      t.x += t.v * dt;
      t.wheel += t.v * dt / 0.55;
      if (t.x > 265) { t.state = 'idle'; t.v = 0; }
    }
  }
};
delivery.draw = function () {
  for (const t of this.list) {
    if (t.state === 'idle') continue;
    const f = fog(dist(t.x, 2, PAD_Z));
    drawVehicle(TPL.yard, t.x, 0, PAD_Z, 0, t.wheel, f);
    if (t.loaded) drawBoxLerp(t.x, 1.25, PAD_Z, 0, 0, 0, f);
    for (const l of TPL.yard.lightsF) queueGlow(t.x + l[0], l[1], PAD_Z + l[2], 0.24, 'white', 0.8 * f);
    for (const l of TPL.yard.lightsR) queueGlow(t.x + l[0], l[1], PAD_Z + l[2], 0.18, 'red', 0.4 * f);
    const b = TPL.yard.beacon;
    queueGlow(t.x + b[0], b[1], PAD_Z + b[2], 0.16, 'red',
      t.v > 0.2 ? 0.6 + 0.35 * Math.sin(perf * 8) : 0.3);
    if (t.v > 0.5) queueBeam(t.x + 11.8, PAD_Z, 1, 16, f);
  }
};

/* --- aircraft crossing the skyline above the mountains --- */
const TPL_PLANE = (() => {
  const a = [];
  seg(a, -6.3, 0, 0, 6.3, 0, 0);            // fuselage
  seg(a, 1.5, 0, 0, -2.4, 0, -8.0);         // wings
  seg(a, 1.5, 0, 0, -2.4, 0, 8.0);
  seg(a, -5.5, 0, 0, -6.9, 2.5, 0);         // fin
  seg(a, -5.8, 0, 0, -6.7, 0, -3.0);        // stabilisers
  seg(a, -5.8, 0, 0, -6.7, 0, 3.0);
  return a;
})();
/* the flight path is an arc at fixed distance, swept across the view azimuth,
   so every pass crosses the whole sky band above the mountains */
const aircraft = {
  active: false, t: 14, az: 0, dir: 1,
  D: 750, Y: 95, V: 42
};
aircraft.update = function (dt) {
  if (!this.active) {
    this.t -= dt;
    if (this.t <= 0) {
      this.active = true;
      this.dir = -this.dir;
      this.az = CAM.yaw - this.dir * 0.82;
    }
    return;
  }
  this.az += this.dir * (this.V / this.D) * dt;
  if (Math.abs(this.az - CAM.yaw) > 0.84) {
    this.active = false;
    this.t = 50 + rng() * 60;
  }
};
aircraft.pos = function () {
  return [CAM.x + Math.sin(this.az) * this.D, this.Y, CAM.z + Math.cos(this.az) * this.D];
};
aircraft.draw = function () {
  if (!this.active) return;
  const [px, py, pz] = this.pos();
  const yawq = this.dir > 0 ? this.az : this.az + Math.PI;
  ctx.beginPath();
  pathSegsTf(TPL_PLANE, px, py, pz, yawq, 0);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = 'rgb(190,208,255)';
  ctx.stroke();
  /* beacon (slow red blink) + white strobe double-flash */
  const bph = perf % 1.3;
  queueGlow(px, py + 1.0, pz, 1.3, 'red', bph < 0.4 ? 0.5 : 0.1);
  const sph = perf % 1.7;
  if (sph < 0.07 || (sph > 0.16 && sph < 0.23)) {
    queueGlow(px, py, pz, 1.5, 'white', 0.8);
  }
};

/* --- truck traffic: gate stop-and-go with follow behaviour --- */
const gate = { x: 132, stopX: 122, arm: 0, open: false }; // arm angle rad
const trucks = [
  { s: 34, v: 8, cleared: false, dwell: 0, wheel: 0, vmax: 8.6 },
  { s: 96, v: 7.5, cleared: false, dwell: 0, wheel: 0, vmax: 8.0 },
  { s: -44, v: 8, cleared: false, dwell: 0, wheel: 0, vmax: 9.2 }
];
const TRUCK_LEN = 19.5, T_ACC = 1.5, T_BRK = 2.6;

function updateTrucks(dt) {
  const sorted = [...trucks].sort((a, b) => a.s - b.s);
  gate.open = false;
  for (let i = 0; i < sorted.length; i++) {
    const tr = sorted[i];
    const leader = sorted[i + 1];
    let vAllow = tr.vmax;

    if (leader) {
      const gap = leader.s - TRUCK_LEN - tr.s - 4;
      vAllow = Math.min(vAllow, leader.v + Math.sqrt(Math.max(0, 2 * T_BRK * Math.max(0, gap))));
    }
    if (!tr.cleared && tr.s < gate.stopX) {
      const dStop = gate.stopX - tr.s;
      vAllow = Math.min(vAllow, Math.sqrt(Math.max(0, 2 * T_BRK * Math.max(0, dStop - 0.4))));
      if (dStop < 0.6 && tr.v < 0.1) {
        tr.v = 0;
        if (tr.dwell === 0) tr.dwell = 2.6 + rng() * 1.8;
      }
    }
    if (tr.dwell > 0) {
      tr.dwell -= dt;
      gate.open = true;
      if (tr.dwell <= 0) { tr.cleared = true; tr.dwell = 0; }
      continue;
    }
    if (tr.cleared && tr.s > gate.stopX - 2 && tr.s < gate.x + 14) gate.open = true;

    tr.braking = tr.v > vAllow + 0.15;
    if (tr.v > vAllow) tr.v = Math.max(vAllow, tr.v - T_BRK * dt);
    else tr.v = Math.min(vAllow, tr.v + T_ACC * dt);
    tr.s += tr.v * dt;
    tr.wheel += tr.v * dt / 0.55;

    if (tr.s > 245) {
      tr.s = -120 - rng() * 70;
      tr.v = tr.vmax * 0.8;
      tr.cleared = false;
    }
  }
  /* gate arm eases toward open/closed */
  const target = gate.open ? 1.32 : 0;
  const rate = 1.25;
  if (gate.arm < target) gate.arm = Math.min(target, gate.arm + rate * dt);
  else gate.arm = Math.max(target, gate.arm - rate * dt);
}

function truckGlows(tr, rz, f) {
  for (const l of TPL.truck.lightsF) queueGlow(tr.s + l[0], l[1], rz + l[2], 0.24, 'white', 0.8 * f);
  for (const l of TPL.truck.lightsM) queueGlow(tr.s + l[0], l[1], rz + l[2], 0.11, 'white', 0.4 * f);
  for (const l of TPL.truck.lightsR) queueGlow(tr.s + l[0], l[1], rz + l[2], 0.2, 'red', (tr.braking ? 0.95 : 0.45) * f);
  for (const l of TPL.truck.lightsRM) queueGlow(tr.s + l[0], l[1], rz + l[2], 0.12, 'red', 0.4 * f);
  queueBeam(tr.s + 9.85, rz, 1, 15, f);
}

function drawTrucks() {
  for (const tr of trucks) {
    const f = fog(dist(tr.s, 2, ROAD_Z));
    if (f <= FOG_MIN + 0.005 && (tr.s < -90 || tr.s > 220)) continue;
    drawVehicle(TPL.truck, tr.s, 0, ROAD_Z, 0, tr.wheel, f);
    truckGlows(tr, ROAD_Z, f);
  }
  /* gate arm swings up when a truck is released */
  const armLen = 5.4;
  const py = 1.2, pz = ROAD_Z - 3.4;
  const ey = py + armLen * Math.sin(gate.arm), ez = pz + armLen * Math.cos(gate.arm);
  ctx.beginPath();
  pathSeg(gate.x + 0.25, py, pz, gate.x + 0.25, ey, ez);
  pathSeg(gate.x + 0.25, py + 0.22, pz, gate.x + 0.25, ey + 0.22 * Math.cos(gate.arm), ez - 0.22 * Math.sin(gate.arm));
  strokeStyled('red', fog(dist(gate.x, 1.5, ROAD_Z)));
  queueGlow(gate.x + 0.25, ey, ez, 0.2, 'red', 0.7);
}

/* --- exit lane: trucks that already cleared the gate roll past the camera --- */
const trucks2 = [
  { s: 15, v: 9.5, vmax: 10, wheel: 0 },
  { s: -95, v: 9, vmax: 9.4, wheel: 0 }
];
function updateTrucks2(dt) {
  const sorted = [...trucks2].sort((a, b) => a.s - b.s);
  for (let i = 0; i < sorted.length; i++) {
    const tr = sorted[i];
    const leader = sorted[i + 1];
    let vAllow = tr.vmax;
    if (leader) {
      const gap = leader.s - TRUCK_LEN - tr.s - 4;
      vAllow = Math.min(vAllow, leader.v + Math.sqrt(Math.max(0, 2 * T_BRK * Math.max(0, gap))));
    }
    tr.braking = tr.v > vAllow + 0.15;
    if (tr.v > vAllow) tr.v = Math.max(vAllow, tr.v - T_BRK * dt);
    else tr.v = Math.min(vAllow, tr.v + T_ACC * dt);
    tr.s += tr.v * dt;
    tr.wheel += tr.v * dt / 0.55;
    if (tr.s > 280) {
      tr.s = -130 - rng() * 80;
      tr.v = tr.vmax * 0.85;
    }
  }
}
function drawTrucks2() {
  for (const tr of trucks2) {
    if (tr.s < -60) continue;
    const f = fog(dist(tr.s, 2, ROAD2_Z));
    drawVehicle(TPL.truck, tr.s, 0, ROAD2_Z, 0, tr.wheel, f);
    truckGlows(tr, ROAD2_Z, f);
  }
}

/* --- inbound lane (outermost, far right): opposing traffic heading down-corridor --- */
const trucks3 = [
  { s: 120, v: 8.5, vmax: 8.8, wheel: 0 },
  { s: 300, v: 9, vmax: 9.5, wheel: 0 }
];
function updateTrucks3(dt) {
  const sorted = [...trucks3].sort((a, b) => b.s - a.s);  // these drive -X: smaller s is ahead
  for (let i = 0; i < sorted.length; i++) {
    const tr = sorted[i];
    const leader = sorted[i + 1];
    let vAllow = tr.vmax;
    if (leader) {
      const gap = tr.s - leader.s - TRUCK_LEN - 4;
      vAllow = Math.min(vAllow, leader.v + Math.sqrt(Math.max(0, 2 * T_BRK * Math.max(0, gap))));
    }
    tr.braking = tr.v > vAllow + 0.15;
    if (tr.v > vAllow) tr.v = Math.max(vAllow, tr.v - T_BRK * dt);
    else tr.v = Math.min(vAllow, tr.v + T_ACC * dt);
    tr.s -= tr.v * dt;
    tr.wheel += tr.v * dt / 0.55;
    if (tr.s < -85) {
      tr.s = 260 + rng() * 130;
      tr.v = tr.vmax * 0.85;
    }
  }
}
function drawTrucks3() {
  for (const tr of trucks3) {
    const f = fog(dist(tr.s, 2, ROAD3_Z));
    if (f <= FOG_MIN + 0.005 && tr.s > 200) continue;
    drawVehicle(TPL.truck, tr.s, 0, ROAD3_Z, Math.PI, tr.wheel, f);
    /* mirrored light offsets: the template faces +X but these trucks face -X */
    for (const l of TPL.truck.lightsF) queueGlow(tr.s - l[0], l[1], ROAD3_Z - l[2], 0.24, 'white', 0.8 * f);
    for (const l of TPL.truck.lightsM) queueGlow(tr.s - l[0], l[1], ROAD3_Z - l[2], 0.11, 'white', 0.4 * f);
    for (const l of TPL.truck.lightsR) queueGlow(tr.s - l[0], l[1], ROAD3_Z - l[2], 0.2, 'red', (tr.braking ? 0.95 : 0.45) * f);
    for (const l of TPL.truck.lightsRM) queueGlow(tr.s - l[0], l[1], ROAD3_Z - l[2], 0.12, 'red', 0.4 * f);
    queueBeam(tr.s - 9.85, ROAD3_Z, -1, 15, f);
  }
}

/* --- forklift working the stack aisle: shuttles a pile of crates between the
       two aisle-end stacks, one box at a time. At each stack it stops short,
       raises the forks to the work level, creeps in, picks/places the top
       crate, backs out and lowers ‚Äî so the forks never cut through the pile. --- */
const forklift = {
  z: 34, v: 0, dir: -1, phase: 'drive', pause: 0, wheel: 0, carry: false,
  lift: 0.25, liftTarget: 0.25,
  Z0: 22, Z1: 46, X: 60,
  VMAX: 4.2, ACC: 1.8, BRK: 2.2,
  LVL: 1.3,                                      // stacked-crate pitch
  STANDOFF: 1.2, CREEP: 0.6,
  stacks: {
    A: { z: 20.42, yaw: Math.PI / 2, n: 3 },     // load centre when spotted at Z0
    B: { z: 47.58, yaw: -Math.PI / 2, n: 0 }
  }
};
forklift.endStack = function () { return this.dir > 0 ? this.stacks.B : this.stacks.A; };
forklift.update = function (dt) {
  /* mast carriage tracks its target at hydraulic speed */
  const rate = this.liftTarget > this.lift ? 1.1 : 1.5;
  if (Math.abs(this.liftTarget - this.lift) > 0.02) {
    this.lift += Math.sign(this.liftTarget - this.lift) * rate * dt;
  }
  const stopZ = this.dir > 0 ? this.Z1 : this.Z0;
  const standZ = stopZ - this.dir * this.STANDOFF;
  if (this.phase === 'drive') {
    const remain = (standZ - this.z) * this.dir;
    const vAllow = Math.sqrt(Math.max(0, 2 * this.BRK * remain));
    this.v = Math.min(this.VMAX, vAllow, this.v + this.ACC * dt);
    this.z += this.dir * this.v * dt;
    this.wheel += this.v * dt / 0.45;
    if (remain <= 0.05 && this.v < 0.3) {
      this.v = 0;
      const st = this.endStack();
      if (this.carry) {                          // set the box down on top
        this.liftTarget = st.n * this.LVL + 0.1;
        this.phase = 'raise';
      } else if (st.n > 0) {                     // forks under the top box
        this.liftTarget = (st.n - 1) * this.LVL + 0.08;
        this.phase = 'raise';
      } else {                                   // this side is empty: turn back
        this.phase = 'wait'; this.pause = 1.3;
      }
    }
  } else if (this.phase === 'raise') {
    if (Math.abs(this.lift - this.liftTarget) <= 0.03) this.phase = 'approach';
  } else if (this.phase === 'approach') {
    this.z += this.dir * this.CREEP * dt;
    this.wheel += this.CREEP * dt / 0.45;
    if ((stopZ - this.z) * this.dir <= 0.02) { this.z = stopZ; this.phase = 'hold'; this.pause = 0.6; }
  } else if (this.phase === 'hold') {
    this.pause -= dt;
    if (this.pause <= 0) {
      const st = this.endStack();
      if (this.carry) { st.n++; this.carry = false; }
      else { st.n--; this.carry = true; this.liftTarget = this.lift + 0.14; }
      this.phase = 'retreat';
    }
  } else if (this.phase === 'retreat') {
    this.z -= this.dir * this.CREEP * dt;
    this.wheel -= this.CREEP * dt / 0.45;
    if ((this.z - standZ) * this.dir <= 0.02) { this.z = standZ; this.liftTarget = 0.25; this.phase = 'lower'; }
  } else if (this.phase === 'lower') {
    if (Math.abs(this.lift - this.liftTarget) <= 0.03) { this.phase = 'wait'; this.pause = 0.5 + rng() * 0.8; }
  } else if (this.phase === 'wait') {
    this.pause -= dt;
    if (this.pause <= 0) { this.dir = -this.dir; this.phase = 'drive'; }
  }
};
forklift.draw = function () {
  /* the two aisle-end crate stacks */
  for (const k in this.stacks) {
    const st = this.stacks[k];
    if (!st.n) continue;
    const fs = fog(dist(this.X, 1, st.z));
    ctx.beginPath();
    for (let i = 0; i < st.n; i++) pathSegsTf(TPL_CRATE, this.X, i * this.LVL, st.z, st.yaw, 0);
    strokeStyled('veh', fs);
  }
  const yawq = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  const f = fog(dist(this.X, 1.5, this.z));
  drawVehicle(TPL.forklift, this.X, 0, this.z, yawq, this.wheel, f);
  /* carriage + load ride the mast at the current lift height */
  ctx.beginPath();
  pathSegsTf(TPL.forklift.carr, this.X, this.lift, this.z, yawq, 0);
  if (this.carry) pathSegsTf(TPL.forklift.load, this.X, this.lift, this.z, yawq, 0);
  strokeStyled('veh', f);
  const b = TPL.forklift.beacon;
  const cy = Math.cos(yawq), sy = Math.sin(yawq);
  queueGlow(this.X + b[0] * cy + b[2] * sy, b[1], this.z - b[0] * sy + b[2] * cy, 0.16, 'red',
    this.v > 0.2 ? 0.6 + 0.35 * Math.sin(perf * 9) : 0.28);
};

/* ---------------------------------------------------------------- render */

function drawBackground() {
  ctx.globalAlpha = 1;
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);
  /* horizon haze */
  const hy = halfH - focal * Math.tan(CAM.pitch + par.pitch);
  const band = ctx.createLinearGradient(0, hy - 70, 0, hy + 90);
  band.addColorStop(0, 'rgba(110,150,255,0)');
  band.addColorStop(0.55, 'rgba(110,150,255,0.055)');
  band.addColorStop(1, 'rgba(110,150,255,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, hy - 70, W, 160);
}

function drawStars(t) {
  for (const s of stars) {
    const p = projPoint(s.x, s.y, s.z);
    if (!p) continue;
    const tw = REDUCED ? 1 : 0.7 + 0.3 * Math.sin(t * s.tw + s.ph);
    ctx.globalAlpha = s.a * tw;
    ctx.fillStyle = s.red ? '#ff4545' : '#cfe0ff';
    ctx.fillRect(p[0], p[1], s.s, s.s);
  }
  ctx.globalAlpha = 1;
}

function drawChunks() {
  for (const key of STYLE_ORDER) {
    for (const ch of chunks[key]) {
      ctx.beginPath();
      const a = ch.arr;
      for (let i = 0; i < a.length; i += 6) {
        pathSeg(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5]);
      }
      strokeStyled(key, ch.fog);
    }
  }
}

let perf = 0;
function render(t) {
  perf = t;
  computeView(t);
  drawBackground();
  drawStars(t);
  drawChunks();
  aircraft.draw();
  forklift.draw();
  rail.draw();
  delivery.draw();
  crane.draw();
  train.draw();
  drawTrucks();
  drawTrucks2();
  drawTrucks3();
  drawLighting();
  drawGlows(t);
  ctx.globalAlpha = 1;
  if (DEBUG) drawDebug();
}

/* ---------------------------------------------------------------- loop */

let last = 0;
function frame(ms) {
  const t = ms / 1000;
  const dt = Math.min(0.05, last ? t - last : 0.016);
  last = t;

  train.update(dt);
  rail.update(dt);
  crane.update(dt);
  delivery.update(dt);
  aircraft.update(dt);
  updateTrucks(dt);
  updateTrucks2(dt);
  updateTrucks3(dt);
  forklift.update(dt);

  /* parallax easing */
  par.yaw += (par.tYaw - par.yaw) * Math.min(1, dt * 2.5);
  par.pitch += (par.tPitch - par.pitch) * Math.min(1, dt * 2.5);

  render(t);
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- sizing & input */

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = hero.clientWidth;
  H = hero.clientHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.lineCap = 'round';
  halfW = W / 2;
  /* portrait: widen the lens a little and lift the scene slightly */
  const portrait = W / H < 0.85;
  halfH = portrait ? H * 0.45 : H / 2;
  focal = (H / 2) / Math.tan((CAM.fov + (portrait ? 8 * Math.PI / 180 : 0)) / 2);
  bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#081027');
  bgGrad.addColorStop(0.42, '#070f23');
  bgGrad.addColorStop(1, '#050b1c');
  if (REDUCED) { computeView(0); render(0); }
}
buildWorld();
new ResizeObserver(resize).observe(hero);
resize();

if (!REDUCED) {
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    par.tYaw = ((e.clientX - r.left) / r.width - 0.5) * 0.035;
    par.tPitch = ((e.clientY - r.top) / r.height - 0.5) * 0.02;
  });
  hero.addEventListener('pointerleave', () => { par.tYaw = 0; par.tPitch = 0; });
  requestAnimationFrame(frame);
} else {
  computeView(0); render(0);
}

/* ---------------------------------------------------------------- debug */

let dbgEl = null;
function drawDebug() {
  if (!dbgEl) {
    dbgEl = document.createElement('div');
    dbgEl.style.cssText = 'position:fixed;top:70px;right:12px;z-index:99;font:11px monospace;color:#9fb;white-space:pre;background:rgba(0,0,0,.5);padding:8px;';
    document.body.appendChild(dbgEl);
  }
  dbgEl.textContent =
    `cam ${CAM.x.toFixed(1)}, ${CAM.y.toFixed(1)}, ${CAM.z.toFixed(1)}\n` +
    `yaw ${(CAM.yaw * 180 / Math.PI).toFixed(1)}  pitch ${(CAM.pitch * 180 / Math.PI).toFixed(1)}  fov ${(CAM.fov * 180 / Math.PI).toFixed(0)}`;
}
if (DEBUG) {
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') CAM.yaw -= 0.01;
    else if (k === 'ArrowRight') CAM.yaw += 0.01;
    else if (k === 'ArrowUp') CAM.pitch -= 0.005;
    else if (k === 'ArrowDown') CAM.pitch += 0.005;
    else if (k === 'a') CAM.x -= 2;
    else if (k === 'd') CAM.x += 2;
    else if (k === 'w') CAM.z += 2;
    else if (k === 's') CAM.z -= 2;
    else if (k === 'r') CAM.y += 1;
    else if (k === 'f') CAM.y -= 1;
    else if (k === '-') CAM.fov += 0.02;
    else if (k === '=') CAM.fov -= 0.02;
    else if (k === 'p') console.log(JSON.stringify({ x: CAM.x, y: CAM.y, z: CAM.z, yaw: CAM.yaw * 180 / Math.PI, pitch: CAM.pitch * 180 / Math.PI, fov: CAM.fov * 180 / Math.PI }));
    else return;
    focal = (H / 2) / Math.tan(CAM.fov / 2);
    e.preventDefault();
  });
}

})();
