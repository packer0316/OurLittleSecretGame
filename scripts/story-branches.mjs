import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out='artifacts/story';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[],results=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const test=async(name,fn)=>{try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:String(e)});console.log('FAIL',name,String(e));}};
const dismiss=async()=>{for(let i=0;i<30;i++){if(await page.evaluate(()=>window.__game.story.modal?.options.length)!==1)break;await page.evaluate(()=>window.__game.story.choose(0));}};
const assert=async(fn,msg)=>{if(!await page.evaluate(fn))throw Error(msg);};
try {
  await page.goto('http://127.0.0.1:5178/?auto&map=temple');await page.waitForFunction(()=>window.__game?.story&&window.__game.running,{timeout:180000});await dismiss();
  await test('evidence cannot be targeted through walls',async()=>{await page.evaluate(()=>{const g=window.__game,s=g.story;s.state.flags.incense=true;s.state.chapter=2;s.sync();g.player.teleport(21,0.9,-20,Math.PI/2,0);});await assert(()=>!window.__game.story.focused(),'target through wall');});
  await test('answer starts a chase, safe lanterns end it',async()=>{await page.evaluate(()=>{const g=window.__game;g.player.teleport(23,.58,0,0,0);g.story.beginChase('stage');});await assert(()=>!!window.__game.story.chase,'no chase');await page.evaluate(()=>window.__game.player.teleport(0,.02,13,0,0));await page.waitForTimeout(200);await assert(()=>!window.__game.story.chase,'chase did not end');});
  await test('caught chase retries with evidence intact',async()=>{await page.evaluate(()=>{const g=window.__game;g.player.teleport(23,.58,0,0,0);g.story.beginChase('stage');g.story.chase.time=2;g.map.storyWorld.ghost.root.position.copy(g.player.pos);g.story.update(.02);});await assert(()=>window.__game.story.state.deaths===1&&!!window.__game.story.modal,'no failure checkpoint');await page.evaluate(()=>window.__game.story.choose(0));await assert(()=>window.__game.story.modal.options.length===3,'no retry choice');await page.evaluate(()=>window.__game.story.choose(0));await dismiss();});
  await test('save restores chapter, evidence, gate and underground position',async()=>{await page.evaluate(()=>{const g=window.__game,s=g.story;Object.assign(s.state.flags,{incense:true,stage:true,loopSolved:true,key:true,underground:true});s.state.chapter=4;s.collect('death');g.player.teleport(55,-7,-14,0,0);s.save();});await page.goto('http://127.0.0.1:5178/?auto&map=temple&resume');await page.waitForFunction(()=>window.__game?.story&&window.__game.running,{timeout:180000});await assert(()=>window.__game.story.state.chapter===4&&window.__game.story.state.evidence.includes('death')&&window.__game.player.pos.y<0,'reload state');await assert(()=>window.__game.map.world.boxes.some(b=>b.z1===21.22&&!b.disabled),'gate did not restore');});
  await test('true ending lists missing evidence without consuming anything',async()=>{await page.evaluate(()=>window.__game.story.prepareRitual());await assert(()=>document.querySelectorAll('.missing-evidence li').length>0&&!window.__game.story.ritual,'missing gate');await dismiss();});
  await test('ordinary ending A requires walking out',async()=>{await page.evaluate(()=>{const s=window.__game.story;s.collect('names');s.collect('confession');s.finalChoice();s.choose(0);});await dismiss();await assert(()=>window.__game.story.state.flags.sealed&&!window.__game.story.state.ending,'A early end');await page.evaluate(()=>window.__game.player.teleport(0,.02,26,0,0));await page.waitForFunction(()=>window.__game.story.state.ending==='A',null,{timeout:10000});await assert(()=>window.__game.story.state.ending==='A','A not finished');});
  await page.screenshot({path:out+'/07-ending-a.png'});
  await test('return to decision and choose replacement ending B',async()=>{await page.evaluate(()=>{const s=window.__game.story;s.choose(0);s.finalChoice();s.choose(1);});await dismiss();await assert(()=>window.__game.story.state.ending==='B','B not finished');});
  await page.screenshot({path:out+'/08-ending-b.png'});
  await test('ritual timer freezes while reading and while stopped',async()=>{await page.evaluate(()=>{const s=window.__game.story;s.choose(0);s.ritual={remaining:60,step:0};s.journal();});const before=await page.evaluate(()=>window.__game.story.ritual.remaining);await page.waitForTimeout(400);const after=await page.evaluate(()=>window.__game.story.ritual.remaining);if(before!==after)throw Error('reading timer advanced');await dismiss();await page.evaluate(()=>window.__game.stop());const frozen=await page.evaluate(()=>window.__game.story.ritual.remaining);await page.waitForTimeout(350);if(frozen!==await page.evaluate(()=>window.__game.story.ritual.remaining))throw Error('pause timer advanced');await page.evaluate(()=>{window.__game.story.ritual=null;window.__game.start();});});
  await test('timeout resets ritual without losing evidence',async()=>{await page.evaluate(()=>{const s=window.__game.story;s.ritual={remaining:.01,step:1};s.update(.05);});await assert(()=>!window.__game.story.ritual&&!!window.__game.story.modal,'timeout did not recover');await page.evaluate(()=>{window.__game.story.modal=null;document.getElementById('story-layer').classList.add('hidden');});});
  // Export actual local 3D meshes, not portrait billboards.
  await test('export ghost and blindfolded Buddha as GLB',async()=>{
    const files=await page.evaluate(async()=>{const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');const {clone:cloneSkeleton}=await import('/node_modules/three/examples/jsm/utils/SkeletonUtils.js');const g=window.__game;const exporter=new GLTFExporter();const files={};
      for(const [id,source] of [['borrowed_voice',g.map.storyWorld.ghost.root],['blindfolded_buddha',g.map.storyWorld.statues[0]],['red_rabbit',g.map.storyWorld.rabbit]]){
        // userData contains live Object3D references, so clear it on export only.
        const old=[];source.traverse(o=>{old.push([o,o.userData]);o.userData={};});const clone=cloneSkeleton(source);for(const [o,data] of old)o.userData=data;
        clone.position.set(0,0,0);clone.visible=true;clone.updateMatrixWorld(true);
        const data=await exporter.parseAsync(clone,{binary:true,onlyVisible:false,animations:id==='borrowed_voice'?g.map.storyWorld.ghost.clips||[]:[]});let binary='';const bytes=new Uint8Array(data);for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));files[id]=btoa(binary);
      }return files;
    });
    for(const [id,data] of Object.entries(files)){const folder='public/assets/models/'+id;fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/'+id+'.glb',Buffer.from(data,'base64'));}
  });
  await page.evaluate(()=>{const g=window.__game;g.story.modal=null;document.getElementById('story-layer').classList.add('hidden');g.story.ritual=null;g.player.teleport(23,.58,2.4,0,0);g.map.storyWorld.ghost.root.visible=true;g.map.storyWorld.ghost.root.position.set(23,.58,-.4);});await page.waitForTimeout(400);await page.screenshot({path:out+'/09-ghost-model.png'});
  await page.evaluate(()=>{const g=window.__game;g.map.storyWorld.ghost.root.visible=false;g.player.teleport(0,.9,-27.6,0,.56);g.renderOnce();});await page.waitForTimeout(400);await page.screenshot({path:out+'/10-buddha-detail.png'});
}catch(e){errors.push(e.stack||String(e));}
finally{fs.writeFileSync(out+'/branch-results.json',JSON.stringify({results,errors},null,2));console.log('ERRORS',JSON.stringify(errors));await browser.close();}
if(errors.length||results.some(r=>!r.pass))process.exitCode=1;

