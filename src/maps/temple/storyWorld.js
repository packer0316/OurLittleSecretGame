import * as THREE from 'three';
import { plaqueTexture, smokeTexture, grimeTexture, witnessWallTexture, sootTexture, glowTexture } from '../../core/canvasTex.js';
import { boxGeo, xf, cylinderBetween, mulberry32 } from '../../core/utils.js';
import { createSmoke } from '../../core/air.js';
import { terrainHeight } from './terrain.js';
import { createGhost } from './ghost.js';
import { buildFinaleStage } from './finaleStage.js';
import { incenseBurnerGeo } from './interiors.js';
import { buildStoryTraces, TRACE_TARGETS } from './storyTraces.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const POSITIONS = {
  rules:[0,1.56,9.07], incense:[0,2.35,-27.25], diary:[-9,1.85,-20.1], newspaper:[9,1.85,-20.1],
  tape:[-9,7.85,-18.4], ritual:[-8.3,7.85,-26.3], stage:[23,1.45,-2.34], divination:[0,8.05,-22.9],
  death:[5,13.0,-27.1], births:[-10,13.0,-26.5], descent:[5.3,17.25,-22],
  names:[48.1,-5.5,-22], confession:[55,-5.9,-16.0], altar:[55,-5.6,-24.3], return:[55,-5.5,-12.4],
  riteName:[51,-5.85,-22], riteRelic:[55,-5.85,-23], riteWitness:[59,-5.85,-22], exit:[0,1.2,26],
  loopmark:[-10.8,8,-16],
  // story：可選的可讀物（不計入十一組證據）。文字在 src/story/campaign.js 的 NOTES。
  log:[-8.42,1.86,-20.1], rulebook:[-8.42,7.86,-18.4], shoes:[58.39,-6.9,-25.6],
};
const LABELS={rules:'天公爐上的刻字',incense:'三炷未熄的香',diary:'卡住的計數器',newspaper:'燒損的門閂',tape:'舊錄音機',ritual:'三槽木盤',stage:'戲台上的空相框',divination:'擲筊問路',death:'裂開的手機',births:'門框上的身高刻痕',descent:'封印暗道',names:'刻滿名字的牆',confession:'神壇前的舊鎖',altar:'最後的抉擇',return:'返回四樓',relic:'老樹石座上的布包',riteName:'空白牌位・喚名',riteRelic:'供盤・歸物',riteWitness:'錄音機・見證',exit:'山門外',loopmark:'紅線旁的彈珠',log:'阿哲的清點日誌',rulebook:'線裝的小簿子',shoes:'門前的一雙女鞋'};
// story（第二輪）：寺內「有人來過」的痕跡（志豪、柏翰、阿哲、林美蘭、郭家）。陳設在 storyTraces.js，文字在 campaign.js 的 NOTES。
for(const [id,t] of Object.entries(TRACE_TARGETS)){POSITIONS[id]=t.p;LABELS[id]=t.label;}

export function buildStoryWorld(ctx) {
  const {root,mats,world,batch,rng,assets}=ctx;
  const storyRoot=new THREE.Group();storyRoot.name='StorySet';root.add(storyRoot);
  const targets=[];
  const paperMat=new THREE.MeshStandardMaterial({map:grimeTexture('#c6b48d',{seed:29,dark:'55,40,22',amount:0.5}),roughness:1});
  const mesh=(geo,mat,p,parent=storyRoot)=>{const o=new THREE.Mesh(geo,mat);if(p)o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const sign=(text,w,h,p,ry=0)=>{
    const plate=new THREE.Group();plate.name='MountedSign';plate.position.set(...p);plate.rotation.y=ry;storyRoot.add(plate);
    mesh(new THREE.BoxGeometry(w+.06,h+.06,.045),mats.woodDark,[0,0,-.024],plate);
    const face=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:plaqueTexture(text,{w:1024,h:Math.round(1024*h/w),seed:22}),roughness:.9}),[0,0,0],plate);
    return face;
  };
  const desk=(x,y,z,w=1.8)=>{mesh(boxGeo(w,0.08,0.8),mats.woodDark,[x,y+0.9,z]);for(const a of [-1,1])for(const b of [-1,1])mesh(boxGeo(0.07,0.9,0.07),mats.woodDark,[x+a*(w/2-0.1),y+0.45,z+b*0.3]);world.box(x-w/2,z-0.4,x+w/2,z+0.4,y,y+0.96);};
  function target(id,p,kind='paper'){
    const obj=new THREE.Group();obj.name=`Evidence_${id}`;obj.position.set(...p);storyRoot.add(obj);
    if(kind==='counter'){
      mesh(new THREE.BoxGeometry(.3,.14,.21),mats.bronze,[0,.02,0],obj);
      mesh(new THREE.CylinderGeometry(.045,.045,.025,18),mats.brass,[0,.10,0],obj);
      mesh(new THREE.PlaneGeometry(.23,.075),new THREE.MeshStandardMaterial({map:plaqueTexture('0006',{w:512,h:160}),roughness:.8}),[0,.035,.107],obj);
    }
    if(kind==='latch'){
      mesh(new THREE.BoxGeometry(.65,.055,.26),mats.woodDark,[0,.02,0],obj);
      const burn=mesh(new THREE.PlaneGeometry(.6,.24),new THREE.MeshStandardMaterial({map:sootTexture(),transparent:true,depthWrite:false,roughness:1}),[0,.049,0],obj);burn.rotation.x=-Math.PI/2;
      for(let i=0;i<4;i++)mesh(new THREE.BoxGeometry(.09,.004,.003),paperMat,[-.22+i*.017,.052,.055+i*.013],obj);
      mesh(new THREE.BoxGeometry(.44,.06,.065),mats.bronze,[.02,.075,0],obj);
      for(const x of [-.2,.2])mesh(new THREE.BoxGeometry(.04,.09,.13),mats.black,[x,.075,0],obj);
    }
    if(kind==='tray'){
      mesh(new THREE.CylinderGeometry(.27,.27,.035,40),mats.woodDark,[0,0,0],obj);
      for(const x of [-.16,0,.16])mesh(new THREE.TorusGeometry(.055,.008,8,20).rotateX(Math.PI/2),mats.brass,[x,.02,0],obj);
    }
    if(kind==='phone'){
      mesh(new THREE.BoxGeometry(.18,.04,.32),mats.black,[0,-.13,0],obj);
      const screen=mesh(new THREE.PlaneGeometry(.15,.27),new THREE.MeshStandardMaterial({color:0x738e91,emissive:0x294649,emissiveIntensity:.3}),[0,-.108,0],obj);screen.rotation.x=-Math.PI/2;
      mesh(cylinderBetween(V(-.06,-.105,-.12),V(.04,-.105,.09),.002,.002,5),mats.black,null,obj);
    }
    if(kind==='height'){
      mesh(new THREE.BoxGeometry(.7,.12,.32),mats.woodDark,[0,-.1,0],obj);
      mesh(new THREE.BoxGeometry(.65,.8,.065),mats.planks,[0,.24,-.08],obj);
      for(let i=0;i<6;i++)mesh(new THREE.BoxGeometry(.12,.012,.008),mats.brass,[-.24+i*.095,.08+i*.065,-.042],obj);
    }
    if(kind==='recorder'){mesh(new THREE.BoxGeometry(0.35,0.12,0.22),mats.bronze,[0,0,0],obj);for(const x of [-0.08,0.08])mesh(new THREE.TorusGeometry(0.038,0.008,6,16).rotateX(Math.PI/2),mats.brass,[x,0.063,0],obj);}
    const glint=mesh(new THREE.OctahedronGeometry(0.024),new THREE.MeshBasicMaterial({color:0xd7c090,transparent:true,opacity:0.85,depthTest:true}),[0,0.18,0],obj);glint.castShadow=false;
    targets.push({id,label:LABELS[id],position:V(...p),object:obj,glint});return obj;
  }
  for(const [id,p] of Object.entries(POSITIONS)){
    const noProp=['rules','incense','stage','descent','names','altar','return','exit','riteName','riteRelic','riteWitness','confession','divination','loopmark','log','rulebook','shoes'].includes(id);
    target(id,p,noProp?'none':({diary:'counter',newspaper:'latch',tape:'recorder',ritual:'tray',death:'phone',births:'height'}[id]));
  }
  // Evidence stations and a distinctive six-child altar.
  // court：山門內側的「清點中 請留原位」告示拆掉了；借聲的舊規矩改刻在天公爐的爐緣（outdoors.js 的 burnerInscription）。
  for(const [x,y,z] of [[-9,0.9,-20.1],[9,0.9,-20.1],[-9,6.9,-18.4],[-8.3,6.9,-26.3],[5,11.9,-27.1],[-10,11.9,-26.5]]){
    desk(x,y,z);ctx.candle(x-0.6,y+0.94,z,{lit:true,h:0.18});
  }
  // story：劇情小陳設。全部併入 batch（紙張與藍色便條各多一個 draw call），不加燈、不加碰撞。
  {
    const blue=new THREE.MeshStandardMaterial({color:0x2c6aa3,roughness:.85});
    const put=(mat,w,h,d,x,y,z,ry=0)=>batch.add(mat,xf(boxGeo(w,h,d,0,0,0,1),{p:[x,y,z],r:[0,ry,0]}));
    // 阿哲的清點日誌：一樓西桌，計數器右側的板夾。
    put(mats.woodDark,.23,.012,.31,-8.42,1.846,-20.1,.22);put(paperMat,.2,.004,.27,-8.42,1.854,-20.1,.22);put(mats.brass,.09,.012,.025,-8.39,1.86,-20.235,.22);
    // 郭師父的規矩簿：二樓錄音機右側，紅線裝訂的帳本。
    put(mats.cabinet,.17,.02,.24,-8.42,7.85,-18.4,-.18);put(paperMat,.16,.012,.225,-8.415,7.853,-18.4,-.18);put(mats.cabinet,.17,.004,.24,-8.42,7.862,-18.4,-.18);put(mats.thread,.007,.026,.235,-8.502,7.852,-18.415,-.18);
    // 阿哲的藍色便條：計數器旁、錄音機旁、送行盤旁；戲台第二張椅子下是他的識別證。
    for(const [x,y,z,ry] of [[-9.3,1.842,-19.93,.3],[-9.3,7.842,-18.22,-.2],[-7.93,7.842,-26.12,.15]])put(blue,.075,.002,.075,x,y,z,ry);
    put(blue,.085,.004,.055,20.42,.584,-1.9,.5);put(blue,.012,.003,.3,20.36,.583,-1.76,1.1);
    // 第三、第四張椅子底下，螢幕朝下的手機：先到的人，用東西佔著位子。
    put(mats.cabinet,.075,.009,.155,19.12,.586,-3.3,-.4);put(mats.cabinet,.075,.009,.155,25.98,.586,.22,.7);
    // 地下神壇東側：一雙鞋尖朝門的女鞋，左腳那隻裡面有一截剪斷的紅線。
    for(const x of [58.3,58.48]){
      batch.add(mats.cabinet,new THREE.SphereGeometry(1,16,10).scale(.045,.017,.12).translate(x,-6.986,-25.6)); // 鞋底
      batch.add(mats.cabinet,new THREE.SphereGeometry(1,14,10).scale(.044,.03,.058).translate(x,-6.972,-25.662)); // 鞋頭，朝門
      batch.add(mats.cabinet,new THREE.SphereGeometry(1,12,8).scale(.041,.027,.02).translate(x,-6.974,-25.495)); // 後跟
      batch.add(mats.cushion,new THREE.SphereGeometry(1,12,8).scale(.031,.005,.058).translate(x,-6.969,-25.555)); // 鞋墊
    }
    batch.add(mats.thread,new THREE.TorusGeometry(.015,.0035,5,12).rotateX(Math.PI/2).translate(58.3,-6.962,-25.55));
  }
  // story（第二輪）：朋友們來過的現場、林美蘭的素衣與木牌、郭家的名冊與鐵桶（見 storyTraces.js）。
  buildStoryTraces(ctx);

  mesh(new THREE.TorusGeometry(0.14,0.025,10,28),mats.bronze,[55,-5.98,-16]);
  mesh(new THREE.BoxGeometry(0.32,0.21,0.12),mats.bronze,[55,-6.13,-16]);
  batch.box(mats.rock,.85,.74,.85,55,-6.63,-16);world.box(54.575,-16.425,55.425,-15.575,-7,-6.26);
  // Two crescent wooden divination blocks.
  const crescent=new THREE.Shape();crescent.moveTo(-.16,0);crescent.quadraticCurveTo(0,.24,.16,0);crescent.quadraticCurveTo(0,.07,-.16,0);
  const moonBlock=new THREE.ExtrudeGeometry(crescent,{depth:.045,bevelEnabled:true,bevelThickness:.015,bevelSize:.01,bevelSegments:2,curveSegments:18});
  for(const s of [-1,1]){const b=mesh(moonBlock,mats.woodRed,[s*.22,7.87,-23.2]);b.rotation.set(-Math.PI/2,0,s*.4);}
  const loopProps=new THREE.Group();loopProps.visible=false;root.add(loopProps);
  for(let i=0;i<6;i++){const marble=mesh(new THREE.SphereGeometry(.06,14,10),mats.brass,[-11.2+i*.18,6.98,-16.05],loopProps);marble.name='MemoryMarble';}
  mesh(new THREE.BoxGeometry(.7,.44,.4),mats.woodDark,[-10.8,7.12,-16.2]);
  mesh(new THREE.TorusGeometry(.11,.012,8,24).rotateX(Math.PI/2),mats.thread,[-10.8,7.35,-16.2]);
  const hatch=mesh(new THREE.BoxGeometry(1.6,0.12,1.8),mats.woodDark,[5.3,17.02,-22]);
  mesh(new THREE.TorusGeometry(0.12,0.018,8,24).rotateX(Math.PI/2),mats.brass,[5.3,17.11,-21.5]);
  // Dynamic locked gate, separate from existing open leaves.
  const gate=new THREE.Group();gate.name='SealedGate';gate.position.set(0,0,21.35);root.add(gate);
  for(const s of [-1,1]){mesh(new THREE.BoxGeometry(1.94,3.25,0.12),mats.woodRed,[s*0.98,1.65,0],gate);for(let j=0;j<7;j++)for(let k=0;k<3;k++)mesh(new THREE.SphereGeometry(0.035,6,5),mats.brass,[s*(0.25+k*0.6),0.4+j*0.4,0.09],gate);}
  world.box(-2,21.22,2,21.5,-0.2,3.5);const gateCollision=world.boxes.at(-1);gateCollision.disabled=true;gate.visible=false;
  // New old opera stage. Open front, walkable low stairs, clear escape route to the courtyard.
  batch.span(mats.woodDark,17,0,-5,29,0.58,3,1.2);world.floor(17,-5,29,3,0.58);
  batch.span(mats.planks,20,0,3,26,0.28,3.7,1.2);world.floor(20,3,26,3.7,0.28);
  for(const x of [17.2,28.7]){batch.box(mats.woodRed,0.3,4.1,0.3,x,2.1,-1);world.circle(x,-1,0.23,0,4.3);}
  batch.span(mats.woodDark,16.6,4.05,-5.2,29.2,4.3,3.2);
  batch.span(mats.planks,17,0.58,-5,29,4.1,-4.85);world.box(17,-5,29,-4.85,0.5,4.3);
  // A framed proscenium with a physically mounted sign, torn side wings and backdrop.
  batch.box(mats.woodDark,3.6,.76,.14,23,3.78,2.94);
  sign('留 聲 戲 台',3.3,.62,[23,3.78,3.015]);
  for(const x of [17.8,28.2])ctx.banner(x,4.13,1.9,1.3,3.25,x<23?-.12:.12,mats.clothDark);
  const backdrop=ctx.cloth.make({width:5.2,height:2.95,material:mats.clothDark,seed:6103,fold:.12,exposure:.8});backdrop.position.set(23,4.05,-4.66);root.add(backdrop);
  for(const x of [18.5,27.5]){batch.box(mats.woodDark,1.8,2.8,.09,x,2.18,-4.7);for(let i=0;i<7;i++)batch.box(mats.woodRed,.045,2.5,.08,x-.72+i*.24,2.18,-4.63);}
  // Six seats remain countable, with the sixth turned away from the gathering.
  const seats=[[19.3,-.1,-.32],[20.2,-2.05,-.6],[18.9,-3.45,.17],[26.2,.1,.42],[27,-2.3,.9],[25.1,-3.65,Math.PI+.08]];
  for(const [x,z,ry] of seats){ctx.model('chinese_stool',{p:[x,.58,z],r:[0,ry,0],s:.85});world.circle(x,z,.23,.58,1.1);}
  // The empty frame now stands on a real table, with a back brace and foot.
  ctx.model('chinese_console_table',{p:[23,.58,-2.55],s:[1.05,.95,1]});world.box(22.1,-2.95,23.9,-2.15,.58,1.24);
  const frame=new THREE.Group();frame.name='StageMemoryFrame';frame.position.set(23,1.45,-2.4);storyRoot.add(frame);
  for(const [w,h,x,y] of [[.66,.038,0,.22],[.66,.038,0,-.22],[.038,.44,-.31,0],[.038,.44,.31,0]])mesh(new THREE.BoxGeometry(w,h,.05),mats.woodDark,[x,y,0],frame);
  const frameBacking=new THREE.MeshStandardMaterial({map:grimeTexture('#453a2e',{seed:196,dark:'16,10,7',amount:1}),roughness:1,color:0x827567});
  mesh(new THREE.BoxGeometry(.59,.39,.018),frameBacking,[0,0,-.018],frame);
  mesh(new THREE.BoxGeometry(.67,.025,.25),mats.woodDark,[23,1.22,-2.52]);
  mesh(cylinderBetween(V(23,1.62,-2.43),V(23,1.23,-2.72),.018,.018,7),mats.woodDark);
  batch.box(mats.woodDark,1.25,.25,.035,23,1.04,-2.10);sign('點名後請留座',1.16,.18,[23,1.04,-2.08]);
  ctx.candle(22.32,1.21,-2.52,{lit:true,h:.16});ctx.candle(23.68,1.21,-2.52,{lit:false,h:.09});
  const stageLight=ctx.addLight({p:[22.25,2.1,-2.2],color:0xc8693a,intensity:10,distance:12,flicker:.8});
  // Abandoned percussion and a crooked prop trunk stay outside the center escape lane.
  batch.box(mats.woodDark,.65,.32,.5,18.1,.74,-2.6);
  mesh(new THREE.CylinderGeometry(.3,.3,.4,28).rotateX(Math.PI/2),mats.woodRed,[18.1,1.17,-2.6]);
  mesh(new THREE.CircleGeometry(.285,28),mats.skin,[18.1,1.17,-2.392]);world.circle(18.1,-2.6,.4,.58,1.5);
  batch.box(mats.planks,1.1,.55,.7,27.5,.855,-3.95);const lid=mesh(new THREE.BoxGeometry(1.15,.07,.74),mats.woodDark,[27.49,1.16,-3.95]);lid.rotation.z=.08;world.box(26.9,-4.35,28.1,-3.55,.58,1.3);
  const soot=new THREE.MeshStandardMaterial({map:sootTexture(),transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2});
  mesh(new THREE.PlaneGeometry(3.2,3.3),soot,[20.1,2.2,-4.79]);mesh(new THREE.PlaneGeometry(2.4,2.8),soot,[26.4,1.9,-4.78]);
  mesh(new THREE.PlaneGeometry(5,3.4),soot,[22,.588,-2.9]).rotation.x=-Math.PI/2;
  // Reference silhouettes are deliberately shadow memories, not photoreal child models.
  const silhouettes=new THREE.Group();silhouettes.visible=false;root.add(silhouettes);
  const silhouetteMat=new THREE.MeshBasicMaterial({color:0x080507,transparent:true,opacity:0.85});
  for(const [x,z,ry] of seats){const g=new THREE.Group();g.position.set(x,.58,z-.3);g.rotation.y=ry;silhouettes.add(g);mesh(new THREE.CapsuleGeometry(.16,.52,4,10),silhouetteMat,[0,.6,0],g);mesh(new THREE.SphereGeometry(.16,14,10),silhouetteMat,[0,1.15,0],g);}
  // ── court：追逐的安全區是香火。它怕還有人在燒香記著的地方：廟埕是天公爐，二樓西側是一座小香爐。──
  // 原本的三盞燭台與「勿應・退回燈下」立牌都拆掉了。光只剩香頭的暗紅餘燼，各重用原本的那一盞燈。
  // safeZones 是 Story.beginChase 判定的圓心（半徑 2.2 m）：廟埕這一個就是天公爐的爐心，繞著爐站都算。
  const safeZones=[V(0,0.02,8),V(-9,6.9,-16.0)];
  for(let i=0;i<6;i++)rng(); // 原本六支點著的蠟燭各抽一次亂數：照抽，後面地下室的落石、布幔與燭台高度不變
  const glowTex=glowTexture(),embers=[],incenseSmokes=[];
  const incenseFire=(x,ash,z,{n,len,spread,seed,glow,light,floor,smoke,parent=root})=>{
    const lr=mulberry32(seed),spots=[];let cx=0,cy=0,cz=0;
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2+lr()*.7,r=spread*(.55+lr()*.45),lean=.05+lr()*.09,l=len*(.82+lr()*.18);
      const dir=V(Math.sin(lean)*Math.cos(a),Math.cos(lean),Math.sin(lean)*Math.sin(a));
      const base=V(x+Math.cos(a)*r,ash-.02,z+Math.sin(a)*r),tip=base.clone().addScaledVector(dir,l),end=tip.clone().addScaledVector(dir,.016);
      batch.add(mats.wax,cylinderBetween(base,base.clone().addScaledVector(dir,Math.min(.09,l*.3)),.0056,.0056,5)); // 紅色的香腳
      batch.add(mats.incense,cylinderBetween(base,tip,.0045,.0042,5));
      batch.add(mats.ember,cylinderBetween(tip,end,.0064,.0056,6)); // 悶燒的香頭
      if(lr()<.65)batch.add(mats.ridge,cylinderBetween(end,end.clone().addScaledVector(dir,.012+lr()*.02).add(V((lr()-.5)*.012,0,(lr()-.5)*.012)),.0058,.0048,5)); // 還沒掉的一截香灰
      spots.push([end.x,end.y+.01,end.z]);cx+=end.x/n;cy+=end.y/n;cz+=end.z/n;
    }
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:new THREE.Color(1,.3,.09),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:glow.opacity}));
    sp.name='IncenseEmbers';sp.position.set(cx,cy,cz);sp.scale.setScalar(glow.size);parent.add(sp);
    embers.push({sp,base:glow.opacity,phase:lr()*20});
    const s=createSmoke(spots,smoke);s.mesh.name='IncenseSmoke';parent.add(s.mesh);incenseSmokes.push(s);
    ctx.addLight({p:[cx,cy+light.dy,cz],color:light.color,intensity:light.intensity,distance:light.distance,floor,flicker:.22});
  };
  // 廟埕：天公爐裡三炷新插的長香（爐緣高過眼睛，只看得到香頭的紅點、上面的煙，和照在爐口的一點暗紅）
  incenseFire(0,0.02+1.1*1.7,8,{n:3,len:.5,spread:.055,seed:1113,glow:{size:.6,opacity:.5},light:{dy:.1,color:0xc4502a,intensity:6.5,distance:8.5},floor:-1,smoke:{height:2.6,width:.34,color:0x8f8b86,opacity:.15}});
  // 二樓：西側回廊口一座小香爐，放在實心的矮爐座上（低頭就看得到爐裡的灰與香腳）
  {
    const p=safeZones[1],top=p.y+.5,g=ctx.floorGroups?.[1]||root,lr=mulberry32(1717);
    batch.add(mats.woodDark,boxGeo(.6,.06,.6,p.x,top-.03,p.z,.8));
    batch.add(mats.cabinet,boxGeo(.48,.38,.48,p.x,p.y+.06+.19,p.z,.8));
    batch.add(mats.woodDark,boxGeo(.58,.06,.58,p.x,p.y+.03,p.z,.8));
    for(const a of [-1,1])batch.add(mats.brass,boxGeo(.3,.012,.004,p.x,p.y+.3,p.z+a*.242,.4)); // 爐座前後的銅條
    batch.add(mats.bronze,xf(incenseBurnerGeo(.4),{p:[p.x,top,p.z]}));
    batch.add(mats.ridge,new THREE.CircleGeometry(.19,20).rotateX(-Math.PI/2).translate(p.x,top+1.1*.4+.006,p.z)); // 爐裡的香灰
    for(let i=0;i<7;i++){const a=lr()*6.28,r=.03+lr()*.12,l=.04+lr()*.1,lean=(lr()-.5)*.5;batch.add(mats.incense,xf(new THREE.CylinderGeometry(.004,.004,l,4).translate(0,l/2,0),{p:[p.x+Math.cos(a)*r,top+1.1*.4,p.z+Math.sin(a)*r],r:[Math.cos(a)*lean,0,Math.sin(a)*lean]}));} // 燒剩的香腳
    world.circle(p.x,p.z,.42,p.y,p.y+1.2);
    incenseFire(p.x,top+1.1*.4,p.z,{n:3,len:.27,spread:.04,seed:1716,glow:{size:.32,opacity:.45},light:{dy:.45,color:0xc85a2e,intensity:5,distance:6.5},floor:1,parent:g,smoke:{height:1.5,width:.24,color:0x8f8b86,opacity:.14}});
  }
  // Optional relic beside a small, reachable grave near the west breach.
  const gy=terrainHeight(-39,-5);const relicPos=[-39,gy+0.6,-5];
  target('relic',relicPos,'none');
  const rabbit=new THREE.Group();rabbit.name='RedClothRabbit';rabbit.position.set(...relicPos);root.add(rabbit);
  for(const [p,s] of [[[0,0.12,0],[0.16,0.2,0.1]],[[0,0.37,0],[0.14,0.12,0.09]],[[-0.065,0.54,0],[0.04,0.17,0.035]],[[0.07,0.53,0],[0.04,0.13,0.035]]]){mesh(new THREE.SphereGeometry(1,20,16),mats.clothDark,p,rabbit).scale.set(...s);}
  for(const x of [-0.055,0.055])mesh(new THREE.SphereGeometry(0.016,8,6),mats.black,[x,0.38,0.085],rabbit);
  for(let i=0;i<7;i++)mesh(new THREE.BoxGeometry(0.022,0.003,0.004),paperMat,[-0.06,0.46+i*0.012,0.035],rabbit);
  mesh(new THREE.BoxGeometry(.65,.9,.2),mats.rock,[-39,gy+.45,-5.45]);
  sign('無 名',.5,.8,[-39,gy+.45,-5.344]);
  mesh(new THREE.BoxGeometry(.7,.62,.65),mats.rock,[-39,gy+.31,-5]);
  // Additional room is isolated under the terrain; traversal uses an authored stair transition.
  world.bounds={...world.bounds,x2:67};const ground=world.terrain;world.terrain=(x,z)=>x>45?-7:ground(x,z);
  batch.span(mats.stoneFloor,47,-7.3,-29,63,-7,-11);
  batch.span(mats.rock,47,-2.5,-29,63,-2.2,-11);
  world.floor(47,-29,63,-11,-7);
  for(const [x1,z1,x2,z2] of [[47,-29,47.4,-11],[62.6,-29,63,-11],[47,-29,63,-28.6],[47,-11.4,63,-11]]){
    batch.span(mats.stoneWall,x1,-7,z1,x2,-2.4,z2,2);world.box(x1,z1,x2,z2,-7,-2.4);
  }
  const inscription=new THREE.MeshStandardMaterial({map:witnessWallTexture(),transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-1});
  mesh(new THREE.PlaneGeometry(9,3.8),inscription,[47.43,-4.8,-22]).rotation.y=Math.PI/2;
  sign('今夜之事　止於此門',7,.6,[55,-3.15,-28.55]);
  // Low arches, layered ledges and damp stone corners make the hidden room older than the temple.
  for(const x of [48.2,61.8])for(const z of [-27.8,-20,-12.2]){
    batch.box(mats.rock,.64,4.5,.64,x,-4.75,z);batch.box(mats.rock,1,.22,1,x,-6.89,z);batch.box(mats.rock,1,.25,1,x,-2.67,z);
    world.box(x-.34,z-.34,x+.34,z+.34,-7,-2.5);
  }
  for(const z of [-27.8,-20,-12.2])batch.box(mats.woodDark,14,.4,.4,55,-2.65,z);
  for(let i=0;i<28;i++){const x=i%2?48+rng()*.5:62-rng()*.5,z=-12-rng()*16;batch.add(mats.rock,new THREE.DodecahedronGeometry(.08+rng()*.16,0).scale(1,.5,1).translate(x,-6.95,z));}
  sign('返回石階',1.4,0.5,[55,-4.8,-11.45],Math.PI);
  // finale：封印佛像的石座、地上的圓與六條紅線改由 finaleStage.js 建立（結局要能把它們移走）。
  const sealedBuddha=ctx.buddha.make({scale:1.6,style:'bronze',halo:true});sealedBuddha.position.set(55,-6.3,-26);root.add(sealedBuddha);
  for(const [i,x,z] of [[0,51,-22],[1,55,-23],[2,59,-22]]){
    desk(x,-7,z,1.2);sign(['姓名','遺物','錄音'][i],.95,.2,[x,-6.22,z+.405]);ctx.candle(x-0.3,-6.05,z,{lit:true});
  }
  mesh(new THREE.BoxGeometry(.24,.52,.07),mats.woodDark,[51,-5.82,-22]);
  mesh(new THREE.BoxGeometry(.34,.05,.2),mats.woodDark,[51,-6.075,-22]);
  mesh(new THREE.CylinderGeometry(.22,.15,.035,36),mats.brass,[55,-6.02,-23]);
  mesh(new THREE.BoxGeometry(.35,.12,.22),mats.bronze,[59,-5.98,-22]);
  for(const x of [-.08,.08])mesh(new THREE.TorusGeometry(.038,.008,6,18).rotateX(Math.PI/2),mats.brass,[59+x,-5.915,-22]);
  for(const x of [50,60]){ctx.model('ceramic_vase_03',{p:[x,-7,-27.5],s:1.3});ctx.candle(x,-7,-26.4,{lit:true,h:.35});}
  ctx.addLight({p:[55,-3.7,-23],color:0xbe3020,intensity:22,distance:18,floor:4,flicker:0.9});
  ctx.addLight({p:[55,-4.0,-13],color:0x548b9d,intensity:12,distance:13,floor:4,flicker:0.1});
  for(let i=0;i<22;i++)ctx.banner(48+rng()*14,-2.6,-13-rng()*14,0.11,0.6+rng(),rng()*3,mats.clothDark);
  // Physical ritual threads and an engraved floor circle：見 finaleStage.js 的 SealedAltar。
  // Main hall art direction: layered tattered ribbons, warm altar grazing light, dense wax.
  for(let i=0;i<11;i++){const x=-9.5+i*1.9;batch.span(mats.woodDark,x,1.5,-33.55,x+1.75,6.3,-33.35,1.2);for(const xx of [x+.12,x+1.63])batch.box(mats.bronze,.028,4.3,.04,xx,3.9,-33.29);}
  for(const x of [-8,-6,6,8])ctx.banner(x,6.35,-25,0.6+rng()*0.5,2+rng()*2,0.15,mats.clothDark);
  for(let i=0;i<18;i++){const x=-8.2+i*0.96;ctx.candle(x,1.52,-29.45,{lit:i%3!==0,holder:false,h:0.15+rng()*0.3});for(let n=0;n<3;n++)batch.add(mats.wax,new THREE.CapsuleGeometry(0.025,0.12+rng()*0.3,3,6).translate(x+(rng()-.5)*0.16,1.4-rng()*.2,-29.36));}
  ctx.addLight({p:[-5,3.6,-30],color:0xd25f2c,intensity:23,distance:15,floor:0,flicker:0.5});
  ctx.addLight({p:[5,4.4,-29.5],color:0xcf603a,intensity:20,distance:14,floor:0,flicker:0.5});
  ctx.addLight({p:[0,5.5,-19],color:0x466f89,intensity:13,distance:16,floor:0});
  // A subtle incense plume, positioned over the story's three fresh sticks.
  const smoke=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTexture(),color:0x9eaaa8,transparent:true,opacity:0.13,depthWrite:false}));smoke.position.set(0,3.5,-27.8);smoke.scale.set(1.0,2.1,1);root.add(smoke);
  const offerings=new THREE.Group();offerings.name='ChangedOfferings';root.add(offerings);offerings.visible=false;
  for(let i=0;i<6;i++)mesh(new THREE.SphereGeometry(0.045,12,10),new THREE.MeshPhysicalMaterial({color:0x617b66,roughness:0.22,metalness:0.3}),[-1.2+i*0.45,2.03,-27.65],offerings);
  const ghost=createGhost(assets);root.add(ghost.root);
  const finale=buildFinaleStage(ctx,{sealedBuddha,rabbit}); // finale：結局的演出陳設（全部預設隱藏），由 src/story/finale.js 操作
  const farewell=silhouettes.children[5].clone(true);farewell.name='XiaoyuMemory';farewell.position.set(55,-7,-24.2);farewell.visible=false;root.add(farewell);
  const memoryMat=new THREE.MeshStandardMaterial({color:0x9eaaa2,emissive:0x4b665a,emissiveIntensity:.35,transparent:true,opacity:.55,depthWrite:false,roughness:1});farewell.traverse(o=>{if(o.isMesh)o.material=memoryMat;});
  const returnedRabbit=rabbit.clone(true);returnedRabbit.position.set(.06,.52,.19);returnedRabbit.scale.setScalar(.5);farewell.add(returnedRabbit);
  const temp=new THREE.Vector3();let state=null,releaseTime=null,scare=null;
  // ── 固定演出的人影（恐怖導演 horror 的區塊）。這裡只管人影自己的站位、姿勢與消失方式；
  //    聲音、後製與燈光由 src/horror/reactive.js 輪詢 scare / scareActive 之後疊上去。──
  const SCARES={gate:{p:[0,.9,-14],pose:'bowed',life:11},tape:{p:[-6,6.9,-18.4],pose:'idle',life:9},phone:{p:[5,11.9,-21],pose:'reach',life:9},stage:{p:[23,.58,.8],pose:'idle',life:9},loop:{p:[-7,6.9,-16],pose:'bowed',life:9},relic:{p:[-34,terrainHeight(-34,-5),-5],pose:'idle',life:10}};
  const eyePoint=new THREE.Vector3(),stepPoint={x:0,z:0};
  const statueFx={stare:0}; // stare > 0：佛像在被看著的時候也慢慢轉頭（由恐怖導演的事件設定）
  const endScare=()=>{ghost.root.visible=false;ghost.setGlitch?.(0);ghost.lookAt?.(null);ghost.setPose?.('idle',true);scare=null;};
  return {targets,ghost,safeZones,rabbit,hatch,sealedBuddha,stageLight,silhouettes,loopProps,statues:ctx.statues,statueFx,finale,
    triggerScare(kind){
      const c=SCARES[kind];if(!c)return;
      scare={kind,time:0,seen:false,seenTime:0,stepped:false,jerk:0,out:0,life:c.life};
      ghost.setPose?.(c.pose,true);ghost.setFade?.(1);ghost.setGlitch?.(0);
      ghost.root.position.set(...c.p);ghost.root.visible=true;
      if(kind==='stage')silhouettes.children[5].position.set(23,.58,-.5);
    },
    get scareActive(){return !!scare;},
    /** 目前的固定人影（null 或 {kind,time,seen,seenTime}），供恐怖導演輪詢 */
    get scare(){return scare;},
    setLoopPass(pass){
      loopProps.visible=true;
      loopProps.children.forEach((o,i)=>{o.visible=i<(pass===1?5:6);});
      if(pass===2)this.triggerScare('loop');
      if(pass===3)endScare();
    },
    setState(s){state=s;gate.visible=!!s.flags.incense&&!s.flags.sealed&&!s.flags.sent;gateCollision.disabled=!gate.visible;offerings.visible=s.chapter>=3;silhouettes.visible=!!s.flags.stage&&!s.flags.key;rabbit.visible=!s.evidence.includes('relic');hatch.rotation.z=s.flags.underground?0.07:0;farewell.visible=!!s.flags.sent;if(!s.flags.sent)releaseTime=null;
      for(const t of targets){const taken=s.evidence.includes(t.id);t.glint.visible=!taken;t.object.visible=true;}
    },
    update(t,player,dt=0){
      if(player.storyChase&&scare){scare=null;ghost.setGlitch?.(0);ghost.lookAt?.(null);ghost.setPose?.('idle');} // 追逐接手同一個模型
      if(scare&&dt>0){
        const g=ghost.root,sc=scare;sc.time+=dt;
        const d=g.position.distanceTo(player.pos);
        temp.copy(g.position).sub(player.pos).normalize();
        const facing=temp.x*(-Math.sin(player.yaw))+temp.z*(-Math.cos(player.yaw));
        if(facing>.8){sc.seen=true;sc.seenTime+=dt;}
        g.rotation.y=Math.atan2(player.pos.x-g.position.x,player.pos.z-g.position.z);
        eyePoint.set(player.pos.x,player.pos.y+(player.eye||1.6),player.pos.z);ghost.lookAt?.(eyePoint); // 頭一直跟著你
        if(sc.kind==='stage'&&sc.time<3)g.position.z+=dt*.5;
        // 被盯著約半秒：抽搐著朝你踏近一步（每次演出只有一次），再過半秒就消失，不在眼前久留
        if(!sc.stepped&&sc.seenTime>.45&&d>4.2&&sc.kind!=='stage'){
          sc.stepped=true;sc.jerk=.24;ghost.setGlitch?.(1);
          stepPoint.x=g.position.x-temp.x*1.1;stepPoint.z=g.position.z-temp.z*1.1;world.resolve(stepPoint,.25,g.position.y);
          g.position.x=stepPoint.x;g.position.z=stepPoint.z;
        }
        if(sc.jerk>0){sc.jerk-=dt;if(sc.jerk<=0)ghost.setGlitch?.(.15);}
        if(sc.out>0){sc.out+=dt;g.visible=Math.sin(sc.out*60)>-.3;if(sc.out>.16)endScare();} // 在你眼前消失：抽搐兩三幀（明滅不超過兩次）
        else if(sc.time>.5&&sc.seen&&facing<.15)endScare(); // 移開視線：回頭已經不在
        else if(sc.seenTime>1||sc.time>sc.life||d<1.5){sc.out=1e-3;ghost.setGlitch?.(1);} // 被盯著約一秒，或一直沒被看到直到 life 用完
      }
      ghost.update(t,!!player.storyChase);smoke.material.opacity=0.11+Math.sin(t*.7)*.025;
      // court：香頭的餘燼像在呼吸（有風時亮一下），香煙沿著同一個時間軸飄
      for(const e of embers)e.sp.material.opacity=e.base*(.72+.28*Math.sin(t*1.3+e.phase)*Math.sin(t*.47+e.phase*1.7));
      for(const s of incenseSmokes)s.update(t);
      if(state?.flags.sent){releaseTime??=t;const fade=Math.max(0,1-(t-releaseTime)/24);memoryMat.opacity=fade*.55;farewell.visible=fade>0;returnedRabbit.visible=fade>.12;}
      // story：o.live 由 Story 每 0.12 秒寫入（目前能不能調查）；沒寫入時維持舊行為。兩邊不再互搶 visible，提示光點不會每隔幾幀閃掉。
      // 調查提示：7 m 內淡淡浮現；走到伸手可及（畫面已有「E 調查」）時隱去，避免貼臉時變成擋在畫面中央的方塊
      for(const o of targets){const d=o.position.distanceTo(player.pos);const show=(o.live??true)&&d>1.1&&d<7&&(!state?.evidence.includes(o.id));o.glint.visible=show;if(show){o.glint.rotation.y=t;o.glint.material.opacity=Math.min(1,(7-d)/3)*Math.min(1,.25+(d-1.1)/1.5)*(0.32+Math.sin(t*2)*0.14);}}
      // 佛像：沒被看著的時候把頭轉向你（第二章起）。statueFx.stare > 0 時，被看著也會慢慢轉，而且轉得更過頭。
      if(state?.chapter>=2&&dt>0){
        const stare=statueFx.stare,lim=stare>0?1.3:.7,lx=-Math.sin(player.yaw),lz=-Math.cos(player.yaw);
        for(const statue of ctx.statues||[]){
          const head=statue.userData.head;if(!head||statue===sealedBuddha)continue;
          statue.getWorldPosition(temp);if(Math.abs(temp.y-player.pos.y)>5)continue;
          const dx=temp.x-player.pos.x,dz=temp.z-player.pos.z,dist=Math.hypot(dx,dz)||1;
          const watched=(dx*lx+dz*lz)/dist>=.1;if(watched&&stare<=0)continue;
          let a=Math.atan2(-dx,-dz)-statue.rotation.y;a=Math.atan2(Math.sin(a),Math.cos(a));
          const want=Math.max(-lim,Math.min(lim,a)),diff=want-head.rotation.y,step=dt*(watched?.3*stare:5);
          head.rotation.y=Math.abs(diff)<=step?want:head.rotation.y+Math.sign(diff)*step;
        }
      }
    },
  };
}
