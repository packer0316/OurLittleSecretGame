import * as THREE from 'three';

/** Legible, self-lit call UI; textures are drawn once rather than uploaded every frame. */
export function createPhoneScreen(scene,{x=.82,y=.866,z=-2.48,anisotropy=1}={}){
  const textures={};
  for(const state of ['idle','incoming','connected','ended']){
    const c=document.createElement('canvas');c.width=512;c.height=960;const ctx=c.getContext('2d');
    const bg=ctx.createLinearGradient(0,0,512,960);bg.addColorStop(0,'#142b43');bg.addColorStop(1,'#234b53');ctx.fillStyle=bg;ctx.fillRect(0,0,512,960);
    const text=(s,size,py,color='#f0f5ed',weight=400)=>{ctx.font=`${weight} ${size}px "Microsoft JhengHei",sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(s,256,py);};
    const circle=(cx,cy,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();};
    text(state==='idle'?'23:42':'23:47',28,58,'#cbdde1');
    if(state==='idle'){
      text('23:42',98,330);text('11 月 12 日　星期四',31,397,'#b8cbd2');text('無新訊息',35,670,'#83969e');
    }else{
      text(state==='incoming'?'來電':state==='connected'?'通話中':'通話結束',35,168,'#c8e8dc');
      text('阿哲',84,292,'#ffffff',500);text('行動電話',30,351,'#b7cdd5');
      circle(256,496,83,'#547682');text('哲',73,522,'#e1ebed');
      if(state==='incoming'){
        circle(256,761,64,'#43c58a');
        // Curved handset, with broad earpieces: recognisable without an icon font.
        ctx.save();ctx.translate(256,761);ctx.rotate(-.6);ctx.strokeStyle='#ffffff';ctx.lineWidth=13;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-23,-28);ctx.bezierCurveTo(-45,0,-5,42,25,26);ctx.stroke();
        ctx.lineWidth=18;ctx.beginPath();ctx.moveTo(-23,-28);ctx.lineTo(-15,-18);ctx.moveTo(17,17);ctx.lineTo(25,26);ctx.stroke();ctx.restore();text('接聽',38,875);
      }else{
        text(state==='connected'?'已接通':'00:00',43,718,state==='connected'?'#a5e9c7':'#aebec5');
        if(state==='connected'){circle(256,830,45,'#9c4946');ctx.strokeStyle='#ffffff';ctx.lineWidth=10;ctx.lineCap='round';ctx.beginPath();ctx.arc(256,850,24,Math.PI*1.16,Math.PI*1.84);ctx.stroke();}
      }
    }
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=anisotropy;textures[state]=texture;
  }
  // The display emits its own colours; a dark diffuse map must not multiply the emission.
  const material=new THREE.MeshStandardMaterial({color:0x000000,emissive:0xffffff,emissiveMap:textures.idle,emissiveIntensity:.06,roughness:.4});
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(.115,.21),material);screen.name='HomePhoneDisplay';screen.position.set(x,y,z);screen.rotation.x=-Math.PI/2;scene.add(screen);
  const spill=new THREE.PointLight(0x89d8d0,0,1.15,2);spill.name='HomePhoneScreenGlow';spill.position.set(x,y+.15,z);scene.add(spill);
  let mode='idle';
  const applyLight=t=>{
    const pulse=.5+.5*Math.sin(t*Math.PI/1.2);
    material.emissiveIntensity=mode==='incoming'?1.65+.3*pulse:mode==='connected'?.95:mode==='ended'?.2:.06;
    spill.intensity=mode==='incoming'?.075+.018*pulse:mode==='connected'?.035:0;
  };
  return {screen,spill,textures,get mode(){return mode;},
    setMode(next){if(!Object.hasOwn(textures,next))throw new Error(`Unknown phone screen: ${next}`);mode=next;material.emissiveMap=textures[next];screen.userData.phoneState=next;applyLight(0);},
    update:applyLight,
    dispose(){material.dispose();Object.values(textures).forEach(t=>t.dispose());},
  };
}
