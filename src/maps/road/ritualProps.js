import * as THREE from 'three';
import { mulberry32 } from '../../core/utils.js';

/** Fictional adult ritual remains. Hand scan is credited in CREDITS; other geometry is authored here. */
export function buildRitualProps(scene,{x=8,y=.94,z=-19,handModel=null}={}){
  const root=new THREE.Group();root.name='AdultRitualRemains';root.position.set(x,y,z);scene.add(root);
  const rng=mulberry32(1988),c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
  ctx.fillStyle='#827366';ctx.fillRect(0,0,256,256);
  for(let i=0;i<16000;i++){const a=rng()*.2;ctx.fillStyle=`rgba(${rng()>.5?'25,13,9':'165,143,120'},${a})`;ctx.fillRect(rng()*256,rng()*256,.5+rng()*2,.5+rng()*2);}
  for(let i=0;i<65;i++){ctx.strokeStyle=`rgba(72,18,14,${rng()*.4})`;ctx.lineWidth=.4+rng()*2;ctx.beginPath();let px=rng()*256,py=rng()*256;ctx.moveTo(px,py);for(let j=0;j<8;j++){px+=rng()*16-8;py+=rng()*14;ctx.lineTo(px,py);}ctx.stroke();}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const skin=new THREE.MeshStandardMaterial({color:0x6d5c4b,map:tex,bumpMap:tex,bumpScale:.003,roughness:.62});
  const burned=new THREE.MeshStandardMaterial({color:0x27100a,map:tex,bumpMap:tex,bumpScale:.014,roughness:.96});
  const flesh=new THREE.MeshStandardMaterial({color:0x87342b,map:tex,bumpMap:tex,bumpScale:.008,roughness:.66});
  const blood=new THREE.MeshStandardMaterial({color:0x240605,map:tex,roughness:.46,transparent:true,opacity:.84,depthWrite:false});
  const bone=new THREE.MeshStandardMaterial({color:0x665943,roughness:.96});
  const nail=new THREE.MeshStandardMaterial({color:0x4a3a28,roughness:.4});
  const add=(g,m,p,parent=root)=>{const o=new THREE.Mesh(g,m);o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const distress=g=>{const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=1+.09*Math.sin(x*9+y*5)*Math.sin(z*8-x*3)+.035*Math.sin(y*29+z*13);p.setXYZ(i,x*k,y*k,z*k);}g.computeVertexNormals();return g;};
  const ellipsoid=(p,s,m,parent=root)=>{const g=new THREE.SphereGeometry(1,32,20);if(m===flesh||m===burned)distress(g);const o=add(g,m,p,parent);o.scale.set(...s);return o;};
  const segment=(a,b,r1,r2,m,parent=root)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const o=add(new THREE.CylinderGeometry(r2,r1,d.length(),18,3),m,av.add(bv).multiplyScalar(.5).toArray(),parent);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;};
  const hand=new THREE.Group();hand.name='SeveredAdultHand';hand.rotation.y=-.36;hand.position.set(-.45,.045,.05);root.add(hand);
  ellipsoid([0,0,0],[.071,.027,.1],skin,hand);
  // The four fingers have individual joint positions, taper and uneven curling.
  for(let i=0;i<4;i++){
    const fx=(i-1.5)*.033,len=[.13,.15,.14,.105][i],base=[fx,0,-.07];
    const mid=[fx+(i-1.5)*.005,.014,-.07-len*.53],tip=[fx+(i-1.5)*.009,-.005,-.07-len];
    segment(base,mid,.014,.012,skin,hand);ellipsoid(mid,[.013,.015,.014],skin,hand);segment(mid,tip,.012,.0085,skin,hand);
    ellipsoid(tip,[.009,.009,.012],skin,hand);ellipsoid([tip[0],tip[1]+.007,tip[2]+.009],[.006,.002,.012],nail,hand);
  }
  segment([-.055,0,.02],[-.105,.01,-.025],.022,.016,skin,hand);segment([-.105,.01,-.025],[-.125,-.006,-.07],.016,.011,skin,hand);
  segment([0,0,.06],[.01,.005,.36],.045,.062,burned,hand);
  const wound=ellipsoid([.01,.005,.36],[.06,.035,.016],flesh,hand);wound.name='WristWound';
  for(const bx of [-.014,.02])ellipsoid([bx,.012,.376],[.009,.01,.02],bone,hand);
  for(let i=0;i<8;i++)segment([rng()*.07-.025,.004,.37],[rng()*.1-.04,-.015,.41+rng()*.06],.004,.0015,flesh,hand);
  if(handModel){
    // Preserve the licensed scan's UVs and natural anatomy, then normalise to adult scale.
    hand.visible=false;const pivot=new THREE.Group();pivot.name='ScannedRitualHand';root.add(pivot);
    handModel.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(handModel),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=.38/Math.max(size.x,size.z);
    handModel.scale.multiplyScalar(scale);handModel.position.sub(center.multiplyScalar(scale));handModel.position.y+=size.y*scale*.5;
    handModel.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color.multiplyScalar(.68);o.material.roughness=.94;}});
    pivot.add(handModel);pivot.position.set(-.43,.004,.06);pivot.rotation.y=.35;
  }
  // A blackened lower leg with an ankle and recognisable heel/foot, laid sideways.
  const leg=new THREE.Group();leg.name='CharredAdultLowerLeg';leg.position.set(.3,.085,-.02);leg.rotation.y=.48;root.add(leg);
  const profile=[[.058,0],[.07,.04],[.083,.13],[.079,.2],[.063,.29],[.044,.39],[.038,.48]].map(([r,y])=>new THREE.Vector2(r,y));
  const shin=new THREE.LatheGeometry(profile,40);const pp=shin.attributes.position;
  for(let i=0;i<pp.count;i++){const px=pp.getX(i),py=pp.getY(i),pz=pp.getZ(i);const k=1+.055*Math.sin(py*58+Math.atan2(px,pz)*7);pp.setXYZ(i,px*k*.77+Math.sin(py*7)*.012,py+Math.sin(Math.atan2(px,pz)*5)*.006,pz*k);}
  shin.rotateX(-Math.PI/2);shin.computeVertexNormals();add(shin,burned,[0,0,.26],leg);ellipsoid([.01,.005,-.23],[.051,.056,.058],burned,leg);
  ellipsoid([.015,-.005,-.31],[.053,.045,.12],burned,leg);
  for(let i=0;i<5;i++)ellipsoid([-.028+i*.019,-.005,-.405+Math.abs(i-1)*.007],[.013-i*.001,.025,.034],burned,leg);
  ellipsoid([0,0,.26],[.064,.055,.022],flesh,leg);ellipsoid([0,.006,.28],[.019,.019,.022],bone,leg);
  // Unnatural tissue connected by thread-like strands; the flesh moves, the bones do not.
  const tissue=new THREE.Group();tissue.name='BorrowedVoiceTissue';tissue.position.set(.02,.03,.14);root.add(tissue);
  for(let i=0;i<13;i++)ellipsoid([rng()*.26-.13,rng()*.055,rng()*.25-.1],[.028+rng()*.03,.016+rng()*.02,.03+rng()*.04],flesh,tissue);
  for(let i=0;i<7;i++){const points=[[rng()*.15-.08,.016,rng()*.1],[rng()*.2-.1,.025,rng()*.2],[rng()*.25-.12,.004,.21]].map(p=>new THREE.Vector3(...p));add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),20,.0025,7,false),flesh,[0,0,0],tissue);}
  const pools=[];
  for(const [px,pz,s]of [[-.42,.16,.3],[.38,.08,.37],[.06,.32,.24]]){
    const phase=rng()*6.28,shape=new THREE.Shape();for(let i=0;i<=96;i++){const a=i/96*Math.PI*2,r=s*(.78+.1*Math.sin(a*3+phase)+.06*Math.sin(a*7-phase)),xx=Math.cos(a)*r,zz=Math.sin(a)*r*.6;if(i===0)shape.moveTo(xx,zz);else shape.lineTo(xx,zz);}const p=add(new THREE.ShapeGeometry(shape),blood,[px,-.002,pz]);p.rotation.x=-Math.PI/2;pools.push(p);
  }
  return {root,update(t){tissue.scale.y=1+Math.sin(t*.85)*.035;},dispose(){tex.dispose();[skin,burned,flesh,blood,bone,nail].forEach(m=>m.dispose());handModel?.traverse(o=>{if(o.isMesh)o.material.dispose();});}};
}
