import * as THREE from 'three';
import { plaqueTexture, smokeTexture, grimeTexture, witnessWallTexture, sootTexture } from '../../core/canvasTex.js';
import { boxGeo, xf, cylinderBetween } from '../../core/utils.js';
import { terrainHeight } from './terrain.js';
import { createGhost } from './ghost.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const POSITIONS = {
  rules:[-2.3,1.65,20.7], incense:[0,2.35,-27.25], diary:[-9,1.85,-20.1], newspaper:[9,1.85,-20.1],
  tape:[-9,7.85,-18.4], ritual:[-8.3,7.85,-26.3], stage:[23,1.45,-2.34], divination:[0,8.05,-22.9],
  death:[5,13.0,-27.1], births:[-10,13.0,-26.5], descent:[5.3,17.25,-22],
  names:[48.1,-5.5,-22], confession:[55,-5.9,-16.0], altar:[55,-5.6,-24.3], return:[55,-5.5,-12.4],
  riteName:[51,-5.85,-22], riteRelic:[55,-5.85,-23], riteWitness:[59,-5.85,-22], exit:[0,1.2,26],
  loopmark:[-10.8,8,-16],
};
const LABELS={rules:'山門告示',incense:'三炷未熄的香',diary:'阿哲的日記',newspaper:'火災剪報',tape:'舊錄音機',ritual:'送魂殘頁',stage:'戲台上的空相框',divination:'擲筊問路',death:'阿哲的死亡通知',births:'六人生辰簿',descent:'封印暗道',names:'刻滿名字的牆',confession:'神壇前的舊鎖',altar:'最後的抉擇',return:'返回四樓',relic:'無名小墳裡的布包',riteName:'空白牌位・喚名',riteRelic:'供盤・歸物',riteWitness:'錄音機・見證',exit:'山門外',loopmark:'兔耳上的補線記號'};

export function buildStoryWorld(ctx) {
  const {root,mats,world,batch,rng,assets}=ctx;
  const storyRoot=new THREE.Group();storyRoot.name='StorySet';root.add(storyRoot);
  const targets=[];
  const paperMat=new THREE.MeshStandardMaterial({map:grimeTexture('#c6b48d',{seed:29,dark:'55,40,22',amount:0.5}),roughness:1});
  const mesh=(geo,mat,p,parent=storyRoot)=>{const o=new THREE.Mesh(geo,mat);if(p)o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const sign=(text,w,h,p,ry=0)=>{const m=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:plaqueTexture(text,{w:1024,h:Math.round(1024*h/w),seed:22}),roughness:0.9,side:THREE.DoubleSide}),p);m.rotation.y=ry;return m;};
  const desk=(x,y,z,w=1.8)=>{mesh(boxGeo(w,0.08,0.8),mats.woodDark,[x,y+0.9,z]);for(const a of [-1,1])for(const b of [-1,1])mesh(boxGeo(0.07,0.9,0.07),mats.woodDark,[x+a*(w/2-0.1),y+0.45,z+b*0.3]);world.box(x-w/2,z-0.4,x+w/2,z+0.4,y,y+0.96);};
  function target(id,p,kind='paper'){
    const obj=new THREE.Group();obj.name=`Evidence_${id}`;obj.position.set(...p);storyRoot.add(obj);
    if(kind==='paper'){const page=mesh(new THREE.BoxGeometry(0.33,0.014,0.44),paperMat,[0,0,0],obj);page.rotation.set(0.12,0.17,0);for(let n=0;n<7;n++)mesh(new THREE.BoxGeometry(0.23,0.002,0.003),mats.woodDark,[0,0.012,-0.14+n*0.04],obj);}
    if(kind==='recorder'){mesh(new THREE.BoxGeometry(0.35,0.12,0.22),mats.bronze,[0,0,0],obj);for(const x of [-0.08,0.08])mesh(new THREE.TorusGeometry(0.038,0.008,6,16).rotateX(Math.PI/2),mats.brass,[x,0.063,0],obj);}
    const glint=mesh(new THREE.OctahedronGeometry(0.035),new THREE.MeshBasicMaterial({color:0xd7c090,transparent:true,opacity:0.85,depthTest:true}),[0,0.18,0],obj);glint.castShadow=false;
    targets.push({id,label:LABELS[id],position:V(...p),object:obj,glint});return obj;
  }
  for(const [id,p] of Object.entries(POSITIONS)){
    const noProp=['rules','incense','stage','descent','names','altar','return','exit','riteName','riteRelic','riteWitness','confession','divination','loopmark'].includes(id);
    target(id,p,noProp?'none':id==='tape'?'recorder':'paper');
  }
  // Actual readable placards, evidence stations and a distinctive six-child altar.
  sign('聞呼名 勿應',0.72,1.0,[-2.28,1.7,20.68]);
  for(const [x,y,z] of [[-9,0.9,-20.1],[9,0.9,-20.1],[-9,6.9,-18.4],[-8.3,6.9,-26.3],[5,11.9,-27.1],[-10,11.9,-26.5]]){
    desk(x,y,z);ctx.candle(x-0.6,y+0.94,z,{lit:true,h:0.18});
  }
  sign('留下名字',1.1,0.3,[5.3,18.1,-23.5]);
  mesh(new THREE.TorusGeometry(0.14,0.025,10,28),mats.bronze,[55,-5.98,-16]);
  mesh(new THREE.BoxGeometry(0.32,0.21,0.12),mats.bronze,[55,-6.13,-16]);
  batch.box(mats.rock,.85,.74,.85,55,-6.63,-16);world.box(54.575,-16.425,55.425,-15.575,-7,-6.26);
  // Two crescent wooden divination blocks.
  const crescent=new THREE.Shape();crescent.moveTo(-.16,0);crescent.quadraticCurveTo(0,.24,.16,0);crescent.quadraticCurveTo(0,.07,-.16,0);
  const moonBlock=new THREE.ExtrudeGeometry(crescent,{depth:.045,bevelEnabled:true,bevelThickness:.015,bevelSize:.01,bevelSegments:2,curveSegments:18});
  for(const s of [-1,1]){const b=mesh(moonBlock,mats.woodRed,[s*.22,7.87,-23.2]);b.rotation.set(-Math.PI/2,0,s*.4);}
  const loopProps=new THREE.Group();loopProps.visible=false;root.add(loopProps);
  for(let i=0;i<6;i++){const marble=mesh(new THREE.SphereGeometry(.06,14,10),mats.brass,[-11.2+i*.18,6.98,-16.05],loopProps);marble.name='MemoryMarble';}
  sign('補過的耳朵',.85,.3,[-10.8,8,-16.2]);
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
  batch.box(mats.woodDark,1.25,.25,.035,23,1.04,-2.10);sign('六人到齊　才能開演',1.16,.18,[23,1.04,-2.08]);
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
  // Three clear safe lights; the same visual language is used in the upstairs sanctuary.
  const safeZones=[V(0,0.02,13),V(-9,6.9,-16.0)];
  for(const p of safeZones){
    // The candles have a stone base; the notice stands beside them, never through them.
    batch.box(mats.rock,1.35,.24,.5,p.x,p.y+.12,p.z);world.floor(p.x-.675,p.z-.25,p.x+.675,p.z+.25,p.y+.24);
    for(let i=-1;i<=1;i++)ctx.candle(p.x+i*.48,p.y+.24,p.z,{lit:true,h:.4});
    ctx.addLight({p:[p.x,p.y+1.4,p.z],color:0xe6ac6d,intensity:9,distance:9,floor:p.y>5?1:-1});
    const sx=p.x+2.05,sz=p.z-.1;
    mesh(new THREE.BoxGeometry(1.48,.36,.09),mats.woodDark,[sx,p.y+.87,sz]);
    sign('勿應・退回燈下',1.4,.28,[sx,p.y+.87,sz+.047]).material.side=THREE.FrontSide;
    for(const dx of [-.49,.49]){mesh(new THREE.BoxGeometry(.065,.78,.065),mats.woodDark,[sx+dx,p.y+.42,sz]);mesh(new THREE.BoxGeometry(.28,.06,.4),mats.woodDark,[sx+dx,p.y+.03,sz]);}
    world.box(sx-.74,sz-.2,sx+.74,sz+.2,p.y,p.y+1.06);
  }
  // Optional relic beside a small, reachable grave near the west breach.
  const gy=terrainHeight(-39,-5);const relicPos=[-39,gy+0.6,-5];
  target('relic',relicPos,'none');
  const rabbit=new THREE.Group();rabbit.name='RedClothRabbit';rabbit.position.set(...relicPos);root.add(rabbit);
  for(const [p,s] of [[[0,0.12,0],[0.16,0.2,0.1]],[[0,0.37,0],[0.14,0.12,0.09]],[[-0.065,0.54,0],[0.04,0.17,0.035]],[[0.07,0.53,0],[0.04,0.13,0.035]]]){mesh(new THREE.SphereGeometry(1,20,16),mats.clothDark,p,rabbit).scale.set(...s);}
  for(const x of [-0.055,0.055])mesh(new THREE.SphereGeometry(0.016,8,6),mats.black,[x,0.38,0.085],rabbit);
  for(let i=0;i<7;i++)mesh(new THREE.BoxGeometry(0.022,0.003,0.004),paperMat,[-0.06,0.46+i*0.012,0.035],rabbit);
  sign('無 名',0.5,0.8,[-39,gy+0.4,-5.4]);
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
  batch.span(mats.rock,53,-7,-27.5,57,-6.3,-24.8);world.box(53,-27.5,57,-24.8,-7,-3);
  const sealedBuddha=ctx.buddha.make({scale:1.6,style:'bronze',halo:true});sealedBuddha.position.set(55,-6.3,-26);root.add(sealedBuddha);
  for(const [i,x,z] of [[0,51,-22],[1,55,-23],[2,59,-22]]){
    desk(x,-7,z,1.2);sign(['一・喚名','二・歸物','三・見證'][i],0.95,0.32,[x,-5.5,z-0.2]);ctx.candle(x-0.3,-6.05,z,{lit:true});
  }
  mesh(new THREE.BoxGeometry(.24,.52,.07),mats.woodDark,[51,-5.82,-22]);
  mesh(new THREE.CylinderGeometry(.22,.15,.035,36),mats.brass,[55,-6.02,-23]);
  mesh(new THREE.BoxGeometry(.35,.12,.22),mats.bronze,[59,-5.98,-22]);
  for(const x of [-.08,.08])mesh(new THREE.TorusGeometry(.038,.008,6,18).rotateX(Math.PI/2),mats.brass,[59+x,-5.915,-22]);
  for(const x of [50,60]){ctx.model('ceramic_vase_03',{p:[x,-7,-27.5],s:1.3});ctx.candle(x,-7,-26.4,{lit:true,h:.35});}
  ctx.addLight({p:[55,-3.7,-23],color:0xbe3020,intensity:22,distance:18,floor:4,flicker:0.9});
  ctx.addLight({p:[55,-4.0,-13],color:0x548b9d,intensity:12,distance:13,floor:4,flicker:0.1});
  for(let i=0;i<22;i++)ctx.banner(48+rng()*14,-2.6,-13-rng()*14,0.11,0.6+rng(),rng()*3,mats.clothDark);
  // Physical ritual threads and an engraved floor circle.
  const circle=mesh(new THREE.RingGeometry(3.45,3.51,96),mats.thread,[55,-6.98,-23]);circle.rotation.x=-Math.PI/2;
  for(let i=0;i<6;i++){const th=i/6*Math.PI*2;batch.add(mats.thread,cylinderBetween(V(55+Math.sin(th)*3.5,-6.95,-23+Math.cos(th)*3.5),V(55,-5.1,-26),0.008,0.008,5));}
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
  const farewell=silhouettes.children[5].clone(true);farewell.name='XiaoyuMemory';farewell.position.set(55,-7,-24.2);farewell.visible=false;root.add(farewell);
  const memoryMat=new THREE.MeshStandardMaterial({color:0x9eaaa2,emissive:0x4b665a,emissiveIntensity:.35,transparent:true,opacity:.55,depthWrite:false,roughness:1});farewell.traverse(o=>{if(o.isMesh)o.material=memoryMat;});
  const returnedRabbit=rabbit.clone(true);returnedRabbit.position.set(.06,.52,.19);returnedRabbit.scale.setScalar(.5);farewell.add(returnedRabbit);
  const temp=new THREE.Vector3();let state=null,releaseTime=null;
  return {targets,ghost,safeZones,rabbit,hatch,sealedBuddha,stageLight,silhouettes,loopProps,statues:ctx.statues,
    setState(s){state=s;gate.visible=!!s.flags.incense&&!s.flags.sealed&&!s.flags.sent;gateCollision.disabled=!gate.visible;offerings.visible=s.chapter>=3;silhouettes.visible=!!s.flags.stage&&!s.flags.key;rabbit.visible=!s.evidence.includes('relic');hatch.rotation.z=s.flags.underground?0.07:0;farewell.visible=!!s.flags.sent;if(!s.flags.sent)releaseTime=null;
      for(const t of targets){const taken=s.evidence.includes(t.id);t.glint.visible=!taken;t.object.visible=!taken||['names','confession'].includes(t.id);}
    },
    update(t,player){ghost.update(t,!!player.storyChase);smoke.material.opacity=0.11+Math.sin(t*.7)*.025;
      if(state?.flags.sent){releaseTime??=t;const fade=Math.max(0,1-(t-releaseTime)/24);memoryMat.opacity=fade*.55;farewell.visible=fade>0;returnedRabbit.visible=fade>.12;}
      for(const o of targets){const d=o.position.distanceTo(player.pos);o.glint.visible=d<10&&(!state?.evidence.includes(o.id));o.glint.rotation.y=t;o.glint.material.opacity=0.45+Math.sin(t*2)*0.25;}
      if(state?.chapter>=2){for(const statue of ctx.statues||[]){if(!statue.userData.head||statue===sealedBuddha)continue;statue.getWorldPosition(temp);const dy=Math.abs(temp.y-player.pos.y);if(dy>5)continue;const angle=Math.atan2(player.pos.x-temp.x,player.pos.z-temp.z)-statue.rotation.y;const to=V(temp.x-player.pos.x,0,temp.z-player.pos.z).normalize();const look=V(-Math.sin(player.yaw),0,-Math.cos(player.yaw));if(to.dot(look)<0.1){statue.userData.head.rotation.y=THREE.MathUtils.clamp(angle,-0.7,0.7);}}}
    },
  };
}
