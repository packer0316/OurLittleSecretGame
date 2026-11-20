import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 寺內恐怖段落的程序化陳設：經櫃（可開門）、大鼓與鼓架、供桌的桌裙（可掀）、布幔、
 * 蒙紅布坐在凳子上的人形（三種姿勢）、香灰與香灰上的字。全部在 attach 時建好，演出只改可見度與姿態。
 */
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const between = (a, b, r0, r1, seg = 8) => {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const mkRng = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

export function createSetProps(game) {
  const A = game.assets, map = game.map;
  const mats = [], texs = [], geos = [];
  const M = (m) => { mats.push(m); return m; };
  const tryMat = (id, opts) => { try { return M(A.mat(id, opts)); } catch { return M(new THREE.MeshStandardMaterial({ color: opts.color ?? 0x553322, roughness: 0.9 })); } };
  const wood = tryMat('dark_wood', { color: 0x5a4636 });
  const woodIn = M(new THREE.MeshStandardMaterial({ color: 0x0c0907, roughness: 1 }));
  const red = tryMat('wood_peeling_paint_weathered', { color: 0xb84a36 });
  const brass = M(new THREE.MeshStandardMaterial({ color: 0x7a5a22, metalness: 0.85, roughness: 0.45 }));
  const velvet = tryMat('velour_velvet', { color: 0x6e1a16, roughness: 1, side: THREE.DoubleSide });
  const velvetDark = tryMat('velour_velvet', { color: 0x3a0f0c, roughness: 1, side: THREE.DoubleSide });
  const paperTex = canvasTex(128, 256, (c, w, h) => {
    c.fillStyle = '#c9b06a'; c.fillRect(0, 0, w, h);
    const r = mkRng(7); for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(60,40,10,${r() * 0.12})`; c.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 4); }
    c.strokeStyle = '#8a1a10'; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = '#8a1a10'; c.font = 'bold 54px serif'; c.textAlign = 'center'; c.fillText('封', w / 2, 92); c.fillText('經', w / 2, 170);
  }); texs.push(paperTex);
  const paper = M(new THREE.MeshStandardMaterial({ map: paperTex, roughness: 1 }));
  const skinTex = canvasTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#b59a6c'); g.addColorStop(0.8, '#8c714b'); g.addColorStop(1, '#4a3a26'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#7a1810'; c.lineWidth = 10; c.beginPath(); c.arc(w / 2, h / 2, 62, 0, Math.PI * 2); c.stroke();
    const r = mkRng(3); for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(40,25,10,${r() * 0.15})`; c.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 3); }
  }); texs.push(skinTex);
  const drumSkin = M(new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.85 }));
  const body = M(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  const hood = tryMat('velour_velvet', { color: 0x5c0d0a, roughness: 1, side: THREE.DoubleSide });
  const glow = M(new THREE.MeshBasicMaterial({ color: 0x9fd0d8, toneMapped: false }));
  const add = (parent, geo, mat, name) => { geos.push(geo); const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; if (name) m.name = name; parent.add(m); return m; };

  const P = {
    velvetDark,
    /** 經櫃：寬 w、深 d、高 h，正面朝 +Z。doors[0..1] 是可以轉的門（樞紐在兩側）。 */
    cabinet({ w = 1.2, d = 0.6, h = 2.05 } = {}) {
      const root = new THREE.Group(); root.name = 'DreadSutraCabinet';
      const t = 0.04;
      add(root, mergeGeometries([box(w, t, d, 0, h - t / 2, 0), box(w, t, d, 0, 0.16, 0), box(t, h - 0.1, d, -w / 2 + t / 2, (h + 0.1) / 2, 0), box(t, h - 0.1, d, w / 2 - t / 2, (h + 0.1) / 2, 0), box(w, h - 0.1, t, 0, (h + 0.1) / 2, -d / 2 + t / 2), box(w + 0.1, 0.08, d + 0.08, 0, h + 0.04, 0), box(w + 0.16, 0.05, d + 0.12, 0, h + 0.1, 0)]), wood);
      for (const [x, z] of [[-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06], [-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06]]) add(root, box(0.07, 0.16, 0.07, x, 0.08, z), wood);
      add(root, mergeGeometries([box(w - 2 * t, h - 0.3, 0.01, 0, (h + 0.1) / 2, -d / 2 + t + 0.006), box(0.01, h - 0.3, d - 0.1, -w / 2 + t + 0.006, (h + 0.1) / 2, 0), box(0.01, h - 0.3, d - 0.1, w / 2 - t - 0.006, (h + 0.1) / 2, 0), box(w - 2 * t, 0.01, d - 0.1, 0, h - t - 0.006, 0)]), woodIn);
      add(root, box(w - 0.1, 0.03, d - 0.12, 0, 1.25, 0), wood); // 層板
      const doors = [];
      const dw = (w - 2 * t) / 2 - 0.004, dh = h - 0.26;
      for (const sd of [-1, 1]) {
        const pivot = new THREE.Group(); pivot.position.set(sd * (w / 2 - t), 0.2, d / 2 - 0.012); root.add(pivot);
        const cx = -sd * dw / 2;
        add(pivot, mergeGeometries([box(dw, dh, 0.026, cx, dh / 2, 0), box(dw - 0.12, 0.04, 0.012, cx, dh * 0.3, 0.018), box(dw - 0.12, 0.04, 0.012, cx, dh * 0.72, 0.018), box(0.04, dh * 0.86, 0.012, cx - sd * (dw / 2 - 0.08), dh / 2, 0.018), box(0.04, dh * 0.86, 0.012, cx + sd * (dw / 2 - 0.08), dh / 2, 0.018)]), wood);
        add(pivot, new THREE.TorusGeometry(0.035, 0.007, 6, 14).translate(-sd * (dw - 0.06), dh * 0.52, 0.03), brass);
        if (sd < 0) add(pivot, new THREE.PlaneGeometry(0.13, 0.36).translate(-sd * (dw - 0.002), dh * 0.6, 0.015), paper); // 跨兩扇門的封條（左半）
        else add(pivot, new THREE.PlaneGeometry(0.13, 0.36).translate(-sd * (dw - 0.002), dh * 0.6, 0.015).scale(1, 1, 1), paper);
        pivot.userData.side = sd; doors.push(pivot);
      }
      /** k：0 關上、1 全開；ajar：躲在裡面時留的縫 */
      const open = (k) => { for (const p of doors) p.rotation.y = p.userData.side * k * 1.9; }; // 往外開
      return { root, doors, open, w, d, h };
    },

    /** 大鼓與鼓架：鼓面朝 +Z，鼓心離地 cy */
    drum({ r = 0.5, len = 0.78, cy = 1.15 } = {}) {
      const root = new THREE.Group(); root.name = 'DreadBigDrum';
      const pts = []; for (let i = 0; i <= 12; i++) { const y = -len / 2 + (len * i) / 12, k = 1 - Math.pow((2 * y) / len, 2); pts.push(new THREE.Vector2(r * (0.92 + 0.1 * k), y)); }
      const barrel = new THREE.LatheGeometry(pts, 36).rotateX(Math.PI / 2).translate(0, cy, 0);
      add(root, barrel, red);
      for (const sz of [-1, 1]) {
        add(root, new THREE.CircleGeometry(r * 0.93, 40).rotateY(sz > 0 ? 0 : Math.PI).translate(0, cy, sz * (len / 2 + 0.004)), drumSkin);
        const studs = []; for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; studs.push(new THREE.SphereGeometry(0.014, 6, 4).translate(Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, sz * (len / 2 - 0.02))); }
        add(root, mergeGeometries(studs), brass);
      }
      const legs = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(between(V(sx * 0.48, 0, sz * 0.34), V(sx * 0.36, cy - 0.15, sz * 0.22), 0.04, 0.035));
      for (const sz of [-1, 1]) legs.push(box(0.8, 0.06, 0.06, 0, cy - 0.38, sz * 0.24));
      for (const sx of [-1, 1]) legs.push(box(0.06, 0.06, 0.6, sx * 0.4, 0.3, 0));
      add(root, mergeGeometries(legs.map((g) => g.index ? g.toNonIndexed() : g)), wood);
      return { root, r, len, cy };
    },

    /** 供桌的桌裙：寬 w、高 h，上緣是樞紐（rotation.x 往外掀）。正面朝 +Z。 */
    skirt({ w = 1.8, h = 0.6, seed = 5 } = {}) {
      const tex = canvasTex(512, 192, (c, W, H) => {
        c.fillStyle = '#6c1510'; c.fillRect(0, 0, W, H);
        const r = mkRng(seed); for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '20,4,2' : '120,40,30'},${r() * 0.18})`; c.fillRect(r() * W, r() * H, 1 + r() * 6, 1 + r() * 14); }
        c.fillStyle = '#b08a3a'; c.fillRect(0, 10, W, 22); c.fillStyle = '#6c1510'; for (let x = 6; x < W; x += 26) c.fillRect(x, 16, 12, 10);
        c.fillStyle = 'rgba(176,138,58,.75)'; c.font = 'bold 66px serif'; c.textAlign = 'center'; c.fillText('慈　雲', W / 2, 118);
        const g = c.createLinearGradient(0, H * 0.6, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,5,3,.65)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      }); texs.push(tex);
      const mat = M(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide }));
      const g = new THREE.PlaneGeometry(w, h, 24, 4).translate(0, -h / 2, 0);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * 26) * 0.012 * (0.4 - y / h)); }
      g.computeVertexNormals();
      const pivot = new THREE.Group(); pivot.name = 'DreadTableSkirt';
      add(pivot, g, mat).castShadow = false;
      return { root: pivot, w, h };
    },

    /**
     * 厚重的布幔：上緣固定、垂直的褶子、下襬微微外擺（不會破洞，躲在後面的人不會露出來）。
     * 上緣在 y = 0，往 −y 垂下，正面朝 +Z。sway(t) 讓它很輕地晃。
     */
    drape({ w = 1.8, h = 4, folds = 7, seed = 3, mat = velvetDark } = {}) {
      const g = new THREE.PlaneGeometry(w, h, Math.max(12, Math.ceil(w * 18)), 10).translate(0, -h / 2, 0);
      const p = g.attributes.position, uv = g.attributes.uv, r = mkRng(seed), ph = r() * 6;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), v = -y / h;
        p.setZ(i, Math.sin((x / w) * folds * Math.PI * 2 + ph) * 0.045 * (0.55 + 0.6 * v) + Math.sin((x / w) * folds * 5.1 + ph) * 0.012 + v * v * 0.06);
        uv.setXY(i, uv.getX(i) * w * 0.7, uv.getY(i) * h * 0.7);
      }
      g.computeVertexNormals();
      const root = new THREE.Group(); root.name = 'DreadDrape';
      const m = add(root, g, mat); m.receiveShadow = true;
      return { root, mesh: m, w, h, sway(t) { root.rotation.x = Math.sin(t * 0.7 + ph) * 0.006; m.position.z = Math.sin(t * 0.45 + ph) * 0.01; } };
    },

    /** 布幔（用地圖的布料系統，會跟著風動） */
    curtain({ w = 1.8, h = 4, seed = 77, mat = velvet, exposure = 0.45 } = {}) {
      const m = map.cloth?.make ? map.cloth.make({ width: w, height: h, material: mat, seed, fold: 0.06, exposure }) : new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, -h / 2, 0), mat);
      m.name = 'DreadCurtain';
      if (m.material && m.material !== mat) mats.push(m.material);
      geos.push(m.geometry);
      const root = new THREE.Group(); root.add(m);
      return { root, mesh: m, w, h };
    },

    /**
     * 蒙著紅布、坐在凳子上的人。腳底在 y = 0，面向 +Z。seat：座面高度。
     * pose：knees（雙手擱在膝上）、lap（手機捧在腿上，螢幕亮著）、ear（右手把手機貼在耳邊）
     */
    sitter({ seat = 0.45, pose = 'knees', stool = true, jacket = 0x1d1c1b, pants = 0x1a1e24 } = {}) {
      const root = new THREE.Group(); root.name = 'DreadSitter';
      if (stool) { try { const st = A.model('chinese_stool'); const bb = new THREE.Box3().setFromObject(st); st.scale.setScalar(seat / Math.max(0.2, bb.max.y)); st.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); root.add(st); } catch { add(root, box(0.42, seat, 0.42, 0, seat / 2, 0), wood); } }
      const H = seat, parts = [];
      const skin = 0x8e7766, shoe = 0x0e0d0d;
      // 軀幹（略為前傾）
      const torso = new THREE.LatheGeometry([[0, 0], [0.16, 0.02], [0.18, 0.18], [0.2, 0.36], [0.21, 0.46], [0.15, 0.55], [0.06, 0.6], [0, 0.61]].map(([r, y]) => new THREE.Vector2(r, y)), 14).scale(1, 1, 0.62).rotateX(0.12).translate(0, H + 0.06, -0.02);
      parts.push(paint(torso, jacket));
      parts.push(paint(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10).translate(0, H + 0.64, 0.05), jacket));
      for (const sx of [-1, 1]) {
        const hip = V(sx * 0.1, H + 0.08, 0), knee = V(sx * 0.12, H + 0.07, 0.44), ankle = V(sx * 0.13, 0.09, 0.47);
        parts.push(paint(between(hip, knee, 0.085, 0.07, 10), pants), paint(between(knee, ankle, 0.06, 0.05, 10), pants));
        parts.push(paint(new THREE.SphereGeometry(0.07, 10, 8).translate(knee.x, knee.y, knee.z), pants));
        parts.push(paint(new THREE.BoxGeometry(0.1, 0.08, 0.26).translate(ankle.x, 0.04, ankle.z + 0.06), shoe));
        const sh = V(sx * 0.2, H + 0.54, -0.02);
        let el, wr;
        if (pose === 'ear' && sx > 0) { el = V(0.27, H + 0.36, 0.2); wr = V(0.14, H + 0.74, 0.1); }
        else if (pose === 'chalk' && sx > 0) { el = V(0.24, H + 0.42, 0.22); wr = V(0.12, H + 0.66, 0.46); } // 右手往前，捏著粉筆貼在柱子上
        else if (pose === 'palm' && sx > 0) { el = V(0.25, H + 0.3, 0.2); wr = V(0.13, H + 0.38, 0.52); } // 右手伸出來，掌心朝上，在等東西
        else if (pose === 'lap') { el = V(sx * 0.24, H + 0.28, 0.1); wr = V(sx * 0.07, H + 0.18, 0.3); }
        else { el = V(sx * 0.25, H + 0.27, 0.12); wr = V(sx * 0.15, H + 0.13, 0.37); }
        parts.push(paint(between(sh, el, 0.055, 0.048, 10), jacket), paint(between(el, wr, 0.045, 0.036, 10), jacket));
        parts.push(paint(new THREE.SphereGeometry(0.05, 10, 8).translate(el.x, el.y, el.z), jacket));
        parts.push(paint(new THREE.SphereGeometry(0.047, 10, 8).scale(0.8, 0.55, 1.25).translate(wr.x + (pose === 'ear' && sx > 0 ? 0 : 0), wr.y + 0.01, wr.z + 0.05), skin));
      }
      parts.push(paint(new THREE.SphereGeometry(0.1, 14, 12).scale(0.92, 1.1, 1).translate(0, H + 0.78, 0.06), skin));
      add(root, mergeGeometries(parts), body);
      // 紅布：從頭頂垂到肩下，鼻樑與眉骨在布下頂出輪廓
      const hp = [[0.001, 0.26], [0.05, 0.25], [0.1, 0.21], [0.122, 0.13], [0.125, 0.03], [0.14, -0.06], [0.2, -0.14], [0.26, -0.2], [0.29, -0.27], [0.3, -0.3]].map(([r, y]) => new THREE.Vector2(r, y));
      const cloth = new THREE.LatheGeometry(hp, 40);
      { const p = cloth.attributes.position, r = mkRng(pose.length * 31 + 5);
        const ph = r() * 6;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), rad = Math.hypot(x, z);
          let k = 1;
          if (y < 0) k += Math.sin(a * 7 + ph) * 0.06 * Math.min(1, -y / 0.2) + Math.sin(a * 13 + ph * 2) * 0.025 * Math.min(1, -y / 0.2);
          const front = Math.max(0, Math.cos(a)); // 臉在 +Z
          let push = 0;
          if (y > -0.04 && y < 0.1) push += Math.exp(-Math.pow(a / 0.22, 2)) * 0.035 * Math.exp(-Math.pow((y - 0.03) / 0.04, 2)); // 鼻
          if (y > 0.05 && y < 0.12) push += Math.pow(front, 6) * 0.012; // 眉骨
          if (y > -0.06 && y < -0.01) push -= Math.exp(-Math.pow(a / 0.3, 2)) * 0.012; // 嘴的位置凹進去
          const nr = rad * k + push;
          if (rad > 1e-5) { p.setX(i, (x / rad) * nr); p.setZ(i, (z / rad) * nr); }
          p.setY(i, y - (y < -0.15 ? Math.max(0, Math.cos(a)) * 0.04 : 0));
        }
        cloth.computeVertexNormals();
      }
      cloth.translate(0, H + 0.78, 0.06);
      const hoodMesh = add(root, cloth, hood, 'DreadRedCloth');
      let screen = null;
      if (pose === 'lap') { add(root, box(0.075, 0.01, 0.15, 0, H + 0.205, 0.31).rotateX(0), body); screen = add(root, new THREE.PlaneGeometry(0.064, 0.13).rotateX(-Math.PI / 2 + 0.35).translate(0, H + 0.214, 0.31), glow); }
      if (pose === 'chalk') add(root, new THREE.CylinderGeometry(0.006, 0.006, 0.045, 6).rotateX(Math.PI / 2).translate(0.12, H + 0.675, 0.52), M(new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 1 })));
      if (pose === 'ear') { add(root, box(0.075, 0.15, 0.012, 0.15, H + 0.78, 0.1).rotateY(0), body); screen = add(root, new THREE.PlaneGeometry(0.064, 0.13).rotateY(Math.PI / 2).translate(0.158, H + 0.78, 0.1), glow); }
      if (screen) screen.castShadow = false;
      return { root, hood: hoodMesh, screen, headY: H + 0.8 };
    },

    /** 翻倒的香爐撒出來的一片香灰 */
    ashSpill({ w = 1.7, h = 1.3 } = {}) {
      const tex = canvasTex(512, 512, (c, W, H) => {
        const r = mkRng(19);
        c.filter = 'blur(6px)';
        for (let i = 0; i < 160; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 1.9, d = Math.pow(r(), 0.7) * W * 0.62; c.fillStyle = `rgba(150,146,138,${0.05 + r() * 0.12})`; c.beginPath(); c.ellipse(W / 2 + Math.cos(a) * d * 0.7, H * 0.88 + Math.sin(a) * d, 16 + r() * 40, 10 + r() * 26, a, 0, Math.PI * 2); c.fill(); }
        c.filter = 'none';
        for (let i = 0; i < 2600; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 2, d = Math.pow(r(), 0.8) * W * 0.6; c.fillStyle = `rgba(${170 + r() * 40 | 0},${165 + r() * 35 | 0},${155 + r() * 30 | 0},${r() * 0.5})`; c.fillRect(W / 2 + Math.cos(a) * d * 0.75, H * 0.88 + Math.sin(a) * d, 1 + r() * 2, 1 + r() * 2); }
      }); texs.push(tex);
      const mat = M(new THREE.MeshStandardMaterial({ map: tex, color: 0x77726c, opacity: 0.8, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      const m = add(new THREE.Group(), new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat); m.castShadow = false;
      const root = m.parent; root.name = 'DreadAshSpill';
      return { root };
    },

    /**
     * 香灰上用手指寫出來的字。貼圖的 alpha 是「浮現的順序」（越早越亮），
     * 演出時把 alphaTest 從 1 往 0 降，字就照筆順一點一點浮出來。
     */
    ashWords(text = '你說等一下', { w = 1.25, h = 0.36 } = {}) {
      const tex = canvasTex(1024, 300, (c, W, H) => {
        c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, W, H);
        const chars = [...text], step = W / (chars.length + 0.4), r = mkRng(41);
        const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const t = tmp.getContext('2d');
        chars.forEach((ch, i) => {
          t.clearRect(0, 0, W, H); t.save();
          const x = step * (i + 0.7), y = H * 0.58 + (r() - 0.5) * 26;
          t.translate(x, y); t.rotate((r() - 0.5) * 0.22); t.scale(0.9 + r() * 0.25, 0.9 + r() * 0.2);
          t.font = `bold ${150 + r() * 26 | 0}px "DFKai-SB","BiauKai","KaiTi","STKaiti","Microsoft JhengHei",serif`; t.textAlign = 'center'; t.textBaseline = 'middle';
          t.lineJoin = 'round'; t.lineWidth = 9; t.strokeStyle = '#fff'; t.fillStyle = '#fff'; t.strokeText(ch, 0, 0); t.fillText(ch, 0, 0); t.restore();
          // 筆順近似：每個字由上往下、由左往右浮現；字與字依序
          const img = t.getImageData(0, 0, W, H), d = img.data;
          for (let p = 0; p < d.length; p += 4) {
            if (d[p + 3] < 40) continue;
            const px = (p / 4) % W, py = (p / 4 / W) | 0;
            const local = Math.min(1, Math.max(0, ((py - (y - 90)) / 180) * 0.65 + ((px - (x - 90)) / 180) * 0.35));
            const order = (i + local * 0.92) / chars.length; // 0..1
            const noise = (r() - 0.5) * 0.03;
            const alpha = Math.max(0.03, Math.min(0.99, 1 - order + noise));
            d[p] = d[p + 1] = d[p + 2] = 200 + r() * 55; d[p + 3] = Math.round(alpha * 255);
          }
          c.globalCompositeOperation = 'lighten'; t.putImageData(img, 0, 0); c.drawImage(tmp, 0, 0);
        });
      }, false); texs.push(tex);
      const mat = M(new THREE.MeshStandardMaterial({ map: tex, color: 0x2a2724, alphaTest: 0.995, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      const m = add(new THREE.Group(), new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat); m.castShadow = false; m.receiveShadow = true;
      const root = m.parent; root.name = 'DreadAshWords';
      return { root, mat, reveal(k) { mat.alphaTest = Math.max(0.01, Math.min(0.995, 1 - k)); } };
    },

    /** 小孩的手印（抹在香灰上） */
    handSmear() {
      const tex = canvasTex(96, 112, (c) => {
        c.filter = 'blur(1.4px)'; c.fillStyle = 'rgba(30,26,22,.9)'; c.strokeStyle = 'rgba(30,26,22,.9)'; c.lineCap = 'round';
        c.beginPath(); c.ellipse(48, 74, 20, 22, 0, 0, Math.PI * 2); c.fill();
        [[-0.5, 24, 8], [-0.2, 31, 8.5], [0.05, 34, 8.5], [0.3, 30, 8], [0.62, 22, 7]].forEach(([a, len, wd], i) => { const bx = 48 + Math.sin(a) * 18 + (i === 0 ? -8 : 0), by = 74 - Math.cos(a) * 16 + (i === 0 ? 12 : 0); c.lineWidth = wd; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.sin(a) * len, by - Math.cos(a) * len - 14); c.stroke(); });
      }); texs.push(tex);
      const mat = M(new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
      const m = add(new THREE.Group(), new THREE.PlaneGeometry(0.22, 0.26).rotateX(-Math.PI / 2), mat); m.castShadow = false;
      return { root: m.parent };
    },

    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); for (const t of texs) t.dispose(); geos.length = mats.length = texs.length = 0; },
  };
  return P;
}
