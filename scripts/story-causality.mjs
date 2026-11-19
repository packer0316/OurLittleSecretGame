// story：劇情修訂的回歸測試。可選讀物、規矩的考驗、選擇的後果、提示光點不再閃爍。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out='artifacts/story';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[],results=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
const test=async(name,fn)=>{try{const detail=await fn();results.push({name,pass:true,detail});console.log('PASS',name,detail??'');}catch(e){results.push({name,pass:false,error:String(e)});console.log('FAIL',name,String(e));}};
const must=(ok,msg)=>{if(!ok)throw Error(msg);};
const dismiss=async()=>{for(let i=0;i<30;i++){if(await page.evaluate(()=>window.__game.story.modal?.options.length)!==1)break;await page.evaluate(()=>window.__game.story.choose(0));}};
const copy=()=>page.evaluate(()=>document.querySelector('#story-layer .story-card')?.innerText||'');
const aim=async(id,offset=[0,0,1.5])=>page.evaluate(([id,off])=>{const g=window.__game,p=g.player,t=g.map.storyWorld.targets.find(t=>t.id===id).position;const floor=t.y<0?-7:t.y>6?6.9:.9;p.teleport(t.x+off[0],floor,t.z+off[2],0,0);const dx=t.x-p.pos.x,dz=t.z-p.pos.z,dy=t.y-(p.pos.y+p.eye);p.teleport(p.pos.x,p.pos.y,p.pos.z,Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz)));g.renderOnce();return g.story.focused()?.id;},[id,offset]);
try{
  // ── 住處：規矩先說，再考；應門會被記住 ──
  await page.goto('http://127.0.0.1:5178/?auto&map=home');await page.waitForFunction(()=>window.__game?.running&&window.__game.story?.state.scene==='home',null,{timeout:120000});
  await test('home: the rule is stated before the door choice, and answering is remembered',async()=>{
    await page.evaluate(()=>{const s=window.__game.story;s.state.home.step=2;s.sync();s.interact('phone');});
    for(let i=0;i<5;i++)await page.evaluate(()=>window.__game.story.choose(0));
    const ask=await copy();must(ask.includes('先不要應')&&ask.includes('敲了三下'),'rule missing before choice');
    must(await page.evaluate(()=>window.__game.story.modal.options.length)===2,'door choice missing');
    await page.evaluate(()=>window.__game.story.choose(1));
    must(await page.evaluate(()=>{const s=window.__game.story.state;return s.answers===1&&s.home.answered===true&&s.home.step===3;}),'answer not counted');
    must((await copy()).includes('誰在外面'),'voice did not echo the player');
    await page.evaluate(()=>{const s=window.__game.story;s.modal=null;document.getElementById('story-layer').classList.add('hidden');s.interact('slip');});
    must((await copy()).includes('我剛才應了它一聲'),'slip forgot the answer');await page.evaluate(()=>{const s=window.__game.story;s.modal=null;document.getElementById('story-layer').classList.add('hidden');});
  });
  // ── 寺廟 ──
  await page.goto('http://127.0.0.1:5178/?auto&map=temple');await page.waitForFunction(()=>window.__game?.running&&window.__game?.story,{timeout:180000});await dismiss();
  await test('optional readables are locked before the incense, then reachable with E and never count as evidence',async()=>{
    must(await page.evaluate(()=>!window.__game.story.active('log')&&!window.__game.story.active('rulebook')&&!window.__game.story.active('shoes')),'notes active too early');
    await page.evaluate(()=>{const s=window.__game.story;s.state.flags.incense=true;s.state.chapter=2;s.sync();});
    for(const id of ['log','rulebook']){const f=await aim(id);must(f===id,`${id} focus hit ${f}`);await page.keyboard.press('e');await page.waitForTimeout(120);must((await copy()).length>80,'note did not open');await page.screenshot({path:`${out}/12-note-${id}.png`});await dismiss();}
    must(await page.evaluate(()=>{const s=window.__game.story.state;return s.notes.join()==='log,rulebook'&&s.evidence.length===1;}),'note bookkeeping');
    // 緊鄰的主線證物仍然優先被對準，不會被讀物搶走焦點。
    for(const id of ['diary','tape']){const f=await aim(id,[0,0,1.8]);must(f===id,`${id} lost focus to ${f}`);}
    await page.evaluate(()=>window.__game.story.journal());must(await page.locator('.note-link').count()===2,'journal does not list read notes');
    must((await page.locator('#clue-count').innerText()).includes('1 / 11'),'evidence counter changed');await dismiss();
  });
  await test('hint sparkle is steady: no dropped frames on inactive or already-read targets',async()=>{
    // 站在一樓西桌旁：log 已讀、stage 尚未開放（兩者都不該亮）；diary 可調查（應該一直亮）。
    await page.evaluate(()=>window.__game.player.teleport(-9,.9,-18.2,0,-.3));await page.waitForTimeout(600);
    const seen={log:new Set(),diary:new Set()};
    for(let i=0;i<40;i++){const v=await page.evaluate(()=>Object.fromEntries(window.__game.map.storyWorld.targets.filter(t=>['log','diary'].includes(t.id)).map(t=>[t.id,t.glint.visible])));seen.log.add(v.log);seen.diary.add(v.diary);await page.waitForTimeout(16);}
    must(seen.log.size===1&&!seen.log.has(true),'read note still sparkles: '+[...seen.log]);must(seen.diary.size===1&&seen.diary.has(true),'active clue flickers: '+[...seen.diary]);
  });
  await test('objective bar and missing list describe objects, not undiscovered evidence titles',async()=>{
    await page.waitForTimeout(250);const title=await page.locator('#objective-title').innerText();must(!/停在六|從外側扣上|被接回去/.test(title),'objective leaks: '+title);
    await page.evaluate(()=>{const s=window.__game.story;for(const id of ['diary','newspaper','tape','stage','death','names','confession'])s.collect(id);Object.assign(s.state.flags,{stage:true,loopSolved:true,key:true,underground:true});s.state.chapter=4;s.sync();s.prepareRitual();});
    const missing=await copy();must(!/補過左耳|被磨平的送行盤|六道身高/.test(missing)&&/布包|木盤|木尺架/.test(missing),'missing list leaks titles');await dismiss();
  });
  await test('stage replay shows its evidence page before the voice asks for an answer',async()=>{
    await page.evaluate(()=>{const s=window.__game.story;s.state.evidence=s.state.evidence.filter(id=>id!=='stage');s.state.flags.stage=false;s.state.flags.key=false;s.state.flags.loopSolved=false;s.state.chapter=3;s.sync();s.stage();});
    for(let i=0;i<8;i++)await page.evaluate(()=>window.__game.story.choose(0));
    const doc=await copy();must(doc.includes('第六張椅子')&&doc.includes('識別證'),'stage evidence page not shown');
    await page.evaluate(()=>window.__game.story.choose(0));must(await page.evaluate(()=>window.__game.story.modal.options.length)===3,'voice trap missing');
    must((await copy()).includes('勿應')||(await copy()).includes('不要應'),'trap does not restate the rule');
    await page.evaluate(()=>window.__game.story.choose(0));await dismiss();must(await page.evaluate(()=>!window.__game.story.chase&&window.__game.story.state.answers===0),'silence was punished');
  });
  await test('second voice trap replays the exact line Peishan said on the road',async()=>{
    await page.evaluate(()=>{const s=window.__game.story;s.state.road.peishan='question';s.voiceTrap('divination');});
    const t=await copy();must(t.includes('你在哪裡？')&&t.includes('02:39'),'Peishan variant missing');await page.screenshot({path:`${out}/13-trap-peishan.png`});
    await page.evaluate(()=>window.__game.story.choose(0));await dismiss();must(await page.evaluate(()=>!window.__game.story.chase),'silence started a chase');
    await page.evaluate(()=>{const s=window.__game.story;s.state.road.peishan=null;s.voiceTrap('divination');});must((await copy()).includes('阿哲的聲音'),'default variant missing');
    await page.evaluate(()=>{const s=window.__game.story;s.modal=null;document.getElementById('story-layer').classList.add('hidden');});
  });
  await test('underground: the shoes unlock with the descent; reading shoes and rabbit names the woman',async()=>{
    must(await page.evaluate(()=>window.__game.story.active('shoes')),'shoes locked underground');
    const f=await aim('shoes',[0,0,1.3]);must(f==='shoes','shoes focus hit '+f);await page.waitForTimeout(300);await page.screenshot({path:`${out}/14-shoes.png`});
    await page.keyboard.press('e');await page.waitForTimeout(120);must((await copy()).includes('媽媽這次有應'),'shoes text');await dismiss();
    await page.evaluate(()=>{const s=window.__game.story;s.collect('relic');s.journal();});must((await copy()).includes('林美蘭'),'journal deduction missing');await dismiss();
  });
  await test('final choice and endings remember answers, captures and Peishan',async()=>{
    await page.evaluate(()=>{const s=window.__game.story;s.state.answers=2;s.finalChoice();});const fc=await copy();must(fc.includes('應過它兩次')&&fc.includes('門的另一邊'),'final choice forgot answers');
    await page.evaluate(()=>{const s=window.__game.story;s.modal=null;s.state.deaths=1;s.finish('A');});const a=await copy();must(a.includes('裡面還有沒有人')&&a.includes('都出來了')&&a.includes('第三次')&&a.includes('被追上 1 次'),'ending A');await page.screenshot({path:`${out}/15-ending-a-remembers.png`});
    await page.evaluate(()=>{const s=window.__game.story;s.modal=null;s.state.ending=null;s.state.answers=0;s.state.road.peishan=null;s.finish('C');});const c=await copy();must(c.includes('沒有借到你的聲音')&&c.includes('是你先開口')&&c.includes('阿哲醒來'),'ending C without Peishan');
    await page.evaluate(()=>{const s=window.__game.story;s.modal=null;s.state.ending=null;s.state.road.peishan='trust';s.finish('C');});must((await copy()).includes('這次，一個都不刪'),'ending C with Peishan');
  });
}catch(e){errors.push(e.stack||String(e));}
finally{fs.writeFileSync(out+'/causality-results.json',JSON.stringify({results,errors},null,2));console.log('ERRORS',JSON.stringify(errors));await browser.close();}
if(errors.length||results.some(r=>!r.pass))process.exitCode=1;
