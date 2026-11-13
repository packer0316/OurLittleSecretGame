import {chromium} from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='artifacts/input-phone-loop';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),results=[],errors=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
const test=async(name,fn)=>{try{const detail=await fn();results.push({name,pass:true,detail});console.log('PASS',name,detail||'');}catch(e){results.push({name,pass:false,error:String(e)});console.log('FAIL',name,String(e));}};
const angles=()=>page.evaluate(()=>[window.__game.player.yaw,window.__game.player.pitch]);
const settle=()=>page.waitForTimeout(180);
const stable=async(before)=>{await page.waitForTimeout(250);const after=await angles();assert.deepEqual(after,before);return after;};
const ready=async()=>{await page.waitForSelector('#overlay:not(.hidden)',{timeout:120000});await page.click('#btn-resume');await page.waitForFunction(()=>window.__game?.running&&document.pointerLockElement===document.getElementById('game'));await settle();};
const aim=async(id,pos)=>page.evaluate(([id,pos])=>{const g=window.__game,p=g.player,t=g.map.storyWorld.targets.find(t=>t.id===id).position;if(pos)p.teleport(...pos);const dx=t.x-p.pos.x,dz=t.z-p.pos.z,dy=t.y-p.pos.y-p.eye;p.teleport(p.pos.x,p.pos.y,p.pos.z,Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz)));g.renderOnce();return g.story.focused()?.id;},[id,pos]);
const shot=async(name)=>{await page.waitForTimeout(250);await page.screenshot({path:`${out}/${name}.png`});};
const phone=()=>page.evaluate(()=>{const p=window.__game.map.storyWorld.phone;return {mode:p.mode,emission:p.screen.material.emissiveIntensity,spill:p.spill.intensity,textureMatches:p.screen.material.emissiveMap===p.textures[p.mode]};});
try{
  await page.goto('http://127.0.0.1:5178/');await page.click('#start-story');await ready();
  await test('native locked mouse movement turns normally, then stops without drift',async()=>{
    await page.mouse.move(650,400);await settle();const before=await angles();await page.mouse.move(690,410);await settle();const after=await angles();const turn=Math.abs(after[0]-before[0]);assert(turn>.001&&turn<.5,JSON.stringify({before,after}));await stable(after);return {before,after};
  });
  await test('cursor-warp deltas cannot spin or corrupt the camera',async()=>{
    const before=await angles();await page.evaluate(()=>{for(const movementX of [12000,-12000,Infinity,NaN])window.__game.player._onMouse({movementX,movementY:0});});await stable(before);
  });
  await test('a burst is bounded to 90 degrees and never replayed on later frames',async()=>{
    await page.evaluate(()=>window.__game.player.teleport(0,0,-.5,0,0));const before=await angles();await page.evaluate(()=>{for(let i=0;i<120;i++)document.dispatchEvent(new MouseEvent('mousemove',{movementX:60,movementY:0}));});await settle();const after=await angles();assert(Math.abs(after[0]-before[0])<=Math.PI/2+.00001);assert(Math.abs(after[0]-before[0])>1);await stable(after);return {before,after};
  });
  await test('blur/focus boundaries discard queued motion and clear held movement keys',async()=>{
    const before=await angles();await page.evaluate(()=>{const p=window.__game.player;p.keys.KeyW=true;document.dispatchEvent(new MouseEvent('mousemove',{movementX:70}));window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new MouseEvent('mousemove',{movementX:480}));});await stable(before);assert.equal(await page.evaluate(()=>Object.keys(window.__game.player.keys).length),0);
  });
  await test('reading rejects unlocked mouse input even if enabled during the relock gap',async()=>{
    await page.keyboard.press('j');await page.waitForFunction(()=>!!window.__game.story.modal&&!document.pointerLockElement);const before=await angles();await page.evaluate(()=>window.__game.player.enabled=true);await settle();await page.mouse.move(300,150);await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:480,movementY:100})));await stable(before);await page.evaluate(()=>window.__game.player.enabled=false);await page.click('.story-choices button');await page.waitForFunction(()=>!!document.pointerLockElement);await settle();
  });
  await test('pause, resume and repeated journal transitions keep the facing direction',async()=>{
    for(let i=0;i<3;i++){
      const before=await angles();await page.keyboard.press('j');await page.waitForFunction(()=>!document.pointerLockElement);await page.mouse.move(100+i*80,100);await page.click('.story-choices button');await page.waitForFunction(()=>!!document.pointerLockElement);await stable(before);
    }
    const before=await angles();await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>!window.__game.running);await page.mouse.move(250,600);await page.click('#btn-resume');await page.waitForFunction(()=>window.__game.running&&!!document.pointerLockElement);await stable(before);
    await page.mouse.move(700,400);await settle();const a=await angles();await page.mouse.move(725,410);await settle();assert.notDeepEqual(await angles(),a);
  });
  await test('disabled controls drop queued motion instead of applying it after a dialogue',async()=>{
    const before=await angles();await page.evaluate(()=>{const p=window.__game.player;document.dispatchEvent(new MouseEvent('mousemove',{movementX:80}));p.enabled=false;p.enabled=true;});await stable(before);
  });
  await test('normal letter and photograph interaction lights the incoming-call screen',async()=>{
    assert.equal((await phone()).mode,'idle');assert.equal(await aim('letter',[0,0,-.5]),'letter');await page.keyboard.press('e');await page.click('.story-choices button');await page.waitForSelector('.story-figure');await page.click('.story-choices button');await page.waitForFunction(()=>document.pointerLockElement&&window.__game.story.state.home.step===2);await settle();const r=await phone();assert.equal(r.mode,'incoming');assert(r.emission>1.6&&r.spill>.07&&r.textureMatches);await aim('phone',[.2,0,-.65]);await shot('01-incoming-room');await aim('phone',[.82,0,-1.8]);await shot('02-incoming-close');
    const png=await page.evaluate(()=>window.__game.map.storyWorld.phone.textures.incoming.image.toDataURL());fs.writeFileSync(out+'/03-call-ui.png',Buffer.from(png.split(',')[1],'base64'));return r;
  });
  await test('ring screen stays lit throughout the pulse, including low quality',async()=>{
    const emissions=[];for(let i=0;i<8;i++){emissions.push((await phone()).emission);await page.waitForTimeout(350);}assert(Math.min(...emissions)>1.6);await page.evaluate(()=>window.__game.applySettings({quality:'low'}));await shot('04-incoming-low');assert((await phone()).emission>1.6);await page.evaluate(()=>window.__game.applySettings({quality:'medium'}));return {min:Math.min(...emissions),max:Math.max(...emissions)};
  });
  await test('reload during ringing restores the incoming display and answer prompt',async()=>{
    await page.evaluate(()=>window.__game.story.save());await page.goto('http://127.0.0.1:5178/');await page.click('#continue-story');await ready();assert.equal((await phone()).mode,'incoming');assert.equal(await aim('phone',[.82,0,-1.8]),'phone');await page.waitForFunction(()=>document.getElementById('interact-prompt').textContent.includes('接聽阿哲來電'));
  });
  await test('answering changes to connected, and completing the call ends the light',async()=>{
    await page.keyboard.press('e');await page.waitForFunction(()=>!!window.__game.story.modal);assert.equal((await phone()).mode,'connected');await shot('05-connected');
    for(let i=0;i<5;i++){await page.keyboard.press('Enter');await page.waitForTimeout(70);}await page.keyboard.press('1');
    for(let i=0;i<5;i++){if(!await page.evaluate(()=>!!window.__game.story.modal))break;await page.keyboard.press('Enter');await page.waitForTimeout(70);}
    assert.equal(await page.evaluate(()=>window.__game.story.state.home.step),3);const r=await phone();assert.equal(r.mode,'ended');assert.equal(r.spill,0);assert(r.emission<.3);await shot('06-ended');return r;
  });
}catch(e){errors.push(e.stack||String(e));}
finally{fs.writeFileSync(out+'/results.json',JSON.stringify({results,errors},null,2));console.log('ERRORS',errors);await browser.close();}
if(errors.length||results.some(r=>!r.pass))process.exitCode=1;
