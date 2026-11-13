import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { World } from '../../core/World.js';
import { boxGeo,mulberry32 } from '../../core/utils.js';
import { plaqueTexture,smokeTexture,sootTexture } from '../../core/canvasTex.js';
import { makeTreeGeometry } from '../temple/trees.js';
import { createClothSystem } from '../temple/cloth.js';
import { buildRitualProps } from './ritualProps.js';

export const ASSETS={textures:['forest_ground_04','mossy_cobblestone','worn_mossy_plasterwall','weathered_brown_planks','wood_peeling_paint_weathered','mossy_rock','bark_brown_02','velour_velvet'],scans:['ritual_hand']};
export function create(game){
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x080e13);scene.fog=new THREE.FogExp2(0x111a20,.028);
  const world=new World();world.bounds={x1:-16,x2:16,z1:-42,z2:39};world.floor(-16,-42,16,39,0);
  const rand=mulberry32(247),materials=[],textures=[];
  const mat=(c,o={})=>{const m=new THREE.MeshStandardMaterial({color:c,roughness:.85,...o});materials.push(m);return m;};
  const pbr=(id,o={})=>{const m=game.assets.mat(id,o);materials.push(m);return m;};
  const dirt=pbr('forest_ground_04',{color:0x625f52}),road=pbr('mossy_cobblestone',{color:0x5b6261,roughness:.62}),wood=pbr('weathered_brown_planks',{color:0x78624d}),red=pbr('wood_peeling_paint_weathered',{color:0x58342d}),wall=pbr('worn_mossy_plasterwall',{color:0x8e8b75}),rock=pbr('mossy_rock',{color:0x636762}),bark=pbr('bark_brown_02',{color:0x5b5145}),clothMat=pbr('velour_velvet',{color:0x431c18});
  const iron=mat(0x282e2c,{metalness:.65,roughness:.58}),dark=mat(0x10100e),paper=mat(0xb8ad8c);
  const mesh=(g,m,p=[0,0,0])=>{const o=new THREE.Mesh(g,m);o.position.set(...p);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o;};
  const box=(w,h,d,x,y,z,m=wood,rounded=false)=>mesh(rounded?new RoundedBoxGeometry(w,h,d,2,.04):boxGeo(w,h,d,0,0,0,2),m,[x,y,z]);
  const cyl=(r1,r2,h,x,y,z,m=iron)=>mesh(new THREE.CylinderGeometry(r1,r2,h,24),m,[x,y,z]);
  const sign=(text,w,h,x,y,z,ry=0)=>{const tex=plaqueTexture(text,{w:1024,h:Math.round(1024*h/w),seed:42});textures.push(tex);const m=mat(0xc6b98f,{map:tex});const front=mesh(new THREE.PlaneGeometry(w,h),m,[x,y,z]);front.rotation.y=ry;return front;};
  const propLabel=(text,w,h,x,y,z,ry=0)=>{const b=box(w+.08,h+.08,.07,x,y,z-.04,wood);b.rotation.y=ry;return sign(text,w,h,x,y,z,ry);};
  box(90,.18,110,0,-.14,-2,dirt);box(5.2,.045,82,0,-.002,-1,road);
  // Water-darkened potholes and broken verge stones; no perfectly mirrored roadside.
  for(let i=0;i<40;i++){const s=.15+rand()*.4;const puddle=mesh(new THREE.CircleGeometry(s,24),mat(0x101b1f,{roughness:.12,metalness:.35}),[(rand()-.5)*4.6,.025,rand()*76-39]);puddle.rotation.x=-Math.PI/2;puddle.scale.y=.35+rand()*.45;}
  for(let i=0;i<100;i++){const s=.08+rand()*.24;const o=mesh(new THREE.DodecahedronGeometry(s,0),rock,[(rand()>.5?1:-1)*(2.6+rand()*2),.02,rand()*82-42]);o.scale.set(1,.6,1.2);o.rotation.set(rand(),rand(),rand());}
  // A culvert bridge; the channel is physically dark below two rows of parapets.
  box(5.2,.13,5,0,.015,10.5,rock);world.floor(-2.6,8,2.6,13,.08);
  for(const x of [-2.72,2.72]){box(.3,.72,5.8,x,.36,10.5,rock);world.box(x-.15,7.6,x+.15,13.4,0,.75);for(let i=0;i<5;i++)box(.37,.92,.32,x,.46,8+i*1.22,rock);}
  // Moonlit trees and distant ridgelines form silhouettes beyond the road.
  const tg=makeTreeGeometry(91,{height:9,maxDepth:4,trunkR:.23}),trees=new THREE.InstancedMesh(tg,bark,100),dummy=new THREE.Object3D();
  for(let i=0;i<100;i++){dummy.position.set((i%2?1:-1)*(17+rand()*25),-.2,rand()*108-52);dummy.rotation.y=rand()*6.28;dummy.scale.setScalar(.7+rand()*1.2);dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);}trees.castShadow=true;scene.add(trees);
  for(let i=0;i<22;i++){const b=mesh(new THREE.DodecahedronGeometry(6+rand()*6,1),rock,[(i%2?1:-1)*(23+rand()*13),1,rand()*100-50]);b.scale.y=.7+rand();}
  const moon=new THREE.DirectionalLight(0x9fbacb,1.1);moon.position.set(-18,24,-19);moon.castShadow=true;moon.shadow.camera.left=-28;moon.shadow.camera.right=28;moon.shadow.camera.top=48;moon.shadow.camera.bottom=-48;moon.shadow.camera.near=.5;moon.shadow.camera.far=100;moon.shadow.bias=-.00025;moon.shadow.normalBias=.09;scene.add(moon);
  scene.add(new THREE.HemisphereLight(0x71899d,0x29231b,.38));
  // Car left at the washed-out turnoff. Headlights give the player a first safe pool of light.
  box(1.75,.54,3.7,-4.6,.65,32,mat(0x343e41,{metalness:.65,roughness:.38}),true);
  box(1.5,.64,1.7,-4.6,1.18,32.15,mat(0x202c32,{metalness:.5,roughness:.28}),true);
  for(const x of [-5.47,-3.73])for(const z of [30.85,33.15]){const tire=cyl(.31,.31,.18,x,.36,z,dark);tire.rotation.z=Math.PI/2;const rim=cyl(.17,.17,.19,x,.36,z,iron);rim.rotation.z=Math.PI/2;}
  for(const x of [-5.15,-4.05]){box(.35,.16,.045,x,.74,30.13,mat(0xd1d4c4,{emissive:0xc5cbbb,emissiveIntensity:1.2}));const l=new THREE.SpotLight(0xe4e4c8,14,20,.5,.55,1.5);l.position.set(x,.75,30.05);l.target.position.set(x,.15,12);scene.add(l,l.target);}
  world.box(-5.55,30.1,-3.65,34,0,1.5);
  // Bus shelter: timetable with no night service, rotting bench and abandoned slippers.
  box(3.4,.12,2,-4.6,2.7,22,iron);for(const x of [-6.1,-3.1])for(const z of [21.3,22.7])box(.07,2.7,.07,x,1.35,z,iron);
  box(3,.08,.46,-4.6,.47,22.25,wood);for(const x of [-5.8,-3.4])box(.08,.45,.35,x,.225,22.25,iron);world.box(-6.1,22,-3.1,22.5,0,.55);
  box(.65,1.05,.08,-3.15,1.7,21.35,iron);sign('末班 18:40',.57,.33,-3.15,1.99,21.401);sign('慈雲里 停駛',.57,.28,-3.15,1.6,21.402);
  for(let i=0;i<2;i++)box(.12,.04,.25,-5+i*.22,.025,21.5,mat(0x483323),true);
  // Old village buildings: doors/windows are recessed into deep frames, eaves and drains are separate geometry.
  function house(x,z,w,d,height,index){
    box(w,height,d,x,height/2,z,wall);world.box(x-w/2,z-d/2,x+w/2,z+d/2,0,height);
    box(w+.65,.16,d+.6,x,height+.12,z,rock);box(w+.15,.2,.12,x,height-.1,z+d/2+.07,wood);
    box(.95,1.95,.06,x,1,z+d/2+.035,red);for(const dx of [-.51,.51])box(.07,2.06,.12,x+dx,1.03,z+d/2+.07,wood);
    for(const dx of [-w*.32,w*.32]){box(.8,.75,.035,x+dx,1.7,z+d/2+.04,dark);for(let j=0;j<4;j++)box(.025,.75,.07,x+dx-.3+j*.2,1.7,z+d/2+.07,iron);}
    const down=cyl(.035,.035,height,x+w/2+.03,height/2,z+d/2);propLabel(`慈雲 ${index} 號`,.54,.25,x-.7,1.35,z+d/2+.115);
    for(let j=0;j<6;j++)box(.27,.035,.45,x-w/2+.2+j*.5,height+.23,z+d/2,rock);
  }
  house(-8,-1,6,6,3.7,12);house(8,0,6,5,4.4,15);house(-9,-16,7,7,3.5,21);house(-8,-31,6,6,4.2,27);
  // Noticeboard positioned in the street, with a physical roof and legs.
  for(const x of [3.3,4.7])box(.09,2.3,.09,x,1.15,5,wood);box(1.65,1.08,.12,4,1.65,5,wood);box(1.9,.1,.5,4,2.27,5,rock);
  sign('住戶遷離公告',1.4,.3,4,1.95,5.066);sign('夜間勿回應門外呼名',1.4,.3,4,1.5,5.067);
  // The workshop is an accessible room with a wide front opening and collision-correct bench.
  box(7,.13,8,8.5,.06,-18.5,rock);world.floor(5,-22.5,12,-14.5,.12);
  box(.22,3.8,8,5,1.9,-18.5,wall);box(.22,3.8,8,12,1.9,-18.5,wall);box(7,3.8,.22,8.5,1.9,-22.5,wall);
  world.box(4.89,-22.5,5.11,-14.5,0,3.8);world.box(11.89,-22.5,12.11,-14.5,0,3.8);world.box(5,-22.61,12,-22.39,0,3.8);
  box(2,3.8,.22,6,1.9,-14.5,wall);box(2,3.8,.22,11,1.9,-14.5,wall);world.box(5,-14.61,7,-14.39,0,3.8);world.box(10,-14.61,12,-14.39,0,3.8);
  box(3,.8,.22,8.5,3.4,-14.5,wood);box(7.7,.18,8.6,8.5,3.85,-18.5,wood);propLabel('榮昌 紙紮行',2.6,.5,8.5,2.95,-14.32);
  box(2.3,.09,1.2,8.3,.91,-19,wood);for(const x of [7.3,9.3])for(const z of [-19.5,-18.5])box(.1,.75,.1,x,.49,z,wood);world.box(7.15,-19.6,9.45,-18.4,.12,.96);
  const remains=buildRitualProps(scene,{x:8.3,y:.965,z:-19,handModel:game.assets.model('ritual_hand')});
  const badge=sign('郭建成 46歲',.25,.09,8.95,.969,-18.55);badge.rotation.x=-Math.PI/2;
  const ring=mesh(new THREE.TorusGeometry(.012,.0028,10,26),mat(0x82704b,{metalness:.65,roughness:.5}),[8.86,.971,-18.61]);ring.rotation.x=Math.PI/2;
  // A paper-making rack and ledger, logically separated from the bodily evidence.
  box(1.1,.08,.7,10.8,.82,-19,wood);for(const x of [10.35,11.25])box(.07,.7,.58,x,.43,-19,wood);world.box(10.25,-19.35,11.35,-18.65,.12,.87);
  const ledger=box(.38,.035,.48,10.8,.885,-19,paper);ledger.rotation.y=.12;
  for(let i=0;i<7;i++)box(.28,.003,.003,10.8,.905,-19.16+i*.045,dark);
  for(const x of [5.5,11.5]){box(.08,2.7,.08,x,1.47,-21.9,wood);for(let i=0;i<4;i++)box(.8,.06,.3,x, .6+i*.55,-21.9,wood);}
  // Furnace: open mouth, ash tray, charred beams, cooled coals and a few surviving embers.
  for(const x of [6,7.3])box(.28,1.6,1.1,x,.92,-21.7,rock);box(1.6,.25,1.2,6.65,1.83,-21.7,rock);box(1.1,1.35,.15,6.65,.9,-22.2,dark);box(1.6,.12,1.4,6.65,.19,-21.6,rock);
  for(let i=0;i<25;i++){const e=mesh(new THREE.DodecahedronGeometry(.06+rand()*.08),i%6===0?mat(0x261309,{emissive:0x9c2809,emissiveIntensity:1.4}):dark,[6.2+rand()*.9,.3,-21.2-rand()*.6]);e.scale.y=.5;}
  const furnace=new THREE.PointLight(0xd46a27,4.5,8,2);furnace.position.set(6.65,.7,-21);scene.add(furnace);
  const taskLamp=new THREE.PointLight(0xd2a579,6,9,2);taskLamp.position.set(8.3,2.15,-18.6);scene.add(taskLamp);
  cyl(.16,.23,.14,8.3,2.32,-18.6,iron);box(.1,.03,.1,8.3,2.24,-18.6,mat(0xffe1a4,{emissive:0xffc276,emissiveIntensity:1}));cyl(.005,.005,1.4,8.3,3.05,-18.6,iron);
  const soot=sootTexture();textures.push(soot);const sootMat=mat(0x130c08,{map:soot,transparent:true,depthWrite:false});const sm=mesh(new THREE.PlaneGeometry(4.5,3.4),sootMat,[6.9,1.9,-22.375]);sm.castShadow=false;
  const cloth=createClothSystem();for(let i=0;i<5;i++){const c=cloth.make({width:.45+rand()*.3,height:1.4+rand(),material:clothMat,seed:240+i,fold:.09,exposure:.35});c.position.set(5.7+i*1.25,3.68,-21.5);scene.add(c);}
  // Street details: electricity cables, toppled stools, buckets, an adult-sized jacket on a hook.
  for(const [x,z]of [[-3,27],[3,3],[-3,-26]]){cyl(.09,.13,6,x,3,z,wood);box(1.3,.08,.08,x,5.5,z,wood);}
  for(let k=0;k<3;k++){const path=new THREE.CatmullRomCurve3([[-3+k*.3,5.5,27],[k*.3,4.6,15],[3+k*.3,5.5,3],[k*.3,4.1,-12],[-3+k*.3,5.5,-26]].map(p=>new THREE.Vector3(...p)));mesh(new THREE.TubeGeometry(path,65,.012,5,false),iron);}
  for(let i=0;i<8;i++){const p=box(.32,.015,.44,5.4+rand()*6,.145,-15-rand()*7,paper);p.rotation.y=rand()*6.28;}
  cyl(.26,.2,.5,11,.37,-15.4,iron);cyl(.24,.24,.014,11,.625,-15.4,dark);
  // Path-end gate physically marks the transition. No automatic teleport on passing a coordinate.
  for(const x of [-2.3,2.3]){box(.28,3.1,.28,x,1.55,-36,rock);world.box(x-.14,-36.14,x+.14,-35.86,0,3.1);}box(5.2,.2,.5,0,3,-36,wood);propLabel('慈雲寺 舊參道',2.6,.45,0,2.62,-35.7);
  for(let i=0;i<5;i++){box(3.8,.12,.7,0,.055,-37-i*.85,rock);}
  const fogTex=smokeTexture();textures.push(fogTex);const fog=[];
  for(let i=0;i<12;i++){const m=new THREE.MeshBasicMaterial({map:fogTex,color:0x758a90,transparent:true,opacity:.08,depthWrite:false});materials.push(m);const o=mesh(new THREE.PlaneGeometry(12,2.6),m,[(rand()-.5)*10,.9,rand()*75-38]);o.castShadow=false;fog.push({o,x:o.position.x,phase:rand()*6});}
  const targets=[['bus','查看停駛時刻表',[-3.15,1.6,21.5]],['notice','調查遷離公告',[4,1.5,5.12]],['remains','檢查作坊桌上的殘留物',[8.3,1.09,-18.85]],['ledger','翻閱焚紙作坊登記簿',[10.8,1,-19]],['gate','沿舊參道前往慈雲寺',[0,1.6,-35.7]],['car','查看車內手機',[-3.6,1.15,32]],['kiln','查看仍有餘溫的焚化爐',[6.65,.85,-20.95]]].map(([id,label,p])=>({id,label,position:new THREE.Vector3(...p)}));
  game.audio.profile='road';game.audio.released=false;game.film.uniforms.grain.value=.032;game.film.uniforms.aberration.value=.0018;
  return {id:'road',scene,world,storyWorld:{targets,setState(){}},cloth,remains,spawn:{x:-1.2,z:33.2,yaw:0,pitch:-.03},
    zoneName:p=>p.z>14?'舊山路・停駛的站牌':p.z>7?'石橋・下方沒有水聲':p.x>4.8&&p.z<-14&&p.z>-23?'廢村・榮昌紙紮行':p.z<-30?'慈雲寺・舊參道':'慈雲里・無人的街',
    indoorAt:p=>p.x>5&&p.z<-14&&p.z>-23,surfaceAt:()=> 'stone',setQuality(q){moon.shadow.mapSize.set(q.shadow,q.shadow);game.film.uniforms.grain.value=.032;game.film.uniforms.aberration.value=.0018;},
    update(dt,t){cloth.update(t,game.camera);remains.update(t);furnace.intensity=4.5*(1+.08*Math.sin(t*2.1));for(const f of fog){f.o.quaternion.copy(game.camera.quaternion);f.o.position.x=f.x+Math.sin(t*.08+f.phase)*2;}},
    dispose(){game.audio.profile=null;game.film.uniforms.grain.value=.03;game.film.uniforms.aberration.value=.0012;scene.traverse(o=>{o.geometry?.dispose();o.shadow?.map?.dispose();});materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());remains.dispose();},
  };
}
