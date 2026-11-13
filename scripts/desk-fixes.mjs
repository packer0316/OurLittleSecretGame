import {chromium} from 'playwright-core';
import fs from 'node:fs';
const out='artifacts/desk-fixes';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const errors=[],results=[];let page;
const test=async(name,fn)=>{try{const detail=await fn();results.push({name,pass:true,detail});console.log('PASS',name,detail||'');}catch(e){results.push({name,pass:false,error:String(e)});console.log('FAIL',name,String(e));}};
const aim=async id=>page.evaluate(id=>{const g=window.__game,p=g.player,t=g.map.storyWorld.targets.find(t=>t.id===id).position;const dx=t.x-p.pos.x,dz=t.z-p.pos.z,dy=t.y-p.pos.y-p.eye;p.teleport(p.pos.x,p.pos.y,p.pos.z,Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz)));},id);
const fresh=async()=>{const c=await browser.newContext({viewport:{width:1440,height:900}});page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5178/');await page.click('#start-story');await page.waitForSelector('#overlay:not(.hidden)',{timeout:120000});await page.click('#btn-resume');await page.waitForFunction(()=>window.__game?.running&&!!document.pointerLockElement);return c;};
try{
  for(const input of ['click','Enter','1']){
    const context=await fresh();
    await test(`${input}: normal UI moves the photograph and automatically opens it`,async()=>{
      await aim('letter');await page.keyboard.press('e');await page.waitForSelector('.story-choices button');
      if(input==='click')await page.click('.story-choices button');else await page.keyboard.press(input);
      await page.waitForFunction(()=>window.__game.map.storyWorld.photoPlacementActive);
      const start=await page.evaluate(()=>window.__game.map.scene.getObjectByName('HomeEvidencePhoto').position.toArray());
      await page.waitForTimeout(400);
      const mid=await page.evaluate(()=>window.__game.map.scene.getObjectByName('HomeEvidencePhoto').position.toArray());
      if(Math.hypot(...start.map((x,i)=>x-mid[i]))<.05)throw Error('photo never moved');
      await page.waitForSelector('.story-figure img',{timeout:8000});
      if(await page.evaluate(()=>window.__game.story.state.home.step!==1||window.__game.story.busy||window.__game.player.enabled))throw Error('reading state incorrect');
      if(input==='click')await page.screenshot({path:out+'/01-auto-open-photo.png'});
      await page.click('.story-choices button');await page.waitForFunction(()=>document.pointerLockElement&&window.__game.story.state.home.step===2&&window.__game.player.enabled);
      if(input==='click'){
        await page.evaluate(()=>{const g=window.__game;g.player.teleport(.12,0,-1.72,0,-.85);});await page.waitForTimeout(250);await page.screenshot({path:out+'/02-desk-closeup.png'});
        await test('ink shares photo coordinates at every point in its motion',async()=>{
          const r=await page.evaluate(async()=>{const {photoMarkLocal}=await import('/src/story/photoLayout.js');const g=window.__game,p=g.map.scene.getObjectByName('HomeEvidencePhoto'),m=p.getObjectByName('PhotoFaceDefacement'),e=photoMarkLocal(.38,.285);if(m.parent!==p)throw Error('mark detached');if(Math.abs(m.position.x-e.x)>1e-7||Math.abs(m.position.y-e.y)>1e-7)throw Error('UV mismatch');return {parent:m.parent.name,x:m.position.x,y:m.position.y};});return r;
        });
        await test('handwritten face is loaded before rendering and includes all letter glyphs',async()=>{
          const r=await page.evaluate(()=>{const g=window.__game,m=g.map.scene.getObjectByName('HomeHandwrittenLetter');if(!document.fonts.check('40px OLSPaperHand','陳以安收你還記得那扇門嗎'))throw Error('font fallback');return {width:m.material.map.image.width,height:m.material.map.image.height,png:m.material.map.image.toDataURL('image/png')};});
          fs.writeFileSync(out+'/03-handwritten-letter.png',Buffer.from(r.png.split(',')[1],'base64'));return {width:r.width,height:r.height};
        });
        await test('saved photo placement is not replayed on rereading the envelope',async()=>{await aim('letter');await page.keyboard.press('e');await page.waitForSelector('.story-choices button');if(!await page.locator('.story-choices button').innerText().then(t=>t.includes('端詳燈下')))throw Error('old action repeated');await page.click('.story-choices button');await page.waitForSelector('.story-figure');if(await page.evaluate(()=>window.__game.map.storyWorld.photoPlacementActive))throw Error('placement replayed');});
        await test('small photo layout still hides the same face and ending C restores it',async()=>{await page.setViewportSize({width:800,height:700});await page.locator('.photo-scribble').waitFor({state:'visible'});await page.screenshot({path:out+'/04-photo-small.png'});await page.evaluate(()=>{const s=window.__game.story;s.state.flags.sent=true;s.sync();s.document('photo');});if(await page.locator('.photo-scribble').count())throw Error('ending did not restore UI');if(!await page.evaluate(()=>!window.__game.map.scene.getObjectByName('PhotoFaceDefacement').visible))throw Error('ending did not restore desk photo');});
      }
      return {start,mid};
    });
    await context.close();
  }
}catch(e){errors.push(e.stack||String(e));}
finally{fs.writeFileSync(out+'/results.json',JSON.stringify({results,errors},null,2));console.log('ERRORS',errors);await browser.close();}
if(errors.length||results.some(r=>!r.pass))process.exitCode=1;
