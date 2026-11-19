/**
 * 鬼模型（跨 agent 合約 E）——「借聲者」：寺裡的聲音借來的外貌。
 *
 *   const ghost = createGhost(assets, { variant: 'woman' });
 *   scene.add(ghost.root);                       // root 初始 visible = false
 *   ghost.root.position.set(x, 地面高度, z);       // 腳底在 y = 0
 *   ghost.root.rotation.y = 朝向;                  // 模型本身面向 +Z
 *   ghost.root.visible = true;
 *   每幀：ghost.update(t, chase)                   // t 是秒；root 不可見時幾乎零成本
 *
 * 變體（variant）
 *   'woman'  借來的母親外貌，身高約 1.70 m。有 assets.models.ghost_woman 時使用授權掃描人體
 *            （只保留身體與頭；濕髮、泛黃長衣、屍斑髒污、眼窩與左腕紅繩都在這個檔案裡程序化建立），
 *            約 4.6 萬三角形、5 個 draw call、5 個材質。沒有載入該模型的地圖（例如 home）自動回退成
 *            程序化人形（單一網格、約 1.7 千三角形）。
 *   'shadow' 純黑人形剪影，給遠處與餘光用。單一蒙皮網格、1 個 draw call、約 1.4 千三角形、
 *            不吃光、不投影、不收影，只受霧影響。
 *   'child'  小女孩身形（約 1.18 m），剪影式處理：長髮完全蓋住臉、沒有五官，材質極暗，
 *            手電筒直射也只看得出輪廓。單一網格、1 個 draw call。
 *   不認得的 variant 一律當成 'woman'。同一場景可以建立任意多個實例，彼此互不影響。
 *
 * 回傳物件
 *   root              THREE.Group。位置、rotation.y、visible 由呼叫端控制；不要改它的 scale。
 *   update(t, chase)  t＝遊戲時間（秒）。chase＝true 時改用追逐步態（有行走動畫的變體會播放），
 *                     而且姿勢是 'idle' 時上半身自動換成前傾伸手的追逐姿態。
 *   setPose(name, instant = false)
 *                     'idle'  垂頭站立、雙手垂在身側（預設）
 *                     'reach' 左手（繫紅繩的那隻）向正前方伸出，身體前傾、歪頭
 *                     'crawl' 趴地爬行：髖部離地約 25 cm，身體從 root 往 +Z 延伸約 0.9 m，頭向後折起往前看
 *                     'bowed' 從腰部深度前彎約 100°，雙臂與頭髮垂直垂落，看不到臉
 *                     'peek'  側身探頭：上身往自己的左側（root 的 +X）傾斜，頭心偏離 root 約 0.33 m，
 *                             左手抬到肩上方像是扣著牆緣。把 root 放在掩體邊緣後方約 0.3 m，露出頭和手即可。
 *                     'peekR' 上述的鏡像（往 root 的 −X 探頭，抬右手）
 *                     'sit'   坐在約 0.42 m 高的椅凳上：髖部在 root 後方 6 cm、離地約 0.47 m，
 *                             膝蓋在 root 前方約 0.35 m，雙手擱在腿上、垂頭
 *                     不認得的名稱回退 'idle'。root 可見時以約 0.45 秒過渡；
 *                     root 不可見、或 instant = true 時立即切換（建議先 setPose 再讓 root 顯示）。
 *   setFade(a)        0..1 不透明度。用螢幕空間的抖動捨棄（像底片顆粒般溶解），不開半透明、沒有排序問題，
 *                     也不需要重新編譯著色器。a <= 0 時整個模型停止繪製；a < 0.55 時不再投射陰影。
 *   lookAt(target, { maxYaw = 150, maxPitch = 55, speed = 2.4 } = {})
 *                     頭部追著「世界座標」的 THREE.Vector3 看；傳 null 放開、慢慢回到姿勢原本的垂頭。
 *                     保留的是向量的參考而不是複本：傳玩家的眼睛位置進來一次，之後它移動頭就會跟著轉；
 *                     每幀重新呼叫也可以。追視時仍保留一點低頭，眼睛從頭髮底下往上看。
 *                     轉動分配在上胸、頸、頭三節。maxYaw（度）預設 150，遠超過活人的約 80°，
 *                     目標在背後時會做出扭斷似的轉頭；想要正常範圍就傳 { maxYaw: 80 }。
 *                     speed 是每秒弧度（預設偏慢、帶壓迫感；傳大一點的值就是猛然轉頭）。
 *   setGlitch(k)      0..1。抽搐與掉格：骨架改以低影格率步進（k = 1 時約 7 fps）、隨機倒帶、
 *                     關節抖動、偶發的頭部猛折與整體位移數公分。頭髮仍以完整影格率運算。0 = 關閉。
 *   setEyes(k)        0..1，眼睛在黑暗裡的反光強度。'woman' 平常就有一點（k = 0 時仍在），k 越大越亮、
 *                     遠處也看得到；'shadow' 與 'child' 平常沒有眼睛，k > 0 才浮出兩個冷色的小亮點。
 *   snapPose()        立即套用目前的姿勢，跳過過渡。
 *   dispose()         從場景移除並釋放這個實例自己的材質與動態幾何（共用的模型、貼圖不會被釋放）。
 *   clips / source    'woman' 使用授權模型時，clips 是原始行走動畫、source 是出處字串（測試匯出用）。
 *   variant           實際建立的變體名稱。
 *   bones             標準化名稱（Hips、Head、LeftHand…）對應的 THREE.Bone，供需要掛東西的呼叫端使用。
 *
 * 其他
 *   - 這個模組不新增任何光源。眼睛只有一點隨視角移動的冷色反光，沒有瞳孔。
 *   - 著色器會壓縮近距離手電筒的過曝，0.6 m 貼臉時仍看得到皮膚與布料的細節；
 *     'woman' 的皮膚與衣服另有極微弱的冷色底光，全黑的地方仍隱約看得出一個蒼白的人形。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/utils.js';

const DEG = Math.PI / 180;
const CM = 0.01;
const SOURCE = 'Ghost Girl Animated — Shaban Hafizsalim — CC BY 4.0';
const IDENT = new THREE.Quaternion();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function createGhost(assets, { variant = 'woman' } = {}) {
  if (variant === 'shadow') return createFigure(FIGURES.shadow);
  if (variant === 'child') return createFigure(FIGURES.child);
  if (assets?.models?.ghost_woman) return createScanWoman(assets);
  return createFigure(FIGURES.woman);
}

// ════════════════════════════════════════════════════════════════════════
//  姿勢資料。座標系：模型面向 +Z，+X 是它自己的左手邊，+Y 向上，單位公分（K 空間，腳底 y = 0）。
//    hips  髖部相對綁定姿勢的位移 [x, y, z]
//    rot   相對父骨骼的旋轉 [俯仰 X, 轉向 Y, 側傾 Z]（度）。X 正值＝往前彎；Z 負值＝往自己的左側倒
//    dir   肢段指向的「絕對」方向（不必正規化），不受軀幹旋轉影響，例如手臂垂直垂落
//    curl  [左手, 右手] 手指彎曲程度 0..1
// ════════════════════════════════════════════════════════════════════════
const POSES = {
  idle: {
    rot: { Spine: [5, 0, 1], Spine1: [7, 0, 1], Spine2: [9, 0, 0], Neck: [18, 3, -4], Head: [20, 5, -7], LeftShoulder: [0, 0, -5], RightShoulder: [0, 0, 5] },
    dir: {
      LeftArm: [0.2, -1, 0.02], LeftForeArm: [0.12, -1, 0.14], RightArm: [-0.2, -1, 0.02], RightForeArm: [-0.12, -1, 0.14],
      LeftUpLeg: [-0.02, -1, -0.1], RightUpLeg: [0.02, -1, -0.1], LeftLeg: [0, -1, -0.03], RightLeg: [0, -1, -0.03],
    },
    curl: [0.3, 0.3],
  },
  reach: {
    hips: [0, -2, 3],
    rot: { Spine: [9, -4, 0], Spine1: [8, -4, 2], Spine2: [8, -6, 3], Neck: [4, 0, 10], Head: [6, 4, 16], LeftShoulder: [0, -10, 8] },
    dir: {
      LeftArm: [0.22, -0.12, 1], LeftForeArm: [0.02, 0.1, 1], LeftHand: [-0.05, 0.25, 1],
      RightArm: [-0.25, -1, 0.12], RightForeArm: [-0.1, -0.85, 0.45],
      LeftUpLeg: [0.03, -1, 0.06], LeftLeg: [0.02, -1, -0.18], RightUpLeg: [0, -1, -0.16], RightLeg: [0, -1, -0.06],
    },
    curl: [0.42, 0.5],
  },
  bowed: {
    hips: [0, -1, -7],
    rot: { Hips: [12, 0, 0], Spine: [34, 0, 2], Spine1: [30, 0, 2], Spine2: [24, 0, 0], Neck: [14, 0, -4], Head: [8, 0, -6] },
    dir: {
      LeftArm: [0.1, -1, 0.1], LeftForeArm: [0.03, -1, 0.05], RightArm: [-0.1, -1, 0.1], RightForeArm: [-0.03, -1, 0.05],
      LeftUpLeg: [-0.01, -1, -0.02], RightUpLeg: [0.01, -1, -0.02], LeftLeg: [0, -1, 0], RightLeg: [0, -1, 0],
    },
    curl: [0.2, 0.2],
  },
  crawl: {
    hips: [0, -66, 4],
    rot: { Hips: [88, 0, 0], Spine: [-3, 0, 4], Spine1: [-4, 0, 3], Spine2: [-5, 0, 0], Neck: [-34, 6, 0], Head: [-36, 8, 10] },
    dir: {
      LeftUpLeg: [0.55, -0.4, 0.72], LeftLeg: [0.05, -0.05, -1], LeftFoot: [0, -0.12, -1],
      RightUpLeg: [-0.6, -0.4, 0.5], RightLeg: [-0.05, -0.03, -1], RightFoot: [0, -0.12, -1],
      LeftArm: [0.3, -0.35, 0.9], LeftForeArm: [-0.05, -0.6, 0.8], LeftHand: [0, -0.3, 1],
      RightArm: [-0.8, 0.15, 0.3], RightForeArm: [0.1, -1, 0.25], RightHand: [0, -0.55, 0.8],
    },
    curl: [0.35, 0.4],
  },
  peek: {
    hips: [9, -1, 0],
    rot: { Hips: [0, 0, -4], Spine: [3, 0, -8], Spine1: [3, 4, -9], Spine2: [3, 6, -9], Neck: [4, 0, -12], Head: [6, -8, -16] },
    dir: {
      LeftArm: [0.62, -0.3, 0.55], LeftForeArm: [0.3, 0.85, 0.42], LeftHand: [0.1, 0.6, 0.8],
      RightArm: [-0.14, -1, 0], RightForeArm: [-0.06, -1, 0.1],
    },
    curl: [0.55, 0.3],
  },
  sit: {
    hips: [0, -44, -6],
    rot: { Spine: [6, 0, 0], Spine1: [8, 0, 1], Spine2: [10, 0, 0], Neck: [20, 2, -3], Head: [22, 4, -6] },
    dir: {
      LeftUpLeg: [0.07, -0.12, 1], RightUpLeg: [-0.07, -0.12, 1], LeftLeg: [0, -1, 0.05], RightLeg: [0, -1, 0.05],
      LeftArm: [0.12, -1, 0.25], LeftForeArm: [-0.15, -0.55, 0.85], RightArm: [-0.12, -1, 0.25], RightForeArm: [0.15, -0.55, 0.85],
    },
    curl: [0.3, 0.3],
  },
  // 內部用：chase = true 且姿勢是 idle 時的上半身
  chase: {
    hips: [0, -3, 2],
    rot: { Spine: [10, 0, 3], Spine1: [9, 0, 2], Spine2: [8, 0, 0], Neck: [2, 0, 12], Head: [0, 6, 20] },
    dir: { LeftArm: [0.3, -0.45, 0.85], LeftForeArm: [0.05, -0.1, 1], RightArm: [-0.3, -0.9, 0.3], RightForeArm: [-0.1, -0.7, 0.7] },
    curl: [0.45, 0.5],
  },
};
const swapSide = (name) => (name.startsWith('Left') ? 'Right' + name.slice(4) : name.startsWith('Right') ? 'Left' + name.slice(5) : name);
function mirrorPose(spec) {
  const out = { rot: {}, dir: {} };
  if (spec.hips) out.hips = [-spec.hips[0], spec.hips[1], spec.hips[2]];
  for (const [k, v] of Object.entries(spec.rot || {})) out.rot[swapSide(k)] = [v[0], -v[1], -v[2]];
  for (const [k, v] of Object.entries(spec.dir || {})) out.dir[swapSide(k)] = [-v[0], v[1], v[2]];
  if (spec.curl) out.curl = [spec.curl[1], spec.curl[0]];
  return out;
}
POSES.peekR = mirrorPose(POSES.peek);

const DIR_CHILD = { Arm: 'ForeArm', ForeArm: 'Hand', Hand: 'HandMiddle1', UpLeg: 'Leg', Leg: 'Foot', Foot: 'ToeBase' };
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
// 追逐時行走動畫與姿勢的混合：0 = 完全用動畫、1 = 完全用姿勢
const clipWeight = (name) => (/UpLeg|Leg$|Foot|Toe/.test(name) ? 0 : name === 'Hips' ? 0.35 : name === 'Spine' ? 0.6 : 1);

// ════════════════════════════════════════════════════════════════════════
//  骨架描述（rig）。所有變體共用同一套姿勢、追視、抽搐邏輯。
//    bones   標準名稱 → Bone
//    bindM   標準名稱 → 綁定姿勢在 K 空間的世界矩陣
//    hipsParentInv  K 空間 → 髖骨父節點區域空間（程序化骨架是單位矩陣）
// ════════════════════════════════════════════════════════════════════════
function makeRig(bones, bindM, hipsParentInv) {
  const order = [];
  const lookup = new Map(Object.entries(bones).map(([name, bone]) => [bone, name]));
  const visit = (bone) => {
    const name = lookup.get(bone);
    if (name) order.push(name);
    for (const child of bone.children) if (child.isBone) visit(child);
  };
  visit(bones.Hips);
  const index = Object.fromEntries(order.map((n, i) => [n, i]));
  const n = order.length;
  const rig = { order, index, n, bones: order.map((name) => bones[name]), byName: bones };
  rig.parent = order.map((name, i) => { if (!i) return -1; let p = bones[name].parent; while (p && !lookup.has(p)) p = p.parent; return p ? index[lookup.get(p)] : -1; });
  rig.bindQ = []; rig.bindP = []; rig.localP = []; rig.parentInvQ = [];
  const s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const q = new THREE.Quaternion(), p = new THREE.Vector3();
    bindM[order[i]].decompose(p, q, s);
    rig.bindQ.push(q); rig.bindP.push(p);
  }
  for (let i = 0; i < n; i++) {
    const pi = rig.parent[i];
    if (pi < 0) { rig.localP.push(rig.bindP[i].clone()); rig.parentInvQ.push(new THREE.Quaternion()); continue; }
    const inv = bindM[order[pi]].clone().invert();
    rig.localP.push(rig.bindP[i].clone().applyMatrix4(inv));
    rig.parentInvQ.push(rig.bindQ[pi].clone().invert());
  }
  // 髖骨父節點的補償
  rig.rootM = hipsParentInv.clone();
  rig.rootQ = new THREE.Quaternion(); rig.rootS = new THREE.Vector3();
  rig.rootM.decompose(new THREE.Vector3(), rig.rootQ, rig.rootS);
  rig.rootInvM = rig.rootM.clone().invert();
  // 肢段方向與手指彎曲軸（K 空間、綁定姿勢）
  rig.axis = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const m = /^(Left|Right)(Arm|ForeArm|Hand|UpLeg|Leg|Foot)$/.exec(order[i]);
    if (!m) continue;
    const child = index[m[1] + DIR_CHILD[m[2]]];
    if (child !== undefined) rig.axis[i] = rig.bindP[child].clone().sub(rig.bindP[i]).normalize();
    else if (m[2] === 'Hand') rig.axis[i] = rig.bindP[i].clone().sub(rig.bindP[index[m[1] + 'ForeArm']]).normalize();
  }
  rig.curlAxis = {};
  for (const side of ['Left', 'Right']) {
    const hand = index[side + 'Hand'], a = index[side + 'HandIndex1'], b = index[side + 'HandPinky1'];
    if (a === undefined || b === undefined) continue;
    const f = rig.axis[hand];
    const dorsal = rig.bindP[a].clone().sub(rig.bindP[hand]).cross(rig.bindP[b].clone().sub(rig.bindP[hand])).normalize();
    if (dorsal.dot(new THREE.Vector3(side === 'Left' ? 1 : -1, 1, 0)) < 0) dorsal.negate();
    rig.curlAxis[side] = dorsal.clone().cross(f).normalize();
  }
  rig.poses = {};
  return rig;
}

function resolvePose(rig, name) {
  if (rig.poses[name]) return rig.poses[name];
  const spec = POSES[name];
  const D = [], A = [];
  const tmp = new THREE.Vector3(), target = new THREE.Vector3();
  for (let i = 0; i < rig.n; i++) {
    const bone = rig.order[i], Ap = rig.parent[i] < 0 ? IDENT : A[rig.parent[i]];
    let d = new THREE.Quaternion();
    const dir = spec.dir?.[bone], rot = spec.rot?.[bone];
    const finger = /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)([123])$/.exec(bone);
    if (dir && rig.axis[i]) {
      tmp.copy(rig.axis[i]).applyQuaternion(Ap);
      target.set(dir[0], dir[1], dir[2]).normalize();
      const Ab = new THREE.Quaternion().setFromUnitVectors(tmp, target).multiply(Ap);
      d.copy(Ap).invert().multiply(Ab);
    } else if (rot) {
      d.setFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'YXZ'));
    } else if (finger && rig.curlAxis[finger[1]] && spec.curl) {
      const curl = spec.curl[finger[1] === 'Left' ? 0 : 1];
      const amount = finger[2] === 'Thumb' ? 0.45 : [0, 0.75, 1.15, 0.9][+finger[3]];
      const stagger = 1 + (FINGERS.indexOf(finger[2]) - 2) * 0.12;
      d.setFromAxisAngle(rig.curlAxis[finger[1]], curl * amount * stagger * 85 * DEG);
    }
    D.push(d); A.push(Ap.clone().multiply(d));
  }
  const hips = new THREE.Vector3(...(spec.hips || [0, 0, 0]));
  return (rig.poses[name] = { D, hips });
}

// ════════════════════════════════════════════════════════════════════════
//  控制器：姿勢過渡、待機細微動作、頭部追視、抽搐掉格、淡出。所有變體共用。
// ════════════════════════════════════════════════════════════════════════
function createController({ root, shake, rig, shared, meshes, variant, clip, kToRoot, castShadow = true, afterPose, glint = [0, 1], owned = [] }) {
  const n = rig.n, idx = rig.index;
  const cur = Array.from({ length: n }, () => new THREE.Quaternion());
  const from = Array.from({ length: n }, () => new THREE.Quaternion());
  const acc = Array.from({ length: n }, () => new THREE.Quaternion());
  const eul = new Float32Array(n * 3), jit = new Float32Array(n * 3);
  const hipsFrom = new THREE.Vector3(), hipsCur = new THREE.Vector3();
  const jointK = Array.from({ length: n }, () => new THREE.Vector3());
  const rng = mulberry32(0x9e37 + Math.floor(Math.random() * 1e6));
  const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
  const v = new THREE.Vector3(), v3 = new THREE.Vector3();
  let poseName = 'idle', target = resolvePose(rig, 'idle'), blend = 1, blendDur = 0.45;
  let chaseMix = 0, last = null, tAnim = rng() * 40, stepAcc = 0, glitch = 0, fade = 1, snapHead = 0, snapTime = 0;
  let wasVisible = false, needSnap = true;
  const look = { on: false, w: 0, yaw: 0, pitch: 0, target: new THREE.Vector3(), maxYaw: 150 * DEG, maxPitch: 55 * DEG, speed: 2.4 };
  shared.uGlint.value = glint[0];
  for (let i = 0; i < n; i++) cur[i].copy(target.D[i]);
  hipsCur.copy(target.hips);
  const eyeUp = rig.bindP[idx.Head].y - rig.bindP[idx.Spine2].y + 8 * (rig.bindP[idx.Head].y / 148);
  // 行走動畫
  let mixer = null, action = null, clipMeanY = 0;
  if (clip) {
    mixer = new THREE.AnimationMixer(clip.model);
    action = mixer.clipAction(clip.clip); action.play();
    clipMeanY = clip.meanHipsY;
  }
  const add = (name, x, y, z) => { const i = idx[name]; if (i === undefined) return; eul[i * 3] += x; eul[i * 3 + 1] += y; eul[i * 3 + 2] += z; };
  const pulse = (t, rate, sharp) => Math.pow(Math.max(0, Math.sin(t * rate + Math.sin(t * rate * 0.37) * 2.3)), sharp);

  function pose(dt, chase) {
    // 姿勢過渡
    const wantName = chase && poseName === 'idle' ? 'chase' : poseName;
    const want = resolvePose(rig, wantName);
    if (want !== target) { for (let i = 0; i < n; i++) from[i].copy(cur[i]); hipsFrom.copy(hipsCur); target = want; blend = needSnap ? 1 : 0; }
    if (blend < 1 || needSnap) {
      blend = needSnap ? 1 : Math.min(1, blend + dt / blendDur);
      const w = blend * blend * (3 - 2 * blend);
      for (let i = 0; i < n; i++) cur[i].copy(from[i]).slerp(target.D[i], w);
      hipsCur.copy(hipsFrom).lerp(target.hips, w);
    }
    chaseMix = needSnap ? (chase ? 1 : 0) : mix(chaseMix, chase ? 1 : 0, Math.min(1, dt * 5));
    const t = tAnim, amp = 1 + chaseMix * 1.5;
    // 待機的細微動作：呼吸、重心搖晃、頭部緩慢游移與偶發抽動、手指
    eul.fill(0);
    const breath = Math.sin(t * 1.15);
    add('Spine1', breath * 0.7 * DEG, 0, Math.sin(t * 0.31 + 1) * 0.9 * DEG * amp);
    add('Spine2', breath * 0.9 * DEG, Math.sin(t * 0.21) * 1.4 * DEG, 0);
    add('Hips', 0, Math.sin(t * 0.17 + 2) * 1.2 * DEG, Math.sin(t * 0.37) * 0.9 * DEG * amp);
    const twitch = pulse(t, 0.83, 36), twitch2 = pulse(t + 11, 0.61, 50);
    add('Neck', Math.sin(t * 0.43) * 1.6 * DEG, Math.sin(t * 0.19 + 2) * 2.5 * DEG, Math.sin(t * 0.27) * 1.8 * DEG);
    add('Head', Math.sin(t * 0.33 + 1) * 2 * DEG - twitch2 * 5 * DEG, Math.sin(t * 0.23 + 4) * 3 * DEG, Math.sin(t * 0.29) * 2.4 * DEG + twitch * 9 * DEG * amp);
    add('LeftForeArm', Math.sin(t * 0.7) * 1.5 * DEG * amp, 0, 0);
    add('RightForeArm', Math.sin(t * 0.6 + 2) * 1.5 * DEG * amp, 0, twitch2 * 4 * DEG);
    add('LeftHand', pulse(t + 3, 1.1, 24) * 9 * DEG, 0, Math.sin(t * 0.9) * 2 * DEG);
    add('RightHand', pulse(t + 7, 0.9, 30) * 11 * DEG, 0, 0);
    if (!mixer && chaseMix > 0.01) {
      // 沒有行走動畫的變體：程序化步態
      const ph = t * 7.4, sw = 24 * DEG * chaseMix;
      add('LeftUpLeg', -Math.sin(ph) * sw, 0, 0); add('RightUpLeg', Math.sin(ph) * sw, 0, 0);
      add('LeftLeg', Math.max(0, Math.cos(ph)) * sw * 1.3, 0, 0); add('RightLeg', Math.max(0, -Math.cos(ph)) * sw * 1.3, 0, 0);
    }
    for (let i = 0; i < n * 3; i++) eul[i] += jit[i];
    // 頭部猛折（抽搐時偶發）
    if (snapTime > 0) add('Head', 0, snapHead * 0.3, snapHead);
    // 行走動畫取樣
    let clipHipsK = null;
    if (mixer && chaseMix > 0.01) {
      action.time = (t * 1.9) % clip.clip.duration; mixer.update(0);
      clipHipsK = v3.copy(rig.bones[0].position).applyMatrix4(rig.rootInvM);
    }
    // 追視：目標方向換算到上胸座標，分配給上胸、頸、頭
    const iS2 = idx.Spine2, iNeck = idx.Neck, iHead = idx.Head;
    look.w = needSnap ? (look.on ? 1 : 0) : mix(look.w, look.on ? 1 : 0, Math.min(1, dt * 3.2));
    for (let i = 0; i < n; i++) {
      const pi = rig.parent[i];
      const Ap = pi < 0 ? IDENT : acc[pi];
      if (pi < 0) jointK[i].copy(rig.bindP[i]).add(hipsCur);
      else jointK[i].copy(rig.bindP[i]).sub(rig.bindP[pi]).applyQuaternion(Ap).add(jointK[pi]);
      if (i === iS2 && look.w > 0.001) {
        // 以上一幀的頭部位置估計視線起點
        q.copy(Ap).multiply(cur[i]);
        v.copy(look.target); root.worldToLocal(v); v.multiplyScalar(1 / kToRoot());
        v.sub(jointK[i]).applyQuaternion(q2.copy(q).invert());
        v.y -= eyeUp;
        let yaw = Math.atan2(v.x, v.z);
        const pitch = clamp(Math.atan2(v.y, Math.hypot(v.x, v.z)), -look.maxPitch, look.maxPitch);
        // 目標在正後方時維持目前轉向的那一側，避免左右來回甩
        if (Math.abs(yaw) > look.maxYaw && Math.abs(look.yaw) > 0.9 && Math.sign(yaw) !== Math.sign(look.yaw)) yaw = Math.sign(look.yaw) * look.maxYaw;
        yaw = clamp(yaw, -look.maxYaw, look.maxYaw);
        if (!look.on) { yaw = 0; }
        const maxStep = needSnap ? 99 : look.speed * dt;
        look.yaw += clamp(yaw - look.yaw, -maxStep, maxStep);
        look.pitch += clamp((look.on ? pitch : 0) - look.pitch, -maxStep, maxStep);
      }
      // 這根骨頭的最終旋轉 = 疊加層 × 姿勢
      const d = q.copy(cur[i]);
      if (look.w > 0.001 && (i === iNeck || i === iHead)) d.slerp(IDENT, look.w * 0.85);
      let ex = eul[i * 3], ey = eul[i * 3 + 1], ez = eul[i * 3 + 2];
      if (look.w > 0.001) {
        const share = i === iS2 ? 0.16 : i === iNeck ? 0.36 : i === iHead ? 0.48 : 0;
        if (share) { ey += look.yaw * share * look.w; ex += (-look.pitch * share + (i === iHead ? 9 * DEG : 0)) * look.w; if (i === iHead) ez += look.yaw * 0.07 * look.w; }
      }
      if (ex || ey || ez) d.premultiply(q2.setFromEuler(e.set(ex, ey, ez)));
      acc[i].copy(Ap).multiply(d);
      // 區域旋轉 = 父綁定旋轉的逆 × D × 自己的綁定旋轉
      const bone = rig.bones[i];
      q2.copy(rig.parentInvQ[i]).multiply(d).multiply(rig.bindQ[i]);
      if (pi < 0) q2.premultiply(rig.rootQ);
      const cw = clipHipsK ? 1 - (1 - clipWeight(rig.order[i])) * chaseMix : 1;
      if (cw < 1) bone.quaternion.slerp(q2, cw); else bone.quaternion.copy(q2);
      if (pi < 0) {
        v.copy(rig.bindP[i]).add(hipsCur);
        if (clipHipsK) { v.y += (clipHipsK.y - clipMeanY) * chaseMix; v.x += clipHipsK.x * 0.5 * chaseMix; }
        bone.position.copy(v).applyMatrix4(rig.rootM); bone.scale.copy(rig.rootS);
      } else bone.position.copy(rig.localP[i]);
    }
  }

  function glitchStep() {
    // 關節抖動：每一步重擲一部分骨頭的偏移，其餘衰減
    const g = glitch;
    const J = [['Head', 15], ['Neck', 9], ['Spine2', 5], ['Spine1', 4], ['LeftArm', 8], ['RightArm', 8], ['LeftForeArm', 14], ['RightForeArm', 14], ['LeftHand', 22], ['RightHand', 22], ['Hips', 2.5]];
    for (const [name, a] of J) {
      const i = idx[name]; if (i === undefined) continue;
      for (let k = 0; k < 3; k++) jit[i * 3 + k] = rng() < 0.4 ? (rng() * 2 - 1) * a * DEG * g : jit[i * 3 + k] * 0.45;
    }
    if (rng() < 0.2 * g) tAnim -= 0.15 + rng() * 0.5;            // 倒帶
    if (snapTime <= 0 && rng() < 0.07 * g) { snapHead = (rng() < 0.5 ? -1 : 1) * (32 + rng() * 26) * DEG; snapTime = 0.12 + rng() * 0.22; }
    const s = g * (rng() < 0.08 ? 0.045 : 0.012);
    shake.position.set((rng() * 2 - 1) * s, 0, (rng() * 2 - 1) * s);
  }

  const api = {
    root, variant, bones: rig.byName,
    update(t, chase = false) {
      const dt = last === null ? 0 : clamp(t - last, 0, 0.1); last = t;
      const visible = root.visible && fade > 0;
      if (!visible) { wasVisible = false; return; }
      if (!wasVisible) { needSnap = true; wasVisible = true; }
      shared.uTime.value = t;
      // 掉格：累積到一格的時間才更新骨架
      let stepDt = dt;
      if (glitch > 0.001) {
        stepAcc += dt;
        const interval = mix(1 / 30, 1 / 7, glitch) * (0.7 + rng() * 0.6);
        if (stepAcc >= interval || needSnap) { stepDt = stepAcc; stepAcc = 0; glitchStep(); } else stepDt = -1;
      } else if (jit.some((x) => x !== 0) || shake.position.lengthSq() > 0) { jit.fill(0); shake.position.set(0, 0, 0); snapTime = 0; }
      if (stepDt >= 0) {
        tAnim += stepDt; if (snapTime > 0) snapTime -= stepDt;
        pose(stepDt, !!chase);
      }
      root.updateMatrixWorld(true);
      afterPose?.(dt, needSnap, jointK);
      needSnap = false;
    },
    setPose(name, instant = false) {
      poseName = Object.prototype.hasOwnProperty.call(POSES, name) && name !== 'chase' ? name : 'idle';
      if (instant || !root.visible) needSnap = true;
    },
    setFade(a) {
      fade = clamp(+a || 0, 0, 1);
      shared.uFade.value = fade;
      shake.visible = fade > 0.003;
      const cast = castShadow && fade >= 0.55;
      for (const m of meshes) m.castShadow = cast;
    },
    lookAt(target, opts = {}) {
      if (!target) { look.on = false; return; }
      look.on = true; look.target = target;
      if (opts.maxYaw !== undefined) look.maxYaw = clamp(opts.maxYaw, 0, 179) * DEG;
      if (opts.maxPitch !== undefined) look.maxPitch = clamp(opts.maxPitch, 0, 89) * DEG;
      if (opts.speed !== undefined) look.speed = Math.max(0.05, opts.speed);
    },
    setGlitch(k) { glitch = clamp(+k || 0, 0, 1); },
    setEyes(k) { shared.uGlint.value = glint[0] + clamp(+k || 0, 0, 1) * glint[1]; },
    snapPose() { needSnap = true; },
    dispose() { root.removeFromParent(); for (const o of owned) o.dispose?.(); },
  };
  return api;
}

// ════════════════════════════════════════════════════════════════════════
//  著色器片段：抖動淡出（所有材質）、近距離過曝壓縮、皮膚與布料的程序化髒污
// ════════════════════════════════════════════════════════════════════════
const GLSL_COMMON = /* glsl */`
uniform float uGhostFade;
uniform float uGhostTime;
float ghostIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void ghostFade() {
  if (uGhostFade < 0.999) {
    float f = floor(uGhostTime * 24.0);
    if (ghostIGN(gl_FragCoord.xy + vec2(f * 5.588238, f * 3.117)) >= uGhostFade) discard;
  }
}
float gHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float gFbm(vec3 p) { return gNoise(p) * 0.55 + gNoise(p * 2.13 + 7.1) * 0.3 + gNoise(p * 4.7 + 3.3) * 0.15; }
// 手電筒貼近時把亮部壓回可辨識的範圍。ghostExpose 以受光量為準，所以反照率的對比（髒污、皺褶）不會被壓平
vec3 ghostCompress(vec3 c, float k) { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return c / (1.0 + l * k); }
vec3 ghostExpose(vec3 c, vec3 albedo, float k) {
  float a = max(dot(albedo, vec3(0.2126, 0.7152, 0.0722)), 0.12);
  return c / (1.0 + k * dot(c, vec3(0.2126, 0.7152, 0.0722)) / a);
}
`;
function installShader(material, shared, key, patch) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGhostFade = shared.uFade;
    shader.uniforms.uGhostTime = shared.uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  ghostFade();');
    patch?.(shader);
  };
  material.customProgramCacheKey = () => 'ghost-' + key;
  return material;
}

const SKIN_VERT_HEAD = /* glsl */`
uniform mat4 uGhostN;
varying vec3 vGhostK;
`;
const SKIN_FRAG_HEAD = /* glsl */`
uniform float uGhostHead;
uniform float uGhostGlint;
varying vec3 vGhostK;
`;
// 皮膚：去飽和的灰白、屍斑（四肢末端的紫灰色斑塊）、手腳與指尖的髒污、加深的眼窩
const SKIN_COLOR = /* glsl */`
{
  vec3 c = diffuseColor.rgb;
  float lum = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(vec3(lum), c, 0.42) * vec3(0.80, 0.86, 0.84);
  vec3 k = vGhostK;
  float ax = abs(k.x);
  float n1 = gFbm(k * 0.085 + 3.0), n2 = gFbm(k * 0.31 + 11.0), n3 = gNoise(k * 1.7);
  c *= 0.86 + 0.26 * gNoise(k * 2.7 + 4.0);
  // 屍斑：前臂、手、小腿、頸側
  float limb = max(smoothstep(30.0, 54.0, ax), smoothstep(52.0, 12.0, k.y)) * (1.0 - uGhostHead);
  limb = max(limb, uGhostHead * 0.45 * smoothstep(152.0, 140.0, k.y));
  float livor = smoothstep(0.42, 0.68, n1) * limb;
  c = mix(c, c * vec3(0.52, 0.4, 0.56), livor * 0.9);
  // 細小的瘀點與靜脈般的暗紋
  c *= 1.0 - 0.22 * smoothstep(0.62, 0.8, n2) * (0.4 + 0.6 * limb);
  // 髒污：腳、腳踝、指尖與指縫
  float foot = smoothstep(26.0, 2.0, k.y) * (1.0 - uGhostHead);
  float hand = smoothstep(51.0, 64.0, ax) * (1.0 - uGhostHead);
  float dirt = clamp(foot * (0.45 + 0.9 * n2) + hand * (0.25 + 0.9 * n2) + smoothstep(0.7, 0.9, n1 * n3 + 0.35 * n2) * 0.35, 0.0, 1.0);
  c = mix(c, vec3(0.045, 0.036, 0.028) * (0.6 + 0.8 * n3), dirt * 0.82);
  if (uGhostHead > 0.5) {
    vec2 uv = fract(vMapUv);
    // 眼窩與嘴周加深；嘴唇發紺
    float socket = min(distance(uv, vec2(0.405, 0.752)), distance(uv, vec2(0.593, 0.752)));
    c *= mix(0.16, 1.0, smoothstep(0.012, 0.085, socket));
    float mouth = distance((uv - vec2(0.5, 0.535)) * vec2(1.0, 1.9), vec2(0.0));
    c *= mix(vec3(0.34, 0.26, 0.32), vec3(1.0), smoothstep(0.02, 0.1, mouth));
    // 眼球：整顆染黑，沒有瞳孔與眼白
    float eye = min(distance(uv, vec2(0.112, 0.122)), distance(uv, vec2(0.887, 0.122)));
    c = mix(vec3(0.004, 0.004, 0.005), c, smoothstep(0.108, 0.118, eye));
  }
  diffuseColor.rgb = c * 0.72;
}
`;
const SKIN_ROUGH = /* glsl */`
{
  float wet = gFbm(vGhostK * 0.22 + 5.0);
  roughnessFactor = mix(0.48, 0.74, wet);
  if (uGhostHead > 0.5) {
    vec2 uv = fract(vMapUv);
    float eye = min(distance(uv, vec2(0.112, 0.122)), distance(uv, vec2(0.887, 0.122)));
    roughnessFactor = mix(0.07, roughnessFactor, smoothstep(0.108, 0.118, eye));
  }
}
`;
// 眼睛的一點反光：假想光源貼著觀看者，所以不管有沒有手電筒，黑暗裡都只剩兩個冷色的亮點
const SKIN_GLINT = /* glsl */`
vec3 ghostGlintColor = vec3(0.0);
if (uGhostHead > 0.5 && uGhostGlint > 0.0) {
  vec2 uv = fract(vMapUv);
  float eye = min(distance(uv, vec2(0.112, 0.122)), distance(uv, vec2(0.887, 0.122)));
  if (eye < 0.112) {
    vec3 V = normalize(vViewPosition);
    vec3 L = normalize(V + vec3(-0.16, 0.24, 0.0));
    float s = pow(max(dot(normalize(normal), L), 0.0), 900.0 / (1.0 + 7.0 * max(uGhostGlint - 0.5, 0.0)));
    ghostGlintColor = vec3(0.62, 0.72, 0.8) * s * uGhostGlint;
  }
}
`;
function skinMaterial(source, shared, N, isHead) {
  const m = source.clone();
  m.color.set(0xffffff); m.metalness = 0; m.envMapIntensity = 0.25; m.side = THREE.FrontSide; m.transparent = false; m.alphaTest = 0;
  if (m.normalScale) m.normalScale.set(1.15, 1.15);
  const head = { value: isHead ? 1 : 0 }, n = { value: N };
  return installShader(m, shared, 'skin', (shader) => {
    shader.uniforms.uGhostN = n; shader.uniforms.uGhostHead = head; shader.uniforms.uGhostGlint = shared.uGlint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGhostK = (uGhostN * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_FRAG_HEAD)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + SKIN_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + SKIN_ROUGH)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + SKIN_GLINT)
      .replace('#include <opaque_fragment>', 'outgoingLight = ghostExpose(outgoingLight + diffuseColor.rgb * vec3(0.036, 0.043, 0.048), diffuseColor.rgb, 0.5) + ghostGlintColor;\n#include <opaque_fragment>');
  });
}

// ════════════════════════════════════════════════════════════════════════
//  程序化貼圖（整個模組共用一份）
// ════════════════════════════════════════════════════════════════════════
const TEX = {};
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function clothMaps() {
  if (TEX.cloth) return TEX.cloth;
  const rng = mulberry32(4471), S = 512;
  const [c, g] = canvasOf(S, S);
  g.fillStyle = '#b7af9e'; g.fillRect(0, 0, S, S);
  // 泛黃與受潮的大片色塊
  for (let i = 0; i < 90; i++) {
    const x = rng() * S, y = rng() * S, r = 30 + rng() * 150;
    const grad = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    const yellow = rng() < 0.6;
    grad.addColorStop(0, yellow ? `rgba(118,96,48,${0.05 + rng() * 0.1})` : `rgba(58,56,50,${0.05 + rng() * 0.09})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 水漬的邊緣線
  for (let i = 0; i < 14; i++) {
    const x = rng() * S, y = rng() * S, r = 24 + rng() * 80;
    g.strokeStyle = `rgba(86,66,34,${0.08 + rng() * 0.12})`; g.lineWidth = 1 + rng() * 2.5;
    g.beginPath();
    for (let a = 0; a <= 24; a++) { const th = (a / 24) * Math.PI * 2, rr = r * (0.8 + 0.3 * Math.sin(th * 3 + i) + 0.15 * rng()); const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr * 0.8; if (a) g.lineTo(px, py); else g.moveTo(px, py); }
    g.closePath(); g.stroke();
  }
  // 往下流的髒水痕、黴點
  for (let i = 0; i < 70; i++) { const x = rng() * S, y = rng() * S, len = 40 + rng() * 220; const grad = g.createLinearGradient(0, y, 0, y + len); grad.addColorStop(0, 'rgba(52,44,30,0)'); grad.addColorStop(0.3, `rgba(52,44,30,${0.05 + rng() * 0.1})`); grad.addColorStop(1, 'rgba(52,44,30,0)'); g.fillStyle = grad; g.fillRect(x, y, 1.5 + rng() * 5, len); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${28 + rng() * 20},${26 + rng() * 16},${18 + rng() * 12},${0.12 + rng() * 0.3})`; g.beginPath(); g.arc(rng() * S, rng() * S, 0.4 + rng() * rng() * 2.6, 0, 7); g.fill(); }
  // 細碎的髒點（不畫規則的布紋，近看才不會像方格紙）
  for (let i = 0; i < 2600; i++) { g.fillStyle = rng() < 0.5 ? `rgba(20,18,12,${0.03 + rng() * 0.06})` : `rgba(255,250,235,${0.02 + rng() * 0.05})`; g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 3); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  // 法線：垂直的皺褶與細布紋
  const NS = 256, [nc, ng] = canvasOf(NS, NS), img = ng.createImageData(NS, NS);
  const ph = Array.from({ length: 8 }, () => rng() * 6.283);
  const h = (x, y) => {
    const u = (x / NS) * Math.PI * 2, w = (y / NS) * Math.PI * 2;
    return Math.sin(u * 3 + ph[0] + Math.sin(w + ph[1]) * 0.9) * 0.5 + Math.sin(u * 7 + ph[2] + Math.sin(w * 2 + ph[3]) * 0.7) * 0.28
      + Math.sin(u * 13 + ph[4] + Math.sin(w * 3 + ph[5])) * 0.14 + Math.sin(w * 5 + ph[6] + Math.sin(u * 4 + ph[7])) * 0.1
      + (Math.sin(x * 1.57) + Math.sin(y * 1.57)) * 0.02;
  };
  for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * 2.4, dy = (h(x, y + 1) - h(x, y - 1)) * 2.4, l = Math.hypot(dx, dy, 1), o = (y * NS + x) * 4;
    img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  ng.putImageData(img, 0, 0);
  const normalMap = new THREE.CanvasTexture(nc);
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.anisotropy = 4; }
  return (TEX.cloth = { map, normalMap });
}
function hairMap() {
  if (TEX.hair) return TEX.hair;
  const rng = mulberry32(977), W = 128, H = 512;
  const [c, g] = canvasOf(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgb(15,14,14)'; g.strokeStyle = 'rgb(15,14,14)'; g.lineCap = 'round';
  // 右側（x 22 以後）：一綹濕髮。上段黏成一片，下段分成幾條、各自收尖
  const X0 = 30, X1 = W, split = H * 0.4, locks = 5, lw = (X1 - X0 - 6) / locks;
  g.beginPath(); g.moveTo(X0 + 3, -2);
  for (let y = 0; y <= split; y += 16) g.lineTo(X0 + 2 + rng() * 5, y);
  for (let i = 0; i < locks; i++) {
    const xa = X0 + 3 + i * lw, xb = xa + lw, len = H * (0.6 + rng() * 0.4), tip = (xa + xb) / 2 + (rng() - 0.5) * lw * 1.3;
    g.lineTo(xa + 1, split + 6);
    g.bezierCurveTo(xa + 2, split + (len - split) * 0.5, tip - 2.5, len - 34, tip, len);
    g.bezierCurveTo(tip + 2.5, len - 34, xb - 2, split + (len - split) * 0.5, xb - 1, split + 6);
  }
  for (let y = split; y >= -2; y -= 16) g.lineTo(X1 - 2 - rng() * 5, y);
  g.closePath(); g.fill();
  // 左側（x 0..17）：一根離群的細髮
  g.lineWidth = 4.6; g.beginPath(); g.moveTo(9, -2); g.bezierCurveTo(5, H * 0.3, 13, H * 0.62, 8, H * 0.9); g.stroke();
  g.lineWidth = 2.4; g.beginPath(); g.moveTo(8, H * 0.89); g.lineTo(9.5, H * 0.985); g.stroke();
  // 髮絲的明暗條紋，只畫在已經不透明的地方
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 280; i++) {
    const x = rng() * W, shade = 3 + rng() * rng() * 78;
    g.strokeStyle = `rgba(${shade},${shade * 0.96},${shade * 0.9},${0.35 + rng() * 0.5})`; g.lineWidth = 0.6 + rng() * 1.7;
    g.beginPath(); g.moveTo(x, -2); g.bezierCurveTo(x + (rng() - 0.5) * 6, H * 0.33, x + (rng() - 0.5) * 9, H * 0.66, x + (rng() - 0.5) * 11, H + 2); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.generateMipmaps = false; map.minFilter = THREE.LinearFilter;
  return (TEX.hair = map);
}

// ════════════════════════════════════════════════════════════════════════
//  'woman'：授權掃描人體 + 程序化的頭髮、長衣、紅繩
// ════════════════════════════════════════════════════════════════════════
const SCAN_CACHE = new WeakMap();
const canonical = (name) => { const m = /^mixamorig[_:]?(.+?)(?:_\d+)?$/.exec(name || ''); return m && !/End$|[a-z]4$/.test(m[1]) ? m[1] : null; };

/** 每個來源模型只做一次：量出 K 空間、裁掉被衣服蓋住的身體、產生長衣與頭髮的資料。 */
function prepareScan(sourceScene) {
  let data = SCAN_CACHE.get(sourceScene);
  if (data) return data;
  sourceScene.updateMatrixWorld(true);
  const skinned = [];
  sourceScene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  const isHeadMesh = (o) => /kafa/i.test(o.name) || /kafa/i.test(o.material?.name || '') || /kafa/i.test(o.parent?.name || '');
  const wanted = (o) => /vucut|kafa/i.test(o.material?.name || '') && !/sutgen|saclar|elbise/i.test(o.material?.name || '');
  const bodyMesh = skinned.find((o) => wanted(o) && !isHeadMesh(o)) || skinned[0];
  const headMesh = skinned.find((o) => wanted(o) && isHeadMesh(o)) || bodyMesh;
  // K 空間：以髖骨的區域空間為準（對量化不敏感），再把腳底平移到 y = 0
  const hipsInverse = (mesh) => mesh.skeleton.boneInverses[mesh.skeleton.bones.findIndex((b) => canonical(b.name) === 'Hips')];
  const v = new THREE.Vector3();
  const pos = bodyMesh.geometry.attributes.position, hi = hipsInverse(bodyMesh);
  let minY = Infinity;
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(hi); if (v.y < minY) minY = v.y; }
  const lift = new THREE.Matrix4().makeTranslation(0, -minY, 0);
  const N = (mesh) => lift.clone().multiply(hipsInverse(mesh));
  const NBody = N(bodyMesh), NHead = N(headMesh);
  // 骨頭在 K 空間的綁定矩陣
  const names = [], bindM = {};
  bodyMesh.skeleton.bones.forEach((bone, i) => {
    const name = canonical(bone.name); if (!name || bindM[name]) return;
    names.push(name); bindM[name] = NBody.clone().multiply(bodyMesh.skeleton.boneInverses[i].clone().invert());
  });
  // 身體頂點（K 空間）與蒙皮權重（換成標準名稱的索引）
  const count = pos.count, P = new Float32Array(count * 3), armW = new Float32Array(count);
  const si = bodyMesh.geometry.attributes.skinIndex, sw = bodyMesh.geometry.attributes.skinWeight;
  const boneToCanon = bodyMesh.skeleton.bones.map((b) => names.indexOf(canonical(b.name)));
  const J = new Int16Array(count * 4), Wt = new Float32Array(count * 4), w4 = new THREE.Vector4(), j4 = new THREE.Vector4();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(NBody); P.set([v.x, v.y, v.z], i * 3);
    j4.fromBufferAttribute(si, i); w4.fromBufferAttribute(sw, i);
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const c = boneToCanon[j4.getComponent(k)], w = c < 0 ? 0 : w4.getComponent(k);
      J[i * 4 + k] = Math.max(0, c); Wt[i * 4 + k] = w; total += w;
      if (c >= 0 && /(Arm|Hand)/.test(names[c]) && !/Shoulder/.test(names[c])) armW[i] += w;
    }
    if (total > 0) { for (let k = 0; k < 4; k++) Wt[i * 4 + k] /= total; armW[i] /= total; }
  }
  const dress = buildDress(P, J, Wt, armW, bodyMesh.geometry.index, names);
  // 裁掉長衣底下看不到的身體三角形（軀幹與大腿），避免穿模也省下繪製量
  const index = bodyMesh.geometry.index;
  if (index && !bodyMesh.geometry.userData.ghostCulled) {
    const keep = [];
    const hidden = (i) => armW[i] < 0.3 && P[i * 3 + 1] > 49 && P[i * 3 + 1] < 113;
    for (let t = 0; t < index.count; t += 3) {
      const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
      if ((hidden(a) && hidden(b) && hidden(c)) || (dress.covered[a] && dress.covered[b] && dress.covered[c])) continue;
      keep.push(a, b, c);
    }
    bodyMesh.geometry.setIndex(keep);
    bodyMesh.geometry.userData.ghostCulled = true;
  }
  const inverses = names.map((name) => bindM[name].clone().invert());
  data = { names, bindM, NBody, NHead, bodyName: bodyMesh.name, headName: headMesh.name, dress: dress.geometry, inverses, hair: buildHairSpec() };
  SCAN_CACHE.set(sourceScene, data);
  return data;
}

/**
 * 泛黃的舊式長衣。上半（胸口以上）是沿著身體表面外推的貼身布片，權重直接沿用身體；
 * 下半從胸線垂掛到小腿，像掛著的布一樣只會往外、不會往內收，裙襬有皺褶與破口。
 */
function buildDress(P, J, Wt, armW, index, names) {
  const count = P.length / 3;
  const covered = new Uint8Array(count);
  const positions = [], uvs = [], hems = [], sIdx = [], sWt = [], indices = [];
  const AXIS_Z = -0.5, U_REPEAT = 2.4;
  const uOf = (x, z) => (Math.abs(Math.atan2(x, z - AXIS_Z)) / Math.PI) * U_REPEAT;
  // ── 上半：身體三角形外推 ──
  const inYoke = (i) => P[i * 3 + 1] > 110 && armW[i] < 0.62;
  const weld = new Map(), remap = new Int32Array(count).fill(-1), yokeV = [];
  const tris = [];
  if (index) for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
    if (!(inYoke(a) && inYoke(b) && inYoke(c))) continue;
    const out = [];
    for (const i of [a, b, c]) {
      if (remap[i] < 0) {
        const key = `${Math.round(P[i * 3] * 20)},${Math.round(P[i * 3 + 1] * 20)},${Math.round(P[i * 3 + 2] * 20)}`;
        if (!weld.has(key)) { weld.set(key, yokeV.length); yokeV.push(i); }
        remap[i] = weld.get(key);
      }
      out.push(remap[i]);
    }
    if (out[0] !== out[1] && out[1] !== out[2] && out[0] !== out[2]) tris.push(out);
  }
  const yn = yokeV.length, yp = new Float32Array(yn * 3), ynrm = new Float32Array(yn * 3);
  for (let k = 0; k < yn; k++) yp.set(P.subarray(yokeV[k] * 3, yokeV[k] * 3 + 3), k * 3);
  const neighbors = Array.from({ length: yn }, () => new Set()), edgeCount = new Map(), boundary = new Uint8Array(yn);
  for (const [a, b, c] of tris) {
    neighbors[a].add(b).add(c); neighbors[b].add(a).add(c); neighbors[c].add(a).add(b);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { const key = p < q ? p * 1e6 + q : q * 1e6 + p; edgeCount.set(key, (edgeCount.get(key) || 0) + 1); }
  }
  for (const [key, c] of edgeCount) if (c === 1) { boundary[Math.floor(key / 1e6)] = 1; boundary[key % 1e6] = 1; }
  // 平滑兩次，抹掉身體的細部起伏，看起來是布而不是皮膚
  for (let pass = 0; pass < 2; pass++) {
    const next = yp.slice();
    for (let k = 0; k < yn; k++) {
      if (boundary[k] || !neighbors[k].size) continue;
      let x = 0, y = 0, z = 0; for (const m of neighbors[k]) { x += yp[m * 3]; y += yp[m * 3 + 1]; z += yp[m * 3 + 2]; }
      const s = neighbors[k].size;
      next[k * 3] = mix(yp[k * 3], x / s, 0.5); next[k * 3 + 1] = mix(yp[k * 3 + 1], y / s, 0.5); next[k * 3 + 2] = mix(yp[k * 3 + 2], z / s, 0.5);
    }
    yp.set(next);
  }
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
  for (const [a, b, c] of tris) {
    e1.set(yp[b * 3] - yp[a * 3], yp[b * 3 + 1] - yp[a * 3 + 1], yp[b * 3 + 2] - yp[a * 3 + 2]);
    e2.set(yp[c * 3] - yp[a * 3], yp[c * 3 + 1] - yp[a * 3 + 1], yp[c * 3 + 2] - yp[a * 3 + 2]);
    nn.crossVectors(e1, e2);
    for (const k of [a, b, c]) { ynrm[k * 3] += nn.x; ynrm[k * 3 + 1] += nn.y; ynrm[k * 3 + 2] += nn.z; }
  }
  for (let k = 0; k < yn; k++) {
    nn.set(ynrm[k * 3], ynrm[k * 3 + 1], ynrm[k * 3 + 2]).normalize();
    const off = boundary[k] ? 0.45 : 1.25;
    const x = yp[k * 3] + nn.x * off, y = yp[k * 3 + 1] + nn.y * off, z = yp[k * 3 + 2] + nn.z * off;
    positions.push(x, y, z); uvs.push(uOf(x, z), (y - 110) / 60); hems.push(0);
    const i = yokeV[k];
    sIdx.push(J[i * 4], J[i * 4 + 1], J[i * 4 + 2], J[i * 4 + 3]); sWt.push(Wt[i * 4], Wt[i * 4 + 1], Wt[i * 4 + 2], Wt[i * 4 + 3]);
  }
  for (const [a, b, c] of tris) indices.push(a, b, c);
  // 完全被布片蓋住的身體頂點（不在布片邊界上）可以裁掉
  for (let i = 0; i < count; i++) if (remap[i] >= 0 && !boundary[remap[i]]) covered[i] = 1;

  // ── 下半：垂掛的裙身 ──
  // 身體輪廓表：每 3 cm 一層、48 個方位，記錄軀幹與腿離中軸最遠的距離
  const NA = 48, NY = 52, table = new Float32Array(NA * NY);
  for (let i = 0; i < count; i++) {
    if (armW[i] > 0.4) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2] - AXIS_Z;
    const r = Math.hypot(x, z), a = ((Math.atan2(x, z) / (Math.PI * 2) + 1) % 1) * NA, yy = y / 3;
    for (let dy = -1; dy <= 1; dy++) for (let da = -1; da <= 1; da++) {
      const iy = Math.round(yy) + dy, ia = (Math.round(a) + da + NA) % NA;
      if (iy < 0 || iy >= NY) continue;
      if (r > table[iy * NA + ia]) table[iy * NA + ia] = r;
    }
  }
  const bodyR = (theta, y) => {
    const a = ((theta / (Math.PI * 2) + 1) % 1) * NA, a0 = Math.floor(a) % NA, a1 = (a0 + 1) % NA, fa = a - Math.floor(a);
    const yy = clamp(y / 3, 0, NY - 1.001), y0 = Math.floor(yy), fy = yy - y0;
    return mix(mix(table[y0 * NA + a0], table[y0 * NA + a1], fa), mix(table[(y0 + 1) * NA + a0], table[(y0 + 1) * NA + a1], fa), fy);
  };
  const NT = 48, NR = 25, rng = mulberry32(5521), base = positions.length / 3;
  const R = Array.from({ length: NR }, () => new Float32Array(NT)), Y = Array.from({ length: NR }, () => new Float32Array(NT));
  for (let j = 0; j < NT; j++) {
    const th = (j / NT) * Math.PI * 2, side = Math.sin(th) ** 2;
    const top = 125.5 - 8.5 * side, hem = 17 + 3.2 * Math.sin(th * 3 + 1.2) + 2.2 * Math.sin(th * 7 + 0.4) + (rng() - 0.5) * 2.5;
    // 第 0 圈是往內收進上半布片底下的領圍，從上面往下看才不會看穿
    Y[0][j] = top + 2.6; R[0][j] = bodyR(th, top + 2.6) - 2.6;
    for (let r = 1; r < NR; r++) {
      const f = Math.pow((r - 1) / (NR - 2), 0.92), y = mix(top, hem, f);
      Y[r][j] = y;
      const ease = 1.3 + 1.6 * f;
      R[r][j] = r === 1 ? bodyR(th, y) + 1.9 : Math.max(bodyR(th, y) + ease, R[r - 1][j] + 0.085 * (Y[r - 1][j] - y));
    }
  }
  for (let r = 2; r < NR; r++) for (let pass = 0; pass < 3; pass++) { const row = R[r].slice(); for (let j = 0; j < NT; j++) R[r][j] = Math.max(row[j] * 0.5 + (row[(j + 1) % NT] + row[(j + NT - 1) % NT]) * 0.25, pass < 2 ? 0 : bodyR((j / NT) * Math.PI * 2, Y[r][j]) + 0.9); }
  // 權重：胸腹用最近的身體頂點，裙襬用公式（髖、兩條大腿、兩條小腿）
  const bi = (n) => names.indexOf(n);
  const B = { Hips: bi('Hips'), LU: bi('LeftUpLeg'), RU: bi('RightUpLeg'), LL: bi('LeftLeg'), RL: bi('RightLeg') };
  const torso = []; for (let i = 0; i < count; i += 2) if (armW[i] < 0.25 && P[i * 3 + 1] > 70 && P[i * 3 + 1] < 132) torso.push(i);
  const nearest = (x, y, z) => { let best = -1, bd = 1e9; for (const i of torso) { const d = (P[i * 3] - x) ** 2 + (P[i * 3 + 1] - y) ** 2 + (P[i * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; };
  for (let r = 0; r < NR; r++) for (let j = 0; j < NT; j++) {
    const th = (j / NT) * Math.PI * 2, f = Math.max(0, (r - 1) / (NR - 2)), y = Y[r][j];
    const fold = Math.sin(th * 7 + 1.3 + 2.1 * f) * 0.5 + Math.sin(th * 12 + 4.1 - 1.7 * f) * 0.33 + Math.sin(th * 19 + 0.7) * 0.17 + Math.sin(th * 4 + 2.6 + f) * 0.3;
    const rad = R[r][j] + (r === 0 ? 0 : fold * (0.3 + 3.3 * Math.pow(f, 1.25)));
    const x = Math.sin(th) * rad, z = AXIS_Z + Math.cos(th) * rad;
    positions.push(x, y, z); uvs.push((j <= NT / 2 ? j : NT - j) / (NT / 2) * U_REPEAT, (y - 110) / 60); hems.push(f);
    const w = new Map(), addW = (b, a) => { if (a > 0 && b >= 0) w.set(b, (w.get(b) || 0) + a); };
    const lower = sstep(98, 82, y);
    if (lower < 1) { const i = nearest(x, y, z); for (let k = 0; k < 4; k++) addW(J[i * 4 + k], Wt[i * 4 + k] * (1 - lower)); }
    if (lower > 0) {
      const left = sstep(-7, 7, x), t = clamp((85 - y) / 40, 0, 1), u = clamp((45 - y) / 30, 0, 1);
      const leg = 0.45 * u, up = y > 45 ? 0.25 + 0.6 * t : 0.8 - 0.35 * u, hip = 1 - leg - up;
      addW(B.Hips, hip * lower); addW(B.LU, up * left * lower); addW(B.RU, up * (1 - left) * lower); addW(B.LL, leg * left * lower); addW(B.RL, leg * (1 - left) * lower);
    }
    const top4 = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top4.reduce((s, x2) => s + x2[1], 0) || 1;
    for (let k = 0; k < 4; k++) { sIdx.push(top4[k]?.[0] ?? 0); sWt.push((top4[k]?.[1] ?? 0) / sum); }
  }
  for (let r = 0; r < NR - 1; r++) for (let j = 0; j < NT; j++) {
    const a = base + r * NT + j, b = base + r * NT + (j + 1) % NT, c = a + NT, d = b + NT;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('ghostHem', new THREE.Float32BufferAttribute(hems, 1));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWt, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, covered };
}
function dressMaterial(shared) {
  const { map, normalMap } = clothMaps();
  const m = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(1.5, 1.5), color: 0xffffff, roughness: 0.93, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.2 });
  return installShader(m, shared, 'dress', (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ghostHem;\nvarying float vGhostHem;\nvarying vec3 vGhostK;\nuniform float uGhostTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vGhostHem = ghostHem; vGhostK = position;
  { float s = ghostHem * ghostHem; transformed.x += sin(uGhostTime * 1.3 + position.z * 0.11 + position.y * 0.05) * 1.1 * s; transformed.z += sin(uGhostTime * 1.05 + position.x * 0.13) * 1.3 * s; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGhostHem;\nvarying vec3 vGhostK;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    // 裙襬的破口
    float edge = smoothstep(0.93, 1.0, vGhostHem);
    if (edge > 0.0 && gNoise(vec3(vGhostK.x * 0.9, vGhostK.z * 0.9, 3.7)) * 0.75 + gNoise(vGhostK * 0.23) * 0.45 < edge) discard;
    float n1 = gFbm(vGhostK * 0.07 + 2.0), n2 = gFbm(vGhostK * 0.33 + 9.0);
    vec3 c = diffuseColor.rgb;
    // 受潮的深色大片、往上滲的泥水、領口與腋下的汗黃
    c *= 1.0 - 0.3 * smoothstep(0.45, 0.75, n1);
    float mud = smoothstep(0.45, 1.0, vGhostHem + (n2 - 0.5) * 0.35);
    c = mix(c, vec3(0.085, 0.066, 0.045) * (0.7 + 0.6 * n2), mud * 0.82);
    c = mix(c, c * vec3(0.72, 0.58, 0.36), smoothstep(0.55, 0.8, n2) * 0.5);
    diffuseColor.rgb = c * 0.7;
  }`)
      .replace('#include <opaque_fragment>', 'outgoingLight = ghostExpose(outgoingLight + diffuseColor.rgb * vec3(0.036, 0.043, 0.048), diffuseColor.rgb, 0.5);\n#include <opaque_fragment>');
  });
}

/**
 * 頭髮（K 空間、綁定姿勢的資料）。三個部分合成一個動態網格、1 個 draw call：
 *   頭皮罩（貼著頭顱的一層）、成綹的濕髮（每綹 10 個節點，前幾個貼著頭皮，其餘受重力垂落）、
 *   以及少數離群的細髮。臉的正前方留一道縫，露出她的左眼。
 */
const HAIR_POINTS = 10;
const SKULL = { c: [0, 157.3, 1.1], r: [9.35, 11.15, 9.85] };
const hairExit = (phi) => { const front = Math.cos(phi) * 0.5 + 0.5, side = Math.abs(Math.sin(phi)); return mix(mix(118, 88, side), 63, front * front) * DEG; };
const onSkull = (eps, phi, extra) => [SKULL.c[0] + (SKULL.r[0] + extra) * Math.sin(eps) * Math.sin(phi), SKULL.c[1] + (SKULL.r[1] + extra) * Math.cos(eps), SKULL.c[2] + (SKULL.r[2] + extra) * Math.sin(eps) * Math.cos(phi)];
function buildHairSpec() {
  const rng = mulberry32(1998), strands = [];
  const make = (stray, s, N) => {
    // phi：0 = 正面，±π = 腦後
    const phi = stray ? (rng() < 0.7 ? (rng() - 0.5) * 2.6 : (rng() - 0.5) * 6.28) : ((((s + rng()) / N) * 13) % 1) * Math.PI * 2 - Math.PI;
    const front = Math.cos(phi) * 0.5 + 0.5, sideness = Math.abs(Math.sin(phi));
    const exit = hairExit(phi);
    const eps0 = exit * (stray ? 0.7 + 0.3 * rng() : 0.4 + 0.6 * Math.pow(rng(), 0.8));
    const lift = stray ? 1.0 + rng() * 1.2 : 0.15 + rng() * 0.95;
    let length = mix(mix(46, 40, sideness), 28, Math.pow(front, 1.5)) * (0.6 + rng() * 0.65) + (stray ? 3 + rng() * 9 : 0);
    const width = stray ? 1.5 + rng() * 0.8 : (2.1 + rng() * 1.9) * (1 - 0.2 * front);
    const drift = (rng() - 0.5) * 0.5, pts = [];
    for (let k = 0, eps = eps0; k < 3 && eps < exit; k++, eps += 0.3) pts.push(onSkull(eps, phi + drift * (eps - eps0), lift * Math.min(1, 0.3 + k * 0.4)));
    if (!pts.length) pts.push(onSkull(exit, phi, lift * 0.3));
    const fixed = pts.length, last = pts[fixed - 1], prev = fixed > 1 ? pts[fixed - 2] : onSkull(Math.max(0, eps0 - 0.3), phi, lift * 0.3);
    const dir = new THREE.Vector3(last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]).normalize();
    if (front > 0.68 && last[0] > 0.2 && last[0] < 6.8) length = stray ? length * 0.3 : 2.5 + rng() * 4;
    const flip = rng() < 0.5;
    strands.push({ fixed: pts, dir: dir.toArray(), seg: length / (HAIR_POINTS - fixed), width, lift, stiff: stray ? 0.35 : 0.5 + rng() * 0.2, lag: stray ? 3.5 + rng() * 3 : 6 + rng() * 6, phase: rng() * 6.28, u: stray ? [0.005, 0.135] : flip ? [0.99, 0.25] : [0.25, 0.99] });
  };
  for (let s = 0; s < 130; s++) make(false, s, 130);
  for (let s = 0; s < 44; s++) make(true, s, 44);
  // 頭皮罩
  const cap = { pos: [], nrm: [], uv: [], idx: [] }, CR = 5, CA = 18;
  for (let i = 0; i <= CR; i++) for (let j = 0; j <= CA; j++) {
    const phi = (j / CA) * Math.PI * 2 - Math.PI, eps = Math.max(0.02, (i / CR) * hairExit(phi) * 1.04), p = onSkull(eps, phi, 0.12);
    cap.pos.push(...p);
    cap.nrm.push((p[0] - SKULL.c[0]) / SKULL.r[0] ** 2, (p[1] - SKULL.c[1]) / SKULL.r[1] ** 2, (p[2] - SKULL.c[2]) / SKULL.r[2] ** 2);
    cap.uv.push(0.34 + 0.56 * Math.abs((((j / CA) * 6) % 2) - 1), 1 - (i / CR) * 0.3);
    if (i < CR && j < CA) { const a = i * (CA + 1) + j, b = a + 1, c2 = a + CA + 1, d = c2 + 1; cap.idx.push(a, c2, b, b, c2, d); }
  }
  return { strands, cap };
}

function createHair(spec, shared, bones, rig, kToRoot) {
  const strands = spec.strands, cap = spec.cap, S = strands.length, P = HAIR_POINTS;
  const capBase = S * P * 2, capCount = cap.pos.length / 3, total = capBase + capCount;
  const positions = new Float32Array(total * 3), normals = new Float32Array(total * 3), uvs = new Float32Array(total * 2), indices = [];
  for (let s = 0; s < S; s++) for (let p = 0; p < P; p++) {
    const o = (s * P + p) * 2, st = strands[s];
    uvs.set([st.u[0], 1 - p / (P - 1), st.u[1], 1 - p / (P - 1)], o * 2);
    if (p < P - 1) indices.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  }
  uvs.set(cap.uv, capBase * 2);
  for (const i of cap.idx) indices.push(capBase + i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0.3), 2.4);
  const material = installShader(new THREE.MeshStandardMaterial({ map: hairMap(), color: 0x6e6963, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.4, metalness: 0, envMapIntensity: 0.2 }), shared, 'hair', (shader) => {
    // 高光只留在比較亮的髮絲上，整體仍是濕黑的
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <transmission_fragment>', 'totalSpecular *= 0.06 + 2.6 * sampledDiffuseColor.g;\n#include <transmission_fragment>')
      .replace('#include <opaque_fragment>', 'outgoingLight = ghostCompress(outgoingLight, 2.2);\n#include <opaque_fragment>');
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'GhostHair'; mesh.castShadow = true; mesh.receiveShadow = true;
  // 模擬狀態（root 區域空間、公尺）
  const pts = new Float32Array(S * P * 3);
  const head = bones.Head, chest = bones.Spine2;
  const headBindInv = rig.bindInv.Head, chestBindInv = rig.bindInv.Spine2;
  const H = new THREE.Matrix4(), Hinv = new THREE.Matrix4(), C = new THREE.Matrix4(), rootInv = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), t = new THREE.Vector3(), side = new THREE.Vector3(), out = new THREE.Vector3(), down = new THREE.Vector3();
  const caps = [[[-12, 135, -1.8], [12, 135, -1.8], 7.6], [[-6.5, 124.5, 0.5], [6.5, 124.5, 0.5], 11.0], [[-5, 110, 0], [5, 110, 0], 10.5]];
  const capA = caps.map(() => new THREE.Vector3()), capB = caps.map(() => new THREE.Vector3());
  const FACE = { c: [0, 152.5, 4.4], r: 8.5 };
  const headC = new THREE.Vector3(), lastRoot = new THREE.Vector3(), vel = new THREE.Vector3();
  let time = 0;
  function update(root, dt, snap) {
    time += dt;
    rootInv.copy(root.matrixWorld).invert();
    H.multiplyMatrices(rootInv, head.matrixWorld).multiply(headBindInv);   // K（跟著頭）→ root 區域
    Hinv.copy(H).invert();
    C.multiplyMatrices(rootInv, chest.matrixWorld).multiply(chestBindInv); // K（跟著胸）→ root 區域
    const scale = kToRoot();                                             // 1 cm 在 root 區域的長度
    for (let i = 0; i < caps.length; i++) { capA[i].set(...caps[i][0]).applyMatrix4(C); capB[i].set(...caps[i][1]).applyMatrix4(C); }
    headC.set(...SKULL.c).applyMatrix4(H);
    // root 的移動換成反方向的拖曳感
    a.setFromMatrixPosition(root.matrixWorld);
    const moved = a.distanceTo(lastRoot);
    if (snap || dt <= 0 || moved > 0.6) vel.set(0, 0, 0);
    else { b.copy(a).sub(lastRoot).transformDirection(rootInv).multiplyScalar(moved / dt); vel.lerp(b, Math.min(1, dt * 6)); }
    lastRoot.copy(a);
    down.set(0, -1, 0).addScaledVector(vel, -0.09); down.y = Math.min(down.y, -0.5); down.normalize();
    // 頭皮罩：跟著頭骨
    for (let i = 0; i < capCount; i++) {
      const o = (capBase + i) * 3;
      a.set(cap.pos[i * 3], cap.pos[i * 3 + 1], cap.pos[i * 3 + 2]).applyMatrix4(H);
      positions[o] = a.x; positions[o + 1] = a.y; positions[o + 2] = a.z;
      a.set(cap.nrm[i * 3], cap.nrm[i * 3 + 1], cap.nrm[i * 3 + 2]).transformDirection(H);
      normals[o] = a.x; normals[o + 1] = a.y; normals[o + 2] = a.z;
    }
    for (let s = 0; s < S; s++) {
      const st = strands[s], base = s * P * 3, seg = st.seg * scale, fixed = st.fixed.length;
      d.set(st.dir[0], st.dir[1], st.dir[2]).transformDirection(H);
      for (let p = 0; p < P; p++) {
        const o = base + p * 3;
        if (p < fixed) { a.set(st.fixed[p][0], st.fixed[p][1], st.fixed[p][2]).applyMatrix4(H); pts[o] = a.x; pts[o + 1] = a.y; pts[o + 2] = a.z; continue; }
        b.set(pts[o - 3], pts[o - 2], pts[o - 1]);
        // 方向逐節從「順著頭皮」轉向重力，再加一點隨時間的輕微擺動
        d.lerp(down, Math.min(1, st.stiff + (p - fixed) * 0.25)).normalize();
        d.x += Math.sin(time * 0.9 + st.phase + p * 0.5) * 0.012; d.z += Math.cos(time * 0.7 + st.phase) * 0.012;
        a.copy(b).addScaledVector(d, seg);
        if (!snap) {
          // 慣性：往目標位置追，越靠髮尾越慢
          t.set(pts[o], pts[o + 1], pts[o + 2]);
          a.lerpVectors(t, a, 1 - Math.exp(-dt * st.lag * (1.6 - p / P)));
          a.sub(b).setLength(seg).add(b);
        }
        // 碰撞：頭顱橢球、臉、肩與胸的膠囊、地面
        t.copy(a).applyMatrix4(Hinv);
        const ex = (t.x - SKULL.c[0]) / (SKULL.r[0] + st.lift), ey = (t.y - SKULL.c[1]) / (SKULL.r[1] + st.lift), ez = (t.z - SKULL.c[2]) / (SKULL.r[2] + st.lift);
        const el = Math.hypot(ex, ey, ez);
        let pushed = false;
        if (el < 1) { t.set(SKULL.c[0] + (ex / el) * (SKULL.r[0] + st.lift), SKULL.c[1] + (ey / el) * (SKULL.r[1] + st.lift), SKULL.c[2] + (ez / el) * (SKULL.r[2] + st.lift)); pushed = true; }
        const fx = t.x - FACE.c[0], fy = t.y - FACE.c[1], fz = t.z - FACE.c[2], fl = Math.hypot(fx, fy, fz), fr = FACE.r + st.lift * 0.6;
        if (fl < fr) { t.set(FACE.c[0] + (fx / fl) * fr, FACE.c[1] + (fy / fl) * fr, FACE.c[2] + (fz / fl) * fr); pushed = true; }
        if (pushed) a.copy(t).applyMatrix4(H);
        for (let i = 0; i < caps.length; i++) {
          side.copy(capB[i]).sub(capA[i]);
          const u = clamp(t.copy(a).sub(capA[i]).dot(side) / side.lengthSq(), 0, 1);
          t.copy(capA[i]).addScaledVector(side, u);
          const rr = (caps[i][2] + st.lift * 0.5) * scale, dist = a.distanceTo(t);
          if (dist < rr && dist > 1e-6) a.sub(t).multiplyScalar(rr / dist).add(t);
        }
        if (a.y < 0.012 + st.lift * 0.004) a.y = 0.012 + st.lift * 0.004;
        d.copy(a).sub(b).normalize();
        pts[o] = a.x; pts[o + 1] = a.y; pts[o + 2] = a.z;
      }
      // 展開成帶狀面片，面向頭的外側
      for (let p = 0; p < P; p++) {
        const o = base + p * 3;
        a.set(pts[o], pts[o + 1], pts[o + 2]);
        if (p < P - 1) t.set(pts[o + 3] - a.x, pts[o + 4] - a.y, pts[o + 5] - a.z); else t.set(a.x - pts[o - 3], a.y - pts[o - 2], a.z - pts[o - 1]);
        t.normalize();
        out.copy(a).sub(headC); out.y *= 0.25; if (out.lengthSq() < 1e-8) out.set(0, 0, 1); out.normalize();
        side.crossVectors(t, out); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
        out.crossVectors(side, t).normalize();
        const f = p / (P - 1), w = st.width * scale * 0.5 * (p < fixed ? 1 : mix(1, 0.5, Math.pow(Math.max(0, (p - fixed) / (P - 1 - fixed)), 1.6)));
        const vo = (s * P + p) * 6;
        positions[vo] = a.x - side.x * w; positions[vo + 1] = a.y - side.y * w; positions[vo + 2] = a.z - side.z * w;
        positions[vo + 3] = a.x + side.x * w; positions[vo + 4] = a.y + side.y * w; positions[vo + 5] = a.z + side.z * w;
        const bend = 0.55 - f * 0.1;
        normals[vo] = out.x - side.x * bend; normals[vo + 1] = out.y - side.y * bend; normals[vo + 2] = out.z - side.z * bend;
        normals[vo + 3] = out.x + side.x * bend; normals[vo + 4] = out.y + side.y * bend; normals[vo + 5] = out.z + side.z * bend;
      }
    }
    geometry.attributes.position.needsUpdate = true; geometry.attributes.normal.needsUpdate = true;
  }
  return { mesh, update };
}

function createScanWoman(assets) {
  const sourceScene = assets.models.ghost_woman;
  const data = prepareScan(sourceScene);
  const root = new THREE.Group(); root.name = 'BorrowedVoice'; root.visible = false;
  const wrapper = new THREE.Group(); wrapper.name = 'GhostScale'; wrapper.scale.setScalar(170 / 168.3);
  const shake = new THREE.Group(); shake.name = 'GhostShake';
  const kGroup = new THREE.Group(); kGroup.name = 'GhostK'; kGroup.scale.setScalar(CM);
  root.add(shake); shake.add(wrapper);
  const model = assets.model('ghost_woman');
  wrapper.add(model, kGroup);
  const shared = { uFade: { value: 1 }, uTime: { value: 0 }, uGlint: { value: 0.55 } };
  const meshes = [];
  let body = null, head = null;
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh && o.name === data.bodyName && !body) body = o;
    else if (o.isSkinnedMesh && o.name === data.headName && !head) head = o;
    else o.visible = false; // 舊版 GLB 裡原作的飄髮、短洋裝等
  });
  const bones = {};
  for (const bone of body.skeleton.bones) { const name = canonical(bone.name); if (name && !bones[name]) bones[name] = bone; }
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  for (const mesh of [body, head]) {
    if (!mesh) continue;
    mesh.material = skinMaterial(mesh.material, shared, mesh === head ? data.NHead : data.NBody, mesh === head && head !== body);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = true;
    meshes.push(mesh);
  }
  root.updateMatrixWorld(true);
  // 手動給一個固定的包圍球（蒙皮網格預設會用綁定姿勢的頂點去算，姿勢一變就不準）
  for (const mesh of meshes) {
    const inv = mesh.matrixWorld.clone().invert();
    sphere.center.set(0, 0.9, 0.3).applyMatrix4(root.matrixWorld).applyMatrix4(inv);
    mesh.boundingSphere = new THREE.Sphere(sphere.center.clone(), 2.4 / mesh.matrixWorld.getMaxScaleOnAxis());
  }
  const hipsParentInv = bones.Hips.parent.matrixWorld.clone().invert().multiply(kGroup.matrixWorld);
  const rig = makeRig(bones, data.bindM, hipsParentInv);
  rig.bindInv = Object.fromEntries(data.names.map((name, i) => [name, data.inverses[i]]));
  // 長衣：自己的蒙皮網格，骨頭與身體共用
  const dress = new THREE.SkinnedMesh(data.dress, dressMaterial(shared));
  dress.name = 'GhostDress'; dress.castShadow = true; dress.receiveShadow = true;
  kGroup.add(dress);
  dress.bind(new THREE.Skeleton(data.names.map((name) => bones[name]), data.inverses), new THREE.Matrix4());
  dress.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 90, 30), 240);
  meshes.push(dress);
  // 左腕的紅繩：身分線索
  const cordMat = installShader(new THREE.MeshStandardMaterial({ color: 0xa01610, emissive: 0x2a0402, roughness: 0.82, metalness: 0 }), shared, 'cord', (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = ghostExpose(outgoingLight, diffuseColor.rgb, 0.35);\n#include <opaque_fragment>');
  });
  const cordParts = [];
  for (const [z, rx, ry, r] of [[-0.5, 0, 0, 2.72], [0.25, 0.14, 0.08, 2.78], [0.95, -0.1, 0.12, 2.7]]) cordParts.push(new THREE.TorusGeometry(r, 0.4, 5, 18).rotateX(rx).rotateY(ry).translate(0, 0, z));
  cordParts.push(new THREE.SphereGeometry(0.72, 6, 5).translate(2.95, 0, 0.3));
  for (const [len, tx, tz] of [[7.5, 0.35, 0.2], [5.2, -0.3, 0.55]]) cordParts.push(new THREE.CylinderGeometry(0.3, 0.2, len, 4).translate(0, -len / 2, 0).rotateX(tx).rotateZ(tz).translate(3.0, -0.2, 0.3));
  const cord = new THREE.Mesh(mergeGeometries(cordParts), cordMat); cord.name = 'RedCord';
  const handI = rig.index.LeftHand, foreAxis = rig.axis[rig.index.LeftForeArm];
  const toBone = rig.bindQ[handI].clone().invert();
  cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), foreAxis.clone().applyQuaternion(toBone));
  cord.position.copy(foreAxis).multiplyScalar(-2.2).applyQuaternion(toBone);
  cord.castShadow = true; bones.LeftHand.add(cord); meshes.push(cord);
  // 頭髮
  const hair = createHair(data.hair, shared, bones, rig, () => CM * wrapper.scale.y);
  shake.add(hair.mesh); meshes.push(hair.mesh);
  // 行走動畫（去掉髖骨的前進位移，只留上下起伏）
  const clips = assets.animations?.ghost_woman || [];
  let clip = null;
  if (clips[0]) {
    const track = clips[0].tracks.find((t) => t.name.endsWith('.position') && canonical(t.name.split('.')[0]) === 'Hips');
    let meanY = 0;
    if (track) { const inv = hipsParentInv.clone().invert(), p = new THREE.Vector3(); for (let i = 0; i < track.values.length; i += 3) meanY += p.set(track.values[i], track.values[i + 1], track.values[i + 2]).applyMatrix4(inv).y; meanY /= track.values.length / 3; }
    clip = { model, clip: clips[0], meanHipsY: meanY };
  }
  const kToRoot = () => CM * wrapper.scale.y;
  const owned = [...meshes.map((m) => m.material), hair.mesh.geometry, cord.geometry, body.skeleton, head?.skeleton, dress.skeleton].filter(Boolean);
  const api = createController({ root, shake, rig, shared, meshes, variant: 'woman', clip, kToRoot, glint: [0.5, 1.2], owned, afterPose: (dt, snap) => hair.update(root, dt, snap) });
  api.clips = clips; api.source = SOURCE;
  return api;
}

// ════════════════════════════════════════════════════════════════════════
//  程序化人形：'shadow'、'child'，以及沒有掃描模型時的 'woman'。
//  整個人是單一蒙皮網格（1 個 draw call），骨架名稱與掃描模型一致，所以姿勢完全通用。
// ════════════════════════════════════════════════════════════════════════
const FIGURES = {
  shadow: { variant: 'shadow', height: 170, body: 1, head: 1, hairLength: 40, hem: 14, palette: null, fingers: true, seg: 10 },
  child: { variant: 'child', height: 118, body: 0.69, head: 0.86, hairLength: 30, hem: 43, palette: { skin: [0.010, 0.0105, 0.011], dress: [0.013, 0.0125, 0.012], hair: [0.003, 0.003, 0.004] }, fingers: false, seg: 12 },
  woman: { variant: 'woman', height: 170, body: 1, head: 1, hairLength: 42, hem: 15, palette: { skin: [0.42, 0.45, 0.44], dress: [0.5, 0.47, 0.4], hair: [0.012, 0.012, 0.013] }, fingers: true, seg: 14 },
};
const FIGURE_CACHE = {};
function figureData(spec) {
  if (FIGURE_CACHE[spec.variant]) return FIGURE_CACHE[spec.variant];
  const b = spec.body, hs = spec.head;
  // 關節（成人、公分），小孩依比例縮放；右側由左側鏡射
  const J = {
    Hips: [0, 91, -1], Spine: [0, 100.5, -1], Spine1: [0, 112, -1.2], Spine2: [0, 124.5, -1.4], Neck: [0, 139, -1.5], Head: [0, 148, 0],
    LeftShoulder: [5, 137, -1.6], LeftArm: [15, 133, -1.8], LeftForeArm: [31, 114.6, -0.5], LeftHand: [49, 97, 1.5],
    LeftUpLeg: [9, 85.5, -0.6], LeftLeg: [10, 45, -2], LeftFoot: [10.4, 8, -3.5], LeftToeBase: [10.6, 1.2, 8],
  };
  const parentOf = { Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm', LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot' };
  const joints = {}, parents = {};
  const shoulderScale = spec.variant === 'child' ? 0.9 : 1;
  for (const [name, p] of Object.entries(J)) {
    const q = [p[0] * b * (/Shoulder|Arm|Hand/.test(name) ? shoulderScale : 1), p[1] * b, p[2] * b];
    joints[name] = q; parents[name] = parentOf[name] || null;
    if (name.startsWith('Left')) { const r = swapSide(name); joints[r] = [-q[0], q[1], q[2]]; parents[r] = parentOf[name].startsWith('Left') ? swapSide(parentOf[name]) : parentOf[name]; }
  }
  const names = Object.keys(joints), idx = Object.fromEntries(names.map((n, i) => [n, i]));
  const pos = [], col = [], sI = [], sW = [], ind = [];
  const pal = spec.palette || { skin: [0, 0, 0], dress: [0, 0, 0], hair: [0, 0, 0] };
  const seg = spec.seg;
  // 環狀管：rings = [{ c, rx, rz, w: { 骨名: 權重 }, n? 軸向 }]，自動封口
  const tube = (rings, color, { close = true, segs = seg, squash = null } = {}) => {
    const start = pos.length / 3, axis = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), c0 = new THREE.Vector3(), c1 = new THREE.Vector3();
    const pushV = (x, y, z, ring) => {
      pos.push(x, y, z); col.push(...color);
      const ws = Object.entries(ring.w).slice(0, 4), sum = ws.reduce((s, e2) => s + e2[1], 0);
      for (let k = 0; k < 4; k++) { sI.push(ws[k] ? idx[ws[k][0]] : 0); sW.push(ws[k] ? ws[k][1] / sum : 0); }
    };
    rings.forEach((ring, r) => {
      c0.set(...rings[Math.max(0, r - 1)].c); c1.set(...rings[Math.min(rings.length - 1, r + 1)].c);
      axis.copy(c1).sub(c0).normalize();
      // 環所在平面的兩個基底：u 盡量對齊世界 X
      u.set(1, 0, 0).addScaledVector(axis, -axis.x); if (u.lengthSq() < 0.05) u.set(0, 0, 1).addScaledVector(axis, -axis.z); u.normalize();
      w.crossVectors(u, axis).normalize();
      for (let s = 0; s < segs; s++) {
        const th = (s / segs) * Math.PI * 2, cx = Math.cos(th) * ring.rx, cz = Math.sin(th) * ring.rz;
        pushV(ring.c[0] + u.x * cx + w.x * cz, ring.c[1] + u.y * cx + w.y * cz, ring.c[2] + u.z * cx + w.z * cz, ring);
      }
    });
    for (let r = 0; r < rings.length - 1; r++) for (let s = 0; s < segs; s++) {
      const a = start + r * segs + s, b2 = start + r * segs + (s + 1) % segs;
      ind.push(a, b2, a + segs, b2, b2 + segs, a + segs);
    }
    if (close) for (const [r, flip] of [[0, false], [rings.length - 1, true]]) {
      const center = pos.length / 3; pushV(...rings[r].c, rings[r]);
      for (let s = 0; s < segs; s++) { const a = start + r * segs + s, b2 = start + r * segs + (s + 1) % segs; if (flip) ind.push(center, b2, a); else ind.push(center, a, b2); }
    }
  };
  const ball = (c, r, bone, color, rows = 5) => {
    const rings = [];
    for (let k = 0; k <= rows; k++) { const a = (k / rows) * Math.PI, s = Math.max(0.12, Math.sin(a)); rings.push({ c: [c[0], c[1] - Math.cos(a) * r[1], c[2]], rx: r[0] * s, rz: r[2] * s, w: { [bone]: 1 } }); }
    tube(rings, color);
  };
  const jp = (name, dx = 0, dy = 0, dz = 0) => [joints[name][0] + dx, joints[name][1] + dy, joints[name][2] + dz];
  const lerp3 = (a, c, t) => [mix(a[0], c[0], t), mix(a[1], c[1], t), mix(a[2], c[2], t)];
  const headC = jp('Head', 0, 9.6 * hs, 1.0 * hs), HR = [8.9 * hs, 11.2 * hs, 9.9 * hs];
  // 頭、頸
  ball(headC, HR, 'Head', pal.skin, 6);
  tube([{ c: jp('Neck', 0, -2, 0), rx: 5 * b, rz: 4.8 * b, w: { Spine2: 1 } }, { c: jp('Head', 0, 3 * hs, 0.5), rx: 4.3 * b, rz: 4.5 * b, w: { Head: 0.6, Neck: 0.4 } }], pal.skin, { close: false });
  // 軀幹與長衣（同一條管，往下一路垂到裙襬）
  const R = (y, rx, rz, w, z = -0.8) => ({ c: [0, y * b, z * b], rx: rx * b, rz: rz * b, w });
  const legW = (h, u, l) => ({ Hips: h, LeftUpLeg: u / 2, RightUpLeg: u / 2, ...(l ? { LeftLeg: l / 2, RightLeg: l / 2 } : {}) });
  const skirt = spec.variant === 'child'
    ? [R(76, 16.5, 12.5, legW(0.6, 0.4)), R(60, 20.5, 15.5, legW(0.3, 0.7)), R(spec.hem, 25, 18.5, legW(0.15, 0.85))]
    : [R(75, 17.5, 12.5, legW(0.6, 0.4)), R(56, 19.5, 14, legW(0.25, 0.75)), R(36, 22, 16, legW(0.15, 0.55, 0.3)), R(spec.hem, 24.5, 18, legW(0.1, 0.45, 0.45))];
  tube([
    R(140.5, 9, 6, { Spine2: 1 }, -1.6), R(137.5, 15.2, 7.4, { Spine2: 1 }, -1.6), R(130, 15.6, 9.6, { Spine2: 1 }, -1), R(122, 14.6, 10.4, { Spine2: 0.6, Spine1: 0.4 }),
    R(112, 13, 9.4, { Spine1: 1 }), R(103, 12.4, 9, { Spine: 0.7, Spine1: 0.3 }), R(94, 14.2, 9.8, { Hips: 0.6, Spine: 0.4 }), R(86, 16.2, 10.8, { Hips: 1 }),
    ...skirt,
  ], pal.dress, { segs: seg + 4 });
  for (const side of ['Left', 'Right']) {
    const sx = side === 'Left' ? 1 : -1;
    // 手臂
    const A = joints[side + 'Arm'], F = joints[side + 'ForeArm'], Hd = joints[side + 'Hand'];
    const armDir = new THREE.Vector3(Hd[0] - F[0], Hd[1] - F[1], Hd[2] - F[2]).normalize();
    const tip = [Hd[0] + armDir.x * 17 * b, Hd[1] + armDir.y * 17 * b, Hd[2] + armDir.z * 17 * b];
    tube([
      { c: lerp3(A, F, -0.08), rx: 4.4 * b, rz: 4.4 * b, w: { [side + 'Shoulder']: 0.5, [side + 'Arm']: 0.5 } }, { c: lerp3(A, F, 0.45), rx: 3.9 * b, rz: 3.9 * b, w: { [side + 'Arm']: 1 } },
      { c: F, rx: 3.3 * b, rz: 3.3 * b, w: { [side + 'Arm']: 0.5, [side + 'ForeArm']: 0.5 } }, { c: lerp3(F, Hd, 0.5), rx: 3.0 * b, rz: 3.0 * b, w: { [side + 'ForeArm']: 1 } },
      { c: Hd, rx: 2.1 * b, rz: 2.3 * b, w: { [side + 'ForeArm']: 0.5, [side + 'Hand']: 0.5 } }, { c: lerp3(Hd, tip, 0.35), rx: 1.5 * b, rz: 3.6 * b, w: { [side + 'Hand']: 1 } },
      { c: lerp3(Hd, tip, spec.fingers ? 0.5 : 0.9), rx: 1.3 * b, rz: (spec.fingers ? 3.4 : 2.4) * b, w: { [side + 'Hand']: 1 } },
    ], pal.skin, { segs: 8 });
    if (spec.fingers) for (let f = 0; f < 4; f++) {
      // 偏長的手指：剪影裡最容易讓人不舒服的部分
      const spread = (f - 1.5) * 1.5 * b, start = lerp3(Hd, tip, 0.48), end = lerp3(Hd, tip, 0.98 - Math.abs(f - 1.4) * 0.06);
      const off = (p, k) => [p[0] + (-armDir.y) * 0 + 0, p[1], p[2] + spread * k];
      tube([{ c: off(start, 0.75), rx: 0.75 * b, rz: 0.75 * b, w: { [side + 'Hand']: 1 } }, { c: off(end, 1.25), rx: 0.4 * b, rz: 0.4 * b, w: { [side + 'Hand']: 1 } }], pal.skin, { segs: 4 });
    }
    // 小腿與腳（膝蓋以上被長衣蓋住）
    const K = joints[side + 'Leg'], Ft = joints[side + 'Foot'], Toe = joints[side + 'ToeBase'];
    const U = joints[side + 'UpLeg'];
    tube([
      { c: lerp3(U, K, 0.25), rx: 6.4 * b, rz: 6.6 * b, w: { [side + 'UpLeg']: 1 } }, { c: K, rx: 4.9 * b, rz: 5 * b, w: { [side + 'UpLeg']: 0.5, [side + 'Leg']: 0.5 } },
      { c: lerp3(K, Ft, 0.35), rx: 4.6 * b, rz: 4.8 * b, w: { [side + 'Leg']: 1 } }, { c: lerp3(K, Ft, 0.92), rx: 2.9 * b, rz: 3.1 * b, w: { [side + 'Leg']: 0.6, [side + 'Foot']: 0.4 } },
    ], pal.skin, { segs: 8 });
    tube([{ c: [Ft[0], 2.6 * b, Ft[2] - 3.5 * b], rx: 3.2 * b, rz: 2.5 * b, w: { [side + 'Foot']: 1 } }, { c: [Ft[0] + sx * 0.3, 2.4 * b, Ft[2] + 5 * b], rx: 3.9 * b, rz: 2.3 * b, w: { [side + 'Foot']: 1 } }, { c: [Toe[0] + sx * 0.4, 1.5 * b, Toe[2] + 4.5 * b], rx: 3.6 * b, rz: 1.4 * b, w: { [side + 'ToeBase']: 1 } }], pal.skin, { segs: 8 });
  }
  // 頭髮：頭殼外的一層，加上垂到胸前與背後的髮簾（連臉一起蓋住）
  const hl = spec.hairLength * b, hy = headC[1];
  const H = (dy, rx, rz, z, w) => ({ c: [0, hy + dy, headC[2] + z], rx: rx * hs, rz: rz * hs, w });
  tube([
    H(HR[1] + 1.0, 0.7, 0.7, -0.4, { Head: 1 }), H(HR[1] * 0.96, 4.4, 4.9, -0.4, { Head: 1 }), H(HR[1] * 0.78, 7.6, 8.4, -0.3, { Head: 1 }), H(HR[1] * 0.3, 10.1, 11.2, 0, { Head: 1 }), H(-HR[1] * 0.35, 10.6, 11.6, 0.1, { Head: 1 }),
    H(-HR[1] * 1.0, 10.8, 11.2, -0.3, { Head: 0.7, Spine2: 0.3 }), H(-HR[1] - hl * 0.35, 12.4 / hs * b, 11.0 / hs * b, -1.2, { Spine2: 0.75, Head: 0.25 }),
    H(-HR[1] - hl * 0.7, 11.6 / hs * b, 10.4 / hs * b, -1.6, { Spine2: 0.8, Spine1: 0.2 }), H(-HR[1] - hl, 8.5 / hs * b, 8.2 / hs * b, -1.8, { Spine2: 0.5, Spine1: 0.5 }),
  ], pal.hair, { segs: seg + 2 });
  // 兩點眼睛：平常和頭髮同色，setEyes(k) 之後才是黑暗裡的兩個冷色亮點
  const eyeStart = pos.length / 3;
  for (const sx of [-1, 1]) ball([headC[0] + sx * 3.3 * hs, headC[1] + 0.6 * hs, headC[2] + 11.75 * hs], [0.95 * hs, 0.7 * hs, 0.5 * hs], 'Head', pal.hair, 3);
  const eye = new Float32Array(pos.length / 3); eye.fill(1, eyeStart);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('ghostEye', new THREE.BufferAttribute(eye, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sI, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  geometry.setIndex(ind);
  geometry.computeVertexNormals();
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 90 * b, 30), 240);
  const bindM = Object.fromEntries(names.map((n) => [n, new THREE.Matrix4().makeTranslation(...joints[n])]));
  return (FIGURE_CACHE[spec.variant] = { names, joints, parents, geometry, bindM, inverses: names.map((n) => bindM[n].clone().invert()) });
}

function createFigure(spec) {
  const data = figureData(spec);
  const root = new THREE.Group(); root.name = spec.variant === 'woman' ? 'BorrowedVoice' : 'Ghost_' + spec.variant; root.visible = false;
  const shake = new THREE.Group(), wrapper = new THREE.Group(), kGroup = new THREE.Group();
  kGroup.scale.setScalar(CM); root.add(shake); shake.add(wrapper); wrapper.add(kGroup);
  const bones = {};
  for (const name of data.names) { const bone = new THREE.Bone(); bone.name = 'ghost_' + name; bones[name] = bone; }
  for (const name of data.names) {
    const parent = data.parents[name];
    if (parent) { bones[parent].add(bones[name]); bones[name].position.set(...data.joints[name]).sub(new THREE.Vector3(...data.joints[parent])); }
    else { kGroup.add(bones[name]); bones[name].position.set(...data.joints[name]); }
  }
  const shared = { uFade: { value: 1 }, uTime: { value: 0 }, uGlint: { value: 0 } };
  const lit = spec.variant !== 'shadow';
  const base = lit
    ? new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: spec.variant === 'child' ? 0.97 : 0.86, metalness: 0, envMapIntensity: 0.15 })
    : new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const material = installShader(base, shared, lit ? 'figure' : 'shadow', (shader) => {
    shader.uniforms.uGhostGlint = shared.uGlint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ghostEye;\nvarying float vGhostEye;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGhostEye = ghostEye;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGhostEye;\nuniform float uGhostGlint;')
      .replace('#include <opaque_fragment>', (lit ? 'outgoingLight = ghostExpose(outgoingLight, diffuseColor.rgb, 0.5);\n' : '') + 'outgoingLight += vec3(0.6, 0.68, 0.7) * step(0.5, vGhostEye) * uGhostGlint;\n#include <opaque_fragment>');
  });
  const mesh = new THREE.SkinnedMesh(data.geometry, material);
  mesh.name = 'GhostFigure'; mesh.castShadow = spec.variant !== 'shadow'; mesh.receiveShadow = spec.variant !== 'shadow';
  kGroup.add(mesh);
  mesh.bind(new THREE.Skeleton(data.names.map((n) => bones[n]), data.inverses), new THREE.Matrix4());
  mesh.boundingSphere = data.geometry.boundingSphere.clone();
  const rig = makeRig(bones, data.bindM, new THREE.Matrix4());
  const api = createController({ root, shake, rig, shared, meshes: [mesh], variant: spec.variant, kToRoot: () => CM, castShadow: lit, glint: [0, 0.9], owned: [material, mesh.skeleton] });
  api.clips = []; api.source = 'procedural';
  return api;
}
