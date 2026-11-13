import {chromium} from 'playwright-core';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1366,height:768}});const errors=[],results=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));
page.on('request',r=>requests.push(r.url()));
const expect=async(fn,message)=>{await page.waitForFunction(fn,null,{timeout:10000}).catch(()=>{throw Error(message);});};
const test=async(name,fn)=>{try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:String(e)});console.log('FAIL',name,String(e));}};
try{
  await page.goto('http://127.0.0.1:5178/');
  await test('new game enters through normal title and pointer lock UI',async()=>{
    await page.click('#start-story');await page.waitForSelector('#overlay:not(.hidden)',{timeout:180000});await page.click('#btn-resume');await expect(()=>!!window.__game.story.modal,'intro missing');
    for(let i=0;i<12;i++){if(!await page.evaluate(()=>window.__game.story.modal))break;await page.keyboard.press('Enter');await page.waitForTimeout(80);}
    await expect(()=>document.pointerLockElement===document.getElementById('game')&&window.__game.player.enabled,'pointer lock did not resume');
  });
  await test('journal opens, stops movement and restores pointer lock',async()=>{
    await page.keyboard.press('j');await expect(()=>!!window.__game.story.modal&&!window.__game.player.enabled,'journal missing');const before=await page.evaluate(()=>window.__game.player.pos.toArray());
    await page.keyboard.down('w');await page.waitForTimeout(200);await page.keyboard.up('w');const after=await page.evaluate(()=>window.__game.player.pos.toArray());if(Math.hypot(...after.map((n,i)=>n-before[i]))>.03)throw Error('movement while reading');
    await page.click('[data-choice="0"]');await expect(()=>!!document.pointerLockElement,'journal closed without pointer lock');
  });
  await test('pause, return to lobby and continue restore save',async()=>{
    // Explicit exit uses the same native pointerlockchange event as Esc.
    await page.evaluate(()=>document.exitPointerLock());await expect(()=>!window.__game.running&&!document.getElementById('overlay').classList.contains('hidden'),'pause missing');
    await page.click('#btn-lobby');await expect(()=>!document.getElementById('continue-story').disabled,'continue unavailable');await page.click('#continue-story');await page.waitForSelector('#overlay:not(.hidden)',{timeout:180000});await page.click('#btn-resume');
    await expect(()=>window.__game.running,'continue failed');
  });
  await test('all runtime assets load locally',async()=>{const external=requests.filter(u=>!u.startsWith('http://127.0.0.1:5178/')&&!u.startsWith('blob:http://127.0.0.1:5178/')&&!u.startsWith('data:'));if(external.length)throw Error(external.join('\n'));});
  await test('small evidence layout preserves red face marking',async()=>{await page.setViewportSize({width:800,height:700});await page.evaluate(()=>window.__game.story.document('photo'));const visible=await page.locator('.photo-scribble').isVisible();if(!visible)throw Error('redaction hidden');await page.screenshot({path:'artifacts/story/11-evidence-small.png'});});
}catch(e){errors.push(e.stack||String(e));}
finally{fs.writeFileSync('artifacts/story/ui-results.json',JSON.stringify({results,errors},null,2));console.log('ERRORS',errors);await browser.close();}
if(errors.length||results.some(r=>!r.pass))process.exitCode=1;
