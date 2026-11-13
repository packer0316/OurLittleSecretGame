import * as THREE from 'three';
import { capsuleBetween, mulberry32 } from '../../core/utils.js';
import { grimeTexture } from '../../core/canvasTex.js';

// Original procedural character: the borrowed appearance of Xiaoyu's mother.
// A genuine 3D model with articulated head/arms and a deforming cloth mesh.
export function createGhost(assets) {
  if (assets.models.ghost_woman) return createAnimatedGhost(assets);
  const root = new THREE.Group(); root.name = 'BorrowedVoice';
  const skin = new THREE.MeshStandardMaterial({ map: grimeTexture('#c5b9ab', { seed: 60, dark: '45,41,38', amount: 0.5 }), roughness: 0.86 });
  const dress = new THREE.MeshStandardMaterial({ map:grimeTexture('#b4afa2',{seed:61,dark:'32,30,25',amount:0.65}), normalMap:assets.pbr.velour_velvet.normalMap, normalScale:new THREE.Vector2(.3,.3), color:0xc0bcae, roughness:1, side:THREE.DoubleSide });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x080909, roughness: 0.63, metalness: 0.06, side: THREE.DoubleSide });
  const red = assets.mat('velour_velvet', { color: 0x651611, roughness: 0.9, side: THREE.DoubleSide });
  const rng = mulberry32(847);
  const mesh = (geo, mat, parent = root, p = [0,0,0]) => { const o = new THREE.Mesh(geo,mat); o.position.set(...p); o.castShadow=true; o.receiveShadow=true; parent.add(o); return o; };
  const robeGeo = new THREE.CylinderGeometry(0.20,0.40,1.23,56,24,true).translate(0,0.77,0);
  const a=robeGeo.attributes.position;
  for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i),th=Math.atan2(z,x); const k=1+0.08*Math.sin(th*14+y*2)+0.025*Math.sin(th*29);a.setXYZ(i,x*k,y+(y<0.2?0.035*Math.sin(th*17):0),z*k*0.75);}
  robeGeo.computeVertexNormals();const robe=mesh(robeGeo,dress); const rest=Float32Array.from(a.array);
  mesh(new THREE.SphereGeometry(1,28,20),dress,root,[0,1.38,0]).scale.set(0.24,0.24,0.14);
  const head=new THREE.Group();head.name='Head';head.position.set(0,1.61,0.035);root.add(head);
  mesh(new THREE.SphereGeometry(1,32,24),skin,head,[0,0.105,0]).scale.set(0.105,0.155,0.103);
  mesh(new THREE.SphereGeometry(1,14,10),skin,head,[0,0.09,0.097]).scale.set(0.02,0.034,0.027);
  mesh(new THREE.SphereGeometry(1,16,12),hairMat,head,[0,0.15,-0.015]).scale.set(0.12,0.14,0.115);
  for(let k=0;k<18;k++){
    const th=k/18*Math.PI*2,len=.56+rng()*.26;const curtain=new THREE.PlaneGeometry(.056,len,3,20);const p=curtain.attributes.position;
    for(let n=0;n<p.count;n++){const v=.5-p.getY(n)/len;const side=p.getX(n);p.setXYZ(n,Math.cos(th)*(.115+v*.035)+Math.sin(th)*side+Math.sin(v*5+k)*.009,.19-v*len,Math.sin(th)*(.112+v*.035)+Math.cos(th)*side+(Math.sin(th)>0?.017:0));}
    curtain.computeVertexNormals();mesh(curtain,hairMat,head);
  }
  for(let k=0;k<50;k++){
    const th=k/50*Math.PI*2;const len=0.45+rng()*0.45;const points=[];
    for(let n=0;n<8;n++){const v=n/7;points.push(new THREE.Vector3(Math.cos(th)*(0.102+0.035*v)+Math.sin(v*4+k)*0.017,0.19-v*len,Math.sin(th)*(0.095+0.025*v)+(Math.sin(th)>0?0.04:0)));}
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),14,0.007+rng()*0.007,4),hairMat,head);
  }
  const arms=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.name=side<0?'LeftArm':'RightArm';arm.position.set(side*0.23,1.42,0);root.add(arm);arms.push(arm);
    mesh(new THREE.CapsuleGeometry(0.067,0.35,6,12),dress,arm,[side*0.045,-0.18,0]);
    mesh(new THREE.CapsuleGeometry(0.035,0.22,6,12),skin,arm,[side*0.06,-0.49,0.025]);
    mesh(new THREE.SphereGeometry(1,16,12),skin,arm,[side*0.06,-0.65,0.03]).scale.set(0.041,0.07,0.024);
    for(let f=0;f<5;f++) mesh(capsuleBetween(new THREE.Vector3(side*0.06+(f-2)*0.014,-0.69,0.03),new THREE.Vector3(side*0.06+(f-2)*0.019,-0.77-Math.sin(f/4*Math.PI)*0.03,0.055),0.007,6),skin,arm);
    if(side<0){mesh(new THREE.TorusGeometry(0.041,0.009,6,20).rotateX(Math.PI/2),red,arm,[side*0.06,-0.6,0.02]);mesh(new THREE.PlaneGeometry(0.022,0.22),red,arm,[side*0.1,-0.72,0.04]);}
    mesh(new THREE.SphereGeometry(1,16,12),skin,root,[side*0.10,0.055,0.04]).scale.set(0.058,0.05,0.14);
  }
  root.visible=false;
  return {root, update(t, chase=false){
    head.rotation.set(0.14+Math.sin(t*0.7)*0.025,Math.sin(t*0.31)*0.08,-0.17+Math.sin(t*0.5)*0.025);
    arms.forEach((arm,i)=>{arm.rotation.x=Math.sin(t*(chase?5:0.8)+i)*0.09;arm.rotation.z=(i?1:-1)*(chase?0.12:0.025);});
    for(let i=0;i<a.count;i++){const y=rest[i*3+1],v=Math.max(0,1-y/1.4);a.setX(i,rest[i*3]+Math.sin(t*2.2+y*6)*v*0.025);a.setZ(i,rest[i*3+2]+Math.sin(t*1.8+y*4)*v*0.025);}
    a.needsUpdate=true;
  }};
}

// Licensed rigged character. Keep the original skin weights and animation;
// normalize the wrapper rather than editing animated node transforms.
function createAnimatedGhost(assets) {
  const root = new THREE.Group();root.name='BorrowedVoice';root.visible=false;
  const model=assets.model('ghost_woman');
  const mixer=new THREE.AnimationMixer(model);
  const clips=assets.animations.ghost_woman||[];
  for(const clip of clips)mixer.clipAction(clip).play();
  mixer.update(0);model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3());
  const size=box.getSize(new THREE.Vector3()),scale=1.82/size.y;
  const wrapper=new THREE.Group();wrapper.scale.setScalar(scale);
  model.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));wrapper.add(model);root.add(wrapper);
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;o.material=o.material.clone();o.material.color.multiplyScalar(.65);o.material.roughness=Math.max(.78,o.material.roughness);o.material.envMapIntensity=.3;}});
  // A red cord at the borrowed mother's wrist is the visual identity clue.
  const cord=new THREE.Mesh(new THREE.TorusGeometry(.037,.008,7,24).rotateX(Math.PI/2),assets.mat('velour_velvet',{color:0x57120c,roughness:.95}));
  root.add(cord);const wrist=model.getObjectByName('mixamorig_LeftHand_011');
  const wristPosition=new THREE.Vector3();let last=null;
  return {root,clips,source:'Ghost Girl Animated — Shaban Hafizsalim — CC BY 4.0',update(t,chase=false){
    const dt=last===null?0:Math.min(.08,Math.max(0,t-last));last=t;
    if(!root.visible)return;
    mixer.timeScale=chase?1.25:.4;mixer.update(dt);root.updateMatrixWorld(true);
    if(wrist){wrist.getWorldPosition(wristPosition);root.worldToLocal(wristPosition);cord.position.copy(wristPosition);}
  }};
}
