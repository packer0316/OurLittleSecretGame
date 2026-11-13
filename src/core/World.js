import { subtractRect } from './utils.js';

const STEP = 0.45; // 可直接跨上的高度
const HEAD = 1.75; // 身高（低於此高度的懸空面會擋住人）

/**
 * 碰撞世界：支援多樓層。
 * - boxes / circles：有高度範圍的牆與障礙物
 * - surfaces：可站立的樓板與斜坡（樓梯）
 * - terrain：室外地形高度函式
 */
export class World {
  constructor() {
    this.boxes = [];
    this.circles = [];
    this.surfaces = [];
    this.terrain = () => 0;
    this.bounds = null;
  }
  box(x1, z1, x2, z2, y1 = -1e9, y2 = 1e9) {
    this.boxes.push({ x1: Math.min(x1, x2), x2: Math.max(x1, x2), z1: Math.min(z1, z2), z2: Math.max(z1, z2), y1, y2 });
  }
  circle(x, z, r, y1 = -1e9, y2 = 1e9) {
    this.circles.push({ x, z, r, y1, y2 });
  }
  /** 以一串圓近似一條斜線障礙（例如半開的門） */
  line(x1, z1, x2, z2, r, y1 = -1e9, y2 = 1e9) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.ceil(len / (r * 1.5)));
    for (let i = 0; i <= n; i++) this.circle(x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, r, y1, y2);
  }
  floor(x1, z1, x2, z2, y, solid = false) {
    this.surfaces.push({ x1: Math.min(x1, x2), x2: Math.max(x1, x2), z1: Math.min(z1, z2), z2: Math.max(z1, z2), y, solid });
  }
  /** 樓板扣掉數個開口（樓梯口） */
  floorWithHoles(rect, holes, y) {
    let rects = [rect];
    for (const h of holes) rects = rects.flatMap((r) => subtractRect(r, h));
    for (const r of rects) this.floor(r.x1, r.z1, r.x2, r.z2, y);
    return rects;
  }
  /** 斜坡：axis 為延伸方向，ya 為座標較小端的高度，yb 為較大端的高度 */
  ramp(x1, z1, x2, z2, axis, ya, yb, solid = false) {
    this.surfaces.push({ x1: Math.min(x1, x2), x2: Math.max(x1, x2), z1: Math.min(z1, z2), z2: Math.max(z1, z2), axis, ya, yb, solid });
  }

  /** 查詢 (x,z) 在腳底高度 feet 時可站立的地面高度，以及是否被實體擋住 */
  probe(x, z, feet) {
    let g = this.terrain(x, z);
    let blocked = false;
    const ss = this.surfaces;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      if (x < s.x1 || x > s.x2 || z < s.z1 || z > s.z2) continue;
      let sy;
      if (s.axis === 'x') sy = s.ya + ((s.yb - s.ya) * (x - s.x1)) / (s.x2 - s.x1);
      else if (s.axis === 'z') sy = s.ya + ((s.yb - s.ya) * (z - s.z1)) / (s.z2 - s.z1);
      else sy = s.y;
      if (sy <= feet + STEP) { if (sy > g) g = sy; }
      else if (s.solid || sy < feet + HEAD) blocked = true;
    }
    return { g, blocked };
  }

  /** 將圓形角色推出障礙物（直接修改 p.x / p.z） */
  occluded(a, b) {
    // Slab intersection against collision volumes. Endpoints on the surface of
    // an inspectable prop are not treated as an obstruction.
    for (const box of this.boxes) {
      if (box.disabled) continue;
      let near = 0, far = 0.97;
      for (const [axis, lo, hi] of [['x',box.x1,box.x2],['y',box.y1,box.y2],['z',box.z1,box.z2]]) {
        const d=b[axis]-a[axis];
        if (Math.abs(d)<1e-8) { if(a[axis]<lo || a[axis]>hi){far=-1;break;} }
        else { const t1=(lo-a[axis])/d,t2=(hi-a[axis])/d;near=Math.max(near,Math.min(t1,t2));far=Math.min(far,Math.max(t1,t2)); }
      }
      if(far>=near && far>0.04 && near<0.97) return true;
    }
    return false;
  }

  resolve(p, r, feet) {
    const lo = feet + 0.4, hi = feet + 1.7;
    for (let iter = 0; iter < 2; iter++) {
      const bs = this.boxes;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (b.disabled) continue;
        if (b.y2 < lo || b.y1 > hi) continue;
        if (p.x < b.x1 - r || p.x > b.x2 + r || p.z < b.z1 - r || p.z > b.z2 + r) continue;
        const cx = p.x < b.x1 ? b.x1 : p.x > b.x2 ? b.x2 : p.x;
        const cz = p.z < b.z1 ? b.z1 : p.z > b.z2 ? b.z2 : p.z;
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // 圓心在方塊內：沿最短方向推出
          const l = p.x - b.x1, rr = b.x2 - p.x, t = p.z - b.z1, bb = b.z2 - p.z;
          const m = Math.min(l, rr, t, bb);
          if (m === l) p.x = b.x1 - r; else if (m === rr) p.x = b.x2 + r;
          else if (m === t) p.z = b.z1 - r; else p.z = b.z2 + r;
        }
      }
      const cs = this.circles;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (c.y2 < lo || c.y1 > hi) continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          p.x = c.x + (dx / d) * rr;
          p.z = c.z + (dz / d) * rr;
        } else p.x = c.x + rr;
      }
    }
    if (this.bounds) {
      const b = this.bounds;
      if (p.x < b.x1) p.x = b.x1; else if (p.x > b.x2) p.x = b.x2;
      if (p.z < b.z1) p.z = b.z1; else if (p.z > b.z2) p.z = b.z2;
    }
  }
}
