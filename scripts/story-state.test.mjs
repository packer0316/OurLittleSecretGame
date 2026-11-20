import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newState,collect,validateSave,EVIDENCE,NOTES,readNote,noteOpen,trueEndingReady,missingEvidence,objectives} from '../src/story/campaign.js';
import {preludeRecords} from '../src/story/preludeRecords.js';

test('main route progresses regardless of the first three evidence order',()=>{
  for(const order of [['diary','newspaper','tape'],['tape','newspaper','diary'],['newspaper','diary','tape']]){
    const s=newState();s.flags.incense=true;s.chapter=2;
    collect(s,order[0]);collect(s,order[1]);assert.equal(s.chapter,2);collect(s,order[2]);assert.equal(s.chapter,3);assert.equal(objectives(s)[0].id,'stage');
    s.flags.stage=true;assert.equal(objectives(s)[0].id,'loopmark');s.flags.loopSolved=true;assert.equal(objectives(s)[0].id,'divination');
    s.flags.key=true;assert.equal(objectives(s)[0].id,'death');collect(s,'death');assert.equal(objectives(s)[0].id,'descent');
  }
});
test('every one of the eleven clues is required for C, wrong answers do not lock it',()=>{
  for(const missing of Object.keys(EVIDENCE)){
    const s=newState();s.evidence=Object.keys(EVIDENCE).filter(k=>k!==missing);s.answers=8;s.deaths=3;
    assert.equal(trueEndingReady(s),false);assert.deepEqual(missingEvidence(s),[missing]);collect(s,missing);assert.equal(trueEndingReady(s),true);
  }
});
test('save roundtrip restores evidence, chapter, position and exit state',()=>{
  const s=newState();Object.assign(s.flags,{incense:true,stage:true,loopSolved:true,key:true,underground:true,sent:true});
  for(const id of Object.keys(EVIDENCE))collect(s,id);s.position=[55,-7,-14,1,.1];s.answers=2;s.deaths=1;
  const restored=validateSave(JSON.parse(JSON.stringify(s)));assert.equal(restored.chapter,4);assert.deepEqual(restored.position,s.position);assert.equal(trueEndingReady(restored),true);assert.equal(objectives(restored)[0].id,'exit');
});
test('damaged and old saves cannot introduce unknown evidence or invalid positions',()=>{
  assert.equal(validateSave(null),null);assert.equal(validateSave({version:0}),null);assert.equal(validateSave({...newState(),flags:[]}),null);
  const raw={...newState(),evidence:['photo','photo','bad','__proto__','toString',null],position:[55,Infinity,0,0,0],elapsed:-12,answers:NaN,ending:'toString'};
  const restored=validateSave(raw);assert.deepEqual(restored.evidence,['photo']);assert.equal(restored.position,null);assert.equal(restored.ending,null);assert.equal(restored.answers,0);assert.equal(restored.elapsed,0);
});
test('old temple saves and all three scene checkpoints remain compatible',()=>{
  const old={...newState(),flags:{incense:true},position:[0,.9,-16,0,0]};delete old.scene;delete old.home;delete old.road;
  assert.equal(validateSave(old).scene,'temple');assert.equal(validateSave(old).chapter,2);
  for(const [scene,p]of [['home',[1.6,0,2.3,3.14,-.2]],['road',[8.4,.12,-17,0,0]],['temple',[55,-7,-18,0,0]]]){
    const s={...newState(),scene,position:p,home:{step:6,notes:['window','calendar']},road:{step:4,notes:['kiln']},flags:{prologueComplete:true}};
    const r=validateSave(JSON.parse(JSON.stringify(s)));assert.equal(r.scene,scene);assert.deepEqual(r.position,p);assert.deepEqual(r.home.notes,s.home.notes);assert.deepEqual(r.road.notes,['kiln']);assert.equal(r.flags.prologueComplete,true);
  }
  const bad=validateSave({...newState(),scene:'home',position:[55,-7,-18,0,0],home:{step:900,notes:['__proto__','window','window']},road:{step:-7,notes:null}});
  assert.equal(bad.position,null);assert.equal(bad.home.step,6);assert.deepEqual(bad.home.notes,['window']);assert.equal(bad.road.step,0);
});
test('archived records reveal only encountered clues and retain the outside witness',()=>{
  const s=newState();assert.deepEqual(preludeRecords(s),[]);
  s.home.step=3;s.home.notes=['window'];s.road.step=2;
  let text=preludeRecords(s).flat().join(' ');assert.match(text,/23:47/);assert.doesNotMatch(text,/郭建成|借聲登記簿|佩珊/);
  s.road.step=4;s.road.peishan='question';s.flags.prologueComplete=true;
  const loaded=validateSave(s);assert.equal(loaded.road.peishan,'question');text=preludeRecords(loaded).flat().join(' ');assert.match(text,/郭建成/);assert.match(text,/佩珊/);
  assert.equal(validateSave({...s,road:{...s.road,peishan:'__proto__'}}).road.peishan,null);
});
test('optional readables are whitelisted, never count as evidence and survive old saves',()=>{
  const s=newState();assert.deepEqual(s.notes,[]);
  for(const id of Object.keys(NOTES)){assert.equal(Object.hasOwn(EVIDENCE,id),false);assert.equal(readNote(s,id),true);assert.equal(readNote(s,id),false);}
  assert.equal(readNote(s,'__proto__'),false);assert.equal(s.evidence.length,1);assert.equal(trueEndingReady(s),false);
  const saved=validateSave(JSON.parse(JSON.stringify({...s,notes:[...s.notes,'log','bad','toString',null],home:{step:3,notes:[],answered:true}})));
  assert.deepEqual(saved.notes,Object.keys(NOTES));assert.equal(saved.home.answered,true);
  const old=JSON.parse(JSON.stringify(newState()));delete old.notes;delete old.home.answered;
  const restored=validateSave(old);assert.deepEqual(restored.notes,[]);assert.equal(restored.home.answered,false);
  assert.equal(validateSave({...newState(),notes:'log',home:{step:1,notes:[],answered:'yes'}}).notes.length,0);
});
test('story traces: every readable has an opening time that follows the chapters and never leaks a name early',()=>{
  // 第二輪新增：朋友們的痕跡、林美蘭的素衣與木牌、郭家的名冊與鐵桶。
  for(const id of ['robe','flashlight','chalk','tablet','camp','register','bucket'])assert.ok(Object.hasOwn(NOTES,id),id);
  const s=newState();
  for(const id of Object.keys(NOTES)){assert.equal(noteOpen(s,id),false,id+' open before the incense');assert.ok(NOTES[id].text.split('\n').length<=5,id+' longer than five paragraphs');}
  assert.equal(noteOpen(s,'__proto__'),false);assert.equal(noteOpen(s,'toString'),false);
  s.flags.incense=true;assert.deepEqual(Object.keys(NOTES).filter(id=>noteOpen(s,id)),['log','robe','rulebook','flashlight']);
  s.flags.stage=true;assert.equal(noteOpen(s,'chalk'),true);assert.equal(noteOpen(s,'camp'),false);
  s.flags.key=true;for(const id of ['camp','register','bucket'])assert.equal(noteOpen(s,id),true,id);
  assert.equal(noteOpen(s,'tablet'),false,'the tablet names 小雨 before the height marks do');collect(s,'death');collect(s,'births');assert.equal(noteOpen(s,'tablet'),true);
  assert.equal(noteOpen(s,'shoes'),false);s.flags.underground=true;assert.equal(noteOpen(s,'shoes'),true);
  // 開放前看得到的讀物，不能說出還沒查到的名字
  for(const id of ['robe','flashlight','chalk'])assert.doesNotMatch(NOTES[id].text,/林小雨|小雨|林美蘭/,id);
  for(const id of ['camp','register','bucket'])assert.doesNotMatch(NOTES[id].text,/小雨/,id);
  // 讀過新讀物不影響證據、章節與結局門檻
  const r=newState();for(const id of Object.keys(NOTES))readNote(r,id);assert.equal(r.evidence.length,1);assert.equal(r.chapter,1);assert.equal(trueEndingReady(r),false);
});
test('the one-time recorder beat is remembered through a save (contract A)',()=>{
  const s=newState();s.seen.push('story:camp','dread:hideseek');const r=validateSave(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(r.seen,['story:camp','dread:hideseek']);
  assert.deepEqual(validateSave({...newState(),seen:['story:camp','Bad Id',42,'story:camp']}).seen,['story:camp']);
});
test('objectives and missing-evidence hints never leak the title of an undiscovered clue',()=>{
  const s=newState();s.flags.incense=true;s.chapter=2;
  for(const o of objectives(s))assert.equal(Object.values(EVIDENCE).some(e=>o.title.includes(e.title)),false,o.title);
  Object.assign(s.flags,{stage:true,loopSolved:true,key:true,underground:true});for(const id of ['diary','newspaper','tape','stage','death'])collect(s,id);
  for(const o of objectives(s))assert.equal(Object.values(EVIDENCE).some(e=>o.title.includes(e.title)),false,o.title);
});
