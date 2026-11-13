import * as THREE from 'three';
import { SAVE_KEY, CHAPTERS, EVIDENCE, ENDINGS, newState, validateSave, collect, trueEndingReady, missingEvidence, objectives } from './campaign.js';

const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paragraphs=s=>s.split('\n').filter(Boolean).map(p=>`<p>${escape(p)}</p>`).join('');
const ART=import.meta.env.BASE_URL+'assets/story/';
export function readSave(key=SAVE_KEY){try{return validateSave(JSON.parse(localStorage.getItem(key)));}catch{return null;}}

export class Story {
  constructor(game,{resume=false,onResume=()=>{},onLobby=()=>{}}={}){
    this.game=game;this.world=game.map.storyWorld;this.state=resume?(readSave()||newState()):newState();
    this.onResume=onResume;this.onLobby=onLobby;this.modal=null;this.started=false;this.chase=null;this.ritual=null;this.toastTime=0;this.tick=0;
    this.look=new THREE.Vector3();this.delta=new THREE.Vector3();this.projected=new THREE.Vector3();this.events=[];
    this.mount();this.sync();
    if(resume&&this.state.position){game.player.teleport(...this.state.position);}
    if(this.state.ending)this.state.ending=null; // continue from last safe play state, never lock the session in an ending
    this.onKey=e=>{
      if(!game.running||e.repeat)return;
      if(this.modal){
        const i=Number(e.key)-1;
        if(i>=0&&i<this.modal.options.length){e.preventDefault();this.choose(i);}
        else if((e.code==='KeyE'||e.code==='Space'||e.code==='Enter')&&this.modal.options.length===1){e.preventDefault();this.choose(0);}
        else if(e.code==='Escape'&&this.modal.dismiss){e.preventDefault();this.choose(this.modal.options.length-1);}
        return;
      }
      if(e.code==='KeyE'){e.preventDefault();const target=this.focused();if(target)this.interact(target.id);}
      if(e.code==='KeyJ'){e.preventDefault();if(!this.chase)this.journal();else this.toast('先退回燈下，再查看筆記。');}
    };
    window.addEventListener('keydown',this.onKey);
    this.onUnload=()=>{if(!this.chase&&!this.ritual&&!this.state.ending)this.save();};window.addEventListener('beforeunload',this.onUnload);
  }
  mount(){
    $('story-layer')?.remove();$('story-hud')?.remove();
    const hud=document.createElement('div');hud.id='story-hud';hud.innerHTML=`<div class="objective"><span id="chapter-label"></span><h3 id="objective-title"></h3><p id="objective-place"></p><small id="objective-distance"></small></div><div id="story-toast" role="status"></div><div id="interact-prompt"></div><div id="waypoint"></div><div id="danger-vignette"></div><div id="chase-hud" class="hidden"></div><div id="ritual-hud" class="hidden"></div><div class="journal-hint"><kbd>E</kbd> 調查　<kbd>J</kbd> 筆記　<span id="clue-count"></span></div>`;
    $('hud').appendChild(hud);
    const layer=document.createElement('section');layer.id='story-layer';layer.className='story-layer hidden';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-labelledby','story-title');document.body.appendChild(layer);
  }
  start(){if(this.started)return;this.started=true;
    if(this.state.flags.prologueComplete){this.toast('02:47。照片與來電都指向慈雲寺。沿參道進入正殿。');return;}
    if(this.state.flags.incense||this.state.elapsed>5){this.toast('已繼續上次的調查。J 開啟筆記。');return;}
    this.game.audio.breathCue?.();
    this.document('photo',()=>this.dialogue([
      ['我','沒有寄件人。照片裡六個孩子……穿黃衣的是我。'],
      ['電話裡的男人','以安。你還記得……那扇門怎麼開嗎？'],
      ['我','阿哲？你在哪裡？'],
      ['電話裡的女孩','你終於要回來接我了嗎？'],
      ['我','2026 年 11 月 13 日，02:47。慈雲寺山門外。這次，我要知道發生過什麼。'],
    ],()=>{this.save();this.toast('沿參道進入慈雲寺，調查一樓正殿的香。');},'沒有寄件人的信'));
  }
  show({eyebrow='慈雲寺・調查紀錄',title,body='',image=null,redacted=false,options=[{text:'收起',action:()=>{}}],dismiss=false,kind=''}){
    this.modal={options,dismiss};this.game.player.enabled=false;this.game.player.keys=Object.create(null);this.game.player.vel.set(0,0,0);
    const photo=image?`<figure class="story-figure ${redacted?'redacted':''}"><img src="${ART+image}" alt="${escape(title)}">${redacted?'<i class="photo-scribble" aria-label="女孩的臉被紅筆塗去"></i>':''}</figure>`:'';
    $('story-layer').className=`story-layer ${kind}`;
    $('story-layer').innerHTML=`<article class="story-card"><p class="story-eyebrow">${escape(eyebrow)}</p><h2 id="story-title">${escape(title)}</h2><div class="story-content ${image?'with-image':''}">${photo}<div class="story-copy">${body}</div></div><nav class="story-choices">${options.map((o,i)=>`<button data-choice="${i}" ${o.disabled?'disabled':''}><span>${i+1<10?i+1:'·'}</span>${escape(o.text)}</button>`).join('')}</nav><small class="story-instruction">${options.length===1?'E / Enter 繼續':'點擊選項，或按數字鍵選擇'} · 閱讀時停止移動與計時</small></article>`;
    $('story-layer').querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>this.choose(+b.dataset.choice)));
    if(document.pointerLockElement)document.exitPointerLock();
    $('story-layer').querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  choose(i){const opt=this.modal?.options[i];if(!opt||opt.disabled)return;
    this.modal=null;$('story-layer').classList.add('hidden');opt.action?.();
    if(!this.modal&&!this.state.ending&&!this.transitioning&&this.game.map&&this.game.story===this){this.game.player.keys=Object.create(null);this.game.player.enabled=true;this.onResume();}
  }
  dialogue(lines,done=()=>{},title='聽見的聲音',i=0){const [speaker,text]=lines[i];this.show({eyebrow:title,title:speaker,body:`<p class="dialogue-line">${escape(text)}</p>`,kind:'dialogue',options:[{text:i===lines.length-1?'繼續調查':'繼續',action:()=>i+1<lines.length?this.dialogue(lines,done,title,i+1):done()}]});}
  document(id,done=()=>{}){const e=EVIDENCE[id];this.show({eyebrow:`證物 ${String(Object.keys(EVIDENCE).indexOf(id)+1).padStart(2,'0')} / 11　${e.place}`,title:e.title,image:e.image,redacted:e.redacted&&!this.state.flags.sent,body:`<p class="document-date">${escape(e.date)}</p>${paragraphs(e.text)}<aside class="deduction">${escape(e.inference)}</aside>`,dismiss:true,options:[{text:'收進筆記，繼續調查',action:done}]});}
  collect(id){const isNew=collect(this.state,id);if(isNew){this.game.audio.storyCue?.('clue');this.sync();this.save();}return isNew;}
  sync(){this.world.setState(this.state);const audio=this.game.audio;const released=!!this.state.flags.sent;if(audio.released!==released&&audio.ctx)audio.droneGain.gain.setTargetAtTime(released ? 0.012 : 0.07,audio.ctx.currentTime,1);audio.released=released;$('chapter-label').textContent=`第${['','一','二','三','四'][this.state.chapter]}章 / ${CHAPTERS[this.state.chapter]}`;$('clue-count').textContent=`證據 ${this.state.evidence.length} / 11`;}
  save(key=SAVE_KEY){
    const p=this.game.player;const s=structuredClone(this.state);s.position=[p.pos.x,p.pos.y,p.pos.z,p.yaw,p.pitch];
    try{localStorage.setItem(key,JSON.stringify(s));this.state.position=s.position;return true;}catch{this.toast('瀏覽器無法儲存進度；本次仍可繼續遊玩。');return false;}
  }
  toast(text){$('story-toast').textContent=text;$('story-toast').classList.add('show');this.toastTime=5;}
  active(id){const s=this.state,f=s.flags;
    if(id.startsWith('rite'))return !!this.ritual;
    if(this.ritual)return false;
    if(['rules','exit','return','incense'].includes(id))return id==='return'?this.game.player.pos.y<0:id==='exit'?!!(f.sealed||f.sent):id==='incense'?!f.incense:true;
    if(id==='descent')return true;
    if(id==='stage')return s.chapter>=3&&!f.stage;
    if(id==='loopmark')return !!f.stage&&!f.loopSolved;
    if(id==='divination')return !!f.stage&&!!f.loopSolved&&!f.key;
    if(id==='altar')return s.evidence.includes('names')&&s.evidence.includes('confession')&&!f.sealed&&!f.sent;
    if(EVIDENCE[id]){if(s.evidence.includes(id))return false;if(id==='relic')return s.evidence.includes('births');if(id==='death')return !!f.key;if(['names','confession'].includes(id))return !!f.underground;return !!f.incense;}
    return false;
  }
  focused(){if(this.chase||this.modal)return null;const cam=this.game.camera;cam.getWorldDirection(this.look);let best=null,score=0;
    for(const t of this.world.targets){if(!this.active(t.id))continue;this.delta.copy(t.position).sub(cam.position);const d=this.delta.length();if(d>3.25||d<.05)continue;const dot=this.delta.normalize().dot(this.look);if(dot<0.68)continue;if(this.game.map.world.occluded?.(cam.position,t.position))continue;const sc=dot-d*.035;if(sc>score){score=sc;best=t;}}
    return best;
  }
  interact(id){if(this.modal||this.chase||!this.active(id))return false;const s=this.state,f=s.flags;
    if(id.startsWith('rite')){this.ritualAction(id);return true;}
    if(id==='rules'){this.show({title:'山門告示',body:paragraphs('子夜過後，勿入後殿。\n聞親人呼名，勿應。\n不問其名，不許其近。\n見紅布鬆脫，退回燈下，勿代為整理。'),dismiss:true});return true;}
    if(id==='incense'){f.incense=true;s.chapter=2;this.sync();this.game.audio.storyCue?.('gate');this.save();this.dialogue([['我','灰這麼厚……這三炷香是誰點的？旁邊連腳印都沒有。'],['門後的童聲','進來了，就不要走了。'],['較遠的童聲','別答應。'],['我','剛剛是兩個人？山門……關起來了。']],()=>this.toast('第二章：調查一樓東西側桌面，以及二樓樓梯旁的錄音機。'),'沒有人拜的廟');return true;}
    if(id==='stage'){this.stage();return true;}
    if(id==='loopmark'){this.loopPass=(this.loopPass||0)+1;this.world.loopProps.visible=true;
      if(this.loopPass<3){this.game.player.teleport(-13,6.9,-16,-Math.PI/2,0);this.dialogue(this.loopPass===1?[['我','這扇門……剛才走過了。供果怎麼變成彈珠？']]:[['走廊裡的男孩聲','一、二、三、四、五。一、二、三、四、五。'],['我','你漏了一個。']],()=>this.toast('回廊又回到原處。查看紅線旁留下的記號。'),'重複的回廊');}
      else{f.loopSolved=true;this.sync();this.save();this.dialogue([['較遠的童聲','不要跟著我的聲音。看我留下的東西。'],['我','補過的兔耳……照片裡也是這樣。這個記號，指向真正的供桌。']],()=>this.afterStage());}return true;}
    if(id==='divination'){this.divination();return true;}
    if(id==='descent'){
      if(!f.key||!s.evidence.includes('death')){this.show({title:'封住的暗道',body:paragraphs(!f.key?'銅鎖已經生鏽。必須先找到能開鎖的鑰匙。':'鑰匙吻合，但阿哲留下的紀錄還沒有找到。先到三樓東北納骨櫃確認來電者的身分。')});return true;}
      f.underground=true;this.game.player.teleport(55,-7,-13.5,0,0);this.sync();this.save();this.dialogue([['我','往下的石階，比廟本身更舊。'],['門內的聲音','再轉一次，就能把以前的事改掉。']],()=>this.toast('地下封印室：調查西牆名字與地上的舊鎖。'),'神明不在神桌上');return true;
    }
    if(id==='return'){this.game.player.teleport(5.3,16.9,-20.5,Math.PI,0);this.save();this.toast('已返回四樓。可沿樓梯回頭尋找遺漏的證物。');return true;}
    if(id==='altar'){this.finalChoice();return true;}
    if(id==='exit'){this.finish(f.sent?'C':'A');return true;}
    if(EVIDENCE[id]){
      this.collect(id);this.document(id,()=>{
        if(id==='tape'){this.game.audio.breathCue?.();this.dialogue([['我','機器已經停了……為什麼房間裡還有那口呼吸？']],()=>this.nextClue());}
        else if(id==='death')this.dialogue([['我','十月二十九……昨天打給我的，不可能是你。'],['像阿哲的聲音','你現在知道了，還會來救我嗎？']],()=>this.toast('可調查三樓西北的生辰簿，或前往四樓暗道。'));
        else if(id==='births')this.dialogue([['我','林小雨。她的母親說害怕，不是要他們把她送回去。'],['我','紅布兔，左耳補縫……在西牆外的無名小墳。']],()=>this.toast('遺物線索已加入筆記：亂葬崗西牆缺口外。'));
        else if(id==='relic')this.dialogue([['我','左耳補過。和照片上一樣。'],['女孩的聲音','它只會說你想聽的。你不要再答應它了。'],['我','這次，我會把妳的名字帶出去。']]);
        else if(id==='confession')this.dialogue([['童年阿哲','以安，快鎖。大人說天亮就能開。'],['小雨，門內','我不是要你開門。我只是……不要你走。'],['年幼的我','我會回來。'],['我','我知道她在裡面。不是我不記得，是我一直不肯記得。']],()=>{this.save(SAVE_KEY+'-decision');this.toast('最後的抉擇已保存。仍可返回地上補齊證據。');});
        else this.nextClue();
      });return true;
    }return false;
  }
  nextClue(){if(this.state.chapter===3&&!this.state.flags.stage){this.game.audio.woodenFish?.(3);this.toast('廟埕東側傳來開演的木魚聲。去古戲台看看。');}else this.toast('證據已收進筆記。按 J 重看紀錄與目的地。');}
  stage(){this.world.silhouettes.visible=true;this.world.stageLight.color.setHex(0xf26426);this.world.stageLight.intensity=24;
    this.dialogue([['童年阿哲','都來了？數一下。'],['童年柏翰','一、二、三、四、五……'],['小雨','還有我。'],['年幼的我','妳站我旁邊。'],['小雨','我們六個，長大以後還會在一起嗎？'],['壇後的男人','小雨。妳願不願意留下來陪我？'],['我','六道腳步走出山門……小雨又被帶了回來。'],['童年阿哲','以安，拿著。快鎖。']],()=>{
      this.collect('stage');this.state.flags.stage=true;this.sync();this.save();this.voiceTrap('stage');
    },'戲台上的火災記憶');
  }
  voiceTrap(source){this.game.audio.breathCue?.();this.show({eyebrow:'聲音正在等你的回答',title:'「以安，你回我一句。」',image:'apparition.png',body:paragraphs('像阿哲的聲音從幕布後傳來。\n「你回我一句，我就知道你還在。」'),kind:'voice-trap',options:[
    {text:'保持沉默，退回燈下',action:()=>this.dialogue([['像母親的聲音','不回答，很沒禮貌。'],['較遠的童聲','走。']],()=>{if(source==='stage')this.afterStage();else this.toast('重新調查木筊，記住日記裡的規則。');})},
    {text:'「阿哲，是你嗎？」',action:()=>{this.state.answers++;this.beginChase(source);}},
    {text:'留意聲音，不出聲',action:()=>this.show({title:'一模一樣的吸氣',body:paragraphs('這口吸氣，與電話裡完全一樣。\n它不是在自然地說話。'),options:[{text:'保持沉默',action:()=>{if(source==='stage')this.afterStage();}},{text:'還是回答它',action:()=>{this.state.answers++;this.beginChase(source);}}]})},
    ]});}
  afterStage(){this.toast(this.state.flags.loopSolved?'到二樓中央供桌擲筊。日記寫著：問路，不報姓名。':'回到二樓西側回廊，尋找留下的補線記號。');this.save();}
  divination(){this.show({eyebrow:'二樓・問神',title:'有問必答，以名為引',body:paragraphs('兩片木筊躺在積灰的供桌上。\n日記說：問路可以，不要報自己的名字。'),options:[
    {text:'「通往後殿的路在哪裡？」',action:()=>{this.state.flags.key=true;this.state.chapter=4;this.sync();this.save();this.game.audio.storyCue?.('clue');this.dialogue([['我','一平一凸。抽屜裡有一把銅鑰匙。'],['門後的聲音','你以前會，現在也會。'],['我','先去三樓，找到阿哲留下的紀錄。']],()=>this.toast('第四章：前往三樓東北納骨櫃。'));}},
    {text:'「我是陳以安，你認得我嗎？」',action:()=>{this.state.answers++;this.beginChase('divination');}},
    {text:'「林小雨，妳在這裡嗎？」',action:()=>this.voiceTrap('divination')},
  ]});}
  beginChase(source){const p=this.game.player;const upstairs=p.pos.y>5;const safe=upstairs?this.world.safeZones[1]:this.world.safeZones[0];
    this.chase={source,time:0,safe:safe.clone(),checkpoint:[p.pos.x,p.pos.y,p.pos.z,p.yaw,p.pitch]};p.storyChase=true;
    const ghost=this.world.ghost.root;ghost.visible=true;ghost.position.set(upstairs?5:25.1,p.pos.y,upstairs?-25:-3.25);
    this.game.audio.storyCue?.('threat');$('chase-hud').classList.remove('hidden');this.toast('你回答了。按住 Shift 逃往三盞燈，或保持距離直到聲音散去。');
  }
  endChase(caught){const c=this.chase;if(!c)return;this.chase=null;this.game.player.storyChase=false;this.world.ghost.root.visible=false;$('chase-hud').classList.add('hidden');$('danger-vignette').style.opacity=0;
    if(caught){this.state.deaths++;this.game.player.teleport(...c.checkpoint);this.show({eyebrow:'聲音又靠近了一點',title:'你回答了',body:paragraphs('紅布遮住了你的視線。你的呼吸，從別人的喉嚨裡傳回來。\n已取得的證據仍然保留。'),options:[{text:'回到這次呼名之前',action:()=>this.voiceTrap(c.source)}]});}
    else{this.save();if(c.source==='stage')this.afterStage();else this.toast('聲音退去了。可以重新擲筊。');}
  }
  finalChoice(){this.save(SAVE_KEY+'-decision');this.show({eyebrow:'最後的抉擇',title:'你要救她，還是讓自己無罪？',body:paragraphs('「把布解開，就當那扇門從來沒有關過。」\n「你只是想聽她說，那不是你的錯。」\n\n紅繩繫在神壇上。這一次，決定仍在你的手裡。'),options:[
    {text:'重新繫緊紅繩，封住聲音',action:()=>{this.state.flags.sealed=true;this.sync();this.save();this.dialogue([['我','到這裡就好。'],['門內的女孩聲','這一次，你還是不帶我走。']],()=>this.toast('山門已開。返回四樓，下樓後沿參道離開。'));}},
    {text:'解開覆眼紅布，接受聲音的承諾',action:()=>this.dialogue([['我','我不會再把妳關起來。'],['女孩聲','我知道。你答應了。'],['自己的聲音','原來，有自己的聲音是這樣。']],()=>this.finish('B'))},
    {text:'留下她的名字，開始送魂',action:()=>this.prepareRitual()},
    {text:'暫時離開，繼續調查',action:()=>{}},
  ]});}
  prepareRitual(){if(!trueEndingReady(this.state)){const missing=missingEvidence(this.state);this.show({title:'還不能把她帶回來',body:`<p>我不能再用一句答應，代替真的把她帶回來。</p><ul class="missing-evidence">${missing.map(id=>`<li><strong>${escape(EVIDENCE[id].title)}</strong><span>${escape(EVIDENCE[id].place)}</span></li>`).join('')}</ul>`,options:[{text:'回頭找齊證據與遺物',action:()=>{}}]});return;}
    this.show({title:'三炷香燃盡之前',body:paragraphs('依序完成：\n一、左側空牌位：喚真名。\n二、中央供盤：歸還遺物。\n三、右側錄音機：留下見證。\n\n點香後有 90 秒。暫停與閱讀時停止計時。作證不是回應黑暗中的呼名。'),options:[{text:'點燃三炷香',action:()=>{this.ritual={remaining:90,step:0};$('ritual-hud').classList.remove('hidden');this.toast('第一步：左側空牌位，喚出林小雨的名字。');}},{text:'稍後再做',action:()=>{}}]});
  }
  ritualAction(id){const order=['riteName','riteRelic','riteWitness'];if(id!==order[this.ritual.step]){this.ritual.step=0;this.toast('順序不對。先喚名，再歸物，最後見證。');return;}
    const lines=[['我','林小雨，我記得妳。'],['我','這是妳的，不是祂的。'],['我','我是陳以安。門是我鎖的。我知道她還在裡面。她叫林小雨。']];
    const step=this.ritual.step++;this.game.audio.storyCue?.('clue');
    this.dialogue([lines[step]],()=>{
      if(step<2){this.toast(step===0?'第二步：中央供盤，歸還紅布兔。':'第三步：右側錄音機，承認並留下見證。');return;}
      this.ritual=null;$('ritual-hud').classList.add('hidden');this.state.flags.sent=true;this.sync();this.save();
      this.dialogue([['交錯的聲音','以安。阿安。孩子。你答應——'],['小雨','這次，你沒有把我留下來。'],['我','對不起。我會把我們六個人的名字，完整帶出去。']],()=>this.toast('送魂已完成。返回地上，沿參道離開慈雲寺。'),'不再沉默');
    });
  }
  finish(ending){this.state.ending=ending;this.chase=null;this.ritual=null;this.game.player.enabled=false;this.world.ghost.root.visible=false;
    if(ending==='B'){for(const statue of this.world.statues||[]){if(statue.userData.head)statue.userData.head.rotation.y=.65;}this.game.player.teleport(55,-5,-26,Math.PI,0);this.world.sealedBuddha.visible=false;}
    const e=ENDINGS[ending];try{const unlocked=JSON.parse(localStorage.getItem('ols-endings')||'[]');localStorage.setItem('ols-endings',JSON.stringify([...new Set([...unlocked,ending])]));}catch{}
    this.show({eyebrow:e.subtitle,title:e.name,body:paragraphs(e.text)+`<p class="ending-final">${escape(e.final)}</p><div class="ending-stats"><span>證據 ${this.state.evidence.length}/11</span><span>回應 ${this.state.answers} 次</span><span>調查 ${Math.max(1,Math.round(this.state.elapsed/60))} 分鐘</span></div>`,kind:'ending',options:[{text:'回到最後抉擇',action:()=>{const s=readSave(SAVE_KEY+'-decision');if(s){this.state=s;this.state.ending=null;this.world.sealedBuddha.visible=true;this.game.player.teleport(55,-7,-18,0,0);this.sync();this.save();}}},{text:'返回標題畫面',action:()=>this.onLobby()}]});
    this.game.audio.storyCue?.(ending==='C'?'release':'threat');
  }
  journal(){const s=this.state;const list=objectives(s);this.show({eyebrow:`調查筆記　${s.evidence.length}/11`,title:'那些被留下的名字',body:`<div class="journal-goal"><small>目前線索</small>${list.map(o=>`<p>${escape(o.title)}<br><span>${escape(o.location)}</span></p>`).join('')}</div><div class="route-note">路線：山門 → 廟埕 → 一樓正殿。<br>西北樓梯上二樓；二樓東側上三樓；三樓北側上四樓。<br>古戲台在廟埕東側，亂葬崗由西牆缺口進入。<br>地下入口在四樓神壇東側，地下南側石階可返回。</div><div class="journal-grid">${Object.entries(EVIDENCE).map(([id,e])=>`<button data-evidence="${id}" ${s.evidence.includes(id)?'':'disabled'}><small>${s.evidence.includes(id)?'已取得':'尚未取得'}</small><strong>${escape(e.title)}</strong><span>${escape(e.place)}</span></button>`).join('')}</div><aside class="deduction">規則：聞呼名勿應。問路，不報自己的姓名。送魂：喚名 → 歸物 → 見證。</aside>`,dismiss:true,kind:'journal',options:[{text:'收起筆記',action:()=>{}}]});
    $('story-layer').querySelectorAll('[data-evidence]').forEach(b=>b.addEventListener('click',()=>this.document(b.dataset.evidence,()=>this.journal())));
  }
  update(dt){if(this.modal||this.state.ending){$('interact-prompt').textContent='';return;}
    this.state.elapsed+=dt;this.tick+=dt;if(this.toastTime>0){this.toastTime-=dt;if(this.toastTime<=0)$('story-toast').classList.remove('show');}
    if(this.chase){const c=this.chase;c.time+=dt;const g=this.world.ghost.root,p=this.game.player.pos;this.delta.copy(p).sub(g.position);this.delta.y=0;const d=this.delta.length();
      if(c.time>1.2&&d>0.2){this.delta.normalize();const next={x:g.position.x+this.delta.x*3.15*dt,z:g.position.z+this.delta.z*3.15*dt};this.game.map.world.resolve(next,0.22,g.position.y);g.position.x=next.x;g.position.z=next.z;g.rotation.y=Math.atan2(this.delta.x,this.delta.z);}
      const safeDist=Math.hypot(p.x-c.safe.x,p.z-c.safe.z);$('chase-hud').textContent=`不要回答　退回燈下 ${Math.round(safeDist)} m　${Math.max(0,Math.ceil(24-c.time))} 秒`;$('danger-vignette').style.opacity=String(Math.max(.08,1-d/12));
      if(d<0.85&&Math.abs(p.y-g.position.y)<2&&c.time>1.2){this.endChase(true);return;}
      if((safeDist<2.2&&Math.abs(p.y-c.safe.y)<1)||c.time>=24){this.endChase(false);return;}
    }
    if(this.ritual){this.ritual.remaining-=dt;const r=this.ritual;$('ritual-hud').innerHTML=`<span>三炷香</span><strong>${Math.ceil(r.remaining)} 秒</strong><div class="incense-meter"><i style="width:${r.remaining/90*100}%"></i></div><small>${['一・喚名 → 二・歸物 → 三・見證','喚名已完成 → 二・歸物 → 三・見證','歸物已完成 → 三・見證'][r.step]||'儀式完成'}</small>`;
      if(r.remaining<=0){this.ritual=null;$('ritual-hud').classList.add('hidden');this.game.player.teleport(55,-7,-18,0,0);this.show({title:'香火已盡',body:paragraphs('自己的聲音從神壇底下說：「來不及了。」\n證據與遺物仍然保留，可以重新點香。'),options:[{text:'重新準備儀式',action:()=>this.prepareRitual()}]});return;}
    }
    if(this.tick<0.12)return;this.tick=0;const p=this.game.player.pos;const focused=this.focused();$('interact-prompt').innerHTML=focused?`<kbd>E</kbd><span>${escape(focused.label)}</span>`:'';
    const goal=objectives(this.state)[0];const target=this.world.targets.find(t=>t.id===goal.id);
    $('objective-title').textContent=goal.title;$('objective-place').textContent=goal.location;
    if(target){const d=p.distanceTo(target.position);const dy=target.position.y-p.y;$('objective-distance').textContent=`${Math.round(d)} m${dy>4?' · 往樓上':dy<-4?' · 往樓下':''}`;
      this.projected.copy(target.position).project(this.game.camera);const front=this.delta.copy(target.position).sub(this.game.camera.position).dot(this.game.camera.getWorldDirection(this.look))>0;
      const marker=$('waypoint');marker.classList.toggle('hidden',!front||Math.abs(this.projected.x)>.94||Math.abs(this.projected.y)>.85||d<3.3||!!this.chase||!!this.ritual);marker.style.left=`${(this.projected.x*.5+.5)*100}%`;marker.style.top=`${(-this.projected.y*.5+.5)*100}%`;marker.textContent='◇';}
    for(const t of this.world.targets)t.glint.visible=this.active(t.id)&&t.position.distanceTo(p)<8;
    if((this.state.flags.sent||this.state.flags.sealed)&&p.z>24&&Math.abs(p.x)<4)this.finish(this.state.flags.sent?'C':'A');
  }
  dispose(){window.removeEventListener('keydown',this.onKey);window.removeEventListener('beforeunload',this.onUnload);$('story-layer')?.remove();$('story-hud')?.remove();this.modal=null;}
}
