import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 恐怖導演用的小道具（全部程序化、attach 時建好並池化）：
 * 濕腳印、小手印、童鞋、彈珠、光圈邊緣的赤腳、窗後的臉、電視倒影、門縫下的腳影。
 */

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill(); };

function footprintTexture() {
  return canvasTex(64, 160, (c) => {
    c.filter = 'blur(1.6px)'; c.fillStyle = '#fff';
    ell(c, 30, 128, 14, 20); // 腳跟
    ell(c, 36, 92, 12, 26, 0.1); // 足弓外緣
    ell(c, 31, 52, 18, 22, -0.1); // 前掌
    [[14, 24, 6.5, 8], [25, 16, 5, 6.5], [34, 14, 4.5, 6], [42, 17, 4, 5.5], [49, 23, 3.6, 5]].forEach(([x, y, a, b]) => ell(c, x, y, a, b));
  });
}
function handprintTexture(seed = 1) {
  return canvasTex(96, 112, (c) => {
    let s = seed; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    c.filter = 'blur(1.2px)'; c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'round';
    ell(c, 48, 76, 21, 22);
    [[-0.5, 26, 9], [-0.2, 34, 9.5], [0.05, 37, 9.5], [0.3, 33, 9], [0.62, 24, 8]].forEach(([a, len, wd], i) => {
      const bx = 48 + Math.sin(a) * 19 + (i === 0 ? -8 : 0), by = 76 - Math.cos(a) * 17 + (i === 0 ? 12 : 0), aa = i === 0 ? a - 0.55 : a;
      c.lineWidth = wd; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.sin(aa) * len, by - Math.cos(aa) * len); c.stroke();
    });
    // 抹開、缺損
    c.globalCompositeOperation = 'destination-out'; c.filter = 'blur(2px)';
    for (let i = 0; i < 26; i++) { c.globalAlpha = 0.25 + r() * 0.5; ell(c, r() * 96, r() * 112, 2 + r() * 6, 1 + r() * 3, r() * 3); }
  });
}
function faceTexture() {
  return canvasTex(128, 160, (c) => {
    const g = c.createRadialGradient(64, 78, 6, 64, 80, 62);
    g.addColorStop(0, 'rgba(206,204,192,1)'); g.addColorStop(0.62, 'rgba(160,160,150,.85)'); g.addColorStop(1, 'rgba(120,122,116,0)');
    c.fillStyle = g; c.filter = 'blur(3px)'; ell(c, 64, 80, 44, 60);
    c.fillStyle = 'rgba(4,4,5,.96)'; c.filter = 'blur(4px)';
    ell(c, 44, 68, 10, 8, 0.15); ell(c, 85, 67, 10.5, 8.5, -0.18); // 眼窩
    ell(c, 65, 118, 9, 15); // 張開的嘴
    c.fillStyle = 'rgba(3,3,4,.9)'; c.filter = 'blur(5px)';
    ell(c, 30, 50, 22, 60, 0.2); ell(c, 102, 52, 20, 62, -0.2); // 兩側垂下的頭髮
  });
}
function silhouetteTexture() {
  // 暗玻璃裡的倒影：看得到的只有淺色的衣服，和被頭髮遮到只剩一條的臉；頭髮本身融在黑裡
  const t = canvasTex(128, 256, (c) => {
    c.filter = 'blur(7px)';
    const g = c.createLinearGradient(0, 92, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,.45)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(38, 104); c.quadraticCurveTo(64, 84, 90, 104); c.lineTo(96, 256); c.lineTo(32, 256); c.closePath(); c.fill();
    c.filter = 'blur(4px)'; c.fillStyle = 'rgba(255,255,255,.42)'; ell(c, 65, 62, 5, 17);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function createProps(h) {
  const { map } = h, scene = map.scene, id = h.id;
  const disposables = [], roots = [];
  const keep = (o) => { disposables.push(o); return o; };
  const addRoot = (o) => { scene.add(o); roots.push(o); return o; };
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();

  // ── 濕腳印（InstancedMesh，環狀重複使用）──
  const PRINTS = 30;
  const printMat = keep(new THREE.MeshStandardMaterial({ map: keep(footprintTexture()), color: 0x0a0d10, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.66, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
  const printMesh = addRoot(new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(0.092, 0.23).rotateX(-Math.PI / 2)), printMat, PRINTS));
  printMesh.frustumCulled = false; printMesh.receiveShadow = true; printMesh.name = 'HorrorWetPrints';
  let printNext = 0, printLife = 0, printFade = 0;
  const hidePrint = (i) => { M4.makeScale(0, 0, 0); printMesh.setMatrixAt(i, M4); };
  for (let i = 0; i < PRINTS; i++) hidePrint(i);
  const prints = {
    mesh: printMesh,
    /** 在地面放一枚腳印。yaw：腳尖朝向（與人物 rotation.y 相同的定義，0 = +Z）。 */
    add(x, y, z, yaw, left, size = 1) {
      if (printFade > 0) { for (let i = 0; i < PRINTS; i++) hidePrint(i); printFade = 0; }
      E.set(0, yaw + Math.PI, 0); Q.setFromEuler(E); P.set(x, y + 0.012, z); S.set(left ? -size : size, 1, size);
      M4.compose(P, Q, S); printMesh.setMatrixAt(printNext, M4); printMesh.instanceMatrix.needsUpdate = true;
      printNext = (printNext + 1) % PRINTS; printMat.opacity = 0.66; printLife = 26;
    },
    /** 一雙並排的腳印（有人剛才就站在這裡） */
    pair(x, y, z, yaw, size = 1) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      prints.add(x - c * 0.085, y, z + s * 0.085, yaw + 0.08, true, size); prints.add(x + c * 0.085, y, z - s * 0.085, yaw - 0.1, false, size);
    },
    clear() { for (let i = 0; i < PRINTS; i++) hidePrint(i); printMesh.instanceMatrix.needsUpdate = true; printLife = 0; printFade = 0; },
  };

  // ── 小手印（池）──
  const HANDS = 12;
  const handTex = [keep(handprintTexture(7)), keep(handprintTexture(23))];
  const handMats = [0, 1].map((i) => keep(new THREE.MeshStandardMaterial({ map: handTex[i], color: 0x1d0806, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
  const paleMat = keep(new THREE.MeshBasicMaterial({ map: handTex[0], color: 0xa9bcc6, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  // 深色磚牆上用的：沾了香灰的灰白手印
  const ashMat = keep(new THREE.MeshStandardMaterial({ map: handTex[1], color: 0x9c978c, roughness: 1, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  const handGeo = keep(new THREE.PlaneGeometry(0.105, 0.122));
  const handPool = [];
  for (let i = 0; i < HANDS; i++) { const m = addRoot(new THREE.Mesh(handGeo, handMats[i % 2])); m.visible = false; m.name = 'HorrorHandprint'; handPool.push(m); }
  let handNext = 0;
  const hands = {
    pool: handPool,
    /** 在法線為 (nx,nz) 的牆面上放一枚手印。pale：true = 玻璃上的霧白手印；'ash' = 深色牆上的灰白手印。 */
    add(x, y, z, nx, nz, roll = 0, pale = false, size = 1) {
      const m = handPool[handNext]; handNext = (handNext + 1) % HANDS;
      m.material = pale === 'ash' ? ashMat : pale ? paleMat : handMats[handNext % 2];
      m.position.set(x + nx * 0.012, y, z + nz * 0.012); m.rotation.set(0, Math.atan2(nx, nz), roll, 'YXZ'); m.scale.setScalar(size); m.visible = true;
      return m;
    },
    clear() { for (const m of handPool) m.visible = false; },
  };

  // ── 童鞋（小雨找不到的那一隻）──
  const shoe = (() => {
    const body = new THREE.SphereGeometry(1, 14, 10).scale(0.031, 0.026, 0.074).translate(0, 0.022, 0).toNonIndexed();
    const strap = new THREE.BoxGeometry(0.066, 0.008, 0.014).translate(0, 0.043, -0.012).toNonIndexed();
    const hole = new THREE.CircleGeometry(1, 14).scale(0.021, 0.036, 1).rotateX(-Math.PI / 2).translate(0, 0.0475, -0.022).toNonIndexed();
    const paint = (g, r, gg, b) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const sole = new THREE.BoxGeometry(0.058, 0.007, 0.146).translate(0, 0.0035, 0).toNonIndexed();
    const geo = keep(mergeGeometries([paint(body, 0.2, 0.024, 0.02), paint(strap, 0.11, 0.014, 0.012), paint(hole, 0.01, 0.007, 0.007), paint(sole, 0.2, 0.18, 0.15)]).scale(1.25, 1.25, 1.25));
    const m = addRoot(new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }))));
    m.castShadow = true; m.receiveShadow = true; m.visible = false; m.name = 'HorrorLostShoe';
    return m;
  })();

  // ── 彈珠 ──
  const marble = addRoot(new THREE.Mesh(keep(new THREE.SphereGeometry(0.028, 14, 10)), keep(new THREE.MeshStandardMaterial({ color: 0x86a7ad, roughness: 0.12, metalness: 0.25, emissive: 0x0c1617 }))));
  marble.castShadow = true; marble.visible = false; marble.name = 'HorrorMarble';

  // ── 光圈邊緣的赤腳（腳踝以上是一件不反光的黑袍）──
  const feet = (() => {
    const g = new THREE.Group(); g.visible = false; g.name = 'HorrorFeet';
    const skin = keep(new THREE.MeshStandardMaterial({ color: 0x8a8177, roughness: 0.85 }));
    const parts = [];
    for (const sx of [-1, 1]) {
      parts.push(new THREE.SphereGeometry(1, 10, 8).scale(0.04, 0.03, 0.1).translate(sx * 0.075, 0.03, 0.045).toNonIndexed());
      parts.push(new THREE.CylinderGeometry(0.03, 0.036, 0.32, 8).translate(sx * 0.075, 0.2, -0.01).toNonIndexed());
      for (let t = 0; t < 5; t++) parts.push(new THREE.SphereGeometry(0.011 - t * 0.0012, 6, 5).translate(sx * (0.075 + (t - 2) * 0.017 * sx), 0.014, 0.14 - Math.abs(t - 1) * 0.008).toNonIndexed());
    }
    const m = new THREE.Mesh(keep(mergeGeometries(parts)), skin); m.castShadow = true; m.receiveShadow = true; g.add(m);
    const robe = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.17, 0.25, 1.2, 12, 1, true).translate(0, 0.9, -0.02)), keep(new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide })));
    g.add(robe); g.userData.robe = robe;
    return addRoot(g);
  })();

  // ── 山村：窗後的臉 ──
  let faces = null;
  if (id === 'road') {
    const tex = keep(faceTexture()), geo = keep(new THREE.PlaneGeometry(0.25, 0.31));
    faces = [0, 1, 2].map(() => { const m = addRoot(new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: 0x8b9096 })))); m.visible = false; m.name = 'HorrorWindowFace'; return m; });
  }

  // ── 住處：電視倒影、門縫下的腳影、窗外的人影 ──
  let tv = null, doorFeet = null, windowFigure = null;
  if (id === 'home') {
    const tex = keep(silhouetteTexture());
    tex.matrixAutoUpdate = false;
    const m = addRoot(new THREE.Mesh(keep(new THREE.PlaneGeometry(1.2, 0.73)), keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: 0x4f5961, blending: THREE.AdditiveBlending }))));
    m.position.set(3.668, 1.0, -0.7); m.rotation.y = -Math.PI / 2; m.visible = false; m.name = 'HorrorTvReflection';
    tv = { mesh: m, tex, x: 3.679, y0: 0.635, y1: 1.365, z0: -1.3, z1: -0.1 };
    const g = new THREE.Group(); g.visible = false; g.name = 'HorrorDoorFeet';
    const fm = keep(new THREE.MeshBasicMaterial({ color: 0x000000 })), fg = keep(new THREE.BoxGeometry(0.125, 0.024, 0.012));
    const a = new THREE.Mesh(fg, fm), b = new THREE.Mesh(fg, fm); a.position.set(-0.12, 0, 0); b.position.set(0.1, 0, 0); g.add(a, b);
    g.position.set(1.65, 0.014, 3.79); doorFeet = { root: addRoot(g), a, b };
    // 七樓窗外、隔著雨的一張臉
    windowFigure = addRoot(new THREE.Mesh(keep(new THREE.PlaneGeometry(0.27, 0.34)), keep(new THREE.MeshBasicMaterial({ map: keep(faceTexture()), transparent: true, opacity: 0, depthWrite: false, color: 0x7d8890 }))));
    windowFigure.visible = false; windowFigure.name = 'HorrorWindowFace';
  }

  const props = {
    prints, hands, shoe, marble, feet, faces, tv, doorFeet, windowFigure, roots,
    update(dt) {
      if (printLife > 0) { printLife -= dt; if (printLife <= 0) printFade = 1e-4; }
      if (printFade > 0) { printFade += dt; printMat.opacity = Math.max(0, 0.66 * (1 - printFade / 9)); if (printFade >= 9) prints.clear(); }
    },
    hideAll() { shoe.visible = false; marble.visible = false; feet.visible = false; if (faces) for (const f of faces) f.visible = false; if (tv) tv.mesh.visible = false; if (doorFeet) doorFeet.root.visible = false; if (windowFigure) windowFigure.visible = false; },
    dispose() {
      for (const r of roots) scene.remove(r);
      for (const d of disposables) d.dispose();
    },
  };
  return props;
}
