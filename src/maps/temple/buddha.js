import * as THREE from 'three';
import { xf, capsuleBetween, cylinderBetween, merge, mulberry32 } from '../../core/utils.js';
import { grimeTexture, blindfoldTexture } from '../../core/canvasTex.js';
import { weather } from '../../core/weathering.js';

/**
 * 程序化佛像：蓮花座、結跏趺坐、禪定印、螺髮肉髻，
 * 雙眼以紅布矇住。全部以 Three.js 幾何組合而成。
 * 單位尺寸下高約 2.0（含蓮座）。
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const NECK_Y = 1.4;

function buildGeometries() {
  const rng = mulberry32(2024);

  // ── 蓮花座 ──
  const lotus = [];
  const basePts = [[0, 0], [0.8, 0], [0.84, 0.05], [0.72, 0.11], [0.64, 0.15], [0.7, 0.22], [0.76, 0.29], [0.6, 0.31], [0, 0.31]].map(([r, y]) => new THREE.Vector2(r, y));
  lotus.push(new THREE.LatheGeometry(basePts, 20));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const up = xf(new THREE.SphereGeometry(0.16, 6, 4), { s: [1, 1.3, 0.3] });
    xf(up, { r: [-0.45, 0, 0], p: [0, 0.22, 0.7] });
    lotus.push(xf(up, { r: [0, a, 0] }));
    const dn = xf(new THREE.SphereGeometry(0.15, 6, 4), { s: [1, 1.1, 0.3] });
    xf(dn, { r: [0.7, 0, 0], p: [0, 0.07, 0.76] });
    lotus.push(xf(dn, { r: [0, a + Math.PI / 18, 0] }));
  }

  // ── 身軀 ──
  const body = [];
  body.push(xf(new THREE.SphereGeometry(1, 18, 10), { p: [0, 0.47, 0.06], s: [0.76, 0.2, 0.5] })); // 盤腿
  for (const sx of [-1, 1]) {
    body.push(xf(new THREE.SphereGeometry(0.2, 10, 8), { p: [sx * 0.5, 0.47, 0.14], s: [1.25, 0.85, 1.15] })); // 膝
    body.push(xf(new THREE.SphereGeometry(0.15, 8, 6), { p: [sx * 0.41, 1.17, 0], s: [1, 0.9, 0.9] })); // 肩
    body.push(capsuleBetween(V(sx * 0.44, 1.14, 0), V(sx * 0.52, 0.78, 0.1), 0.105, 7));
    body.push(capsuleBetween(V(sx * 0.52, 0.78, 0.1), V(sx * 0.13, 0.6, 0.4), 0.085, 7));
  }
  const torsoPts = [[0, 0.4], [0.37, 0.42], [0.41, 0.6], [0.38, 0.8], [0.385, 0.98], [0.43, 1.13], [0.4, 1.22], [0.3, 1.29], [0.13, 1.34], [0.115, 1.43]].map(([r, y]) => new THREE.Vector2(r, y));
  body.push(xf(new THREE.LatheGeometry(torsoPts, 18), { s: [1, 1, 0.7] }));
  body.push(xf(new THREE.SphereGeometry(0.13, 10, 6), { p: [0, 0.6, 0.42], s: [1.5, 0.5, 0.9] })); // 禪定印的雙手
  // 袈裟：自左肩斜披至右脅的衣緣，以及披在左肩上的衣褶
  const sash = [[0.36, 1.33, 0], [0.26, 1.2, 0.25], [0.1, 1.02, 0.29], [-0.1, 0.88, 0.29], [-0.28, 0.74, 0.225], [-0.415, 0.64, 0],
    [-0.28, 0.74, -0.225], [-0.1, 0.9, -0.285], [0.1, 1.05, -0.285], [0.26, 1.22, -0.25]].map(([x, y, z]) => V(x, y, z));
  body.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sash, true), 40, 0.024, 5, true));
  for (const [dx, r] of [[0.07, 0.02], [0.14, 0.017]]) {
    const fold = sash.slice(0, 4).map((p, i) => V(p.x + dx * (1 - i * 0.1), p.y - 0.01 * i, p.z + 0.004));
    fold.unshift(V(0.36 + dx, 1.3, -0.12));
    body.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fold), 14, r, 4));
  }
  // 頸部三道紋與胸前的起伏
  for (const [yy, rr] of [[1.365, 0.122], [1.395, 0.117]]) body.push(xf(new THREE.TorusGeometry(rr, 0.008, 4, 14), { r: [Math.PI / 2, 0, 0], p: [0, yy, 0] }));
  body.push(xf(new THREE.SphereGeometry(0.2, 10, 6), { p: [0, 1.04, 0.15], s: [1.5, 0.82, 0.5] }));
  // 盤腿上的衣襬
  body.push(xf(new THREE.TorusGeometry(0.55, 0.02, 4, 24, Math.PI), { r: [Math.PI / 2 - 0.12, 0, 0], p: [0, 0.5, 0.2], s: [1.25, 1, 0.75] }));

  // ── 頭部（以頸部為原點，便於轉頭）──
  const head = [];
  head.push(xf(new THREE.SphereGeometry(0.25, 18, 12), { p: [0, 0.24, 0], s: [0.9, 1.1, 0.96] }));
  head.push(xf(new THREE.SphereGeometry(0.03, 6, 5), { p: [0, 0.2, 0.238], s: [0.75, 1.7, 1] })); // 鼻
  head.push(xf(new THREE.SphereGeometry(1, 8, 4), { p: [0, 0.115, 0.222], s: [0.062, 0.014, 0.03] })); // 唇
  for (const sx of [-1, 1]) head.push(xf(new THREE.CapsuleGeometry(0.03, 0.14, 2, 6), { p: [sx * 0.228, 0.19, -0.01], s: [0.6, 1, 1.2] })); // 長耳

  const hair = [];
  hair.push(xf(new THREE.SphereGeometry(0.262, 16, 7, 0, Math.PI * 2, 0, 1.28), { p: [0, 0.25, -0.012], s: [0.92, 1.1, 0.98] }));
  for (let i = 0; i < 60; i++) {
    const th = Math.acos(1 - rng() * 0.7), ph = rng() * Math.PI * 2;
    const r = 0.268;
    hair.push(xf(new THREE.SphereGeometry(0.036, 5, 3), {
      p: [Math.sin(th) * Math.cos(ph) * r * 0.92, 0.25 + Math.cos(th) * r * 1.1, -0.012 + Math.sin(th) * Math.sin(ph) * r * 0.98],
    }));
  }
  hair.push(xf(new THREE.SphereGeometry(0.1, 10, 6), { p: [0, 0.535, -0.02], s: [1, 0.82, 1] })); // 肉髻

  // ── 矇眼紅布 ──
  const band = new THREE.CylinderGeometry(0.262, 0.262, 0.125, 40, 4, true);
  {
    const p = band.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const wr = 1 + Math.sin(a * 9 + y * 40) * 0.012 + Math.sin(a * 23) * 0.006;
      let ny = y + Math.sin(a * 5) * 0.006;
      if (y < -0.06) ny += Math.sin(a * 13) * 0.012 - 0.004; // 下緣不規則
      p.setXYZ(i, x * wr, ny, z * wr);
    }
    band.rotateY(Math.PI);
    band.computeVertexNormals();
    xf(band, { p: [0, 0.262, 0], s: [0.935, 1, 0.995] });
  }
  const cloth = [band];
  cloth.push(xf(new THREE.SphereGeometry(0.045, 10, 8), { p: [0.13, 0.262, -0.235], s: [1.2, 1.3, 0.8] })); // 結

  // 垂下的布條（原點在結的位置）
  const tails = [];
  for (const [dx, len, rz, rx] of [[-0.03, 0.72, 0.1, 0.07], [0.04, 0.56, -0.14, 0.12]]) {
    const g = new THREE.PlaneGeometry(0.085, len, 2, 10);
    g.translate(0, -len / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), x = p.getX(i);
      const t = -y / len;
      p.setZ(i, Math.sin(t * 7 + dx * 30) * 0.018 * t + Math.sin(x * 60) * 0.006);
      p.setX(i, x * (1 - t * 0.25) + Math.sin(t * 5) * 0.012);
    }
    g.computeVertexNormals();
    tails.push(xf(g, { r: [rx, 0, rz], p: [dx, 0, 0] }));
  }

  // ── 背光（主尊用）──
  const halo = [];
  halo.push(xf(new THREE.RingGeometry(0.33, 0.47, 48), { p: [0, 1.66, -0.3] }));
  halo.push(xf(new THREE.CircleGeometry(0.33, 48), { p: [0, 1.66, -0.31] }));
  {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.15);
    shape.bezierCurveTo(0.95, 0.2, 1.0, 1.4, 0, 2.35);
    shape.bezierCurveTo(-1.0, 1.4, -0.95, 0.2, 0, 0.15);
    halo.push(xf(new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 24 }), { p: [0, 0, -0.46] }));
  }

  // ── 低面數小佛（萬佛殿用，可大量實例化）──
  const tiny = [
    new THREE.LatheGeometry([[0, 0], [0.56, 0], [0.58, 0.07], [0.5, 0.13], [0.54, 0.2], [0, 0.2]].map(([r, y]) => new THREE.Vector2(r, y)), 9),
    xf(new THREE.SphereGeometry(1, 8, 4), { p: [0, 0.31, 0.05], s: [0.54, 0.14, 0.36] }), // 盤腿
    xf(new THREE.LatheGeometry([[0, 0.28], [0.26, 0.3], [0.27, 0.5], [0.25, 0.68], [0.3, 0.82], [0.27, 0.9], [0.1, 0.96], [0.085, 1.02]].map(([r, y]) => new THREE.Vector2(r, y)), 9), { s: [1, 1, 0.68] }),
    xf(new THREE.SphereGeometry(0.19, 9, 7), { p: [0, 1.18, 0], s: [0.9, 1.1, 0.96] }), // 頭
    xf(new THREE.SphereGeometry(0.2, 9, 4, 0, Math.PI * 2, 0, 1.2), { p: [0, 1.19, -0.01], s: [0.92, 1.1, 0.98] }), // 髮
    xf(new THREE.SphereGeometry(0.075, 6, 4), { p: [0, 1.41, -0.015], s: [1, 0.8, 1] }), // 肉髻
    xf(new THREE.SphereGeometry(0.09, 6, 4), { p: [0, 0.42, 0.29], s: [1.5, 0.5, 0.9] }), // 手
  ];
  for (const sx of [-1, 1]) {
    tiny.push(xf(new THREE.SphereGeometry(0.15, 6, 4), { p: [sx * 0.36, 0.32, 0.11], s: [1.2, 0.8, 1.1] })); // 膝
    tiny.push(xf(new THREE.SphereGeometry(0.11, 6, 4), { p: [sx * 0.29, 0.83, 0] })); // 肩
    tiny.push(cylinderBetween(V(sx * 0.31, 0.82, 0), V(sx * 0.36, 0.53, 0.07), 0.075, 0.07, 6));
    tiny.push(cylinderBetween(V(sx * 0.36, 0.55, 0.07), V(sx * 0.1, 0.42, 0.27), 0.062, 0.055, 6));
    tiny.push(xf(new THREE.SphereGeometry(0.03, 4, 3), { p: [sx * 0.175, 1.15, -0.01], s: [0.6, 2.4, 1.2] })); // 耳
  }
  const tinyBody = merge(tiny);
  const tinyBand = xf(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 14, 1, true).rotateY(Math.PI), { p: [0, 1.2, 0], s: [0.93, 1, 0.99] });

  return {
    lotus: merge(lotus), body: merge(body), head: merge(head), hair: merge(hair),
    cloth: merge(cloth), tails: merge(tails), halo: merge(halo), tinyBody, tinyBand,
  };
}

export function createBuddhaFactory(ctx) {
  const { mats, assets } = ctx;
  const geo = buildGeometries();
  const goldMap = grimeTexture('#a8822e', { seed: 5, dark: '26,16,6', patina: '60,80,50', amount: 1.1 });
  const styles = {
    gold: {
      body: new THREE.MeshStandardMaterial({ map: goldMap, metalness: 0.88, roughness: 0.42, envMapIntensity: 1.0 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x0c1018, metalness: 0.3, roughness: 0.7 }),
    },
    bronze: {
      body: new THREE.MeshStandardMaterial({ map: grimeTexture('#4a3a22', { seed: 9, dark: '10,8,4', patina: '50,95,80', amount: 1.3 }), metalness: 0.8, roughness: 0.55 }),
      hair: null,
    },
    wood: { body: assets.mat('wood_peeling_paint_weathered', { color: 0x8c6e5a, roughness: 0.92 }), hair: null },
    stone: { body: mats.rock, hair: null },
  };
  for (const s of Object.values(styles)) if (!s.hair) s.hair = s.body;
  // 佛像本身的陳舊感：朝上的面（頭頂、肩、膝、掌心）積了一層灰，凹處發黑，身上有雨水滲下的痕跡。
  // 尺度用佛像的大小（一公尺上下），和牆面的大尺度髒污分開。
  const aged = (m, o = {}) => weather(m, { levels: [-9999], blotch: 0.7, streak: 0.55, damp: 0, dust: 0.5, dustTint: 0x77705f, scale: 1.1, fine: 0.3, streakW: 0.22, streakL: 2.2, ...o });
  aged(styles.gold.body, { dust: 0.42, blotch: 0.55 });
  aged(styles.bronze.body, { dust: 0.45, dustTint: 0x6f7466 });
  aged(styles.wood.body, { dust: 0.55, blotch: 0.85 });
  // 矇眼紅布：平織、褪色，雙眼的位置有往下滲開的深色水痕
  const bandMap = blindfoldTexture(7, [0.452, 0.548]);
  const blindfold = (mats.blindfold = new THREE.MeshStandardMaterial({ map: bandMap, bumpMap: bandMap, bumpScale: 1.2, roughness: 0.97, side: THREE.DoubleSide }));
  mats.cloth.color.setHex(0xa8322a); // 原本的亮紅在手電筒下會過曝成螢光色
  const cloth = mats.cloth;
  function clothTails(seed) {
    const group=new THREE.Group();group.name='TornBlindfoldTails';
    for(const [i,dx,len,rz] of [[0,-.03,.72,.10],[1,.04,.56,-.14]]){
      const strip=ctx.cloth.make({width:.085,height:len,material:cloth,seed:seed+i*73,fold:.009,exposure:.45,amplitude:.024});
      strip.position.x=dx;strip.rotation.set(.08,0,rz);group.add(strip);
    }
    return group;
  }

  // CC0 museum photogrammetry for hero statues. Bake the source transform and
  // split at the neck so the original texture and blindfold move with the head.
  let scanned = null;
  if (assets.models.amoghasiddhi) {
    const source=assets.models.amoghasiddhi;source.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(source),center=bounds.getCenter(new THREE.Vector3());
    const factor=2/(bounds.max.y-bounds.min.y);
    const normalize=new THREE.Matrix4().makeScale(factor,factor,factor).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
    const bodies=[],heads=[];let material;const headBox=new THREE.Box3();
    source.traverse(o=>{
      if(!o.isMesh)return;
      const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize,o.matrixWorld));
      const buckets=[{position:[],normal:[],uv:[]},{position:[],normal:[],uv:[]}];
      for(let i=0;i<g.attributes.position.count;i+=3){const pa=g.attributes.position;const isHead=(pa.getY(i)+pa.getY(i+1)+pa.getY(i+2))/3>1.54;const b=buckets[isHead?1:0];
        for(let j=0;j<3;j++){for(const name of ['position','normal','uv']){const attr=g.attributes[name];if(!attr)continue;for(let n=0;n<attr.itemSize;n++)b[name].push(attr.array[(i+j)*attr.itemSize+n]);}if(isHead)headBox.expandByPoint(V(pa.getX(i+j),pa.getY(i+j),pa.getZ(i+j)));}
      }
      buckets.forEach((b,k)=>{if(!b.position.length)return;const geometry=new THREE.BufferGeometry();for(const name of ['position','normal','uv'])if(b[name].length)geometry.setAttribute(name,new THREE.Float32BufferAttribute(b[name],name==='uv'?2:3));(k?heads:bodies).push(geometry);});
      material=o.material.clone();material.roughness=0.79;material.metalness=0.35;material.color.setHex(0xa59c87);material.envMapIntensity=0.6;g.dispose();
    });
    const hc=headBox.getCenter(new THREE.Vector3()),hs=headBox.getSize(new THREE.Vector3());
    scanned={body:merge(bodies),head:merge(heads).translate(0,-1.54,0),material,hc,hs};
    // 依高度切片的外形（半寬與前後範圍），給纏繞的紅繩貼著身體用
    const bins=Array.from({length:40},()=>({x:0,zf:-9,zb:9}));const bp=scanned.body.attributes.position;
    for(let i=0;i<bp.count;i++){const k=Math.min(39,Math.max(0,Math.floor(bp.getY(i)/1.54*40)));const b=bins[k];b.x=Math.max(b.x,Math.abs(bp.getX(i)));b.zf=Math.max(b.zf,bp.getZ(i));b.zb=Math.min(b.zb,bp.getZ(i));}
    scanned.bins=bins;
  }
  /** 佛像在高度 y（單位尺寸，0..1.54）的外形：{ rx, rz, cz } */
  function profile(y) {
    if (!scanned) return { rx: 0.5, rz: 0.3, cz: 0.04 };
    const k = Math.min(39, Math.max(0, Math.floor((y / 1.54) * 40)));
    let rx = 0, zf = -9, zb = 9;
    for (let j = Math.max(0, k - 1); j <= Math.min(39, k + 1); j++) { const b = scanned.bins[j]; rx = Math.max(rx, b.x); zf = Math.max(zf, b.zf); zb = Math.min(zb, b.zb); }
    return { rx, rz: (zf - zb) / 2, cz: (zf + zb) / 2 };
  }
  function makeScanned(scale,style,halo,headYaw,headPitch,headRoll) {
    const g=new THREE.Group();g.name='BlindfoldedAmoghasiddhi';const st=scanned;
    const material=st.material.clone();if(style==='bronze')material.color.setHex(0x646655);aged(material,{dust:0.46,blotch:0.5,streak:0.5});
    const add=(geo,mat,parent=g)=>{const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
    add(st.body,material);
    const head=new THREE.Group();head.position.y=1.54;head.rotation.set(headPitch,headYaw,headRoll,'YXZ');g.add(head);add(st.head,material,head);
    const rx=st.hs.x*0.49,rz=st.hs.z*0.46;
    const band=new THREE.CylinderGeometry(1,1,0.13,64,6,true).rotateY(Math.PI);const pos=band.attributes.position;
    for(let i=0;i<pos.count;i++){const a=Math.atan2(pos.getZ(i),pos.getX(i)),y=pos.getY(i);const crease=1+Math.sin(a*13+y*42)*.018;pos.setXYZ(i,pos.getX(i)*rx*crease+st.hc.x,y+0.125+Math.sin(a*7)*.006,pos.getZ(i)*rz*crease+st.hc.z);}
    band.computeVertexNormals();add(band,blindfold,head);
    const tails=clothTails(376+(ctx.statues?.length||0)*117);head.add(tails);tails.position.set(st.hc.x+rx*.75,.125,st.hc.z-rz);tails.rotation.y=.7;
    if(halo){const haloGroup=new THREE.Group();g.add(haloGroup);for(const r of [.43,.51,.56]){const m=add(new THREE.TorusGeometry(r,.012,7,72),mats.bronze,haloGroup);m.position.set(st.hc.x,1.62,-.27);}for(let i=0;i<24;i++){const a=i/24*Math.PI*2;const leaf=add(new THREE.SphereGeometry(.055,8,6),mats.bronze,haloGroup);leaf.scale.set(.4,1.8,.18);leaf.rotation.z=-a;leaf.position.set(Math.sin(a)*.55,1.62+Math.cos(a)*.55,-.27);}}
    g.scale.setScalar(scale);g.userData.head=head;g.userData.tails=tails;g.userData.source='Minneapolis Institute of Art / CC0';
    (ctx.statues ||= []).push(g);return g;
  }

  /**
   * @param {object} o  scale, style, halo, headYaw, headPitch
   */
  function make({ scale = 1, style = 'gold', halo = false, headYaw = 0, headPitch = 0, headRoll = 0 } = {}) {
    if (scanned && scale >= 1 && (style === 'gold' || style === 'bronze')) return makeScanned(scale,style,halo,headYaw,headPitch,headRoll);
    const st = styles[style];
    const g = new THREE.Group();
    const add = (geometry, mat, parent = g) => {
      const m = new THREE.Mesh(geometry, mat);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    add(geo.lotus, st.body);
    add(geo.body, st.body);
    const head = new THREE.Group();
    head.position.y = NECK_Y;
    head.rotation.set(headPitch, headYaw, headRoll, 'YXZ');
    g.add(head);
    add(geo.head, st.body, head);
    add(geo.hair, st.hair, head);
    add(geo.cloth, blindfold, head);
    const tails = clothTails(985+(ctx.statues?.length||0)*117);head.add(tails);
    tails.position.set(0.13, 0.25, -0.26);
    tails.rotation.x = -0.1;
    if (halo) add(geo.halo, st.body);
    g.scale.setScalar(scale);
    g.userData.head = head;
    g.userData.tails = tails;
    (ctx.statues ||= []).push(g);
    return g;
  }

  /** 大量小佛像（InstancedMesh） */
  function makeTiny(matrices, style = 'gold') {
    const group = new THREE.Group();
    const a = new THREE.InstancedMesh(geo.tinyBody, styles[style].body, matrices.length);
    const b = new THREE.InstancedMesh(geo.tinyBand, blindfold, matrices.length);
    matrices.forEach((m, i) => { a.setMatrixAt(i, m); b.setMatrixAt(i, m); });
    for (const m of [a, b]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
    return group;
  }

  return { make, makeTiny, styles, profile };
}
