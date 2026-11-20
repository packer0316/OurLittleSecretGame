import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { World } from '../../core/World.js';
import { boxGeo, mulberry32 } from '../../core/utils.js';
import { loadHandwriting, handwrittenPaper } from '../../core/handwriting.js';
import { photoMarkLocal } from '../../story/photoLayout.js';
import { createPhoneScreen } from './phoneScreen.js';
import { buildHomeDecor } from './decor.js';
import { createGlassRain } from '../../core/air.js';

/** 門縫下字條的起點（門外）與停點（門墊中央，墊子範圍 z 3.09–3.55） */
const SLIP_GAP=3.92,SLIP_REST=3.4;

export const ASSETS={textures:['dark_wood','weathered_brown_planks','painted_plaster_wall','velour_velvet'],images:['children-1998'],scans:['ghost_woman']};

/** A lived-in apartment, metres at human scale. The desk lamp is the only visible indoor light source. */
export async function create(game){
  await loadHandwriting();
  if(!THREE.UniformsLib.LTC_FLOAT_1)RectAreaLightUniformsLib.init();
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x030509);scene.fog=new THREE.FogExp2(0x080b10,.018);
  const world=new World();world.bounds={x1:-3.64,x2:3.64,z1:-3.64,z2:3.64};world.floor(-4,-4,4,4,0);
  const textures=[],materials=new Set(),rand=mulberry32(1247);
  const mat=(color,opts={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.78,...opts});materials.add(m);return m;};
  const wood=game.assets.mat('dark_wood',{color:0xb09e8c,roughness:.74});
  const floor=game.assets.mat('weathered_brown_planks',{color:0x94866f});
  const plaster=game.assets.mat('painted_plaster_wall',{color:0xd2c8b2,normalScale:new THREE.Vector2(.5,.5)});
  const ceiling=game.assets.mat('painted_plaster_wall',{color:0xdcd6c8,normalScale:new THREE.Vector2(.25,.25)}); // 天花板：平整的白色系油漆面
  const textile=game.assets.mat('velour_velvet',{color:0x7d8f92});
  [wood,floor,plaster,ceiling,textile].forEach(m=>materials.add(m));
  const black=mat(0x101512,{metalness:.45,roughness:.32}),brass=mat(0x9e7953,{metalness:.76,roughness:.38}),paper=mat(0xc0b8a1),trim=mat(0x4c514c),ceramic=mat(0xbdb8a4,{roughness:.24});
  const mesh=(g,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o;};
  const box=(w,h,d,x,y,z,m=wood,rounded=false)=>mesh(rounded?new RoundedBoxGeometry(w,h,d,2,Math.min(.035,h/4,d/4)):boxGeo(w,h,d,0,0,0,1.8),m,x,y,z);
  const cyl=(r1,r2,h,x,y,z,m=black)=>mesh(new THREE.CylinderGeometry(r1,r2,h,32),m,x,y,z);
  const rod=(a,b,r,m=black)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);const o=mesh(new THREE.CylinderGeometry(r,r,v.length(),16),m,...av.add(bv).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;};
  const printed=(lines,w,h,bg='#b4ab96',ink='#393933')=>{
    const c=document.createElement('canvas');c.width=768;c.height=Math.round(768*h/w);const ctx=c.getContext('2d');
    ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);
    for(let i=0;i<8500;i++){ctx.fillStyle=`rgba(50,35,20,${rand()*.09})`;ctx.fillRect(rand()*c.width,rand()*c.height,rand()*3,1);}
    ctx.fillStyle=ink;ctx.textAlign='left';ctx.font=`${Math.round(c.width*.056)}px "Noto Serif TC",serif`;
    lines.forEach((s,i)=>ctx.fillText(s,c.width*.09,c.height*.18+i*c.height*.14));
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);return mat(0xffffff,{map:t,roughness:.95});
  };
  const flat=(m,w,h,x,y,z,angle=0)=>{const o=mesh(new THREE.PlaneGeometry(w,h),m,x,y,z);o.rotation.set(-Math.PI/2,0,angle);o.castShadow=false;return o;};
  const handwritten=(lines,w,h,seed)=>{const map=handwrittenPaper(lines,{aspect:w/h,seed});map.anisotropy=game.assets.aniso;textures.push(map);return mat(0xffffff,{map,roughness:.95});};
  box(8,.16,8,0,-.08,0,floor);box(8,.16,8,0,3.12,0,ceiling);
  // North wall has an actual window aperture, not a luminous rectangle on a wall.
  box(8,1.12,.18,0,.56,-4,plaster);box(8,.55,.18,0,2.845,-4,plaster);
  box(3.25,1.45,.18,-2.375,1.845,-4,plaster);box(1.75,1.45,.18,3.125,1.845,-4,plaster);
  box(.18,3.2,8,-4,1.6,0,plaster);box(.18,3.2,8,4,1.6,0,plaster);box(8,3.2,.18,0,1.6,4,plaster);
  for(const z of [-3.89,3.89])box(7.8,.13,.055,0,.065,z,trim);
  for(const x of [-3.89,3.89])box(.055,.13,7.8,x,.065,0,trim);
  for(const x of [-.76,.75,2.26])box(.055,1.55,.12,x,1.84,-3.94,black);
  for(const y of [1.09,1.85,2.6])box(3.08,.045,.13,.75,y,-3.93,black);
  const glass=mat(0x345163,{transparent:true,opacity:.2,metalness:.3,roughness:.2});box(3,1.48,.025,.75,1.85,-4.01,glass);
  // Distant buildings and rain catch the cold city light beyond the glass.
  for(let i=0;i<9;i++){const x=-6+i*1.5,z=-12-rand()*5,h=3+rand()*7;box(1.2,h,1.3,x,h/2-1,z,mat(0x06090f));for(let j=0;j<4;j++)box(.14,.22,.02,x+(j%2)*.4-.2,Math.floor(j/2)*.7+.7,z+.66,mat(0x343d42,{emissive:0x394344,emissiveIntensity:.5}));}
  const rainPos=[];for(let i=0;i<180;i++){const x=-.7+rand()*2.9,y=1.12+rand()*1.4;rainPos.push(x,y,-3.905,x+.012,y+.04+rand()*.1,-3.905);}
  const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(rainPos,3));const rain=new THREE.LineSegments(rg,new THREE.LineBasicMaterial({color:0x7899ad,transparent:true,opacity:.12}));scene.add(rain);
  const cool=new THREE.PointLight(0x6e8ca6,1.25,7.5,2);cool.position.set(.75,2,-3.7);scene.add(cool);
  // 氣氛組：玻璃上往下滑的雨痕（單一平面，加色混合）
  const glassRain=createGlassRain(3,1.48,{strength:.3});glassRain.mesh.position.set(.75,1.85,-3.985);scene.add(glassRain.mesh);
  scene.add(new THREE.HemisphereLight(0xa7b7ca,0x837568,1.2));
  // Desk, drawers and a chair pulled away from the investigation path.
  box(2.6,.09,1.02,0,.79,-2.6,wood,true);world.box(-1.3,-3.11,1.3,-2.09,0,.84);
  for(const x of [-1.16,1.16])for(const z of [-2.99,-2.21])box(.09,.73,.09,x,.365,z,wood,true);
  box(.57,.52,.87,1,.49,-2.62,wood);for(let i=0;i<3;i++){box(.53,.14,.05,1,.36+i*.16,-2.16,wood,true);rod([.9,.36+i*.16,-2.12],[1.1,.36+i*.16,-2.12],.012,brass);}
  const chair= new THREE.Group();scene.add(chair);
  const chairPart=(o)=>{scene.remove(o);chair.add(o);return o;};
  chairPart(box(.54,.12,.53,0,.47,0,textile,true));chairPart(box(.54,.55,.09,0,.8,.25,textile,true));for(const x of [-.21,.21])for(const z of [-.2,.2])chairPart(box(.045,.4,.045,x,.2,z,black));chair.position.set(-1.8,0,-1.15);chair.rotation.y=-.4;world.circle(-1.8,-1.15,.4,0,1.1);const chairCollider=world.circles.at(-1);
  // Articulated green desk lamp. Actual bulb sits within the open underside.
  cyl(.17,.19,.035,-.87,.855,-2.83);rod([-.87,.87,-2.83],[-.85,1.29,-2.83],.025,brass);rod([-.85,1.29,-2.83],[-.55,1.57,-2.7],.022,black);
  const shade=mesh(new THREE.CylinderGeometry(.12,.26,.21,40,1,true),mat(0x244238,{metalness:.5,side:THREE.DoubleSide}),-.55,1.51,-2.7);
  cyl(.06,.06,.025,-.55,1.42,-2.7,mat(0xffe3ad,{emissive:0xffc572,emissiveIntensity:2.4}));
  const LAMP=3.1;const lamp=new THREE.SpotLight(0xffd09a,LAMP,9,1.08,.63,1.5);lamp.position.set(-.55,1.425,-2.7);lamp.target.position.set(0,.7,-2.3);lamp.castShadow=true;lamp.shadow.mapSize.set(2048,2048);lamp.shadow.bias=-.0003;lamp.shadow.normalBias=.015;scene.add(lamp,lamp.target);
  const bounce=new THREE.PointLight(0xffc680,2.4,7,2);bounce.position.set(-.4,1.65,-1.9);scene.add(bounce);
  // Grounded paper layers, handwritten address, folded envelope flap and photo.
  for(let i=0;i<4;i++)flat(paper,.3,.4,-.65+i*.01,.842+i*.002,-2.28+i*.015,-.17);
  const letter=flat(handwritten(['陳以安　收','照片先還你。','02:47，聽到這裡再停。','阿哲'],.42,.29,247),.42,.29,-.08,.85,-2.37,.12);letter.name='HomeHandwrittenLetter';
  const flap=flat(printed([],.42,.14),.42,.14,-.08,.849,-2.6,-.08);
  const photo=flat(mat(0xffffff,{map:game.assets.images['children-1998'],roughness:.65}),.38,.285,.38,.852,-2.42,-.12);
  photo.name='HomeEvidencePhoto';
  const markTexture=await new THREE.TextureLoader().loadAsync(import.meta.env.BASE_URL+'assets/story/photo-defacement.svg');markTexture.colorSpace=THREE.SRGBColorSpace;markTexture.anisotropy=game.assets.aniso;textures.push(markTexture);
  const layout=photoMarkLocal(.38,.285);
  const mark=new THREE.Mesh(new THREE.PlaneGeometry(layout.width,layout.height),mat(0xffffff,{map:markTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
  mark.name='PhotoFaceDefacement';mark.position.set(layout.x,layout.y,.0004);photo.add(mark);
  // Telephone body, bezel, screen, speaker grill and charging wire.
  box(.13,.02,.255,.82,.854,-2.48,black,true);
  const phone=createPhoneScreen(scene,{anisotropy:game.assets.aniso});rod([.79,.868,-2.595],[.85,.868,-2.595],.003,black);
  const cablePoints=[[.82,.85,-2.35],[.85,.83,-2.05],[1.4,.1,-1.95],[1.8,.02,-2.7],[3.7,.04,-3.4]].map(p=>new THREE.Vector3(...p));mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePoints),32,.007,6,false),black);
  // Cup with dark tea, handle and coffee-ring stain.
  cyl(.065,.058,.12,-.45,.91,-2.79,ceramic);cyl(.056,.056,.002,-.45,.967,-2.79,mat(0x241b10,{roughness:.1}));const handle=mesh(new THREE.TorusGeometry(.041,.009,8,22),ceramic,-.37,.92,-2.79);handle.rotation.y=Math.PI/2;
  const ring=mesh(new THREE.RingGeometry(.069,.074,40),mat(0x38251b,{transparent:true,opacity:.5,side:THREE.DoubleSide}),-.23,.843,-2.84);ring.rotation.x=-Math.PI/2;
  for(let i=0;i<3;i++)rod([-.94+i*.03,.856,-2.25],[-.7+i*.03,.856,-2.14],.005,i===1?brass:black);
  // Books, shelf, sofa with uneven cushions, a switched-off television.
  box(.78,1.95,.42,-3.55,.98,-2.65,wood);for(let i=0;i<4;i++)box(.8,.055,.47,-3.55,.27+i*.48,-2.65,wood);
  for(let i=0;i<24;i++){const x=-3.84+(i%6)*.105,y=.28+Math.floor(i/6)*.48;box(.07,.22+rand()*.13,.26,x,y+.16,-2.58,mat([0x394644,0x594b36,0x4a3430,0x686353][i%4]));}
  world.box(-3.96,-2.91,-3.12,-2.4,0,2);
  box(.9,.38,2.3,-3.35,.27,.65,textile,true);box(.22,.65,2.35,-3.75,.59,.65,textile,true);for(const z of [-.48,1.78])box(.9,.23,.17,-3.35,.59,z,textile,true);
  for(let i=0;i<3;i++){const c=box(.67,.16,.67,-3.23,.5,-.07+i*.72,textile,true);c.rotation.y=(rand()-.5)*.035;}
  const pillow=box(.18,.42,.5,-3.5,.83,.2,mat(0x585648),true);pillow.rotation.z=-.2;world.box(-3.9,-.6,-2.85,1.93,0,1.05);
  box(.48,.5,1.5,3.63,.25,-.7,wood);box(.065,.83,1.32,3.72,1,-.7,black,true);box(.018,.73,1.2,3.679,1,-.7,mat(0x11151a,{metalness:.45,roughness:.18}));world.box(3.3,-1.5,4,.1,0,1.5);
  // Calendar's date and an unfinished voicemail are optional, persistent clues.
  const cal=mesh(new THREE.PlaneGeometry(.48,.65),printed(['NOVEMBER　2026','','12　星期四','','阿哲　別忘了回電'],.48,.65),-2.4,1.65,-3.89);
  box(.52,.71,.025,-2.4,1.65,-3.92,wood);
  // Soft light reflected into the entryway makes the cabinet and its items visible.
  const entryFill=new THREE.RectAreaLight(0xe1c8aa,6,1.8,1.15);
  entryFill.position.set(1.65,2.65,2.1);
  entryFill.lookAt(2.45,.2,3.25);
  scene.add(entryFill);
  box(.72,.45,.52,2.95,.225,2.7,wood,true);world.box(2.59,2.44,3.31,2.96,0,.46);
  const kit=new THREE.Group();scene.add(kit);
  const flashlight=mesh(new THREE.CylinderGeometry(.045,.03,.22,20),trim,2.86,.5,2.7);flashlight.rotation.z=Math.PI/2;kit.attach(flashlight);
  const key=mesh(new THREE.TorusGeometry(.035,.005,8,20),brass,3.06,.458,2.65);key.rotation.x=-Math.PI/2;kit.attach(key);kit.attach(rod([3.06,.46,2.67],[3.06,.46,2.78],.008,brass));
  // A heavy entrance door, peephole, hinges, letter slot and bolted chain.
  box(1.08,2.19,.09,1.65,1.125,3.86,wood,true);for(const x of [1.08,2.22])box(.08,2.32,.17,x,1.16,3.81,trim);box(1.22,.08,.17,1.65,2.3,3.81,trim);
  const threshold=box(1.02,.012,.012,1.65,.013,3.801,mat(0xe4c190,{emissive:0xb89459,emissiveIntensity:.6}));
  const hallSpill=new THREE.RectAreaLight(0xdbb57f,12,1.02,.022);hallSpill.position.set(1.65,.025,3.8);hallSpill.lookAt(1.65,0,2.5);scene.add(hallSpill);
  const peep=cyl(.018,.018,.035,1.65,1.57,3.794,brass);peep.rotation.x=Math.PI/2;
  const doorHandle=rod([2.04,1.02,3.79],[2.04,.92,3.79],.026,brass);box(.35,.055,.018,1.65,.38,3.799,brass);
  for(let i=0;i<14;i++){const c=mesh(new THREE.TorusGeometry(.012,.003,6,10),brass,1.14+i*.013,1.44-Math.sin(i/13*Math.PI)*.035,3.78);c.rotation.y=i%2*Math.PI/2;}
  const slip=flat(handwritten(['照片收到，請回答。','','七樓　七樓'],.32,.22,448),.32,.22,1.6,.0095,SLIP_REST,.15);slip.visible=false;
  Object.assign(slip.material,{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  // 字條路徑：門縫下要高過發光門檻（頂面 y≈.019、門板底 .03），滑進來後落在門墊（y=.006）上方 3.5mm，整張停在墊子範圍內，不與墊子共面
  const poseSlip=u=>{const ease=u*u*(3-2*u),z=SLIP_GAP*(1-ease)+SLIP_REST*ease,lift=THREE.MathUtils.smoothstep(z,3.56,3.66);slip.position.set(1.6,.0095+.0115*lift,z);slip.rotation.z=-.06+.21*ease;};
  const shoe=mat(0x272321);for(let i=0;i<2;i++)box(.11,.08,.26,1.0+i*.17,.04,3.35,shoe,true);
  // Fine dust suspended in the lamp cone, without screen-space noise cards.
  const dustData=[];for(let i=0;i<100;i++)dustData.push(-1+rand()*2,.9+rand()*1.2,-3+rand()*1.6);
  const dustG=new THREE.BufferGeometry();dustG.setAttribute('position',new THREE.Float32BufferAttribute(dustData,3));const dust=new THREE.Points(dustG,new THREE.PointsMaterial({size:.006,color:0xddc2a1,transparent:true,opacity:.18,depthWrite:false}));scene.add(dust);
  // 場景美術：床、衣櫃、冰箱、窗簾、地毯等生活陳設（合併成五個網格）與牆面的使用痕跡
  const decor=buildHomeDecor({scene,world,mats:{wood,textile,plaster,floor}});
  const targets=[['letter','查看阿哲寄來的信封',[-.08,.9,-2.37]],['photo','端詳舊合照',[.38,.91,-2.42]],['phone','查看手機',[.82,.91,-2.48]],['calendar','查看牆上月曆',[-2.4,1.65,-3.87]],['window','聽窗外的雨',[.75,1.8,-3.82]],['message','聽尚未送出的語音',[-.65,.89,-2.28]],['slip','撿起門縫下的字條',[1.6,.08,SLIP_REST]],['kit','拿起手電筒與鑰匙',[2.95,.55,2.7]],['door','查看門外',[1.65,1.3,3.75]]].map(([id,label,p])=>({id,label,position:new THREE.Vector3(...p)}));
  let step=0,doorEvent=null,photoPlacement=null,phoneAnswered=false,chairMoved=false,chairMotion=0;
  const photoHome=new THREE.Vector3(.38,.852,-2.42),letterHome=new THREE.Vector3(-.08,.85,-2.37),letterAside=new THREE.Vector3(-.35,.85,-2.49);
  const photoTarget=targets.find(t=>t.id==='photo'),letterTarget=targets.find(t=>t.id==='letter');
  const syncDeskTargets=()=>{photoTarget.position.copy(photo.position).y+=.045;letterTarget.position.copy(letter.position).y+=.045;};
  game.audio.profile='home';game.audio.released=false;
  game.film.uniforms.grain.value=.026;game.film.uniforms.aberration.value=.0012;
  const storyWorld={targets,
    phone,
    answerPhone(){phoneAnswered=true;phone.setMode('connected');targets.find(t=>t.id==='phone').label='通話中的手機';},
    get photoPlacementActive(){return !!photoPlacement;},
    get photoPlacementTime(){return photoPlacement?.time??null;},
    placePhoto(done){
      photoPlacement={time:0,done,yaw:game.player.yaw,pitch:game.player.pitch};photo.visible=true;
      photo.position.copy(letterHome);photo.position.y=.857;photo.rotation.z=.12;letter.position.copy(letterHome);syncDeskTargets();
    },
    get doorEventActive(){return !!doorEvent;},
    get doorEventTime(){return doorEvent?.time??null;},
    get slipPosition(){return slip.position;},
    startDoorEvent(){doorEvent={time:0,knocks:0,slideTime:null};slip.visible=false;poseSlip(0);},
    setState(s){step=s.home?.step||0;if(!doorEvent){slip.visible=step>=3;poseSlip(1);}kit.visible=step<5;
      if(!photoPlacement){photo.visible=step>=1;photo.position.copy(photoHome);photo.rotation.z=-.12;letter.position.copy(step>=1?letterAside:letterHome);syncDeskTargets();}
      mark.visible=!s.flags.sent;
      phone.setMode(step===2?(phoneAnswered?'connected':'incoming'):step>2?'ended':'idle');
      targets.find(t=>t.id==='phone').label=phone.mode==='incoming'?'接聽阿哲來電':phone.mode==='connected'?'通話中的手機':step>2?'查看通話紀錄':'查看手機';
    }
  };
  return {id:'home',scene,world,storyWorld,spawn:{x:0,z:-.5,yaw:0,pitch:-.35},flashOn:false,flashAvailable:false,
    zoneName:p=>p.z>1.7?'住處・玄關':'住處・深夜的書桌',indoorAt:()=>true,surfaceAt:()=> 'wood',
    setQuality(q){lamp.shadow.mapSize.set(Math.min(2048,q.shadow),Math.min(2048,q.shadow));game.film.uniforms.grain.value=.026;game.film.uniforms.aberration.value=.0012;},
    update(dt,t){
      rain.position.y=-((t*.07)% .16);dust.position.y=Math.sin(t*.1)*.05;lamp.intensity=LAMP*(step>=3?1-.012*Math.sin(t*17):1);glassRain.update(t);{const p=game.player.pos;game.audio.windowNear=Math.max(0,Math.min(1,1-(Math.hypot(p.x-.75,p.z+4)-1.3)/4.5));}if(step<5)game.player.flashOn=false;
      phone.update(t);
      if(photoPlacement&&game.running&&!game.story?.modal){
        const a=photoPlacement;a.time+=dt;const u=Math.min(1,a.time/1.15),ease=u*u*(3-2*u);
        photo.position.lerpVectors(letterHome,photoHome,ease);photo.position.y=.852+Math.sin(u*Math.PI)*.065;
        photo.rotation.z=.12-.24*ease;letter.position.lerpVectors(letterHome,letterAside,ease);syncDeskTargets();
        const p=game.player,dx=photoHome.x-p.pos.x,dz=photoHome.z-p.pos.z,dy=photoHome.y-p.pos.y-p.eye,yaw=Math.atan2(-dx,-dz);
        p.yaw=a.yaw+Math.atan2(Math.sin(yaw-a.yaw),Math.cos(yaw-a.yaw))*ease;p.pitch=THREE.MathUtils.lerp(a.pitch,Math.atan2(dy,Math.hypot(dx,dz)),ease);p._syncCamera(0);
        if(u===1){photoPlacement=null;photo.position.copy(photoHome);letter.position.copy(letterAside);syncDeskTargets();a.done?.();}
      }
      if(game.running&&!game.story?.modal&&step>=4&&!chairMoved){
        chairMotion+=dt;
        if(chairMotion>1.2){
          chair.position.z=Math.min(-.75,chair.position.z+dt*.3);chairCollider.z=chair.position.z;
          if(chairMotion-dt<=1.2)game.audio.presence(-.65);
          if(chair.position.z>=-.75){chairMoved=true;game.story?.toast('書桌旁傳來拖椅聲。那裡剛才沒有人。');}
        }
      }
      if(doorEvent&&game.running&&!game.story?.modal){
        const e=doorEvent;e.time+=dt;
        hallSpill.intensity=e.time>1.8&&e.time<3.1?2:12;
        doorHandle.rotation.z=e.time>1.8&&e.time<3.1?Math.sin((e.time-1.8)/1.3*Math.PI)*.8:0;
        const knockTimes=[.15,.85,1.8];while(e.knocks<3&&e.time>=knockTimes[e.knocks]){game.audio.doorKnock(e.knocks===2?.65:1);e.knocks++;}
        const near=Math.hypot(game.player.pos.x-1.65,game.player.pos.z-3.6)<2.5;
        if(e.time>=2.5&&near&&e.slideTime===null)e.slideTime=0;
        if(e.slideTime!==null){e.slideTime+=dt;slip.visible=true;poseSlip(Math.min(1,e.slideTime/2.2));}
        if(e.slideTime>=2.5){doorEvent=null;doorHandle.rotation.z=0;poseSlip(1);hallSpill.intensity=12;game.story?.toast('敲門聲停了。紙從門縫滑進來，正好停在你腳前。');}
      }
    },
    dispose(){game.audio.profile=null;game.film.uniforms.grain.value=.03;game.film.uniforms.aberration.value=.0012;scene.traverse(o=>{o.geometry?.dispose();o.shadow?.map?.dispose();});materials.forEach(m=>m.dispose());rain.material.dispose();dust.material.dispose();glassRain.dispose();decor.dispose();textures.forEach(t=>t.dispose());phone.dispose();},
  };
}
