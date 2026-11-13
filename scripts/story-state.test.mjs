import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newState,collect,validateSave,EVIDENCE,trueEndingReady,missingEvidence,objectives} from '../src/story/campaign.js';

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
