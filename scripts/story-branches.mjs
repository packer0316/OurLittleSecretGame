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
  // court：安全區從三盞燈改成天公爐的香火，位置一律從 world.safeZones 取（站在爐邊即可）。
  await test('answer starts a chase, the incense burner ends it',async()=>{await page.evaluate(()=>{const g=window.__game;g.player.teleport(23,.58,0,0,0);g.story.beginChase('stage');});await assert(()=>!!window.__game.story.chase,'no chase');await page.evaluate(()=>{const s=window.__game.map.storyWorld.safeZones[0];window.__game.player.teleport(s.x,s.y,s.z+1.6,0,0);});await page.waitForTimeout(200);await assert(()=>!window.__game.story.chase,'chase did not end');});
  await test('caught chase retries with evidence intact',async()=>{await page.evaluate(()=>{const g=window.__game;g.player.teleport(23,.58,0,0,0);g.story.beginChase('stage');g.story.chase.time=2;g.map.storyWorld.ghost.root.position.copy(g.player.pos);g.story.update(.02);});await assert(()=>window.__game.story.state.deaths===1&&!!window.__game.story.modal,'no failure checkpoint');await page.evaluate(()=>window.__game.story.choose(0));await assert(()=>window.__game.story.modal.options.length===3,'no retry choice');await page.evaluate(()=>window.__game.story.choose(0));await dismiss();});
  await test('save restores chapter, evidence, gate and underground position',async()=>{await page.evaluate(()=>{const g=window.__game,s=g.story;Object.assign(s.state.flags,{incense:true,stage:true,loopSolved:true,key:true,underground:true});s.state.chapter=4;s.collect('death');g.player.teleport(55,-7,-14,0,0);s.save();});await page.goto('http://127.0.0.1:5178/?auto&map=temple&resume');await page.waitForFunction(()=>window.__game?.story&&window.__game.running,{timeout:180000});await assert(()=>window.__game.story.state.chapter===4&&window.__game.story.state.evidence.includes('death')&&window.__game.player.pos.y<0,'reload state');await assert(()=>window.__game.map.world.boxes.some(b=>b.z1===21.22&&!b.disabled),'gate did not restore');});
  await test('true ending lists missing evidence without consuming anything',async()=>{await page.evaluate(()=>window.__game.story.prepareRitual());await assert(()=>document.querySelectorAll('.missing-evidence li').length>0&&!window.__game.story.ritual,'missing gate');await dismiss();});
  // finale：三個結局都是可以玩的演出。用 debug.run 快轉（照正式邏輯、不渲染），需要玩家的地方用真的按鍵。
  const fin=(js)=>page.evaluate(new Function(`const s=window.__game.story,f=s.finale,p=window.__game.player;return (${js})`));
  await test('ending A requires holding the rope, walking out under dying lights and answering at the gate',async()=>{
    await page.evaluate(()=>{const s=window.__game.story;s.collect('names');s.collect('confession');s.finalChoice();s.choose(0);});
    if(await fin('f.debug.phase')!=='a-tie')throw Error('A did not start');
    await fin('f.debug.run(5)');if(await fin('f.debug.phase')!=='a-tie'||await fin('s.state.ending'))throw Error('rope tied itself');
    await page.keyboard.down('e');await fin('f.debug.run(8.5)');await page.keyboard.up('e');
    await fin('f.debug.run(11)');
    if(await fin('f.debug.phase')!=='a-walk'||!await fin('s.state.flags.sealed')||await fin('s.state.ending'))throw Error('A did not lead to the walk: '+await fin('f.debug.phase'));
    const lit=await fin('window.__game.map.lights.filter(L=>L.floor<=0&&Math.abs(L.light.position.x)<16&&L.light.position.z<-26.5&&L.light.position.y>-1).map(L=>L.mul??1)');
    if(!lit.length||lit.some(m=>m>0.05))throw Error('lights behind did not die: '+lit);
    await fin('f.debug.run(6)');if(await fin('f.debug.phase')!=='a-walk'||await fin('s.state.ending'))throw Error('standing still finished A');
    await fin('(p.teleport(0,0.02,18.6,Math.PI,0),f.debug.run(14))');
    if(await fin('f.debug.phase')!=='a-gate'||await fin('s.state.ending'))throw Error('gate answered by itself: '+await fin('f.debug.phase'));
    await page.keyboard.press('e');await fin('f.debug.run(14)');
    if(await fin('f.debug.phase')!=='a-phone'||await fin('s.state.ending'))throw Error('no phone call: '+await fin('f.debug.phase'));
    await page.keyboard.press('e');await fin('f.debug.run(12)');
    await assert(()=>window.__game.story.state.ending==='A','A not finished');
  });
  await page.screenshot({path:out+'/07-ending-a.png'});
  await test('return to decision and play replacement ending B to the end',async()=>{
    await page.evaluate(()=>{const s=window.__game.story;s.choose(0);s.finalChoice();s.choose(1);});
    if(await fin('f.debug.phase')!=='b-untie')throw Error('B did not start');
    await fin('f.debug.run(30)');if(await fin('s.state.ending'))throw Error('B ended before the call');
    await fin('f.debug.run(40)');
    await assert(()=>window.__game.story.state.ending==='B','B not finished');
  });
  await page.screenshot({path:out+'/08-ending-b.png'});
  await test('finale timeline freezes while reading and while stopped',async()=>{
    await page.evaluate(()=>{const s=window.__game.story;s.choose(0);s.finale.start('C');s.finale.debug.to('c-fire');});
    const t0=await fin('f.debug.state.t');await page.evaluate(()=>window.__game.story.journal());await page.waitForTimeout(400);
    if(await fin('f.debug.state.t')!==t0)throw Error('reading advanced the timeline');
    await dismiss();await page.evaluate(()=>window.__game.stop());const t1=await fin('f.debug.state.t');await page.waitForTimeout(350);
    if(t1!==await fin('f.debug.state.t'))throw Error('pause advanced the timeline');await page.evaluate(()=>window.__game.start());
  });
  await test('letting go of the hot key replays 1998 and retries in place without losing evidence',async()=>{
    const n=await fin('s.state.evidence.length');
    await page.keyboard.down('e');await fin('f.debug.run(1.6)');await page.keyboard.up('e');
    await fin('f.debug.run(2.2)');if(await fin('f.debug.phase')!=='c-fail3')throw Error('letting go did not fail: '+await fin('f.debug.phase'));
    await fin('f.debug.run(9.5)');if(await fin('f.debug.phase')!=='c-fire')throw Error('no retry: '+await fin('f.debug.phase'));
    await fin('f.debug.run(25.5)');if(await fin('f.debug.phase')!=='c-fail3')throw Error('waiting forever did not time out');
    await fin('f.debug.run(9.5)');
    if(await fin('f.debug.phase')!=='c-fire'||await fin('s.state.evidence.length')!==n||await fin('f.debug.state.fails.key')!==2)throw Error('retry lost progress');
  });
  await test('looking back in the dark is caught and restarts the walk',async()=>{
    const d=await fin('s.state.deaths');await fin('f.debug.to("c-walk")');await fin('f.debug.run(1)');
    await fin('(p.yaw+=Math.PI,f.debug.run(0.1))');if(await fin('f.debug.phase')!=='c-fail1'||await fin('s.state.deaths')!==d+1)throw Error('looking back was not punished');
    await fin('f.debug.run(4)');if(await fin('f.debug.phase')!=='c-walk')throw Error('walk did not restart');
  });
  await test('answering the sixth name costs an answer but does not block',async()=>{
    const a=await fin('s.state.answers');await fin('f.debug.to("c-six")');await dismiss();await fin('f.debug.run(2)');
    await page.keyboard.press('e');await fin('f.debug.run(0.1)');
    if(await fin('f.debug.phase')!=='c-answered'||await fin('s.state.answers')!==a+1)throw Error('answer not counted');
    await fin('f.debug.run(8)');if(await fin('f.debug.phase')!=='c-witness-ready')throw Error('answering blocked the ritual');
    await page.evaluate(()=>window.__game.story.finale.restore());
  });
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
    for(const [id,data] of Object.entries(files)){const folder=out+'/models/'+id;fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/'+id+'.glb',Buffer.from(data,'base64'));}
  });
  await page.evaluate(()=>{const g=window.__game;g.story.modal=null;document.getElementById('story-layer').classList.add('hidden');g.story.ritual=null;g.player.teleport(23,.58,2.4,0,0);g.map.storyWorld.ghost.root.visible=true;g.map.storyWorld.ghost.root.position.set(23,.58,-.4);});await page.waitForTimeout(400);await page.screenshot({path:out+'/09-ghost-model.png'});
  await page.evaluate(()=>{const g=window.__game;g.map.storyWorld.ghost.root.visible=false;g.player.teleport(0,.9,-27.6,0,.56);g.renderOnce();});await page.waitForTimeout(400);await page.screenshot({path:out+'/10-buddha-detail.png'});
}catch(e){errors.push(e.stack||String(e));}
finally{fs.writeFileSync(out+'/branch-results.json',JSON.stringify({results,errors},null,2));console.log('ERRORS',JSON.stringify(errors));await browser.close();}
if(errors.length||results.some(r=>!r.pass))process.exitCode=1;

