import * as THREE from 'three';
import { World } from '../../core/World.js';
import { Batch, mulberry32, matrixOf, xf } from '../../core/utils.js';
import { createNightSky } from '../../core/sky.js';
import { talismanTexture, flameTexture, grimeTexture } from '../../core/canvasTex.js';
import { FLOORS, PLINTH, COMPOUND, GRAVEYARD, BOUNDS, SPAWN, MOON_DIR, FOG_COLOR, STAIRS, stairRect } from './layout.js';
import { buildTerrain, terrainHeight } from './terrain.js';
import { buildTemple } from './building.js';
import { createBuddhaFactory } from './buddha.js';
import { buildInteriors } from './interiors.js';
import { buildCompound, buildGraveyard, buildNature, buildFog } from './outdoors.js';
import { buildForest } from './trees.js';
import { buildStoryWorld } from './storyWorld.js';
import { createClothSystem } from './cloth.js';

export const ASSETS = {
  textures: [
    'forest_ground_04', 'mossy_cobblestone', 'monastery_stone_floor', 'worn_mossy_plasterwall',
    'red_plaster_weathered', 'clay_roof_tiles_02', 'dark_wood', 'wood_peeling_paint_weathered',
    'weathered_brown_planks', 'mossy_rock', 'mossy_stone_wall', 'velour_velvet', 'bark_brown_02',
  ],
  models: [
    'dead_tree_trunk_02', 'tree_stump_01', 'boulder_01', 'rock_moss_set_01', 'dry_branches_medium_01',
    'grass_medium_01', 'fern_02', 'brass_candleholders', 'chinese_console_table', 'brass_pot_01',
    'wooden_lantern_01', 'ceramic_vase_03', 'wooden_bucket_01', 'chinese_stool',
  ],
  hdr: ['satara_night_no_lamps'],
  images: ['temple-keyart', 'children-1998', 'apparition'],
  scans: ['amoghasiddhi', 'ghost_woman'],
};

const inRect = (x, z, r, m = 0) => x > r.x1 - m && x < r.x2 + m && z > r.z1 - m && z < r.z2 + m;
const tick = () => new Promise((r) => setTimeout(r, 0));

function floorIndex(y) {
  let i = 0;
  for (let k = 1; k < FLOORS.length; k++) if (y > FLOORS[k].y - 0.6) i = k;
  return i;
}

export async function create(game, onProgress) {
  const { assets } = game;
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const world = new World();
  world.bounds = BOUNDS;
  const rng = mulberry32(20261113);

  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.019);
  scene.background = new THREE.Color(FOG_COLOR);
  scene.environment = assets.env.satara_night_no_lamps;
  scene.environmentIntensity = 0.22;

  // ── 材質 ──
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const mats = {
    ground: assets.mat('forest_ground_04', { vertexColors: true, color: 0xb0aa9c }),
    mound: assets.mat('forest_ground_04', { color: 0x8a8274 }),
    cobble: assets.mat('mossy_cobblestone', { color: 0xb8b8b8 }),
    stoneFloor: assets.mat('monastery_stone_floor', { color: 0xb4b0a8 }),
    stoneWall: assets.mat('mossy_stone_wall', { color: 0xb0b0aa }),
    plaster: assets.mat('red_plaster_weathered', { color: 0xc9a79a }),
    plasterOld: assets.mat('worn_mossy_plasterwall', { color: 0xb5b2a8 }),
    roof: assets.mat('clay_roof_tiles_02', { side: THREE.DoubleSide, color: 0x9a8f88 }),
    woodDark: assets.mat('dark_wood', { color: 0x9a8474 }),
    woodRed: assets.mat('wood_peeling_paint_weathered', { color: 0xe07860 }),
    planks: assets.mat('weathered_brown_planks', { color: 0xa89888 }),
    niche: assets.mat('dark_wood', { color: 0xb8a288 }),
    cabinet: assets.mat('dark_wood', { color: 0x3c332c }),
    rock: assets.mat('mossy_rock', { color: 0xb4b4ac }),
    grave: assets.mat('mossy_rock', { color: 0xc4c2b8 }),
    bark: assets.mat('bark_brown_02', { color: 0x8a8078 }),
    cloth: assets.mat('velour_velvet', { color: 0xd2483e, side: THREE.DoubleSide, roughness: 0.95 }),
    clothDark: assets.mat('velour_velvet', { color: 0x8a2a26, side: THREE.DoubleSide, roughness: 1 }),
    banner: assets.mat('velour_velvet', { color: 0xb09a52, side: THREE.DoubleSide, roughness: 1 }),
    lantern: assets.mat('velour_velvet', { color: 0xb8362c, roughness: 0.85 }),
    cushion: assets.mat('velour_velvet', { color: 0x8a7a40, roughness: 1 }),
    ridge: assets.mat('worn_mossy_plasterwall', { color: 0x6e6a66 }),
    brass: S({ map: grimeTexture('#8a6b2a', { seed: 31, dark: '18,12,4', amount: 0.8 }), metalness: 0.9, roughness: 0.45 }),
    bronze: S({ map: grimeTexture('#3c3020', { seed: 17, dark: '8,6,3', patina: '55,105,85', amount: 1.4 }), metalness: 0.75, roughness: 0.6 }),
    urn: S({ map: grimeTexture('#4a2c18', { seed: 44, dark: '10,6,3', amount: 1.2 }), metalness: 0.05, roughness: 0.42 }),
    skin: S({ color: 0x9c8866, roughness: 0.9 }),
    wax: S({ color: 0x8c1410, roughness: 0.55 }),
    thread: S({ color: 0x9a0c0a, roughness: 0.8, emissive: 0x240000 }),
    incense: S({ color: 0x4a2a1a, roughness: 1 }),
    ember: S({ color: 0x000000, emissive: 0xff5a14, emissiveIntensity: 5 }),
    redGlow: S({ color: 0x280000, emissive: 0xff1806, emissiveIntensity: 3.2, roughness: 0.3 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
  };

  // ── 共用建構工具 ──
  const batch = new Batch();
  const sway = [], wisps = [], lights = [], flames = [];
  const cloth = createClothSystem();
  const talismanLists = [[], [], [], [], []];
  const flameTex = flameTexture();
  const lanternBody = new THREE.SphereGeometry(0.34, 16, 12).scale(1, 1.12, 1);
  {
    const p = lanternBody.attributes.position;
    for (let i = 0; i < p.count; i++) { // 破損凹陷
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + Math.sin(Math.atan2(z, x) * 12) * 0.025 - Math.max(0, Math.sin(x * 9 + y * 5)) * 0.05;
      p.setXYZ(i, x * k, y, z * k);
    }
    lanternBody.computeVertexNormals();
  }
  const lanternTrim = new THREE.CylinderGeometry(0.15, 0.15, 0.07, 12);
  const stringGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 4).translate(0, -0.5, 0);

  const ctx = {
    scene, root, world, assets, mats, rng, batch, sway, wisps, lights, flames, cloth,
    groundAt: (x, z) => (inRect(x, z, COMPOUND) ? 0.02 : terrainHeight(x, z)),
    talisman(x, y, z, ry = 0, rz = 0, rx = 0) {
      talismanLists[Math.floor(rng() * talismanLists.length)].push(matrixOf(x, y, z, rx, ry, rz));
    },
    model(id, { p = [0, 0, 0], r = [0, 0, 0], s = 1, cast = true, hide = [] } = {}) {
      const m = assets.model(id);
      m.position.set(p[0], p[1], p[2]);
      m.rotation.set(r[0], r[1], r[2]);
      if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = cast; o.receiveShadow = true;
        if (hide.some((h) => o.name.includes(h) || o.material.name.includes(h))) o.visible = false;
      });
      ctx.root.add(m);
      return m;
    },
    addLight({ p, color, intensity, distance, floor = -1, flicker = 0 }) {
      const light = new THREE.PointLight(color, intensity, distance, 1.7);
      light.position.set(p[0], p[1], p[2]);
      root.add(light);
      lights.push({ light, base: intensity, floor, flicker, phase: rng() * 100, gate: 1 });
      return light;
    },
    candle(x, y, z, { lit = false, holder = true, h = 0.26 } = {}) {
      if (holder) {
        const pts = [[0, 0], [0.09, 0], [0.09, 0.02], [0.03, 0.05], [0.025, 0.25], [0.075, 0.3], [0.075, 0.32], [0, 0.32]].map(([r, yy]) => new THREE.Vector2(r, yy));
        batch.add(mats.brass, new THREE.LatheGeometry(pts, 12).translate(x, y, z));
        y += 0.32;
      }
      batch.add(mats.wax, new THREE.CylinderGeometry(0.026, 0.03, h, 10).translate(x, y + h / 2, z));
      batch.add(mats.black, new THREE.CylinderGeometry(0.003, 0.003, 0.025, 4).translate(x, y + h + 0.012, z));
      if (lit) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(3.2, 2.4, 1.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        sp.position.set(x, y + h + 0.075, z);
        sp.scale.set(0.07, 0.15, 1);
        ctx.root.add(sp);
        flames.push({ sp, phase: rng() * 100 });
      }
    },
    redLamp(x, y, z) {
      batch.add(mats.brass, new THREE.CylinderGeometry(0.05, 0.04, 0.03, 10).translate(x, y + 0.015, z));
      batch.add(mats.redGlow, new THREE.CylinderGeometry(0.04, 0.035, 0.09, 10).translate(x, y + 0.075, z));
    },
    incense(x, y, z, lit = false, count = 3) {
      for (let i = 0; i < count; i++) {
        const a = rng() * 6.28, lean = rng() * (count > 3 ? 0.35 : 0.12), len = 0.2 + rng() * 0.14;
        const g = new THREE.CylinderGeometry(0.004, 0.004, len, 4).translate(0, len / 2, 0);
        batch.add(mats.incense, xf(g, { p: [x + Math.cos(a) * 0.03 * Math.sqrt(count), y - 0.05, z + Math.sin(a) * 0.03 * Math.sqrt(count)], r: [Math.cos(a) * lean, 0, Math.sin(a) * lean] }));
        if (lit) batch.add(mats.ember, new THREE.SphereGeometry(0.008, 6, 4).translate(x + Math.cos(a) * 0.03 + Math.sin(a) * lean * len, y - 0.05 + len, z + Math.sin(a) * 0.03 + Math.cos(a) * lean * len));
      }
    },
    lantern(x, yTop, z, drop = 1) {
      const g = new THREE.Group();
      g.position.set(x, yTop, z);
      const s = new THREE.Mesh(stringGeo, mats.woodDark); s.scale.y = drop; g.add(s);
      const body = new THREE.Mesh(lanternBody, mats.lantern); body.position.y = -drop - 0.4; body.rotation.y = rng() * 6; body.castShadow = true; g.add(body);
      for (const dy of [-0.02, -0.78]) { const c = new THREE.Mesh(lanternTrim, mats.woodDark); c.position.y = -drop + dy; g.add(c); }
      const tassel = new THREE.Mesh(stringGeo, mats.cloth); tassel.scale.set(3, 0.4, 3); tassel.position.y = -drop - 0.8; g.add(tassel);
      ctx.root.add(g);
      sway.push({ obj: g, axis: 'z', amp: 0.035, speed: 0.5 + rng() * 0.4, phase: rng() * 6, base: 0 });
      sway.push({ obj: g, axis: 'x', amp: 0.025, speed: 0.37 + rng() * 0.3, phase: rng() * 6, base: 0 });
      return g;
    },
    banner(x, yTop, z, w, h, ry = 0, mat = mats.banner) {
      const m = cloth.make({width:w,height:h,material:mat,seed:Math.round(x*719+yTop*313+z*911)>>>0,fold:Math.min(.055,w*.18),exposure:z>-10?1:.7});
      m.position.set(x, yTop, z); m.rotation.y = ry;
      ctx.root.add(m);
      return m;
    },
  };

  // ── 建構場景 ──
  onProgress?.(0.05, '堆砌地形');
  buildTerrain(ctx);
  await tick();
  ctx.buddha = createBuddhaFactory(ctx);
  onProgress?.(0.2, '搭建廟宇');
  buildTemple(ctx);
  await tick();
  onProgress?.(0.4, '安奉佛像');
  const floorGroups = FLOORS.map(() => { const g = new THREE.Group(); root.add(g); return g; });
  buildInteriors(ctx, floorGroups);
  await tick();
  onProgress?.(0.6, '圍牆與山門');
  buildCompound(ctx);
  await tick();
  onProgress?.(0.7, '亂葬崗');
  buildGraveyard(ctx);
  buildNature(ctx);
  await tick();
  onProgress?.(0.85, '枯樹林');
  buildForest(ctx);
  const puffs = buildFog(ctx);
  const storyWorld = buildStoryWorld(ctx);
  batch.build(root);
  // 符咒（實例化）
  const talGeo = new THREE.PlaneGeometry(0.14, 0.44);
  talismanLists.forEach((list, i) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(talGeo, new THREE.MeshStandardMaterial({ map: talismanTexture(i + 1), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }), list.length);
    list.forEach((m, k) => im.setMatrixAt(k, m));
    im.receiveShadow = true;
    im.computeBoundingSphere();
    root.add(im);
  });
  await tick();

  // ── 燈光 ──
  const moonDir = new THREE.Vector3(...MOON_DIR).normalize();
  const moon = new THREE.DirectionalLight(0x8fa8dc, 1.05);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 20; sc.far = 300;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.08;
  scene.add(moon, moon.target);
  const hemi = new THREE.HemisphereLight(0x2a3a5c, 0x0c0a08, 0.9);
  scene.add(hemi);
  const debugLight = new THREE.AmbientLight(0xffffff, 0);
  scene.add(debugLight);
  const sky = createNightSky({ moonDir, fogColor: FOG_COLOR });
  sky.mesh.scale.setScalar(1);
  scene.add(sky.mesh);

  let indoorMix = 0;
  let fullBright = false;
  let lastTx = 1e9, lastTz = 1e9, shadowDirty = true;
  moon.shadow.autoUpdate = false;
  let bloomWas = null;

  const indoorAt = (pos) => {
    if (pos.x > 45 && pos.y < 0) return true;
    const i = floorIndex(pos.y);
    if (pos.y < FLOORS[0].y - 0.5) return false;
    return inRect(pos.x, pos.z, FLOORS[i]);
  };

  return {
    scene, world, storyWorld, cloth,
    spawn: SPAWN,
    indoorAt,
    surfaceAt(pos) {
      if (inRect(pos.x, pos.z, FLOORS[0]) && pos.y > 1.2) return pos.y > 16.4 ? 'stone' : 'wood';
      if (inRect(pos.x, pos.z, COMPOUND)) return 'stone';
      return 'dirt';
    },
    zoneName(pos) {
      if (pos.x > 45 && pos.y < 0) return '地下・封印室';
      if (pos.x > 16 && pos.z > -6 && pos.z < 4) return '古戲台';
      if (inRect(pos.x, pos.z, PLINTH) && pos.y > 0.5) {
        const i = floorIndex(pos.y);
        if (inRect(pos.x, pos.z, FLOORS[i])) return FLOORS[i].name;
        return i === 3 ? '四樓・露台' : '大殿前廊';
      }
      if (inRect(pos.x, pos.z, COMPOUND)) return '廟埕';
      if (inRect(pos.x, pos.z, GRAVEYARD, 3)) return '亂葬崗';
      return pos.z > COMPOUND.z2 ? '參道' : '荒林';
    },
    setQuality(q) {
      moon.shadow.mapSize.set(q.shadow, q.shadow);
      moon.shadow.map?.dispose();
      moon.shadow.map = null;
      shadowDirty = true;
    },
    setFullBright(on) {
      fullBright = on;
      debugLight.intensity = on ? 2.4 : 0;
      scene.fog.density = on ? 0.0025 : 0.019;
      for (const p of puffs) p.m.visible = !on;
      if (on) { bloomWas = game.bloom.enabled; game.bloom.enabled = false; } else if (bloomWas !== null) game.bloom.enabled = bloomWas;
    },
    update(dt, t, player) {
      storyWorld.update(t, player);
      const released = !!game.story?.state.flags.sent;
      const pos = player.pos;
      // 月光陰影跟隨玩家（以 4m 為單位移動，避免陰影閃爍）
      const tx = Math.round(pos.x / 4) * 4, tz = Math.round(pos.z / 4) * 4;
      if (tx !== lastTx || tz !== lastTz || shadowDirty) {
        lastTx = tx; lastTz = tz; shadowDirty = false;
        moon.target.position.set(tx, 8, tz);
        moon.position.copy(moon.target.position).addScaledVector(moonDir, 150);
        moon.target.updateMatrixWorld();
        moon.shadow.needsUpdate = true;
      }

      // 室內外環境光
      indoorMix += ((indoorAt(pos) ? 1 : 0) - indoorMix) * Math.min(1, dt * 1.6);
      hemi.intensity = released ? 1.2 - 0.7 * indoorMix : 0.9 - 0.72 * indoorMix;
      moon.intensity = released ? 1.6 : 1.05;
      moon.color.setHex(released ? 0xd8c6aa : 0x8fa8dc);
      scene.environmentIntensity = fullBright ? 2.2 : released ? 0.4 - 0.24 * indoorMix : 0.22 - 0.14 * indoorMix;

      // 點光源：依樓層啟閉，並加上燭火閃爍
      const pf = pos.x > 45 && pos.y < 0 ? 4 : floorIndex(pos.y);
      // 只顯示所在樓層（以及樓梯口附近相鄰樓層）的佛像與擺設
      const inBuilding = inRect(pos.x, pos.z, PLINTH, 6);
      for (let f = 0; f < floorGroups.length; f++) {
        let vis = f === pf;
        if (!vis && inBuilding && Math.abs(f - pf) === 1) vis = inRect(pos.x, pos.z, stairRect(STAIRS[Math.min(f, pf)]), 6);
        floorGroups[f].visible = vis || fullBright;
      }
      for (const L of lights) {
        const want = L.floor === -1 || L.floor === pf ? 1 : 0;
        L.gate += (want - L.gate) * Math.min(1, dt * 2.5);
        let f = 1;
        if (L.flicker) {
          const p = t * 9 + L.phase;
          f = 1 + L.flicker * (0.1 * Math.sin(p) + 0.07 * Math.sin(p * 2.7 + 1.3) + 0.05 * Math.sin(p * 6.1));
        }
        L.light.intensity = L.base * L.gate * f;
      }
      for (const f of flames) {
        const p = t * 11 + f.phase;
        f.sp.scale.set(0.07 * (1 + 0.12 * Math.sin(p * 1.7)), 0.15 * (1 + 0.14 * Math.sin(p) + 0.08 * Math.sin(p * 3.3)), 1);
      }
      // 風吹擺動
      const gust = 0.6 + 0.4 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 2);
      for (const s of sway) s.obj.rotation[s.axis] = s.base + Math.sin(t * s.speed + s.phase) * s.amp * gust;
      cloth.update(t, game.camera);
      // 鬼火
      for (const w of wisps) {
        const a = t * w.speed + w.phase;
        const x = w.cx + Math.cos(a) * w.r, z = w.cz + Math.sin(a * 1.31) * w.r * 0.7;
        const y = terrainHeight(x, z) + 1.0 + Math.sin(t * 0.9 + w.phase) * 0.35;
        w.sprite.position.set(x, y, z);
        w.light.position.set(x, y, z);
        const k = 0.75 + 0.25 * Math.sin(t * 5 + w.phase) * Math.sin(t * 1.3);
        w.sprite.scale.setScalar(0.5 * k);
      }
      // 霧
      const q = game.camera.quaternion, cam = game.camera.position;
      for (const p of puffs) {
        p.m.quaternion.copy(q);
        p.m.position.x = p.x + Math.sin(t * p.drift * 0.2 + p.phase) * p.span;
        const d = Math.hypot(p.m.position.x - cam.x, p.m.position.z - cam.z);
        p.m.material.opacity = 0.3 * Math.min(1, Math.max(0, (d - 5) / 12));
      }
      sky.update(t);
    },
    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
      });
    },
    get fullBright() { return fullBright; },
  };
}
