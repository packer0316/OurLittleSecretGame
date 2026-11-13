import * as THREE from 'three';
import { mulberry32, noise2 } from '../../core/utils.js';

// Authored torn cloth, animated at the vertices. The top seam is pinned;
// waves travel down the fabric and different strips lag behind the same gust.
// All geometry, including holes and frayed threads, also casts matching shadows.
export function createClothSystem() {
  const pieces=[];
  let lastTime=-Infinity;
  const cameraPosition=new THREE.Vector3(),worldPosition=new THREE.Vector3();

  function make({width:w,height:h,material,seed=1,fold=.055,gather=0,scallops=0,exposure=.65,amplitude=null}) {
    const rng=mulberry32(seed),phase=rng()*Math.PI*2;
    const nx=Math.min(100,Math.max(w<.2?8:16,Math.ceil(w*13)));
    const ny=Math.min(42,Math.max(20,Math.ceil(h*11)));
    const holes=Array.from({length:w<.2?1:Math.min(9,2+Math.floor(w*1.5))},()=>({
      u:.14+rng()*.72,v:.22+rng()*.46,rx:(w<.2?.10:.035)+rng()*.045,ry:.035+rng()*.065,phase:rng()*6,
    }));
    const cuts=Array.from({length:Math.max(2,Math.min(10,Math.ceil(w*2)))},()=>({
      u:.05+rng()*.9,r:.018+rng()*.045,depth:.12+rng()*.3,
    }));
    const positions=[],uvs=[],colors=[],weights=[],indices=[];
    function hem(u){
      let height=.91+.07*noise2(u*19,seed*.13);
      for(const cut of cuts){const d=Math.abs(u-cut.u)/cut.r;if(d<1)height-=Math.pow(1-d*d,.35)*cut.depth;}
      return Math.max(.48,height);
    }
    function shape(u,v) {
      const scallop=scallops?Math.abs(Math.sin(u*Math.PI*scallops))*.32:0;
      const edge=(Math.sin(v*38+phase)*.008+Math.sin(v*91+phase)*.004)*Math.pow(Math.abs(u-.5)*2,8)*v;
      let x=(u-.5)*w*(1-gather*Math.sin(v*Math.PI)*.8)+edge*w;
      const y=-v*h*(1-scallop);
      const z=Math.sin(u*w*8.7+phase)*fold*(.3+v*.85)+Math.sin(u*w*19+phase)*fold*.22;
      return [x,y,z];
    }
    function vertex(u,v,p) {
      positions.push(...p);uvs.push(u*Math.max(.18,w*.7),(1-v)*h*.7);weights.push(u,v);
      const soot=noise2(u*7+seed,v*6),streak=noise2(u*29+seed,v*1.8);
      const fade=.48+soot*.33+streak*.19;
      const frayed=v>.92?.12:0;
      colors.push(Math.min(1,fade+frayed),Math.min(1,fade*.84+frayed),Math.min(1,fade*.72+frayed));
      return positions.length/3-1;
    }
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const u=i/nx,v=j/ny,p=shape(u,v);
      if(i>0&&i<nx&&j>0&&j<ny){p[0]+=(rng()-.5)*w/nx*.3;p[1]+=(rng()-.5)*h/ny*.25;}
      vertex(u,v,p);
    }
    function hole(u,v){return v>hem(u)||holes.some(o=>{
      const x=(u-o.u)/o.rx,y=(v-o.v)/o.ry,a=Math.atan2(y,x);
      return x*x+y*y<1+.23*Math.sin(a*5+o.phase)+.13*Math.cos(a*9);
    });}
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;
      if(!hole((i+.33)/nx,(j+.33)/ny))indices.push(a,c,b);
      if(!hole((i+.67)/nx,(j+.67)/ny))indices.push(b,c,d);
    }
    // Project cut edges onto their irregular contour. Simply deleting grid cells
    // leaves conspicuous stair steps, especially on cloth close to the camera.
    const edges=new Map();
    for(let i=0;i<indices.length;i+=3)for(const [a,b] of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]){
      const key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)||0)+1);
    }
    const boundary=new Set();for(const [edge,count] of edges)if(count===1)for(const id of edge.split(':'))boundary.add(+id);
    const reach=Math.hypot(w/nx,h/ny)*1.8;
    for(const id of boundary){
      const u=weights[id*2],v=weights[id*2+1];if(v<.12)continue;
      if((u===0||u===1)&&v<hem(u)-2/ny)continue;
      let best=Infinity,bu=u,bv=v;
      const candidate=(a,b)=>{const d=Math.hypot((a-u)*w,(b-v)*h);if(d<best){best=d;bu=a;bv=b;}};
      for(let k=-8;k<=8;k++){const a=Math.max(0,Math.min(1,u+k/(nx*4)));candidate(a,hem(a));}
      for(const o of holes){const a=Math.atan2((v-o.v)/o.ry,(u-o.u)/o.rx),r=Math.sqrt(1+.23*Math.sin(a*5+o.phase)+.13*Math.cos(a*9));candidate(o.u+Math.cos(a)*o.rx*r,o.v+Math.sin(a)*o.ry*r);}
      if(best>reach)continue;
      const p=shape(bu,bv);for(let axis=0;axis<3;axis++){positions[id*3+axis]=p[axis];colors[id*3+axis]*=.78;}
      weights[id*2]=bu;weights[id*2+1]=bv;uvs[id*2]=bu*Math.max(.18,w*.7);uvs[id*2+1]=(1-bv)*h*.7;
    }
    // Fine loose fibers around holes share the same wind deformation as the fabric.
    for(const id of boundary){
      const u=weights[id*2],v=weights[id*2+1];if(v<.2||v>hem(u)-.06||u<.02||u>.98||rng()>.24)continue;
      const p=positions.slice(id*3,id*3+3),thread=Math.min(.002,w*.006),length=Math.min(.09,h*.06)*(.3+rng()*.7);
      const a=vertex(u,v,[p[0]-thread,p[1],p[2]]),b=vertex(u,v,[p[0]+thread,p[1],p[2]]),c=vertex(u,v+.015,[p[0]+length*.15,p[1]-length,p[2]+.003]);indices.push(a,c,b);
    }
    // Uneven individual threads on the surviving hem, not identical saw teeth.
    for(let i=0;i<nx*2;i++){
      if(rng()<.25)continue;const u=(i+.2+rng()*.6)/(nx*2),v=(Math.floor(hem(u)*ny)-.4)/ny;if(hole(u,v))continue;
      const p=shape(u,v),length=Math.min(.19,h*.13)*(.3+rng()*.7),thread=Math.min(.003,w*.007);
      const a=vertex(u,v,[p[0]-thread,p[1],p[2]]),b=vertex(u,v,[p[0]+thread,p[1],p[2]]),c=vertex(u,v+.035,[p[0]+(rng()-.5)*length*.25,p[1]-length,p[2]+.008]);indices.push(a,c,b);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
    geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    const mat=material.clone();mat.vertexColors=true;mat.roughness=1;mat.side=THREE.DoubleSide;mat.shadowSide=THREE.DoubleSide;
    const mesh=new THREE.Mesh(geo,mat);mesh.name='WeatheredCloth';mesh.castShadow=true;mesh.receiveShadow=true;
    const strength=amplitude??Math.min(.34,Math.max(.035,h*.105))*exposure;
    geo.computeBoundingBox();geo.boundingBox.expandByScalar(strength*1.5);geo.computeBoundingSphere();geo.boundingSphere.radius+=strength*1.5;
    const piece={mesh,rest:Float32Array.from(positions),weights:Float32Array.from(weights),phase,strength,normalTick:0};pieces.push(piece);
    mesh.userData.cloth={seed,pinnedTop:true,holes:holes.length};return mesh;
  }

  function update(time,camera,{force=false}={}) {
    if(!force&&time>=lastTime&&time-lastTime<1/30)return;lastTime=time;
    camera?.getWorldPosition(cameraPosition);
    for(const piece of pieces){
      const {mesh,rest,weights,phase,strength}=piece;
      let visible=true;for(let p=mesh;p;p=p.parent)if(!p.visible){visible=false;break;}
      if(!visible&&!force)continue;
      mesh.getWorldPosition(worldPosition);if(camera&&worldPosition.distanceToSquared(cameraPosition)>75*75&&!force)continue;
      const spatial=worldPosition.x*.075+worldPosition.z*.045;
      const gust=.35+.65*Math.pow(.5+.5*Math.sin(time*.43+spatial),2);
      const slow=Math.sin(time*.76+spatial);
      const attr=mesh.geometry.attributes.position;
      for(let i=0;i<attr.count;i++){
        const u=weights[i*2],v=weights[i*2+1],free=Math.min(1,v)*Math.min(1,v),a=strength*free;
        const wave=time*1.48-v*4.6+phase+u*1.8;
        const ripple=time*3.15-v*10.5+u*8.2+phase*.7;
        attr.setXYZ(i,
          rest[i*3]+a*(slow*.26+Math.sin(wave-.8)*.18)*gust,
          rest[i*3+1]+a*(.04+.08*(.5+.5*Math.cos(wave))),
          rest[i*3+2]+a*(slow*.44+Math.sin(wave)*.58+Math.sin(ripple)*.15)*gust);
      }
      attr.needsUpdate=true;
      if(force||piece.normalTick++%2===0)mesh.geometry.computeVertexNormals();
    }
  }
  return {make,update,pieces};
}
