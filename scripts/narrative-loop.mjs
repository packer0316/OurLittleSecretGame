import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const output='artifacts/narrative-loop';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const close=async()=>{for(let i=0;i<20;i++){if(await page.evaluate(()=>window.__game.story.modal?.options.length)!==1)break;await page.evaluate(()=>window.__game.story.choose(0));}};
const aim=async(id,offset=[0,0,1.8])=>page.evaluate(([id,offset])=>{
  const g=window.__game,t=g.map.storyWorld.targets.find(o=>o.id===id).position;
  const y=t.y<0?-7:t.y>11?11.9:t.y>6?6.9:.9;
  g.player.teleport(t.x+offset[0],y,t.z+offset[2]);
  const p=g.player,dx=t.x-p.pos.x,dz=t.z-p.pos.z;
  p.teleport(p.pos.x,y,p.pos.z,Math.atan2(-dx,-dz),Math.atan2(t.y-y-p.eye,Math.hypot(dx,dz)));
  g.renderOnce();
},[id,offset]);
try {
  await page.goto('http://127.0.0.1:5178/?auto&map=temple');
  await page.waitForFunction(()=>window.__game?.running&&window.__game.story);
  await close();
  await page.evaluate(()=>window.__game.story.journal());
  const early=await page.locator('.story-copy').innerText();
  assert(!/林小雨|送行盤|喚名|掌心裡的齒痕|五個重疊的手印/.test(early));
  assert.equal(await page.locator('.journal-grid button:disabled strong').allTextContents().then(a=>a.every(t=>t==='尚未確認的線索')),true);
  await page.screenshot({path:output+'/journal-before-discovery.png'});
  await close();
  console.log('PASS journal withholds undiscovered identities, object names and ritual rules');
  await page.evaluate(()=>{const s=window.__game.story;s.state.flags.incense=true;s.state.chapter=2;s.sync();});
  for(const id of ['diary','newspaper','tape','ritual']){
    await aim(id);await page.waitForTimeout(120);
    await page.screenshot({path:output+'/'+id+'.png'});
    assert.equal(await page.evaluate(()=>window.__game.story.focused()?.id),id);
  }
  console.log('PASS replacement evidence is reachable through the normal focus system');
  await page.evaluate(()=>{
    const g=window.__game;g.player.teleport(-9,6.9,-16,-.9,0);
    g.map.storyWorld.triggerScare('tape');g.story.journal();
  });
  await page.waitForTimeout(9500);
  assert(await page.evaluate(()=>window.__game.map.storyWorld.scareActive));
  await close();
  await page.waitForTimeout(300);
  await page.screenshot({path:output+'/tape-presence.png'});
  await page.evaluate(()=>{const g=window.__game;g.player.yaw=Math.PI;g.renderOnce();});
  await page.waitForTimeout(2200);
  assert(!(await page.evaluate(()=>window.__game.map.storyWorld.scareActive)));
  console.log('PASS presence stays during reading and leaves after the player looks away');
  const signs=await page.evaluate(()=>{
    const result=[];window.__game.map.scene.traverse(o=>{if(o.name==='MountedSign')result.push({p:o.position.toArray(),backed:o.children.some(m=>m.geometry?.type==='BoxGeometry')});});return result;
  });
  assert(signs.length>5&&signs.every(s=>s.backed));
  assert.equal(signs.filter(s=>s.p[1]===-6.22).length,3);
  console.log('PASS signs have backing and three ritual labels are mounted on table fronts');
  await page.evaluate(()=>{const w=window.__game.map.storyWorld;w.setLoopPass(1);});
  assert.equal(await page.evaluate(()=>window.__game.map.storyWorld.loopProps.children.filter(c=>c.visible).length),5);
  await page.evaluate(()=>window.__game.map.storyWorld.setLoopPass(2));
  assert.equal(await page.evaluate(()=>window.__game.map.storyWorld.loopProps.children.filter(c=>c.visible).length),6);
  await aim('loopmark');await page.screenshot({path:output+'/corridor-marker.png'});
  console.log('PASS the repeated corridor changes its visible objects');
  await page.goto('http://127.0.0.1:5178/?auto&map=road');
  await page.waitForFunction(()=>window.__game?.running&&window.__game.map?.id==='road');
  await page.evaluate(()=>{const g=window.__game;g.player.teleport(8.5,.12,-17.1,Math.PI,-.05);g.story.state.road.step=3;g.map.storyWorld.triggerScare('workshop');g.renderOnce();});
  await page.screenshot({path:output+'/workshop-doorway.png'});
  await page.evaluate(()=>window.__game.story.journal());await page.keyboard.press('Enter');
  assert(!(await page.evaluate(()=>!!window.__game.story.modal)));
  console.log('PASS road archive closes back to play');
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
