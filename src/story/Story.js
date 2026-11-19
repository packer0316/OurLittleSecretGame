import * as THREE from 'three';
import { SAVE_KEY, CHAPTERS, EVIDENCE, NOTES, ENDINGS, newState, validateSave, collect, readNote, hint, trueEndingReady, missingEvidence, objectives } from './campaign.js';
import { preludeRecords } from './preludeRecords.js';
import { PHOTO_MARK_STYLE } from './photoLayout.js';

const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paragraphs=s=>s.split('\n').filter(Boolean).map(p=>`<p>${escape(p)}</p>`).join('');
const ART=import.meta.env.BASE_URL+'assets/story/';
const COUNT=['零','一','兩','三','四','五','六','七','八','九'],ORDINAL=['零','一','二','三','四','五','六','七','八','九','十'];
const times=n=>n<COUNT.length?COUNT[n]:` ${n} `;
const nth=n=>n<ORDINAL.length?ORDINAL[n]:` ${n} `;
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
      if(!game.running||e.repeat||this.busy)return;
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
    if(this.state.flags.prologueComplete&&!this.state.flags.incense){this.toast('02:47。阿哲的設備箱在正殿西桌。先走向亮著的供桌。');return;}
    if(this.state.flags.incense||this.state.elapsed>5){this.toast('已繼續上次的調查。J 開啟筆記。');return;}
    this.game.audio.breathCue?.();
    this.document('photo',()=>this.dialogue([
      ['我','阿哲說後面的門打不開。同一句話他說了兩次，連吸氣都一樣，然後電話就斷了。'],
      ['我','他的攝影機最後拍到設備箱，標籤寫著正殿西桌。先找到那個箱子。'],
    ],()=>{this.save();this.toast('走進正殿，先檢查仍亮著的供桌。');},'02:47・慈雲寺'));
  }

  show({eyebrow='慈雲寺・調查紀錄',title,body='',image=null,redacted=false,options=[{text:'收起',action:()=>{}}],dismiss=false,kind=''}){
    this.modal={options,dismiss};this.game.player.enabled=false;this.game.player.keys=Object.create(null);this.game.player.vel.set(0,0,0);
    const photo=image?`<figure class="story-figure ${redacted?'redacted':''}" style="${PHOTO_MARK_STYLE}"><img src="${ART+image}" alt="${escape(title)}">${redacted?'<i class="photo-scribble" aria-label="女孩的臉被紅筆塗去"></i>':''}</figure>`:'';
    $('story-layer').className=`story-layer ${kind}`;
    $('story-layer').innerHTML=`<article class="story-card"><p class="story-eyebrow">${escape(eyebrow)}</p><h2 id="story-title">${escape(title)}</h2><div class="story-content ${image?'with-image':''}">${photo}<div class="story-copy">${body}</div></div><nav class="story-choices">${options.map((o,i)=>`<button data-choice="${i}" ${o.disabled?'disabled':''}><span>${i+1<10?i+1:'·'}</span>${escape(o.text)}</button>`).join('')}</nav><small class="story-instruction">${options.length===1?'E / Enter 繼續':'點擊選項，或按數字鍵選擇'} · 閱讀時停止移動與計時</small></article>`;
    $('story-layer').querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>this.choose(+b.dataset.choice)));
    if(document.pointerLockElement)document.exitPointerLock();
    $('story-layer').querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  choose(i){const opt=this.modal?.options[i];if(!opt||opt.disabled)return;
    this.modal=null;$('story-layer').classList.add('hidden');opt.action?.();
    if(!this.modal&&!this.busy&&!this.state.ending&&!this.transitioning&&this.game.map&&this.game.story===this){this.game.player.keys=Object.create(null);this.game.player.enabled=true;this.onResume();}
  }
  /** lines: [speaker, text, cue?]。cue 是該句出現時才觸發的聲音或演出。 */
  dialogue(lines,done=()=>{},title='聽見的聲音',i=0){const [speaker,text,cue]=lines[i];cue?.();this.show({eyebrow:title,title:speaker,body:`<p class="dialogue-line">${escape(text)}</p>`,kind:'dialogue',options:[{text:i===lines.length-1?'繼續調查':'繼續',action:()=>i+1<lines.length?this.dialogue(lines,done,title,i+1):done()}]});}
  document(id,done=()=>{}){const e=EVIDENCE[id];this.show({eyebrow:e.place,title:e.title,image:e.image,redacted:e.redacted&&!this.state.flags.sent,body:`<p class="document-date">${escape(e.date)}</p>${paragraphs(e.text)}<aside class="deduction">${escape(e.inference)}</aside>`,dismiss:true,options:[{text:'收進筆記，繼續調查',action:done}]});}
  note(id,done=()=>{}){const n=NOTES[id];this.show({eyebrow:n.place+'・可回看的筆記',title:n.title,body:paragraphs(n.text),dismiss:true,options:[{text:'放回原處',action:done}]});}
  collect(id){const isNew=collect(this.state,id);if(isNew){this.game.audio.storyCue?.('clue');this.sync();this.save();}return isNew;}
  sync(){this.world.setState(this.state);const audio=this.game.audio;const released=!!this.state.flags.sent;if(audio.released!==released&&audio.ctx)audio.droneGain.gain.setTargetAtTime(released ? 0.012 : 0.07,audio.ctx.currentTime,1);audio.released=released;$('chapter-label').textContent=`第${['','一','二','三','四'][this.state.chapter]}章 / ${CHAPTERS[this.state.chapter]}`;$('clue-count').textContent=`證據 ${this.state.evidence.length} / 11`;}
  save(key=SAVE_KEY){
    const p=this.game.player;const s=structuredClone(this.state);s.position=[p.pos.x,p.pos.y,p.pos.z,p.yaw,p.pitch];
    try{localStorage.setItem(key,JSON.stringify(s));this.state.position=s.position;return true;}catch{this.toast('瀏覽器無法儲存進度；本次仍可繼續遊玩。');return false;}
  }
  toast(text){$('story-toast').textContent=text;$('story-toast').classList.add('show');this.toastTime=5;}
  /** 聲音合約 D：新的聲音一律走可選鏈結，實作還沒到位時不會壞。 */
  sfx(kind,opts){this.game.audio.horror?.(kind,opts);}
  preludeJournal(){const records=preludeRecords(this.state);this.show({eyebrow:'出發以前・山村調查',title:'我親眼確認過的事',body:records.length?records.map(([title,text])=>`<section class="archive-record"><h3>${escape(title)}</h3><p>${escape(text)}</p></section>`).join(''):'<p>目前還沒有序章調查紀錄。</p>',kind:'journal',dismiss:true,options:this.state.scene==='temple'?[{text:'返回目前筆記',action:()=>this.journal()}]:[{text:'收起紀錄',action:()=>{}}]});}
  active(id){const s=this.state,f=s.flags;
    if(id.startsWith('rite'))return !!this.ritual;
    if(this.ritual)return false;
    if(['rules','exit','return','incense'].includes(id))return id==='return'?this.game.player.pos.y<0:id==='exit'?!!(f.sealed||f.sent):id==='incense'?!f.incense:true;
    if(id==='descent')return true;
    if(id==='stage')return s.chapter>=3&&!f.stage;
    if(id==='loopmark')return !!f.stage&&!f.loopSolved;
    if(id==='divination')return !!f.stage&&!!f.loopSolved&&!f.key;
    if(id==='altar')return s.evidence.includes('names')&&s.evidence.includes('confession')&&!f.sealed&&!f.sent;
    if(NOTES[id])return id==='shoes'?!!f.underground:!!f.incense;
    if(EVIDENCE[id]){if(s.evidence.includes(id))return false;if(id==='relic')return s.evidence.includes('births');if(id==='death')return !!f.key;if(id==='births')return s.evidence.includes('death');if(['names','confession'].includes(id))return !!f.underground;return !!f.incense;}
    return false;
  }
  focused(){if(this.chase||this.modal)return null;const cam=this.game.camera;cam.getWorldDirection(this.look);let best=null,score=0;
    for(const t of this.world.targets){if(!this.active(t.id))continue;this.delta.copy(t.position).sub(cam.position);const d=this.delta.length();if(d>3.25||d<.05)continue;const dot=this.delta.normalize().dot(this.look);if(dot<0.68)continue;if(this.game.map.world.occluded?.(cam.position,t.position))continue;const sc=dot-d*.035;if(sc>score){score=sc;best=t;}}
    return best;
  }
  interact(id){if(this.modal||this.chase||!this.active(id))return false;const s=this.state,f=s.flags;
    if(id.startsWith('rite')){this.ritualAction(id);return true;}
    if(id==='rules'){this.show({title:'山門告示',body:paragraphs('清點工作進行中，設備請留原位。——張明哲 10/27\n告示板背面釘著一張發脆的舊規矩：\n「七月初一開後殿。先上戲台點名，殿內無人，門自外扣。」\n「問者敲三下，問：裡面還有沒有人。問路可，勿報己名。」\n「門內喚你名，勿應。亡者不叫活人。」'),dismiss:true});return true;}
    if(id==='incense'){f.incense=true;s.chapter=2;this.sync();this.game.audio.storyCue?.('gate');this.save();this.dialogue([
      ['我','三炷香還在燒，香灰卻積了很厚。阿哲的工具箱就在供桌旁，蓋子開著。'],
      ['山門方向','砰。'],
      ['我','沒有風。門是自己關上的。'],
      ['我','手機上的時間還是 02:47。我進山門，早就不只一分鐘了。'],
    ],()=>{this.world.triggerScare('gate');this.toast('檢查一樓東西兩張工作桌，再上西北樓梯找錄音機。');},'設備還在，人去了哪裡');return true;}
    if(id==='stage'){this.stage();return true;}
    if(id==='loopmark'){this.loopPass=(this.loopPass||0)+1;this.world.setLoopPass(this.loopPass);
      if(this.loopPass<3){this.game.player.teleport(-13,6.9,-16,-Math.PI/2,0);this.dialogue(this.loopPass===1?[['我','又是這段回廊。紅線還繫在同一根柱腳，地上的彈珠是五顆。']]:[['走廊裡的男孩聲','一、二、三、四、五。一、二、三、四、五。'],['我','你漏了一個。'],['走廊裡的男孩聲','沒有漏。第六個是別人替她喊的。']],()=>this.toast('回廊又回到原處。查看紅線旁留下的記號。'),'重複的回廊');}
      else{f.loopSolved=true;this.sync();this.save();this.dialogue([['牆後很輕的聲音','第三顆，別踩到。'],['我','彈珠變成六顆了。紅線的結一直朝著中央供桌。'],['我','跟著聲音走，只會繞回原地。這一次，我跟著東西走。']],()=>this.afterStage());}return true;}
    if(id==='divination'){this.divination();return true;}
    if(id==='descent'){
      if(!f.key||!s.evidence.includes('death')){this.show({title:'封住的暗道',body:paragraphs(!f.key?'暗道的銅鎖生了鏽。得先找到開得了它的鑰匙。':'鎖孔裡塞著一截充電線頭，和三樓東北桌那個充電座是同一種。先確認阿哲留下的手機。')});return true;}
      f.underground=true;this.game.player.teleport(55,-7,-13.5,0,0);this.sync();this.save();this.sfx('sub',{intensity:.8});this.dialogue([['我','往下的石階比廟還舊。上面這四層樓，是蓋在後殿上面的。'],['門內，阿哲的聲音','以安，我在慈雲寺。後面的門打不開。'],['我','同一句話，同一口吸氣。可是這一次，聲音是從門的另一邊傳出來的。']],()=>this.toast('地下封印室：調查西牆的手印，和門前石座上的舊鎖。'),'把最後一句說完');return true;
    }
    if(id==='return'){this.game.player.teleport(5.3,16.9,-20.5,Math.PI,0);this.save();this.toast('已返回四樓。可沿樓梯回頭尋找遺漏的證物。');return true;}
    if(id==='altar'){this.finalChoice();return true;}
    if(id==='exit'){this.finish(f.sent?'C':'A');return true;}
    if(NOTES[id]){if(readNote(s,id)){this.game.audio.storyCue?.('clue');this.save();}this.note(id);return true;}
    if(EVIDENCE[id]){
      this.collect(id);this.document(id,()=>{
        if(id==='tape'){this.world.triggerScare('tape');this.game.audio.presence(.7);this.sfx('whisper',{pan:.7,dist:1.2});this.nextClue();}
        else if(id==='death')this.dialogue([
          ['我','十月二十九日 02:47，那三通我看到了。我沒有接。',()=>this.sfx('static',{intensity:.6})],
          ['我','我沒接，它才去找別人。志豪、柏翰，然後繞回來，用阿哲的聲音。'],
          ['我','這支手機要帶出去。他沒說完的那半句，要有人聽完。'],
        ],()=>{this.world.triggerScare('phone');this.game.audio.presence(-.6);this.toast('西北木尺架留著另一組名字。也可以先帶鑰匙到四樓。');});
        else if(id==='births')this.dialogue([['我','林小雨。照片最右邊的那一個，叫這個名字。'],['我','我不是想不起來。是有人教過我，不要想。']],()=>this.toast('門框背面的陶牌指向西牆缺口。去老樹下找布兔。'));
        else if(id==='relic')this.dialogue([['我','名字對得上。左耳的縫線也一樣。'],['很輕的聲音','輪到你數了。',()=>this.sfx('hum',{pan:-.5,dist:4})]],()=>{this.world.triggerScare('relic');this.toast('布兔已收好。從西牆缺口回廟裡。');});
        else if(id==='names')this.dialogue([['牆後的童聲','都出來了。沒有別人。都出來了。沒有別人。',()=>this.sfx('whisper',{pan:-.8,dist:1})],['我','五個聲音。裡面有一個是我的。']],()=>this.nextClue());
        else if(id==='confession')this.dialogue([
          ['童年柏翰','後殿今天晚上聽得到妳爸爸。真的。',()=>this.sfx('sub',{intensity:.7})],
          ['童年志豪','鞋我藏起來了。讓她找久一點。'],
          ['童年佩珊','……六。有。'],
          ['童年阿哲','先扣上。大人等一下就來。'],
          ['門內的孩子','我的鞋找不到了。等我一下。'],
          ['年幼的我','都出來了。'],
          ['我','五個人，一人一句。沒有一句是想害她的。'],
        ],()=>{this.save(SAVE_KEY+'-decision');this.toast('到地下神壇決定怎麼處理這一分鐘。也可以先回地上補齊線索。');});
        else this.nextClue();
      });return true;
    }return false;
  }
  nextClue(){if(this.state.chapter===3&&!this.state.flags.stage){this.game.audio.woodenFish?.(3);this.toast('廟埕東側傳來三聲木魚，像有人在催點名。去舊戲台。');}else{const next=objectives(this.state)[0];this.toast(next.title+'。'+next.location+'。');}}
  stage(){this.world.silhouettes.visible=true;this.world.stageLight.color.setHex(0xf26426);this.world.stageLight.intensity=24;
    this.dialogue([
      ['錄音裡的男人','借聲之前，殿裡不能有人。點名。'],
      ['台上的孩子','一、二、三、四、五。'],
      ['第五張椅子','……六。有。'],
      ['我','第六聲是從第五張椅子傳來的。第六張上面，只有一隻布兔。'],
      ['錄音裡的男人','都出來了？'],
      ['幕布後','叩。叩。叩。',()=>this.sfx('knock',{pan:.3,dist:6})],
      ['台上的孩子','都出來了。'],
      ['我','穿黃衣的孩子把右手藏到背後。我知道那是我。'],
    ],()=>{
      this.collect('stage');this.state.flags.stage=true;this.sync();this.save();
      this.document('stage',()=>this.voiceTrap('stage'));
    },'沒有記進錄音的座位');
  }
  /** 每一次呼名都先把「它哪裡不對」寫給玩家看，再讓玩家決定要不要應。選項 0 永遠是沉默。 */
  voiceTrap(source){this.game.audio.breathCue?.();
    const silent=()=>{if(source==='stage'){this.world.triggerScare('stage');this.game.audio.presence(.7);this.afterStage();}else this.toast('回去查看木筊。計數器底座刻著：問路，勿報姓名。');};
    const answer=()=>{this.state.answers++;this.beginChase(source);};
    const heard=this.state.road?.peishan?'佩珊說過：裡面不管誰叫你，都不要應。':'舊告示上寫著：門內喚你名，勿應。';
    if(source==='divination'&&this.state.road?.peishan){
      this.show({eyebrow:'聲音正在等你的回答',title:'「你在哪裡？」',body:paragraphs('佩珊的聲音，從樓梯口傳上來。\n「訊息我收到了。已經報警……你在哪裡？」\n和 02:39 那通電話是同一句。連翻紙的聲音，都停在同一個地方。'),kind:'voice-trap',options:[
        {text:'不出聲，手不離開木筊',action:()=>this.dialogue([['佩珊的聲音','你在哪裡？你在哪裡？你在——'],['牆後很輕的聲音','她沒有上山。']],silent)},
        {text:'「佩珊？我在二樓。」',action:answer},
        {text:'留意聲音，不出聲',action:()=>this.show({title:'同一通電話',body:paragraphs('它沒有借到佩珊的聲音。她一通都沒接。\n它只是把我在山下聽過的那一句，照原樣放了一次。'),options:[{text:'保持沉默',action:silent},{text:'還是回答它',action:answer}]})},
      ]});return;
    }
    const where=source==='stage'?'幕布後面傳來阿哲的聲音。位置很低，像有人趴在地上，從布底下往外說話。':'供桌底下傳來阿哲的聲音。位置很低，像有人蜷在桌腳旁邊。';
    this.show({eyebrow:'聲音正在等你的回答',title:'「以安，你回我一句。」',body:paragraphs(`${where}\n「你回我一句，我就知道你還在。」\n${heard}`),kind:'voice-trap',options:[
      {text:'保持沉默，退回燈下',action:()=>this.dialogue([['像阿哲的聲音','你以前不是這樣的。你以前都會應。'],['錄音裡那個女人的聲音','不回答，很沒禮貌。'],['牆後很輕的聲音','走。']],silent)},
      {text:'「阿哲，是你嗎？」',action:answer},
      {text:'留意聲音，不出聲',action:()=>this.show({title:'一模一樣的吸氣',body:paragraphs('這口吸氣，和電話裡那一口完全一樣。連停頓的長度都沒有變。\n它不是在說話。它在播放。'),options:[{text:'保持沉默',action:silent},{text:'還是回答它',action:answer}]})},
    ]});}
  afterStage(){this.toast(this.state.flags.loopSolved?'到二樓中央供桌擲筊。計數器底座刻著：問路，勿報姓名。':'回到二樓西側回廊，找紅線旁留下的記號。');this.save();}
  divination(){this.show({eyebrow:'二樓・問神',title:'有問必答，以名為引',body:paragraphs('兩片木筊躺在積灰的供桌上。桌沿刻著八個字：有問必答，以名為引。\n計數器底下那枚木片寫的是：問路，勿報姓名。'),options:[
    {text:'「通往後殿的路在哪裡？」',action:()=>{this.state.flags.key=true;this.state.chapter=4;this.sync();this.save();this.game.audio.storyCue?.('clue');this.dialogue([['我','一平一凸，聖筊。抽屜自己滑開，裡面是一把銅鑰匙，齒缺了一角。'],['門後的聲音','你以前會開，現在也會。'],['我','抽屜內側貼著阿哲的藍色便條：「三樓東北桌，手機在充電。」']],()=>this.toast('前往三樓東北收存桌，找阿哲的手機。'));}},
    {text:'「我是陳以安，你認得我嗎？」',action:()=>{this.state.answers++;this.dialogue([['我','兩片木筊都立了起來。'],['供桌底下','陳、以、安。記住了。']],()=>this.beginChase('divination'));}},
    {text:'「後面有人嗎？」',action:()=>this.voiceTrap('divination')},
  ]});}
  beginChase(source){const p=this.game.player;const upstairs=p.pos.y>5;const safe=upstairs?this.world.safeZones[1]:this.world.safeZones[0];
    this.chase={source,time:0,safe:safe.clone(),checkpoint:[p.pos.x,p.pos.y,p.pos.z,p.yaw,p.pitch]};p.storyChase=true;
    const ghost=this.world.ghost.root;ghost.visible=true;ghost.position.set(upstairs?5:25.1,p.pos.y,upstairs?-25:-3.25);
    this.game.audio.storyCue?.('threat');$('chase-hud').classList.remove('hidden');this.toast('你應了它。按住 Shift 退回三盞燈下，或拉開距離撐到聲音散去。');
  }
  endChase(caught){const c=this.chase;if(!c)return;this.chase=null;this.game.player.storyChase=false;this.world.ghost.root.visible=false;$('chase-hud').classList.add('hidden');$('danger-vignette').style.opacity=0;
    if(caught){this.state.deaths++;this.game.player.teleport(...c.checkpoint);
      const n=this.state.deaths;const line=n===1?'紅布蓋住了你的眼睛。你聽見自己的呼吸，從別人的喉嚨裡傳回來。':n===2?'紅布又蓋下來。這一次它喘氣的方式，已經和你一模一樣。':'紅布蓋下來以前，你聽見它用你的聲音，練習叫你自己的名字。';
      this.show({eyebrow:'聲音又靠近了一點',title:'你回答了',body:paragraphs(line+'\n已取得的證據仍然保留。'),options:[{text:'回到這次呼名之前',action:()=>this.voiceTrap(c.source)}]});}
    else{this.save();if(c.source==='stage')this.afterStage();else this.toast('聲音退去了。可以重新擲筊。');}
  }
  finalChoice(){this.save(SAVE_KEY+'-decision');const s=this.state,n=s.answers;
    const owed=n>0?`今晚我應過它${times(n)}次。門裡現在說話的，用的就是那幾句。`:'今晚我一聲都沒有應它。它手上屬於我的，還是只有二十八年前那一句。';
    this.show({eyebrow:'最後的抉擇',title:'門裡只剩你的聲音',body:paragraphs(`門裡一遍一遍放著「都出來了」。後面接著我自己的聲音，說我沒有做錯。\n${owed}\n紅繩把那扇門繫在神壇後面。阿哲、志豪和柏翰，應該都在門的另一邊。阿哲的手機在我手上，那一分鐘還沒有人帶出去。\n我可以把門重新封死，也可以照它說的解開紅布。${s.evidence.includes('ritual')?'送行盤是第三條路。':'或者，把她的名字留下來。'}`),options:[
    {text:'重新繫緊紅繩，把門封回去',action:()=>{this.state.flags.sealed=true;this.sync();this.save();this.dialogue([['我','到這裡就好。'],['門內的女孩聲','你說過，等一下就回來。'],['門內的女孩聲','這一次，你還是不帶我走。']],()=>this.toast('山門已開。返回四樓，下樓後沿參道離開。'));}},
    {text:'解開覆眼的紅布，相信門裡的聲音',action:()=>this.dialogue([['我','我不會再把妳關起來。'],['女孩聲','我知道。你答應了。'],['女人的聲音','應了就好。'],['自己的聲音','原來，有自己的聲音是這樣。']],()=>this.finish('B'))},
    {text:'留下她的名字，開始送行',action:()=>this.prepareRitual()},
    {text:'先離開，繼續調查',action:()=>{}},
  ]});}
  prepareRitual(){if(!trueEndingReady(this.state)){const missing=missingEvidence(this.state).map(hint);this.show({title:'還不能把她送走',body:`<p>我不能再用一句答應，代替真的把她帶出去。名字、她的東西、那一晚的順序，我還缺：</p><ul class="missing-evidence">${missing.map(m=>`<li><strong>${escape(m.title)}</strong><span>${escape(m.location)}</span></li>`).join('')}</ul>`,options:[{text:'回頭找齊證據與遺物',action:()=>{}}]});return;}
    this.show({title:'三炷香燃盡之前',body:paragraphs('送行和借聲相反：不問，只說。\n一、左側空牌位：說出她的名字。\n二、中央供盤：把她的東西還給她。\n三、右側錄音機：把那一分鐘說完。\n點香後有 90 秒，閱讀與暫停時不計時。過程中不管誰叫你，都不要應。作證不是回答。'),options:[{text:'點燃三炷香',action:()=>{this.ritual={remaining:90,step:0};$('ritual-hud').classList.remove('hidden');this.toast('第一步：左側空牌位，說出林小雨的名字。');}},{text:'稍後再做',action:()=>{}}]});
  }
  ritualAction(id){const order=['riteName','riteRelic','riteWitness'];if(id!==order[this.ritual.step]){this.ritual.step=0;this.toast('順序不對。先喚名，再歸物，最後見證。');return;}
    const lines=[
      [['我','林小雨。我記得妳。'],['門內，女人的聲音','以安。你應阿姨一聲。',()=>this.sfx('whisper',{pan:0,dist:2})],['我','……林小雨。妳的名字是林小雨。']],
      [['我','這是妳的。耳朵是妳媽媽補的。它不是祂的。']],
      [['我','我是陳以安。門是我扣的。'],['我','妳說妳還在。我聽見了。我說都出來了。'],['我','裡面還有人。她叫林小雨。']],
    ];
    const step=this.ritual.step++;this.game.audio.storyCue?.('clue');
    this.dialogue(lines[step],()=>{
      if(step<2){this.toast(step===0?'第二步：中央供盤，把紅布兔還給她。':'第三步：右側錄音機，把那一分鐘說完。');return;}
      this.ritual=null;$('ritual-hud').classList.add('hidden');this.state.flags.sent=true;this.sync();this.save();this.game.audio.duck?.(6);
      this.dialogue([['交錯的聲音','以安。阿安。孩子。你應一聲——'],['女人的聲音','……小雨？'],['小雨','媽媽，我在這裡。'],['小雨','這次，你沒有把我留下來。'],['我','對不起。六個名字，我會一個不少地帶出去。']],()=>this.toast('送行完成。返回地上，沿參道離開慈雲寺。'),'不再沉默');
    });
  }
  /** 結局會記得玩家一路上的選擇：應過幾次、有沒有接佩珊的電話、怎麼對她說話。 */
  aftermath(ending){const s=this.state,n=s.answers,out=[];
    if(ending==='A')out.push(n>0?`你在廟裡應過它${times(n)}次。山門外那一句，是第${nth(n+1)}次。`:'你在廟裡一聲都沒有應。最後應它的那一句，是你在山門外自己說的。');
    if(ending==='B'&&n>0)out.push(`它學你說話，今晚已經學了${times(n)}次。`);
    if(ending==='C'){
      out.push(n>0?`你今晚應過它${times(n)}次。那幾句話沒有跟著你下山。往後要是聽見自己的聲音在叫你，不要回頭。`:'你整晚沒有應過它一聲。它到最後，都沒有借到你的聲音。');
      const p=s.road?.peishan;
      out.push(p==='question'?'天亮後，佩珊傳來訊息：「你問我怎麼知道是 23:47。因為我每天晚上都看著它響。六個名字，我都看見了。這次，一個都不刪。那一聲『有』是我替她喊的，我自己去說。」'
        :p==='silence'?'天亮後，佩珊傳來訊息：「你那時候什麼都沒問，我反而想全部講出來。六個名字，我都看見了。這次，一個都不刪。那一聲『有』是我替她喊的，我自己去說。」'
        :p==='trust'?'天亮後，佩珊傳來訊息：「六個名字，我都看見了。這次，一個都不刪。那一聲『有』是我替她喊的，我自己去說。」'
        :'下山後，手機跳出一通 02:39 的未接來電：周佩珊。你回撥過去。這一次，是你先開口。');
    }
    return out.map(t=>`<aside class="deduction">${escape(t)}</aside>`).join('');
  }
  finish(ending){this.state.ending=ending;this.chase=null;this.ritual=null;this.game.player.enabled=false;this.world.ghost.root.visible=false;
    if(ending==='B'){for(const statue of this.world.statues||[]){if(statue.userData.head)statue.userData.head.rotation.y=.65;}this.game.player.teleport(55,-5,-26,Math.PI,0);this.world.sealedBuddha.visible=false;}
    const e=ENDINGS[ending];try{const unlocked=JSON.parse(localStorage.getItem('ols-endings')||'[]');localStorage.setItem('ols-endings',JSON.stringify([...new Set([...unlocked,ending])]));}catch{}
    this.show({eyebrow:e.subtitle,title:e.name,body:paragraphs(e.text)+this.aftermath(ending)+`<p class="ending-final">${escape(e.final)}</p><div class="ending-stats"><span>證據 ${this.state.evidence.length}/11</span><span>回應 ${this.state.answers} 次</span><span>被追上 ${this.state.deaths} 次</span><span>調查 ${Math.max(1,Math.round(this.state.elapsed/60))} 分鐘</span></div>`,kind:'ending',options:[{text:'回到最後抉擇',action:()=>{const s=readSave(SAVE_KEY+'-decision');if(s){this.state=s;this.state.ending=null;this.world.sealedBuddha.visible=true;this.game.player.teleport(55,-7,-18,0,0);this.sync();this.save();}}},{text:'返回標題畫面',action:()=>this.onLobby()}]});
    this.game.audio.storyCue?.(ending==='C'?'release':'threat');
  }
  /** 筆記最下方那一句：把目前為止「玩家自己查到的」串成一條因果。 */
  deduction(){const s=this.state,has=id=>s.evidence.includes(id);
    let t=has('confession')?'門是我扣的，謊也是我說的。被剪掉的那一分鐘裡，她說的是「我還在」。'
      :has('names')?'大人把那句謊當成保護，教到連我們自己都信。'
      :has('death')?'打給我的是兩週前的錄音。接了電話的人，都在 02:47 到了這裡。'
      :s.flags.stage?'那場點名我在。第六聲「有」，是別人替她喊的。'
      :has('tape')?'02:47 是錄音被剪斷的地方。有人問過：裡面還有沒有人。'
      :s.flags.incense?'阿哲清點的東西都還在。先把物件和那卷錄音對起來。'
      :'先找阿哲留在正殿的設備。';
    if(has('diary'))t+=' 問路，勿報姓名。';
    if(has('ritual'))t+=' 送行的順序：名、物、證。';
    if(has('relic')&&s.notes?.includes('shoes'))t+=' 白衣的女人是林美蘭。她應了聲，它就一直穿著她。';
    else if(has('relic'))t+=' 補兔耳的紅線，和白衣女人左腕上的是同一種。';
    return t;
  }
  journal(){const s=this.state;const list=objectives(s);const notes=(s.notes||[]).filter(id=>NOTES[id]);
    this.show({eyebrow:`調查筆記　${s.evidence.length}/11`,title:'目前查到的事',body:`<div class="journal-goal"><small>目前線索</small>${list.map(o=>`<p>${escape(o.title)}<br><span>${escape(o.location)}</span></p>`).join('')}</div><div class="route-note">路線：山門 → 廟埕 → 一樓正殿。<br>西北樓梯上二樓；二樓東側上三樓；三樓北側上四樓。<br>古戲台在廟埕東側，亂葬崗由西牆缺口進入。<br>地下入口在四樓神壇東側，地下南側石階可返回。</div><div class="journal-grid">${Object.entries(EVIDENCE).map(([id,e])=>`<button data-evidence="${id}" ${s.evidence.includes(id)?'':'disabled'}><small>${s.evidence.includes(id)?'已取得':'尚未取得'}</small><strong>${s.evidence.includes(id)?escape(e.title):'尚未確認的線索'}</strong><span>${s.evidence.includes(id)?escape(e.place):''}</span></button>`).join('')}</div>${notes.length?`<div class="journal-notes"><small>順手讀過的東西（不計入證據）</small>${notes.map(id=>`<button class="note-link" data-note="${id}">${escape(NOTES[id].title)}　·　${escape(NOTES[id].place)}</button>`).join('')}</div>`:''}<aside class="deduction">${escape(this.deduction())}</aside>`,dismiss:true,kind:'journal',options:[{text:'收起筆記',action:()=>{}}]});
    $('story-layer').querySelectorAll('[data-evidence]').forEach(b=>b.addEventListener('click',()=>this.document(b.dataset.evidence,()=>this.journal())));
    $('story-layer').querySelectorAll('[data-note]').forEach(b=>b.addEventListener('click',()=>this.note(b.dataset.note,()=>this.journal())));
    if(preludeRecords(s).length){const b=document.createElement('button');b.className='prelude-link';b.textContent='回看住處、山村與佩珊的紀錄';b.onclick=()=>this.preludeJournal();$('story-layer').querySelector('.route-note').before(b);}
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
      if(r.remaining<=0){this.ritual=null;$('ritual-hud').classList.add('hidden');this.game.player.teleport(55,-7,-18,0,0);this.show({title:'香火已盡',body:paragraphs('神壇底下，我自己的聲音說：「來不及了。」\n證據與遺物都還在，可以重新點香。'),options:[{text:'重新準備儀式',action:()=>this.prepareRitual()}]});return;}
    }
    if(this.tick<0.12)return;this.tick=0;const p=this.game.player.pos;const focused=this.focused();$('interact-prompt').innerHTML=focused?`<kbd>E</kbd><span>${escape(focused.label)}</span>`:'';
    const goal=objectives(this.state)[0];const target=this.world.targets.find(t=>t.id===goal.id);
    $('objective-title').textContent=goal.title;$('objective-place').textContent=goal.location;
    if(target){const d=p.distanceTo(target.position);const dy=target.position.y-p.y;$('objective-distance').textContent=`${Math.round(d)} m${dy>4?' · 往樓上':dy<-4?' · 往樓下':''}`;
      this.projected.copy(target.position).project(this.game.camera);const front=this.delta.copy(target.position).sub(this.game.camera.position).dot(this.game.camera.getWorldDirection(this.look))>0;
      const marker=$('waypoint');marker.classList.toggle('hidden',!front||Math.abs(this.projected.x)>.94||Math.abs(this.projected.y)>.85||d<3.3||!!this.chase||!!this.ritual);marker.style.left=`${(this.projected.x*.5+.5)*100}%`;marker.style.top=`${(-this.projected.y*.5+.5)*100}%`;marker.textContent='◇';}
    // 提示光點只留給「現在能調查、而且還沒讀過」的東西；實際顯示由 storyWorld 依距離決定。
    for(const t of this.world.targets)t.live=this.active(t.id)&&!(NOTES[t.id]&&this.state.notes?.includes(t.id));
    if((this.state.flags.sent||this.state.flags.sealed)&&p.z>24&&Math.abs(p.x)<4)this.finish(this.state.flags.sent?'C':'A');
  }
  dispose(){window.removeEventListener('keydown',this.onKey);window.removeEventListener('beforeunload',this.onUnload);$('story-layer')?.remove();$('story-hud')?.remove();this.modal=null;}
}
