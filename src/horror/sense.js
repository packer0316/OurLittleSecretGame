import * as THREE from 'three';

/**
 * 玩家感知：每幀量測視角轉動、移動、靜止時間，並提供不配置記憶體的幾何查詢
 * （視野、手電筒光錐、視線遮蔽、可站立位置搜尋）。所有恐怖事件都透過這裡判斷
 * 「玩家現在看不看得到」。
 */
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createSense(game) {
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), flashDir = new THREE.Vector3();
  const tmp = { x: 0, z: 0 }, tmpPos = { x: 0, y: 0, z: 0 };
  let prevYaw = 0, prevX = 0, prevZ = 0, prevStep = 0, first = true;

  const s = {
    eye, fwd, flashDir,
    world: null, map: null,
    yaw: 0, pitch: 0, feet: 0, px: 0, pz: 0,
    yawRate: 0,      // rad/s，平滑後，正值 = 向左轉
    turnAccum: 0,    // 最近約半秒累積的轉動量（rad，帶正負號）
    speed: 0,
    stillTime: 0,    // 完全不動（不走、不轉頭）的秒數
    moveTime: 0,     // 連續行走的秒數
    stepped: false,  // 這一幀玩家踏出一步
    jumped: false,   // 這一幀被瞬移
    hfov: 0.82, vfov: 0.59,
    flashLit: false, // 手電筒實際有在發光
    flashScale: 1,   // 恐怖導演對手電筒的壓暗倍率（由 index.js 每幀寫入）
    indoor: false,

    attach(map) { s.map = map; s.world = map.world; first = true; s.stillTime = 0; s.moveTime = 0; s.turnAccum = 0; s.yawRate = 0; },

    update(dt) {
      const p = game.player, cam = game.camera;
      s.yaw = p.yaw; s.pitch = p.pitch; s.feet = p.pos.y; s.px = p.pos.x; s.pz = p.pos.z;
      eye.set(p.pos.x, p.pos.y + p.eye, p.pos.z);
      const cp = Math.cos(p.pitch);
      fwd.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
      flashDir.set(0, 0, -1).applyQuaternion(p.flashQuat);
      s.vfov = (cam.fov * Math.PI) / 360;
      s.hfov = Math.atan(Math.tan(s.vfov) * cam.aspect);
      s.flashLit = !!p.flashOn && p.flashPower > 0.5 && p.flash.intensity * s.flashScale > 4;
      s.indoor = !!s.map?.indoorAt?.(p.pos);
      if (first) { first = false; prevYaw = p.yaw; prevX = p.pos.x; prevZ = p.pos.z; prevStep = p.stepIndex; }
      const dyaw = wrap(p.yaw - prevYaw), moved = Math.hypot(p.pos.x - prevX, p.pos.z - prevZ);
      s.jumped = moved > 1.5 || Math.abs(dyaw) > 1.4;
      prevYaw = p.yaw; prevX = p.pos.x; prevZ = p.pos.z;
      s.stepped = p.stepIndex !== prevStep; prevStep = p.stepIndex;
      if (dt <= 0) return;
      if (s.jumped) { s.yawRate = 0; s.turnAccum = 0; s.speed = 0; s.stillTime = 0; s.moveTime = 0; return; }
      s.yawRate += (dyaw / dt - s.yawRate) * Math.min(1, dt * 14);
      s.turnAccum = s.turnAccum * Math.exp(-dt / 0.5) + dyaw;
      s.speed += (moved / dt - s.speed) * Math.min(1, dt * 10);
      const still = s.speed < 0.25 && Math.abs(s.yawRate) < 0.35 && p.enabled;
      s.stillTime = still ? s.stillTime + dt : 0;
      s.moveTime = s.speed > 0.8 ? s.moveTime + dt : Math.max(0, s.moveTime - dt * 3);
    },

    /** 從視線正前方到該點的水平夾角（正 = 左方） */
    bearing(x, z) { return wrap(Math.atan2(-(x - s.px), -(z - s.pz)) - s.yaw); },
    dist(x, z) { return Math.hypot(x - s.px, z - s.pz); },
    /** 視線中心到該點的立體夾角 */
    gaze(x, y, z) {
      const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, l = Math.hypot(dx, dy, dz) || 1;
      return Math.acos(clamp((dx * fwd.x + dy * fwd.y + dz * fwd.z) / l, -1, 1));
    },
    inView(x, y, z, margin = 0) {
      if (Math.abs(s.bearing(x, z)) > s.hfov + margin) return false;
      const elev = Math.atan2(y - eye.y, Math.hypot(x - eye.x, z - eye.z));
      return Math.abs(elev - s.pitch) < s.vfov + margin;
    },
    /** 手電筒光軸到該點的夾角（手電筒沒亮時回傳 9） */
    flashAngle(x, y, z) {
      if (!s.flashLit) return 9;
      const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, l = Math.hypot(dx, dy, dz) || 1;
      return Math.acos(clamp((dx * flashDir.x + dy * flashDir.y + dz * flashDir.z) / l, -1, 1));
    },

    /** 兩點之間是否沒有牆、柱、大型陳設擋住（與 World.occluded 同一份碰撞資料，但不配置物件，且包含圓柱） */
    los(ax, ay, az, bx, by, bz) {
      const w = s.world; if (!w) return true;
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const bs = w.boxes;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i]; if (b.disabled) continue;
        let near = 0.03, far = 0.97, t1, t2;
        if (Math.abs(dx) < 1e-8) { if (ax < b.x1 || ax > b.x2) continue; }
        else { t1 = (b.x1 - ax) / dx; t2 = (b.x2 - ax) / dx; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } if (t1 > near) near = t1; if (t2 < far) far = t2; if (near > far) continue; }
        if (Math.abs(dz) < 1e-8) { if (az < b.z1 || az > b.z2) continue; }
        else { t1 = (b.z1 - az) / dz; t2 = (b.z2 - az) / dz; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } if (t1 > near) near = t1; if (t2 < far) far = t2; if (near > far) continue; }
        if (Math.abs(dy) < 1e-8) { if (ay < b.y1 || ay > b.y2) continue; }
        else { t1 = (b.y1 - ay) / dy; t2 = (b.y2 - ay) / dy; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } if (t1 > near) near = t1; if (t2 < far) far = t2; if (near > far) continue; }
        return false;
      }
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) return true;
      const cs = w.circles;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        const t = ((c.x - ax) * dx + (c.z - az) * dz) / len2;
        if (t < -0.2 || t > 1.2) continue;
        const qx = ax + dx * t - c.x, qz = az + dz * t - c.z, d2 = qx * qx + qz * qz, r2 = c.r * c.r;
        if (d2 >= r2) continue;
        const half = Math.sqrt((r2 - d2) / len2), t0 = Math.max(t - half, 0.03), t1 = Math.min(t + half, 0.97);
        if (t0 > t1) continue;
        const y0 = ay + dy * t0, y1 = ay + dy * t1;
        if (Math.max(y0, y1) < c.y1 || Math.min(y0, y1) > c.y2) continue;
        return false;
      }
      return true;
    },
    /** 玩家此刻是否真的看得到這個點（在畫面內且沒被擋住） */
    sees(x, y, z, margin = -0.04) { return s.inView(x, y, z, margin) && s.los(eye.x, eye.y, eye.z, x, y, z); },

    /**
     * 從玩家的角度看，這個位置的背後有沒有亮的東西（燭火照亮的牆、月光下的戶外）。
     * 純黑的人影只有在背景是亮的時候才看得見；背景是暗的就該改用會被手電筒照亮的蒼白身影。
     */
    backlit(x, y, z) {
      const dx = x - eye.x, dz = z - eye.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      const ls = s.map?.lights;
      if (ls) for (let i = 0; i < ls.length; i++) {
        const L = ls[i]; if (L.gate < 0.5 || (L.mul ?? 1) < 0.5 || L.base < 4) continue;
        const p = L.light.position; if (Math.abs(p.y - y) > 6) continue;
        const lx = p.x - eye.x, lz = p.z - eye.z, t = lx * ux + lz * uz;
        if (t < d + 0.8 || t > d + 14) continue;
        if (Math.abs(lx * uz - lz * ux) > 2.5 + (t - d) * 0.35) continue;
        return true;
      }
      if (s.map?.id === 'temple' && s.indoor && s.map.indoorAt) { tmpPos.x = x; tmpPos.y = y; tmpPos.z = z; if (!s.map.indoorAt(tmpPos)) return true; } // 從殿內往外看
      return false;
    },

    /** 這個位置能不能站一個人（不在牆裡、地面高度合理）。可以則回傳地面高度，否則 NaN。 */
    standable(x, z, feet = s.feet, tol = 0.7, r = 0.3) {
      const w = s.world;
      const pr = w.probe(x, z, feet);
      if (pr.blocked || Math.abs(pr.g - feet) > tol) return NaN;
      tmp.x = x; tmp.z = z; w.resolve(tmp, r, pr.g);
      if (Math.abs(tmp.x - x) + Math.abs(tmp.z - z) > 0.05) return NaN;
      return pr.g;
    },

    /**
     * 在玩家周圍找一個位置。b0..b1：相對視線的方位角範圍（rad，正 = 左，可用 ±）；d0..d1：距離。
     * hidden：此刻必須看不到；los：必須與玩家之間沒有遮蔽（一轉頭就會看到）。
     * 找到時把結果寫進 out（x,y,z,bearing,dist）並回傳 true。
     */
    pickSpot(out, rng, { b0 = -Math.PI, b1 = Math.PI, d0 = 3, d1 = 8, hidden = true, los = true, tries = 10, chest = 1.3, both = false } = {}) {
      const tol = s.indoor ? 0.7 : 1.6;
      for (let i = 0; i < tries; i++) {
        let b = b0 + (b1 - b0) * rng();
        if (both && rng() < 0.5) b = -b;
        const d = d0 + (d1 - d0) * rng(), a = s.yaw + b;
        const x = s.px - Math.sin(a) * d, z = s.pz - Math.cos(a) * d;
        const g = s.standable(x, z, s.feet, tol + (s.indoor ? 0 : d * 0.1));
        if (Number.isNaN(g)) continue;
        const clear = s.los(eye.x, eye.y, eye.z, x, g + chest, z);
        if (los && !clear) continue;
        if (hidden && clear && s.inView(x, g + chest, z, 0.14)) continue;
        out.x = x; out.y = g; out.z = z; out.bearing = wrap(b); out.dist = d;
        return true;
      }
      return false;
    },

    /**
     * 從 (ox,oz) 沿 (dx,dz) 找最近的一面「牆」（高度足夠的碰撞方塊）。
     * 找到時把交點與法線寫進 out（x,z,nx,nz,dist）並回傳 true。
     */
    rayWall(out, ox, oz, dx, dz, y, maxDist = 7, accept = null) {
      const w = s.world; let best = maxDist, hit = false;
      const bs = w.boxes;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (b.disabled || b.y1 > y - 0.5 || b.y2 < y + 0.9) continue;
        if (accept && !accept(b)) continue;
        let near = 0, far = best, nx = 0, nz = 0, t1, t2;
        if (Math.abs(dx) < 1e-8) { if (ox < b.x1 || ox > b.x2) continue; }
        else { t1 = (b.x1 - ox) / dx; t2 = (b.x2 - ox) / dx; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } if (t1 > near) { near = t1; nx = dx > 0 ? -1 : 1; nz = 0; } if (t2 < far) far = t2; if (near > far) continue; }
        if (Math.abs(dz) < 1e-8) { if (oz < b.z1 || oz > b.z2) continue; }
        else { t1 = (b.z1 - oz) / dz; t2 = (b.z2 - oz) / dz; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } if (t1 > near) { near = t1; nx = 0; nz = dz > 0 ? -1 : 1; } if (t2 < far) far = t2; if (near > far) continue; }
        if (near <= 0.3 || near >= best || (nx === 0 && nz === 0)) continue;
        best = near; hit = true; out.x = ox + dx * near; out.z = oz + dz * near; out.nx = nx; out.nz = nz; out.dist = near;
        out.u0 = nx ? b.z1 : b.x1; out.u1 = nx ? b.z2 : b.x2; // 牆面沿切線方向的範圍
      }
      return hit;
    },
  };
  return s;
}
