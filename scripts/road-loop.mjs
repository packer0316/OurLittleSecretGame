import {chromium} from 'playwright-core';
import fs from 'node:fs';
const out='artifacts/road-loop';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
const check=async(name,fn)=>{try{const detail=await fn();results.push({name,pass:true,detail});console.log('PASS',name,detail||'');}catch(e){results.push({name,pass:false,error:String(e)});console.log('FAIL',name,String(e));}};
const shot=async name=>{await page.waitForTimeout(350);await page.screenshot({path:`${out}/${name}.png`});};
const close=async()=>{for(let i=0;i<12;i++){if(!await page.evaluate(()=>!!window.__game.story?.modal))break;await page.keyboard.press('Enter');await page.waitForTimeout(80);}};
const aim=async(id,pos)=>page.evaluate(([id,pos])=>{const g=window.__game,t=g.map.storyWorld.targets.find(t=>t.id===id).position,p=g.player;if(pos)p.teleport(...pos);const dx=t.x-p.pos.x,dz=t.z-p.pos.z,dy=t.y-p.pos.y-p.eye;p.teleport(p.pos.x,p.pos.y,p.pos.z,Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz)));g.renderOnce();return g.story.focused()?.id;},[id,pos]);
const inspect=async(id)=>{const got=await aim(id);if(got!==id)throw Error(`${id} focus hit ${got}`);await page.keyboard.press('e');await page.waitForTimeout(100);};
// Drive the same WASD controls a player uses; no teleporting along the route.
const walk=async(x,z)=>{
  const begin=Date.now();let best=Infinity,lastProgress=Date.now();await page.keyboard.down('w');
  try{while(Date.now()-begin<45000){const r=await page.evaluate(([x,z])=>{const p=window.__game.player,dx=x-p.pos.x,dz=z-p.pos.z;p.yaw=Math.atan2(-dx,-dz);p.pitch=-.04;return {d:Math.hypot(dx,dz),p:p.pos.toArray()};},[x,z]);if(r.d<.3)break;if(r.d<best-.1){best=r.d;lastProgress=Date.now();}if(Date.now()-lastProgress>5000)throw Error('blocked walking to '+[x,z]+' at '+r.p);await page.waitForTimeout(100);}
  }finally{await page.keyboard.up('w');await page.waitForTimeout(200);}
  const p=await page.evaluate(()=>window.__game.player.pos.toArray());if(Math.hypot(x-p[0],z-p[2])>.65)throw Error('route incomplete '+p);return p;
};
try{
  await page.goto('http://127.0.0.1:5178/?auto&map=road');await page.waitForFunction(()=>window.__game?.running&&window.__game.map?.id==='road',null,{timeout:120000});
  await shot('01-parked-car-road');
  await check('walk to bus shelter and read the timetable',async()=>{await walk(-2.7,23.1);await inspect('bus');await close();if(!await page.evaluate(()=>window.__game.story.state.road.step===1))throw Error('bus not saved');});
  await aim('bus');await shot('02-bus-shelter');
  await check('cross the bridge and investigate village notice',async()=>{await walk(0,19);await walk(0,9);await shot('03-bridge-village');await walk(2.2,6.6);await inspect('notice');await close();if(!await page.evaluate(()=>window.__game.story.bridgeCue&&window.__game.story.state.road.step===2))throw Error('bridge/notice');});
  await check('early gate cannot skip the investigation',async()=>{const result=await page.evaluate(()=>{const s=window.__game.story;s.interact('gate');return !!s.modal&&s.state.scene==='road';});if(!result)throw Error('gate skipped');await close();});
  await check('enter workshop through actual opening and inspect adult remains',async()=>{await walk(0,2);await walk(0,-12);await walk(8.5,-12.7);await aim('remains');await shot('04-workshop-entry');await walk(8.5,-17.1);await inspect('remains');await shot('05-remains-description');await close();await aim('remains');await shot('06-ritual-table');});
  await check('reach ledger without walking through the workbench',async()=>{await walk(10.5,-17.6);await inspect('ledger');await close();if(!await page.evaluate(()=>window.__game.story.state.road.step===4))throw Error('ledger');});
  await check('optional furnace clue has a reachable viewing position',async()=>{await walk(10,-20.3);await walk(7.4,-20.1);await inspect('kiln');await close();await aim('kiln');await shot('07-furnace');});
  await check('road save resumes position and evidence',async()=>{await page.evaluate(()=>window.__game.story.save());const before=await page.evaluate(()=>window.__game.player.pos.toArray());await page.goto('http://127.0.0.1:5178/?auto&map=road&resume');await page.waitForFunction(()=>window.__game?.running&&window.__game.story?.state.road.step===4);const s=await page.evaluate(()=>({p:window.__game.player.pos.toArray(),r:window.__game.story.state.road}));if(!s.r.notes.includes('kiln')||Math.hypot(...s.p.map((x,i)=>x-before[i]))>.1)throw Error(JSON.stringify(s));});
  await check('walk out of workshop and continue to temple',async()=>{await walk(6.6,-20.1);await walk(6.6,-17);await walk(8.5,-16.4);await walk(8.5,-12.7);await walk(0,-12.7);await walk(0,-33.8);await inspect('gate');await page.keyboard.press('1');await page.waitForFunction(()=>window.__game?.running&&window.__game.story?.state.scene==='temple',null,{timeout:180000});const s=await page.evaluate(()=>window.__game.story.state);if(s.road.step!==5||!s.flags.prologueComplete||await page.evaluate(()=>!!window.__game.story.modal))throw Error('temple transition');await shot('08-temple-arrival');});
}catch(e){errors.push(e.stack||String(e));}
finally{fs.writeFileSync(out+'/results.json',JSON.stringify({results,errors},null,2));console.log('ERRORS',errors);await browser.close();}
if(errors.length||results.some(r=>!r.pass))process.exitCode=1;
