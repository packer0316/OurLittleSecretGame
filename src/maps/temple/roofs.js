import * as THREE from 'three';
import { lerp } from '../../core/utils.js';

function gridGeo(nu, nt, fn, flip = false) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nt; j++) {
    for (let i = 0; i <= nu; i++) {
      const r = fn(i / nu, j / nt);
      pos.push(r[0], r[1], r[2]);
      uv.push(r[3], r[4]);
    }
  }
  const w = nu + 1;
  for (let j = 0; j < nt; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * w + i, b = (j + 1) * w + i, c = j * w + i + 1, d = (j + 1) * w + i + 1;
      if (flip) idx.push(a, c, b, c, d, b); else idx.push(a, b, c, c, b, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 環狀腰簷：從外圈屋簷（outer, yEave）往上收到內圈牆面（inner, yTop）。
 * 屋面為內凹曲線，四個簷角上翹。
 */
export function ringRoofGeos(outer, inner, yEave, yTop, lift = 0.8, tile = 2.2) {
  const sides = [
    [[inner.x1, inner.z2], [inner.x2, inner.z2], [outer.x1, outer.z2], [outer.x2, outer.z2]],
    [[inner.x2, inner.z1], [inner.x1, inner.z1], [outer.x2, outer.z1], [outer.x1, outer.z1]],
    [[inner.x2, inner.z2], [inner.x2, inner.z1], [outer.x2, outer.z2], [outer.x2, outer.z1]],
    [[inner.x1, inner.z1], [inner.x1, inner.z2], [outer.x1, outer.z1], [outer.x1, outer.z2]],
  ];
  return sides.map(([iA, iB, oA, oB]) => {
    const lenO = Math.hypot(oB[0] - oA[0], oB[1] - oA[1]);
    const depth = Math.hypot((oA[0] + oB[0] - iA[0] - iB[0]) / 2, (oA[1] + oB[1] - iA[1] - iB[1]) / 2);
    const slope = Math.hypot(depth, yTop - yEave);
    return gridGeo(Math.max(12, Math.round(lenO / 1.4)), 6, (u, t) => {
      const ix = lerp(iA[0], iB[0], u), iz = lerp(iA[1], iB[1], u);
      const ox = lerp(oA[0], oB[0], u), oz = lerp(oA[1], oB[1], u);
      const prof = 1 - Math.pow(1 - t, 1.75);
      const y = yTop + (yEave - yTop) * prof + lift * Math.pow(Math.abs(2 * u - 1), 6) * t * t;
      return [lerp(ix, ox, t), y, lerp(iz, oz, t), (u * lenO) / tile, (t * slope) / tile];
    });
  });
}

/** 屋簷邊緣的連續曲線（給封簷板用） */
export function ringEaveCurves(outer, yEave, lift = 0.8) {
  const c = [[outer.x1, outer.z2], [outer.x2, outer.z2], [outer.x2, outer.z1], [outer.x1, outer.z1]];
  const curves = [];
  for (let k = 0; k < 4; k++) {
    const a = c[k], b = c[(k + 1) % 4];
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      pts.push(new THREE.Vector3(lerp(a[0], b[0], u), yEave + lift * Math.pow(Math.abs(2 * u - 1), 6), lerp(a[1], b[1], u)));
    }
    curves.push(new THREE.CatmullRomCurve3(pts));
  }
  return curves;
}

/** 頂層大屋頂（兩坡、內凹曲面、燕尾翹脊） */
export function gableRoof({ x1, x2, zc, halfD, eaveY, rise, lift = 1.1, tile = 2.2 }) {
  const profile = (t) => eaveY + rise * Math.pow(1 - t, 1.6);
  const liftAt = (u, t) => lift * Math.pow(Math.abs(2 * u - 1), 4) * (0.35 + 0.65 * t * t);
  const slope = Math.hypot(halfD, rise) * 1.06;
  const make = (sign) => gridGeo(40, 12, (u, t) => {
    const x = lerp(x1, x2, u);
    return [x, profile(t) + liftAt(u, t), zc + sign * halfD * t, (x - x1) / tile, (t * slope) / tile];
  }, sign < 0);
  const ridgePts = [];
  const ext = 0.7;
  for (let i = 0; i <= 30; i++) {
    const u = i / 30;
    const x = lerp(x1 - ext, x2 + ext, u);
    ridgePts.push(new THREE.Vector3(x, profile(0) + 0.18 + (lift + 1.3) * Math.pow(Math.abs(2 * u - 1), 3.4), zc));
  }
  const hips = [];
  for (const u of [0, 1]) {
    for (const sign of [-1, 1]) {
      const pts = [];
      for (let j = 0; j <= 12; j++) {
        const t = j / 12;
        pts.push(new THREE.Vector3(lerp(x1, x2, u), profile(t) + liftAt(u, t) + 0.1, zc + sign * halfD * t));
      }
      hips.push(new THREE.CatmullRomCurve3(pts));
    }
  }
  return { slopes: [make(1), make(-1)], ridge: new THREE.CatmullRomCurve3(ridgePts), hips, profile };
}

/** 山牆：填滿牆頂到屋面之間的三角區 */
export function gableWallGeo(x, z1, z2, yBase, zc, halfD, profile, flip = false, tile = 2) {
  const n = 24;
  return gridGeo(n, 1, (u, t) => {
    const z = lerp(z1, z2, u);
    const tt = Math.min(1, Math.abs(z - zc) / halfD);
    const yTop = Math.max(yBase, profile(tt) - 0.06);
    const y = lerp(yBase, yTop, t);
    return [x, y, z, z / tile, y / tile];
  }, flip);
}
