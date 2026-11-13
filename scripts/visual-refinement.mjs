import {chromium} from 'playwright-core';
import fs from 'node:fs';
const out='artifacts/refinement-20261113';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1366,height:850}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=async(name,fn)=>{try{const detail=await fn();results.push({name,pass:true,detail});console.log('PASS',name,detail||'');}catch(e){results.push({name,pass:false,error:String(e)});console.log('FAIL',name,String(e));}};
const aim=async(pos,target)=>page.evaluate(([pos,target])=>{
  const g=window.__game;g.stop();const dx=target[0]-pos[0],dz=target[2]-pos[2],dy=target[1]-(pos[1]+1.66);g.player.teleport(...pos,Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz)));
  for(let n=0;n<35;n++)g.map.update(.1,12,g.player);g.time=12;g.map.cloth.update(12,g.camera,{force:true});g.renderOnce();
},[pos,target]);
const shot=async name=>{await page.waitForTimeout(250);await page.evaluate(()=>window.__game.renderOnce());await page.screenshot({path:`${out}/${name}.png`});};
try{
  await page.goto('http://127.0.0.1:5178/?auto&map=temple');await page.waitForFunction(()=>window.__game?.story&&window.__game.running,null,{timeout:180000});
  await page.locator('.story-figure').screenshot({path:out+'/01-photo-mark.png'});
  await check('photo defacement restores after true ending',async()=>{const count=await page.locator('.photo-scribble').count();await page.evaluate(()=>{const s=window.__game.story;s.state.flags.sent=true;s.document('photo');});if(count!==1||await page.locator('.photo-scribble').count()!==0)throw Error('photo restoration');await page.evaluate(()=>{const s=window.__game.story;s.state.flags.sent=false;s.modal=null;document.getElementById('story-layer').classList.add('hidden');});});
  await page.addStyleTag({content:'#hud { visibility:hidden!important; }'});
  await aim([1.0,.02,16.8],[.9,.75,13]);await shot('02-candle-notice');
  await aim([23,.02,7.2],[23,1.65,-1.8]);await shot('03-stage-wide');
  await aim([23,.58,.7],[23,1.48,-2.4]);await shot('04-stage-frame');
  await check('stage memory can be inspected from the open center aisle',async()=>{return await page.evaluate(()=>{const g=window.__game;g.story.state.chapter=3;g.story.state.flags.incense=true;g.story.sync();if(g.story.focused()?.id!=='stage')throw Error('stage target blocked');return g.story.focused().id;});});
  await check('ghost clears the stage table and can reach the aisle',async()=>{return await page.evaluate(()=>{const g=window.__game;g.story.beginChase('stage');const p=g.map.storyWorld.ghost.root.position;for(let i=0;i<180&&g.story.chase&&p.z<=-.8;i++)g.story.update(1/60);if(p.z<=-.8)throw Error(`ghost stuck at ${p.x},${p.z}`);g.story.endChase(false);return {x:p.x,z:p.z};});});
  await aim([5.7,.9,-23],[8.1,4.1,-29.25]);await shot('05-torn-cloth');
  await check('cloth has anchored seams and independently deforming hems',async()=>await page.evaluate(()=>{
    const c=window.__game.map.cloth;const visible=c.pieces.filter(p=>{let o=p.mesh;while(o){if(!o.visible)return false;o=o.parent;}return true;});
    c.update(12,null,{force:true});const before=visible.map(p=>Float32Array.from(p.mesh.geometry.attributes.position.array));c.update(14.8,null,{force:true});
    let pinnedError=0,maxMove=0,moving=0;
    visible.forEach((p,k)=>{const a=p.mesh.geometry.attributes.position.array;let changed=false;for(let i=0;i<p.weights.length/2;i++){const d=Math.hypot(a[i*3]-before[k][i*3],a[i*3+1]-before[k][i*3+1],a[i*3+2]-before[k][i*3+2]);if(p.weights[i*2+1]===0)pinnedError=Math.max(pinnedError,d);else if(d>.001)changed=true;maxMove=Math.max(maxMove,d);}if(changed)moving++;});
    if(pinnedError>1e-6||moving!==visible.length||maxMove<.04)throw Error(JSON.stringify({pinnedError,moving,visible:visible.length,maxMove}));return {pieces:c.pieces.length,visible:visible.length,moving,pinnedError,maxMove};
  }));
  await page.evaluate(()=>{window.__game.time=14.8;window.__game.renderOnce();});await shot('06-cloth-later');
  if(process.env.CAPTURE_CLOTH){fs.mkdirSync(out+'/frames',{recursive:true});for(let i=0;i<96;i++){await page.evaluate(t=>{const g=window.__game;g.time=t;g.map.cloth.update(t,g.camera,{force:true});g.renderOnce();},12+i/24);await page.screenshot({path:`${out}/frames/cloth-${String(i).padStart(3,'0')}.jpg`,type:'jpeg',quality:87});}}
  await aim([13.6,.9,-12.4],[13.6,2.25,-15.4]);await shot('07-entrance-offering-lamps');
  await check('safe areas still end a chase',async()=>await page.evaluate(()=>{const g=window.__game;for(const p of g.map.storyWorld.safeZones){g.player.teleport(p.x+2.8,p.y,p.z+2,0,0);g.story.beginChase('stage');g.player.teleport(p.x,p.y,p.z,0,0);g.story.update(.05);if(g.story.chase)throw Error('safe area inaccessible');}return 'both safe areas';}));
}catch(e){errors.push(e.stack||String(e));}
finally{fs.writeFileSync(out+'/results.json',JSON.stringify({results,errors},null,2));console.log('ERRORS',errors);await browser.close();}
if(errors.length||results.some(r=>!r.pass))process.exitCode=1;
