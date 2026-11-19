// story：劇情文字與小陳設的截圖稽核。逐張輸出到 artifacts/story/review/，供人工閱讀。
// 用法：node scripts/story-review-shots.mjs [temple|home|road|all]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out='artifacts/story/review';fs.mkdirSync(out,{recursive:true});
const which=process.argv[2]||'all';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
const shot=async name=>{await page.waitForTimeout(250);await page.screenshot({path:`${out}/${name}.png`});console.log('SHOT',name);};
// 只關掉目前這一張，不觸發選項的後果（呼名選項會開始追逐）。
const closeAll=async()=>page.evaluate(()=>{const g=window.__game,s=g.story;s.modal=null;s.chase=null;g.player.storyChase=false;g.map.storyWorld.ghost&&(g.map.storyWorld.ghost.root.visible=false);document.getElementById('story-layer').classList.add('hidden');document.getElementById('chase-hud')?.classList.add('hidden');const v=document.getElementById('danger-vignette');if(v)v.style.opacity=0;});
const look=async(pos,at)=>page.evaluate(([pos,at])=>{const g=window.__game,p=g.player;p.teleport(...pos);const dx=at[0]-p.pos.x,dz=at[2]-p.pos.z,dy=at[1]-(p.pos.y+p.eye);p.teleport(p.pos.x,p.pos.y,p.pos.z,Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz)));g.renderOnce();},[pos,at]);
try{
  if(which==='temple'||which==='all'){
    await page.goto('http://127.0.0.1:5178/?auto&map=temple');
    await page.waitForFunction(()=>window.__game?.running&&window.__game?.story,{timeout:180000});
    await shot('t00-photo');await closeAll();
    await page.evaluate(()=>window.__game.story.interact('rules'));await shot('t01-rules');await closeAll();
    await page.evaluate(()=>{const s=window.__game.story;Object.assign(s.state.flags,{incense:true});s.state.chapter=2;s.sync();});
    for(const id of ['diary','newspaper','tape','ritual']){await page.evaluate(id=>{const s=window.__game.story;s.collect(id);s.document(id);},id);await shot('t02-'+id);await closeAll();}
    for(const id of ['log','rulebook']){await page.evaluate(id=>window.__game.story.interact(id),id);await shot('t03-note-'+id);await closeAll();}
    await page.evaluate(()=>{const s=window.__game.story;s.collect('stage');s.state.flags.stage=true;s.sync();s.document('stage');});await shot('t04-stage');await closeAll();
    await page.evaluate(()=>window.__game.story.voiceTrap('stage'));await shot('t05-trap-stage');await closeAll();
    await page.evaluate(()=>{const s=window.__game.story;s.state.road.peishan='question';s.voiceTrap('divination');});await shot('t06-trap-peishan');await closeAll();
    await page.evaluate(()=>{const s=window.__game.story;Object.assign(s.state.flags,{loopSolved:true,key:true,underground:true});s.state.chapter=4;s.sync();});
    for(const id of ['death','births','relic','names','confession']){await page.evaluate(id=>{const s=window.__game.story;s.collect(id);s.document(id);},id);await shot('t07-'+id);await closeAll();}
    await page.evaluate(()=>window.__game.story.interact('shoes'));await shot('t08-note-shoes');await closeAll();
    await page.evaluate(()=>{const s=window.__game.story;s.state.answers=2;s.finalChoice();});await shot('t09-final-choice');await closeAll();
    await page.evaluate(()=>window.__game.story.journal());await shot('t10-journal');await closeAll();
    // 小陳設：板夾、規矩簿、戲台椅子下的東西、門前的女鞋。
    await look([-8.5,.9,-18.9],[-8.6,1.85,-20.1]);await shot('p01-clipboard-desk');
    await look([-8.5,6.9,-17.2],[-8.6,7.85,-18.4]);await shot('p02-rulebook-desk');
    await look([21.6,.58,-.4],[19.9,.6,-2.4]);await shot('p03-stage-seats-west');
    await look([24.6,.58,-1.2],[26,.6,.2]);await shot('p04-stage-seat-east');
    await look([58.4,-7,-24.3],[58.39,-6.95,-25.6]);await shot('p05-shoes');
    for(const e of ['A','B','C']){await page.evaluate(e=>{const s=window.__game.story;s.modal=null;s.state.ending=null;s.state.answers=e==='C'?0:2;s.state.deaths=1;s.finish(e);},e);await shot('t11-ending-'+e);}
  }
  if(which==='home'||which==='all'){
    await page.goto('http://127.0.0.1:5178/?auto&map=home');
    await page.waitForFunction(()=>window.__game?.running&&window.__game.story?.state.scene==='home',null,{timeout:120000});
    await page.evaluate(()=>{const s=window.__game.story;s.state.home.step=1;s.sync();s.interact('letter');});await shot('h01-letter');await closeAll();
    await page.evaluate(()=>{const s=window.__game.story;s.modal=null;s.state.home.step=2;s.sync();s.interact('phone');});
    for(let i=0;i<5;i++)await page.evaluate(()=>window.__game.story.choose(0));
    await shot('h02-door-choice');await page.evaluate(()=>window.__game.story.choose(1));await shot('h03-answered');await closeAll();
    await page.evaluate(()=>window.__game.story.interact('slip'));await shot('h04-slip');await closeAll();
    await page.evaluate(()=>window.__game.story.interact('phone'));await shot('h04-call-log');await closeAll();
    await page.evaluate(()=>window.__game.story.journal());await shot('h04-journal');await closeAll();
    for(const id of ['calendar','window','message']){await page.evaluate(id=>window.__game.story.interact(id),id);await shot('h05-'+id);await closeAll();}
    await page.evaluate(()=>{const s=window.__game.story;s.state.home.step=5;s.sync();s.interact('door');});await shot('h06-leave');await closeAll();
  }
  if(which==='road'||which==='all'){
    await page.goto('http://127.0.0.1:5178/?auto&map=road');
    await page.waitForFunction(()=>window.__game?.running&&window.__game.map?.id==='road',null,{timeout:120000});
    for(const [i,id] of ['bus','notice','remains','ledger'].entries()){await page.evaluate(([i,id])=>{const s=window.__game.story;s.state.road.step=i;s.interact(id);},[i,id]);await shot('r0'+(i+1)+'-'+id);await closeAll();}
    for(const id of ['car','kiln','gate']){await page.evaluate(id=>window.__game.story.interact(id),id);await shot('r05-'+id);await closeAll();}
    await page.evaluate(()=>window.__game.story.peishanCall());await shot('r06-peishan');await page.evaluate(()=>window.__game.story.choose(1));
    for(let i=0;i<6;i++){await shot('r07-peishan-line'+i);await page.evaluate(()=>window.__game.story.choose(0));}
    await page.evaluate(()=>window.__game.story.journal());await shot('r08-archive');await closeAll();
  }
}catch(e){errors.push(e.stack||String(e));}
finally{console.log('ERRORS',JSON.stringify(errors));await browser.close();}
if(errors.length)process.exitCode=1;
