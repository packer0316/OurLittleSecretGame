import {chromium} from 'playwright-core';
import fs from 'node:fs';
const out='artifacts/door-loop';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
const test=async(name,fn)=>{try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:String(e)});console.log('FAIL',name,e.message);}};
try{
  await page.goto('http://127.0.0.1:5178/?auto&map=home');await page.waitForFunction(()=>window.__game?.running&&window.__game.map?.id==='home');
  await page.evaluate(()=>{const g=window.__game,s=g.story;s.state.home.step=3;s.sync();g.knockCount=0;const knock=g.audio.doorKnock.bind(g.audio);g.audio.doorKnock=(n)=>{g.knockCount++;knock(n);};s.world.startDoorEvent();});
  await test('paper waits for the player and cannot be inspected too early',async()=>{await page.waitForTimeout(3000);if(!await page.evaluate(()=>window.__game.map.storyWorld.doorEventActive&&!window.__game.story.active('slip')&&window.__game.knockCount===3))throw Error('cue timing');});
  await test('reading and pause freeze the in-world event',async()=>{await page.keyboard.press('j');const before=await page.evaluate(()=>window.__game.map.storyWorld.doorEventTime);await page.waitForTimeout(350);if(before!==await page.evaluate(()=>window.__game.map.storyWorld.doorEventTime))throw Error('reading did not freeze event');await page.keyboard.press('Enter');await page.evaluate(()=>window.__game.stop());const paused=await page.evaluate(()=>window.__game.map.storyWorld.doorEventTime);await page.waitForTimeout(350);if(paused!==await page.evaluate(()=>window.__game.map.storyWorld.doorEventTime))throw Error('pause did not freeze event');await page.evaluate(()=>window.__game.start());});
  await test('slip slides physically through the door gap then becomes inspectable',async()=>{
    await page.evaluate(()=>{const g=window.__game;g.player.teleport(1.65,0,1.75,Math.PI,-.65);});
    await page.screenshot({path:out+'/01-before-slide.png'});const start=await page.evaluate(()=>window.__game.map.storyWorld.slipPosition.z);
    await page.waitForTimeout(1150);const mid=await page.evaluate(()=>window.__game.map.storyWorld.slipPosition.z);await page.screenshot({path:out+'/02-mid-slide.png'});
    await page.waitForFunction(()=>!window.__game.map.storyWorld.doorEventActive);const end=await page.evaluate(()=>window.__game.map.storyWorld.slipPosition.z);await page.screenshot({path:out+'/03-after-slide.png'});
    if(!(start>mid&&mid>end)||Math.abs(end-3.4)>.001)throw Error(`motion ${start}, ${mid}, ${end}`);
    if(!await page.evaluate(()=>window.__game.story.active('slip')&&window.__game.knockCount===3))throw Error('not inspectable or duplicate knocks');
  });
  await test('reload during a cue restores a usable clue instead of a blocked step',async()=>{await page.evaluate(()=>{const s=window.__game.story;s.world.startDoorEvent();s.save();});await page.goto('http://127.0.0.1:5178/?auto&map=home&resume');await page.waitForFunction(()=>window.__game?.running&&window.__game.story?.state.home.step===3);if(!await page.evaluate(()=>window.__game.story.active('slip')&&!window.__game.map.storyWorld.doorEventActive&&window.__game.map.storyWorld.slipPosition.z===3.4))throw Error('cue resume blocked');});
}catch(e){errors.push(e.stack||String(e));}
finally{fs.writeFileSync(out+'/results.json',JSON.stringify({results,errors},null,2));console.log('ERRORS',errors);await browser.close();}
if(errors.length||results.some(r=>!r.pass))process.exitCode=1;
