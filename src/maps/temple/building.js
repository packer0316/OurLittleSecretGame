import * as THREE from 'three';
import { FLOORS, WALL_T as T, SLAB, PLINTH as P, STEPS, STAIRS, stairRect } from './layout.js';
import { boxGeo, xf, subtractRect } from '../../core/utils.js';
import { ringRoofGeos, ringEaveCurves, gableRoof, gableWallGeo } from './roofs.js';
import { plaqueTexture } from '../../core/canvasTex.js';

const expand = (r, d) => ({ x1: r.x1 - d, x2: r.x2 + d, z1: r.z1 - d, z2: r.z2 + d });

/** 每層樓的柱位 */
export const COLS = [
  { xs: [-11.5, -5, 5, 11.5], zs: [-17.5, -23, -28.2] },
  { xs: [-11.5, -4, 4, 11.5], zs: [-18.5, -23, -27.5] },
  { xs: [-11.5, -4, 4, 11], zs: [-19.5, -25] },
];
const PORCH_XS = [-19, -13.4, -7.8, -2.9, 2.9, 7.8, 13.4, 19];
const PORCH_Z = -8.8;

/** 一道牆（可開門窗），並建立碰撞 */
export function wallRun(ctx, { axis, c, a, b, y0, y1, t = T, mat, openings = [] }) {
  const { batch, world } = ctx;
  const piece = (u1, u2, ya, yb) => {
    if (u2 - u1 < 0.01 || yb - ya < 0.01) return;
    if (axis === 'x') batch.span(mat, u1, ya, c - t / 2, u2, yb, c + t / 2);
    else batch.span(mat, c - t / 2, ya, u1, c + t / 2, yb, u2);
  };
  const collide = (u1, u2) => {
    if (u2 - u1 < 0.01) return;
    if (axis === 'x') world.box(u1, c - t / 2, u2, c + t / 2, y0, y1);
    else world.box(c - t / 2, u1, c + t / 2, u2, y0, y1);
  };
  const ops = [...openings].sort((p, q) => p.from - q.from);
  let cur = a, solid = a;
  for (const o of ops) {
    piece(cur, o.from, y0, y1);
    piece(o.from, o.to, y0, o.bottom);
    piece(o.from, o.to, o.top, y1);
    if (o.door) { collide(solid, o.from); solid = o.to; }
    cur = o.to;
  }
  piece(cur, b, y0, y1);
  collide(solid, b);
}

/** 木格窗（部分窗櫺斷裂；boarded 時從內側釘上木板） */
export function lattice(ctx, { axis, c, from, to, bottom, top, boarded = false, inward = 1 }) {
  const { batch, mats, rng } = ctx;
  const put = (u1, ya, u2, yb, th) => {
    if (axis === 'x') batch.span(mats.woodDark, u1, ya, c - th / 2, u2, yb, c + th / 2, 1);
    else batch.span(mats.woodDark, c - th / 2, ya, u1, c + th / 2, yb, u2, 1);
  };
  put(from, bottom, to, bottom + 0.1, 0.5); put(from, top - 0.1, to, top, 0.5);
  put(from, bottom, from + 0.1, top, 0.5); put(to - 0.1, bottom, to, top, 0.5);
  const n = Math.round((to - from) / 0.25);
  for (let i = 1; i < n; i++) {
    if (rng() < 0.1) continue;
    const u = from + ((to - from) * i) / n;
    const yb = rng() < 0.1 ? bottom + (top - bottom) * (0.25 + rng() * 0.45) : top;
    put(u - 0.022, bottom, u + 0.022, yb, 0.05);
  }
  for (const f of [0.3, 0.7]) { const y = bottom + (top - bottom) * f; put(from, y - 0.022, to, y + 0.022, 0.06); }
  if (boarded) {
    const len = to - from + 0.7, mid = (from + to) / 2;
    for (let k = 0; k < 4; k++) {
      const y = bottom + (top - bottom) * (0.15 + 0.23 * k) + (rng() - 0.5) * 0.1;
      const rot = (rng() - 0.5) * 0.22;
      const g = axis === 'x'
        ? xf(boxGeo(len, 0.2, 0.035, 0, 0, 0, 1), { p: [mid, y, c + inward * 0.27], r: [0, 0, rot] })
        : xf(boxGeo(0.035, 0.2, len, 0, 0, 0, 1), { p: [c + inward * 0.27, y, mid], r: [rot, 0, 0] });
      batch.add(mats.planks, g);
    }
  }
}

/** 木欄杆 */
export function railing(ctx, axis, c, a, b, y, collide = true) {
  const { batch, mats, world } = ctx;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const put = (u1, ya, u2, yb, th) => {
    if (axis === 'x') batch.span(mats.woodDark, u1, ya, c - th / 2, u2, yb, c + th / 2, 1);
    else batch.span(mats.woodDark, c - th / 2, ya, u1, c + th / 2, yb, u2, 1);
  };
  const n = Math.max(1, Math.round((hi - lo) / 1.1));
  for (let i = 0; i <= n; i++) { const u = lo + ((hi - lo) * i) / n; put(u - 0.05, y, u + 0.05, y + 1.08, 0.1); }
  put(lo, y + 1.0, hi, y + 1.09, 0.12);
  put(lo, y + 0.5, hi, y + 0.56, 0.06);
  put(lo, y + 0.12, hi, y + 0.18, 0.06);
  if (collide) {
    if (axis === 'x') world.box(lo, c - 0.07, hi, c + 0.07, y - 0.2, y + 1.15);
    else world.box(c - 0.07, lo, c + 0.07, hi, y - 0.2, y + 1.15);
  }
}

/** 紅漆木柱 + 石柱礎 */
export function column(ctx, x, z, y0, y1, r = 0.34) {
  const { batch, mats, world } = ctx;
  const h = y1 - y0;
  const g = new THREE.CylinderGeometry(r * 0.93, r, h, 18, 1, true);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * h / 1.6, uv.getX(i) * 1.4);
  g.translate(x, y0 + h / 2, z);
  batch.add(mats.woodRed, g);
  const base = new THREE.CylinderGeometry(r * 1.25, r * 1.5, 0.3, 18);
  base.translate(x, y0 + 0.15, z);
  batch.add(mats.rock, base);
  world.circle(x, z, r + 0.06, y0, y1);
}

/** 門扇（含門釘與門環），angle 為向內開啟的角度 */
export function doorLeaf(ctx, { x, z, y, w, h, angle, side, tilt = 0, studs = true, collide = true }) {
  const { batch, mats, world } = ctx;
  const sgn = side === 'L' ? 1 : -1;
  const tr = { p: [x, y, z], r: [0, sgn * angle, tilt] };
  batch.add(mats.woodRed, xf(boxGeo(w, h, 0.09, (sgn * w) / 2, h / 2, 0, 1.5), tr));
  if (studs) {
    const nx = Math.max(2, Math.round(w / 0.45)), ny = Math.max(3, Math.round(h / 0.6));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (const f of [-1, 1]) {
          const s = new THREE.SphereGeometry(0.04, 5, 3);
          s.translate(sgn * (0.25 + (i * (w - 0.5)) / (nx - 1)), 0.5 + (j * (h - 1)) / (ny - 1), f * 0.05);
          batch.add(mats.brass, xf(s, tr));
        }
      }
    }
    const ring = new THREE.TorusGeometry(0.11, 0.018, 6, 16);
    ring.translate(sgn * (w - 0.3), h * 0.42, 0.07);
    batch.add(mats.brass, xf(ring, tr));
  }
  if (collide) world.line(x, z, x + sgn * Math.cos(angle) * w, z - Math.sin(angle) * w, 0.1, y, y + h);
}

/** 斜向木樑（樓梯側樑、扶手） */
function slopedBeam(axis, u0, y0, u1, y1, v, height, thick) {
  const run = Math.abs(u1 - u0), rise = y1 - y0, L = Math.hypot(run, rise), dir = Math.sign(u1 - u0);
  const g = boxGeo(L, height, thick, 0, 0, 0, 1);
  g.rotateZ(Math.atan2(rise, run));
  if (axis === 'x') { if (dir < 0) g.rotateY(Math.PI); g.translate((u0 + u1) / 2, (y0 + y1) / 2, v); }
  else { g.rotateY((-Math.PI / 2) * dir); g.translate(v, (y0 + y1) / 2, (u0 + u1) / 2); }
  return g;
}

function buildStair(ctx, s) {
  const { batch, world, mats } = ctx;
  const rise = s.y1 - s.y0, n = Math.round(rise / 0.185), dir = Math.sign(s.u1 - s.u0);
  const tread = Math.abs(s.u1 - s.u0) / n, h = rise / n;
  for (let i = 0; i < n; i++) {
    const ua = s.u0 + dir * tread * i, ub = ua + dir * tread * 1.1, top = s.y0 + h * (i + 1);
    const lo = Math.min(ua, ub), hi = Math.max(ua, ub);
    if (s.axis === 'z') {
      batch.span(mats.planks, s.v1, top - 0.06, lo, s.v2, top, hi, 1.4);
      batch.span(mats.woodDark, s.v1 + 0.05, top - h, ua - 0.015, s.v2 - 0.05, top - 0.05, ua + 0.015, 1.4);
    } else {
      batch.span(mats.planks, lo, top - 0.06, s.v1, hi, top, s.v2, 1.4);
      batch.span(mats.woodDark, ua - 0.015, top - h, s.v1 + 0.05, ua + 0.015, top - 0.05, s.v2 - 0.05, 1.4);
    }
  }
  for (const v of [s.v1 + 0.06, s.v2 - 0.06]) {
    batch.add(mats.woodDark, slopedBeam(s.axis, s.u0, s.y0 - 0.12, s.u1, s.y1 - 0.12, v, 0.34, 0.12));
    batch.add(mats.woodDark, slopedBeam(s.axis, s.u0, s.y0 + 1.0, s.u1, s.y1 + 1.0, v, 0.09, 0.1));
    batch.add(mats.woodDark, slopedBeam(s.axis, s.u0, s.y0 + 0.5, s.u1, s.y1 + 0.5, v, 0.05, 0.05));
  }
  const r = stairRect(s);
  const ya = s.u0 < s.u1 ? s.y0 : s.y1, yb = s.u0 < s.u1 ? s.y1 : s.y0;
  world.ramp(r.x1, r.z1, r.x2, r.z2, s.axis, ya, yb, false);
  // 兩側擋住（扶手）
  if (s.axis === 'z') {
    world.box(s.v1 - 0.06, r.z1, s.v1 + 0.02, r.z2, s.y0, s.y1 + 1.1);
    world.box(s.v2 - 0.02, r.z1, s.v2 + 0.06, r.z2, s.y0, s.y1 + 1.1);
  } else {
    world.box(r.x1, s.v1 - 0.06, r.x2, s.v1 + 0.02, s.y0, s.y1 + 1.1);
    world.box(r.x1, s.v2 - 0.02, r.x2, s.v2 + 0.06, s.y0, s.y1 + 1.1);
  }
  // 上層樓梯口的欄杆（兩側 + 底端）
  const side = s.axis === 'z' ? 'z' : 'x';
  railing(ctx, side, s.v1, s.u0, s.u1, s.y1, false);
  railing(ctx, side, s.v2, s.u0, s.u1, s.y1, false);
  railing(ctx, s.axis === 'z' ? 'x' : 'z', s.u0, s.v1, s.v2, s.y1, true);
}

function spanMinus(a, b, cut) {
  if (!cut || cut[1] <= a || cut[0] >= b) return [[a, b]];
  const out = [];
  if (cut[0] > a) out.push([a, cut[0]]);
  if (cut[1] < b) out.push([cut[1], b]);
  return out;
}

export function buildTemple(ctx) {
  const { batch, world, mats, rng, root } = ctx;
  const [F0, F1, F2, F3] = FLOORS;

  // ── 台基與石階 ──
  batch.span(mats.stoneWall, P.x1, -0.5, P.z1, P.x2, P.y - 0.05, P.z2, 2.6);
  batch.span(mats.stoneFloor, P.x1 - 0.12, P.y - 0.05, P.z1 - 0.12, P.x2 + 0.12, P.y, P.z2 + 0.12, 2.4);
  world.floor(P.x1, P.z1, P.x2, P.z2, P.y, true);
  world.box(P.x1, P.z1, P.x2, P.z2, -2, P.y - 0.05); // 台基側面（站在地面時擋住身體）
  const sd = (STEPS.z2 - STEPS.z1) / (STEPS.n - 1), sh = P.y / STEPS.n;
  for (let i = 1; i < STEPS.n; i++) {
    batch.span(mats.stoneFloor, STEPS.x1, -0.3, STEPS.z1 + (i - 1) * sd, STEPS.x2, P.y - i * sh, STEPS.z1 + i * sd, 2.4);
  }
  world.ramp(STEPS.x1, STEPS.z1, STEPS.x2, STEPS.z2, 'z', P.y, 0.1, true);
  for (const sx of [-1, 1]) {
    const xa = sx * (STEPS.x2 + 0.02), xb = sx * (STEPS.x2 + 0.7);
    batch.span(mats.stoneWall, xa, -0.3, STEPS.z1, xb, P.y + 0.12, STEPS.z2 + 0.25, 2.6);
    world.box(xa, STEPS.z1, xb, STEPS.z2 + 0.25, 0, 2);
  }

  // ── 各層牆面與門窗 ──
  const W = (c, w, b, t) => ({ from: c - w / 2, to: c + w / 2, bottom: b, top: t });
  const D = (c, w, h) => ({ from: c - w / 2, to: c + w / 2, bottom: 0, top: h, door: true });
  const many = (cs, w, b, t) => cs.map((c) => W(c, w, b, t));
  const CFG = [
    {
      S: [D(0, 4.4, 4.3), D(-9.2, 2.4, 3.4), D(9.2, 2.4, 3.4), ...many([-5.2, 5.2, -13.6, 13.6], 2.0, 1.5, 4.0), ...many([-17.3, 17.3], 1.8, 1.5, 4.0)],
      E: many([-30.5, -25.5, -20.5, -15.5], 1.8, 1.6, 4.0), W: many([-30.5, -25.5, -20.5, -15.5], 1.8, 1.6, 4.0),
      N: many([-17, -13, 13, 17], 1.8, 3.0, 4.7),
    },
    {
      S: many([-14, -10, -6, -2, 2, 6, 10, 14], 1.6, 1.85, 3.7),
      E: many([-29, -25, -21, -17], 1.6, 1.85, 3.7), W: many([-29, -25, -21, -17], 1.6, 1.85, 3.7), N: [],
    },
    {
      S: many([-12, -8, -4, 0, 4, 8, 12], 1.6, 1.85, 3.7),
      E: many([-27.5, -23, -18.5], 1.6, 1.85, 3.7), W: [], N: [],
    },
    {
      S: [D(0, 2.8, 3.0), ...many([-4.6, 4.6, -7.9, 7.9], 1.5, 1.2, 3.0)],
      E: many([-25, -21.2], 1.5, 1.2, 3.0), W: many([-25, -21.2], 1.5, 1.2, 3.0), N: [],
    },
  ];
  FLOORS.forEach((F, i) => {
    const y0 = F.y, y1 = F.y + F.h - (i < 3 ? SLAB : 0);
    const abs =(ops) => ops.map((o) => ({ ...o, bottom: y0 + o.bottom, top: y0 + o.top }));
    const runs = [
      { key: 'S', axis: 'x', c: F.z2 - T / 2, a: F.x1, b: F.x2, inward: -1 },
      { key: 'N', axis: 'x', c: F.z1 + T / 2, a: F.x1, b: F.x2, inward: 1 },
      { key: 'W', axis: 'z', c: F.x1 + T / 2, a: F.z1 + T, b: F.z2 - T, inward: 1 },
      { key: 'E', axis: 'z', c: F.x2 - T / 2, a: F.z1 + T, b: F.z2 - T, inward: -1 },
    ];
    for (const r of runs) {
      const ops = abs(CFG[i][r.key]);
      wallRun(ctx, { axis: r.axis, c: r.c, a: r.a, b: r.b, y0, y1, mat: mats.plaster, openings: ops });
      for (const o of ops) {
        if (o.door) {
          // 門框與門檻
          const th = T + 0.14;
          const put = (u1, ya, u2, yb) => batch.span(mats.woodDark, u1, ya, r.c - th / 2, u2, yb, r.c + th / 2, 1.2);
          put(o.from - 0.02, y0, o.from + 0.16, o.top); put(o.to - 0.16, y0, o.to + 0.02, o.top);
          put(o.from, o.top - 0.2, o.to, o.top + 0.04);
          batch.span(mats.rock, o.from + 0.16, y0, r.c - 0.16, o.to - 0.16, y0 + 0.16, r.c + 0.16, 1.5);
        } else {
          lattice(ctx, { axis: r.axis, c: r.c, from: o.from, to: o.to, bottom: o.bottom, top: o.top, boarded: i === 3, inward: r.inward });
        }
      }
    }
  });

  // ── 樓板（含樓梯開口）──
  for (let i = 1; i <= 3; i++) {
    const F = FLOORS[i], below = FLOORS[i - 1];
    const base = i === 1 ? { x1: F0.x1, x2: F0.x2, z1: F0.z1, z2: -8.6 } : { x1: below.x1, x2: below.x2, z1: below.z1, z2: below.z2 };
    const hole = stairRect(STAIRS[i - 1]);
    for (const r of subtractRect(base, hole)) {
      if (i === 3) {
        batch.span(mats.stoneFloor, r.x1, F.y - 0.1, r.z1, r.x2, F.y, r.z2, 2.2);
        batch.span(mats.planks, r.x1, F.y - SLAB, r.z1, r.x2, F.y - 0.1, r.z2, 2.2);
      } else batch.span(mats.planks, r.x1, F.y - SLAB, r.z1, r.x2, F.y, r.z2, 2.2);
    }
    const walk = i === 3 ? F2 : F;
    world.floorWithHoles({ x1: walk.x1, x2: walk.x2, z1: walk.z1, z2: walk.z2 }, [hole], F.y);
    // 天花樑（避開樓梯口）
    const cols = COLS[i - 1], yb = F.y - SLAB;
    for (const z of cols.zs) {
      const cut = z > hole.z1 - 0.2 && z < hole.z2 + 0.2 ? [hole.x1 - 0.1, hole.x2 + 0.1] : null;
      for (const [a, b] of spanMinus(below.x1 + T, below.x2 - T, cut)) batch.span(mats.woodDark, a, yb - 0.4, z - 0.16, b, yb, z + 0.16, 1.5);
    }
    for (const x of cols.xs) {
      const cut = x > hole.x1 - 0.2 && x < hole.x2 + 0.2 ? [hole.z1 - 0.1, hole.z2 + 0.1] : null;
      for (const [a, b] of spanMinus(below.z1 + T, below.z2 - T, cut)) batch.span(mats.woodDark, x - 0.14, yb - 0.3, a, x + 0.14, yb, b, 1.5);
    }
    for (const x of cols.xs) for (const z of cols.zs) column(ctx, x, z, below.y, yb - 0.3);
  }
  // 前廊柱列與簷樑
  for (const x of PORCH_XS) column(ctx, x, PORCH_Z, F0.y, F1.y - SLAB - 0.4, 0.36);
  batch.span(mats.woodDark, F0.x1, F1.y - SLAB - 0.42, PORCH_Z - 0.18, F0.x2, F1.y - SLAB, PORCH_Z + 0.18, 1.5);
  for (const x of PORCH_XS) batch.span(mats.woodDark, x - 0.13, F1.y - SLAB - 0.32, PORCH_Z, x + 0.13, F1.y - SLAB, F0.z2 - T, 1.5);

  // ── 樓梯 ──
  STAIRS.forEach((s) => buildStair(ctx, s));

  // ── 四樓露台石欄杆 ──
  {
    const y = F3.y, R = F2, m = 0.18;
    const runs = [
      ['x', R.z2 - m, R.x1, R.x2], ['x', R.z1 + m, R.x1, R.x2], ['z', R.x1 + m, R.z1, R.z2], ['z', R.x2 - m, R.z1, R.z2],
    ];
    for (const [axis, c, a, b] of runs) {
      const put = (u1, ya, u2, yb, th) => {
        if (axis === 'x') batch.span(mats.rock, u1, ya, c - th / 2, u2, yb, c + th / 2, 1.6);
        else batch.span(mats.rock, c - th / 2, ya, u1, c + th / 2, yb, u2, 1.6);
      };
      const n = Math.round((b - a) / 2.4);
      for (let k = 0; k <= n; k++) { const u = a + ((b - a) * k) / n; put(u - 0.15, y, u + 0.15, y + 1.25, 0.3); }
      put(a, y, b, y + 0.85, 0.14);
      put(a, y + 0.95, b, y + 1.1, 0.26);
      if (axis === 'x') world.box(a, c - 0.15, b, c + 0.15, y - 0.3, y + 1.3);
      else world.box(c - 0.15, a, c + 0.15, b, y - 0.3, y + 1.3);
    }
  }

  // ── 腰簷與大屋頂 ──
  const rings = [
    { outer: { x1: P.x1 + 0.2, x2: P.x2 - 0.2, z1: P.z1 + 0.2, z2: P.z2 + 0.8 }, inner: F1, yEave: F1.y, yTop: F1.y + 1.7, lift: 1.0 },
    { outer: expand(F1, 2.2), inner: F2, yEave: F2.y, yTop: F2.y + 1.7, lift: 0.9 },
    { outer: expand(F2, 1.9), inner: expand(F2, 0.02), yEave: F3.y - 1.0, yTop: F3.y - 0.1, lift: 0.8 },
  ];
  for (const r of rings) {
    for (const g of ringRoofGeos(r.outer, r.inner, r.yEave, r.yTop, r.lift)) batch.add(mats.roof, g);
    for (const c of ringEaveCurves(r.outer, r.yEave, r.lift)) batch.add(mats.woodDark, new THREE.TubeGeometry(c, 24, 0.09, 5));
  }
  const yCeil = F3.y + F3.h;
  const zc = (F3.z1 + F3.z2) / 2, halfD = (F3.z2 - F3.z1) / 2 + 2.6;
  const top = gableRoof({ x1: F3.x1 - 2.8, x2: F3.x2 + 2.8, zc, halfD, eaveY: yCeil + 0.28, rise: 4.8, lift: 1.25 });
  for (const g of top.slopes) batch.add(mats.roof, g);
  batch.add(mats.ridge, new THREE.TubeGeometry(top.ridge, 60, 0.3, 8));
  for (const c of top.hips) batch.add(mats.ridge, new THREE.TubeGeometry(c, 20, 0.17, 6));
  batch.span(mats.planks, F3.x1 - 2.4, yCeil, zc - halfD + 0.4, F3.x2 + 2.4, yCeil + 0.2, zc + halfD - 0.4, 2.2);
  batch.add(mats.plaster, gableWallGeo(F3.x2 - T / 2, F3.z1, F3.z2, yCeil + 0.2, zc, halfD, top.profile, false));
  batch.add(mats.plaster, gableWallGeo(F3.x1 + T / 2, F3.z1, F3.z2, yCeil + 0.2, zc, halfD, top.profile, true));
  // 屋脊中央寶塔
  {
    const pts = [[0, 0], [0.5, 0], [0.55, 0.2], [0.3, 0.35], [0.42, 0.6], [0.2, 0.8], [0.3, 1.0], [0.12, 1.25], [0.16, 1.45], [0, 1.9]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 14);
    g.translate(0, top.profile(0) + 0.3, zc);
    batch.add(mats.ridge, g);
  }

  // ── 門 ──
  const dz = F0.z2 - T / 2;
  doorLeaf(ctx, { x: -2.2, z: dz, y: F0.y, w: 2.2, h: 4.3, angle: 1.25, side: 'L' });
  doorLeaf(ctx, { x: 2.2, z: dz, y: F0.y, w: 2.2, h: 4.3, angle: 0.55, side: 'R' });
  doorLeaf(ctx, { x: -10.4, z: dz, y: F0.y, w: 1.2, h: 3.4, angle: 0.02, side: 'L' });
  doorLeaf(ctx, { x: -8.0, z: dz, y: F0.y, w: 1.2, h: 3.4, angle: 0.04, side: 'R' });
  doorLeaf(ctx, { x: 8.0, z: dz, y: F0.y, w: 1.2, h: 3.4, angle: 1.45, side: 'L' });
  // 掉落在前廊的另一扇門
  batch.add(mats.woodRed, xf(boxGeo(1.2, 3.4, 0.09, 0, 0, 0, 1.5), { p: [10.9, F0.y + 0.07, -10.2], r: [Math.PI / 2 - 0.03, 0, 0.5] }));
  // 封死的側門：交叉木板
  for (const rot of [0.5, -0.45]) {
    batch.add(mats.planks, xf(boxGeo(3.2, 0.22, 0.04, 0, 0, 0, 1), { p: [-9.2, F0.y + 1.7, dz + 0.3], r: [0, 0, rot] }));
  }
  for (let k = 0; k < 5; k++) {
    ctx.talisman(-9.2 + (rng() - 0.5) * 1.8, F0.y + 1.3 + rng() * 1.4, dz + 0.26 + k * 0.004, 0, (rng() - 0.5) * 0.5);
  }
  const d4 = F3.z2 - T / 2;
  doorLeaf(ctx, { x: -1.4, z: d4, y: F3.y, w: 1.4, h: 3.0, angle: 0.95, side: 'L' });
  doorLeaf(ctx, { x: 1.4, z: d4, y: F3.y, w: 1.4, h: 3.0, angle: 0.12, side: 'R' });
  for (let k = 0; k < 9; k++) {
    const sx = k % 2 ? 1 : -1;
    ctx.talisman(sx * (1.75 + rng() * 1.2), F3.y + 1.2 + rng() * 1.6, d4 + 0.21 + k * 0.003, 0, (rng() - 0.5) * 0.6);
  }

  // ── 匾額 ──
  const plaque = (text, w, h, x, y, z, rx, rz, seed) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.1),
      [mats.woodDark, mats.woodDark, mats.woodDark, mats.woodDark,
        new THREE.MeshStandardMaterial({ map: plaqueTexture(text, { w: 1024, h: Math.round((1024 * h) / w), seed }), roughness: 0.75, metalness: 0.1 }), mats.woodDark],
    );
    m.position.set(x, y, z); m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    root.add(m);
    return m;
  };
  plaque('大雄寶殿', 4.2, 1.5, 0, F0.y + 5.05, F0.z2 + 0.28, 0.2, 0.045, 3);
  plaque('封', 1.3, 1.3, 0, F3.y + 3.75, F3.z2 + 0.16, 0.12, -0.03, 8);

  // ── 前廊的破燈籠 ──
  for (const x of [-10.6, -5.3, 5.3, 10.6]) ctx.lantern(x, F1.y - SLAB - 0.05, -10.2, 0.9 + rng() * 0.5, false);

  // 柱上的符咒
  for (const x of PORCH_XS) {
    if (rng() < 0.6) ctx.talisman(x + (rng() - 0.5) * 0.1, F0.y + 1.5 + rng() * 0.8, PORCH_Z + 0.36, 0, (rng() - 0.5) * 0.3);
  }
  return { top };
}

export { PORCH_XS, PORCH_Z };
