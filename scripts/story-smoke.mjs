import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out='artifacts/story';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const results=[];
const check=async(name,fn)=>{try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:String(e)});console.log('FAIL',name,String(e));}};
const dismiss=async()=>{for(let i=0;i<35;i++){const n=await page.evaluate(()=>window.__game.story.modal?.options.length||0);if(n!==1)break;await page.evaluate(()=>window.__game.story.choose(0));}};
const interact=async id=>{const ok=await page.evaluate(id=>window.__game.story.interact(id),id);if(!ok)throw Error('Interaction refused: '+id);await dismiss();};
const aim=async(id,offset=[0,0,2.1])=>page.evaluate(([id,off])=>{const g=window.__game,t=g.map.storyWorld.targets.find(t=>t.id===id).position;const floor=id==='relic'?g.map.world.terrain(t.x,t.z):t.y<0?-7:t.y>16?16.9:t.y>11?11.9:t.y>6?6.9:0.9;g.player.teleport(t.x+off[0],floor+off[1],t.z+off[2],0,0);const dx=t.x-g.player.pos.x,dz=t.z-g.player.pos.z,dy=t.y-(g.player.pos.y+1.66);g.player.yaw=Math.atan2(-dx,-dz);g.player.pitch=Math.atan2(dy,Math.hypot(dx,dz));g.renderOnce();},[id,offset]);
try{
  await page.goto('http://127.0.0.1:5178/');await page.waitForTimeout(500);await page.screenshot({path:out+'/01-title.png'});
  await page.goto('http://127.0.0.1:5178/?auto&map=temple&dev');
  await page.waitForFunction(()=>window.__game?.running&&window.__game?.story,{timeout:180000});
  await page.screenshot({path:out+'/02-photo.png'});await dismiss();
  await check('fresh game starts with one evidence',async()=>{if(await page.evaluate(()=>window.__game.story.state.evidence.length)!==1)throw Error('bad initial evidence');});
  await aim('incense',[0,0,4.8]);await page.waitForTimeout(700);await page.screenshot({path:out+'/03-main-hall.png'});
  await check('incense closes gate and enters chapter two',async()=>{await interact('incense');if(await page.evaluate(()=>window.__game.story.state.chapter)!==2)throw Error('chapter');});
  for(const id of ['diary','newspaper','tape','ritual'])await check('inspect '+id,async()=>{await aim(id);await page.waitForTimeout(200);const focus=await page.evaluate(()=>window.__game.story.focused()?.id);if(focus!==id)throw Error('not focused: '+focus);await page.keyboard.press('e');await dismiss();if(!await page.evaluate(id=>window.__game.story.state.evidence.includes(id),id))throw Error('not collected');});
  await aim('stage',[0,0,2]);await page.waitForTimeout(500);await page.screenshot({path:out+'/04-opera-stage.png'});
  await check('stage voice choice and silent branch',async()=>{await interact('stage');await page.evaluate(()=>window.__game.story.choose(0));await dismiss();});
  await check('three memory corridor passes unlock the way',async()=>{for(let i=0;i<3;i++)await interact('loopmark');if(!await page.evaluate(()=>window.__game.story.state.flags.loopSolved))throw Error('loop remains');});
  await check('divination gives key',async()=>{await interact('divination');await page.evaluate(()=>window.__game.story.choose(0));await dismiss();if(!await page.evaluate(()=>window.__game.story.state.flags.key))throw Error('key');});
  for(const id of ['death','births','relic'])await check('inspect '+id,async()=>{await aim(id);await page.waitForTimeout(200);const focus=await page.evaluate(()=>window.__game.story.focused()?.id);if(focus!==id)throw Error('not focused: '+focus);await page.keyboard.press('e');await dismiss();});
  await check('underground entrance and truths',async()=>{await interact('descent');await aim('names',[2,0,0]);await page.waitForTimeout(200);await interact('names');await aim('confession');await interact('confession');});
  await page.evaluate(()=>{const g=window.__game;g.player.teleport(55,-7,-14.5,0,0.08);});await page.waitForTimeout(600);await page.screenshot({path:out+'/05-underground.png'});
  await check('true ending requires eleven evidence',async()=>{const n=await page.evaluate(()=>window.__game.story.state.evidence.length);if(n!==11)throw Error('evidence '+n);});
  // finale：送行是可以玩的演出。三個實體位置仍要用 E 依序操作；每段演出用 debug.run 快轉（不渲染、照正式邏輯走），鑰匙要真的按住 E。
  const fin=(js,arg)=>page.evaluate(new Function('a',`const s=window.__game.story,f=s.finale,p=window.__game.player; const advance=seconds=>{for(let t=0;t<seconds;t+=1/30){if(s.modal?.visual&&!s.state.ending&&s.modal.options.length===1)s.choose(0);f.debug.run(1/30);}return f.debug.phase;};return (${js})`),arg);
  const station=async id=>{await aim(id);await page.waitForTimeout(200);const focus=await page.evaluate(()=>window.__game.story.focused()?.id);if(focus!==id)throw Error('ritual target inaccessible: '+focus);await page.keyboard.press('e');};
  await check('ritual wrong order resets, physical stations complete it',async()=>{
    await page.evaluate(()=>window.__game.story.prepareRitual());await page.evaluate(()=>window.__game.story.choose(0));
    await page.evaluate(()=>window.__game.story.ritualAction('riteRelic'));if(await page.evaluate(()=>window.__game.story.ritual.step)!==0)throw Error('order');
    await station('riteName');if(await fin('f.debug.phase')!=='c-name')throw Error('naming did not start: '+await fin('f.debug.phase'));
    await fin('advance(14)');if(await fin('f.debug.phase')!=='c-walk')throw Error('walk did not start');
    await station('riteRelic');if(await fin('f.debug.phase')!=='c-relic')throw Error('relic did not start: '+await fin('f.debug.phase'));
    await fin('advance(52)');if(await fin('f.debug.phase')!=='c-witness-ready')throw Error('roll call did not finish: '+await fin('f.debug.phase'));
    if(await fin('s.state.answers')!==0)throw Error('holding out counted as an answer');
    await station('riteWitness');await fin('advance(15)');if(await fin('f.debug.phase')!=='c-fire')throw Error('fire did not start: '+await fin('f.debug.phase'));
    await page.keyboard.down('e');await fin('advance(7.5)');await page.keyboard.up('e');
    if(!['c-unlock','c-girl'].includes(await fin('f.debug.phase')))throw Error('holding the key did not open the door: '+await fin('f.debug.phase'));
    await fin('advance(75)');
    if(!await page.evaluate(()=>window.__game.story.state.flags.sent))throw Error('not sent');
  });
  await check('C ending completes only after the exit, the gate and the answer',async()=>{
    if(await fin('s.state.ending'))throw Error('ended too early');
    if(await fin('f.debug.phase')!=='c-exit')throw Error('not at exit: '+await fin('f.debug.phase'));
    await fin('(p.teleport(55,-7,-12.6,Math.PI,0),advance(9))');if(await fin('f.debug.phase')!=='c-up')throw Error('stairs did not lead up');
    await fin('(p.teleport(0,16.9,-17.2,Math.PI,0),advance(8))');if(await fin('f.debug.phase')!=='c-gate')throw Error('terrace did not lead to the gate: '+await fin('f.debug.phase'));
    await fin('advance(12)');if(await fin('s.state.ending')||await fin('f.debug.phase')!=='c-gate')throw Error('gate answered by itself');
    await page.keyboard.press('e');await fin('advance(26)');
    if(await page.evaluate(()=>window.__game.story.state.ending)!=='C')throw Error('C did not finish: '+await fin('f.debug.phase'));
  });
  await page.screenshot({path:out+'/06-ending-c.png'});
  console.log('RENDER',await page.evaluate(()=>({fps:Math.round(window.__game.fps),calls:window.__game.renderer.info.render.calls,triangles:window.__game.renderer.info.render.triangles})));
}catch(e){errors.push(e.stack||String(e));}
finally{fs.writeFileSync(out+'/smoke-results.json',JSON.stringify({results,errors},null,2));console.log('ERRORS',JSON.stringify(errors));await browser.close();}
if(errors.length||results.some(r=>!r.pass))process.exitCode=1;
