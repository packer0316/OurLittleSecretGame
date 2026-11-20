import * as THREE from 'three';
import { SAVE_KEY, CHAPTERS, EVIDENCE, NOTES, ENDINGS, newState, validateSave, collect, readNote, noteOpen, hint, trueEndingReady, missingEvidence, objectives } from './campaign.js';
import { preludeRecords } from './preludeRecords.js';
import { PHOTO_MARK_STYLE } from './photoLayout.js';
import { createFinale } from './finale.js';
import { PICTURES, evidencePicture, notePicture, normalizePictures, pictureChapter } from './illustrations.js';
import { createWaypoint } from './waypoint.js';

const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paragraphs=s=>s.split('\n').filter(Boolean).map(p=>`<p>${escape(p)}</p>`).join('');
const ART=import.meta.env.BASE_URL+'assets/story/';
const COUNT=['零','一','兩','三','四','五','六','七','八','九'],ORDINAL=['零','一','二','三','四','五','六','七','八','九','十'];
const times=n=>n<COUNT.length?COUNT[n]:` ${n} `;
const nth=n=>n<ORDINAL.length?ORDINAL[n]:` ${n} `;
// story：會自己插進主線的一次性劇情演出（目前是四樓錄音機的點名）。?auto 測試下預設關閉，網址加 &setpieces 才開；
// 關閉時仍可用 E 調查觸發，或在主控台呼叫 __game.story.campTape('camp')。
const BEATS=(()=>{const q=new URLSearchParams(typeof location!=='undefined'?location.search:'');return !q.has('auto')||q.has('setpieces');})();
export function readSave(key=SAVE_KEY){try{return validateSave(JSON.parse(localStorage.getItem(key)));}catch{return null;}}

export class Story {
  constructor(game,{resume=false,onResume=()=>{},onLobby=()=>{}}={}){
    this.game=game;this.world=game.map.storyWorld;this.state=resume?(readSave()||newState()):newState();
    // scene：正在跑的腳本演出 id（例如 'finale'、'sp:hideseek'），null 表示自由探索。設定期間恐怖導演的隨機事件暫停。
    this.onResume=onResume;this.onLobby=onLobby;this.modal=null;this.started=false;this.chase=null;this.ritual=null;this.scene=null;this.toastTime=0;this.tick=0;
    this.look=new THREE.Vector3();this.delta=new THREE.Vector3();this.events=[];
    this.guideTo=new THREE.Vector3();
    this.mount();this.waypoint=createWaypoint($('waypoint'),game.camera);this.sync();
    if(resume&&this.state.position){game.player.teleport(...this.state.position);}
    if(this.state.ending)this.state.ending=null; // continue from last safe play state, never lock the session in an ending
    this.onKey=e=>{
      if(!game.running||e.repeat||this.busy)return;
      if($('story-image-viewer')?.open)return;
      if(this.modal){
        // Let focused image/archive buttons receive their native keyboard click.
        if(['Enter','Space'].includes(e.code)&&e.target.closest?.('button:not([data-choice])'))return;
        const i=Number(e.key)-1;
        if(i>=0&&i<this.modal.options.length){e.preventDefault();this.choose(i);}
        else if((e.code==='KeyE'||e.code==='Space'||e.code==='Enter')&&this.modal.options.length===1){e.preventDefault();this.choose(0);}
        else if(e.code==='Escape'&&this.modal.dismiss){e.preventDefault();this.choose(this.modal.options.length-1);}
        return;
      }
      if(e.code==='KeyE'){e.preventDefault();const target=this.focused();if(target)this.interact(target.id);}
      if(e.code==='KeyJ'){e.preventDefault();if(!this.chase)this.journal();else this.toast('先退回香火旁，再查看筆記。');}
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
  start(){if(this.started)return;this.started=true;this.syncTraces();
    if(this.state.flags.prologueComplete&&!this.state.flags.incense){this.toast('02:47。阿哲的設備箱在正殿西桌。先走向亮著的供桌。');return;}
    if(this.state.flags.incense||this.state.elapsed>5){this.toast('已繼續上次的調查。J 開啟筆記。');return;}
    this.game.audio.breathCue?.();
    this.document('photo',()=>this.dialogue([
      ['我','阿哲說後面的門打不開。同一句話他說了兩次，連吸氣都一樣，然後電話就斷了。'],
      ['我','他的攝影機最後拍到設備箱，標籤寫著正殿西桌。先找到那個箱子。'],
    ],()=>{this.save();this.toast('走進正殿，先檢查仍亮著的供桌。');},'02:47・慈雲寺'));
  }

  show({eyebrow='慈雲寺・調查紀錄',title,body='',image=null,visual=null,redacted=false,options=[{text:'收起',action:()=>{}}],dismiss=false,kind=''}){
    this.modal={options,dismiss};this.game.player.enabled=false;this.game.player.keys=Object.create(null);this.game.player.vel.set(0,0,0);
    const art=PICTURES[visual],src=art?import.meta.env.BASE_URL+art.image:image?ART+image:null;
    this.modal.visual=art?.id||null;
    if(art)this.rememberPicture(art.id);
    const photo=src?`<figure class="story-figure ${art?'story-art ':''}${redacted?'redacted':''}" ${art?`data-visual-id="${art.id}"`:`style="${PHOTO_MARK_STYLE}"`}><img src="${escape(src)}" alt="${escape(art?.name||title)}" decoding="async">${redacted?'<i class="photo-scribble" aria-label="女孩的臉被紅筆塗去"></i>':''}${art?`<button class="story-image-open" aria-label="放大${escape(art.name)}">查看大圖</button>${art.category==='clue'?`<figcaption>${escape(art.caption)}</figcaption>`:''}<p class="story-image-fallback" hidden>圖片暫時無法載入，線索文字仍可閱讀。</p>`:''}</figure>`:'';
    $('story-layer').className=`story-layer ${kind}${art?' illustrated':''}${art?.category==='beat'?' cinematic':''}`;
    $('story-layer').innerHTML=`<article class="story-card"><p class="story-eyebrow">${escape(eyebrow)}</p><h2 id="story-title">${escape(title)}</h2><div class="story-content ${src?'with-image':''}">${photo}<div class="story-copy">${body}</div></div><nav class="story-choices">${options.map((o,i)=>`<button data-choice="${i}" ${o.disabled?'disabled':''}><span>${i+1<10?i+1:'·'}</span>${escape(o.text)}</button>`).join('')}</nav><small class="story-instruction">${options.length===1?'E / Enter 繼續':'點擊選項，或按數字鍵選擇'} · 閱讀時停止移動與計時</small></article>`;
    if(art)this.bindPictureViewer(src,art.name);
    $('story-layer').querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>this.choose(+b.dataset.choice)));
    if(document.pointerLockElement)document.exitPointerLock();
    $('story-layer').querySelector('[data-choice]:not(:disabled)')?.focus({preventScroll:true});
  }
  bindPictureViewer(src,title){
    const layer=$('story-layer'),figure=layer.querySelector('.story-art'),button=figure.querySelector('.story-image-open');
    figure.querySelector('img').addEventListener('error',()=>{figure.classList.add('image-unavailable');figure.querySelector('.story-image-fallback').hidden=false;button.hidden=true;},{once:true});
    button.onclick=()=>{
      let viewer=$('story-image-viewer');
      if(!viewer){viewer=document.createElement('dialog');viewer.id='story-image-viewer';viewer.setAttribute('aria-label',title);
        viewer.innerHTML=`<button class="story-image-close" autofocus>關閉大圖 · Esc</button><img src="${escape(src)}" alt="${escape(title)}"><p>${escape(title)}</p>`;
        viewer.addEventListener('keydown',e=>e.stopPropagation());
        viewer.querySelector('button').onclick=()=>viewer.close();
        viewer.addEventListener('close',()=>button.isConnected&&button.focus({preventScroll:true}));
        layer.appendChild(viewer);
      }
      viewer.showModal();
    };
  }
  rememberPicture(id){
    this.state.pictures=normalizePictures(this.state.pictures);
    if(!this.state.pictures.includes(id)){this.state.pictures.push(id);if(!this.chase&&!this.ritual&&!this.state.ending&&!this.transitioning)this.save();}
  }
  picture(id,done=()=>{}){const art=PICTURES[id];if(!art){done();return;}
    const body=art.dialogue?art.dialogue.map(([speaker,line])=>`<p class="picture-line"><strong>${escape(speaker)}</strong>${escape(line)}</p>`).join(''):paragraphs(art.caption);
    this.show({eyebrow:pictureChapter(art),title:art.name,visual:id,body,kind:'picture-sequence',options:[{text:'繼續',action:done}]});
  }
  pictureJournal(back=()=>this.journal()){
    const items=normalizePictures(this.state.pictures).map(id=>PICTURES[id]);
    this.show({eyebrow:'只記下親眼看過的事',title:'影像紀錄',body:items.length?`<div class="picture-archive">${items.map(art=>`<button data-picture="${art.id}"><img src="${import.meta.env.BASE_URL+art.image}" alt="" loading="lazy"><span>${escape(art.name)}</span><small>${escape(pictureChapter(art))}</small></button>`).join('')}</div>`:'<p>調查物件或經歷事件後，圖片會記在這裡。</p>',kind:'journal',dismiss:true,options:[{text:'返回筆記',action:back}]});
    $('story-layer').querySelectorAll('[data-picture]').forEach(b=>b.onclick=()=>this.picture(b.dataset.picture,()=>this.pictureJournal(back)));
  }
  addPictureJournalLink(back=()=>this.journal()){
    const button=document.createElement('button');button.className='picture-journal-link';button.textContent=`回看影像紀錄（${normalizePictures(this.state.pictures).length}）`;
    button.onclick=()=>this.pictureJournal(back);$('story-layer').querySelector('.story-copy').appendChild(button);
  }
  afterNotePicture(id,done){
    const notes=this.state.notes||[];
    if(['tablet','register'].includes(id)&&notes.includes('tablet')&&notes.includes('register')&&!this.state.pictures?.includes('beat-meilan-return'))this.picture('beat-meilan-return',done);
    else done();
  }
  choose(i){const opt=this.modal?.options[i];if(!opt||opt.disabled)return;
    $('story-image-viewer')?.close();this.modal=null;$('story-layer').classList.add('hidden');opt.action?.();
    if(!this.modal&&!this.busy&&!this.state.ending&&!this.transitioning&&this.game.map&&this.game.story===this){this.game.player.keys=Object.create(null);this.game.player.enabled=true;this.onResume();}
  }
  /** lines: [speaker, text, cue?]。cue 是該句出現時才觸發的聲音或演出。 */
  dialogue(lines,done=()=>{},title='聽見的聲音',i=0,visual=null){const [speaker,text,cue,lineVisual]=lines[i];cue?.();visual=lineVisual??visual;this.show({eyebrow:title,title:speaker,visual,body:`<p class="dialogue-line">${escape(text)}</p>`,kind:'dialogue',options:[{text:i===lines.length-1?'繼續調查':'繼續',action:()=>i+1<lines.length?this.dialogue(lines,done,title,i+1,visual):done()}]});}
  document(id,done=()=>{}){const e=EVIDENCE[id];this.show({eyebrow:e.place,title:e.title,image:e.image,visual:evidencePicture(id),redacted:e.redacted&&!this.state.flags.sent,body:`<p class="document-date">${escape(e.date)}</p>${paragraphs(e.text)}<aside class="deduction">${escape(e.inference)}</aside>`,dismiss:true,options:[{text:'收進筆記，繼續調查',action:done}]});}
  note(id,done=()=>{}){const n=NOTES[id];this.show({eyebrow:n.place+'・可回看的筆記',title:n.title,visual:notePicture(id),body:paragraphs(n.text),dismiss:true,options:[{text:'放回原處',action:()=>this.afterNotePicture(id,done)}]});}
  collect(id){const isNew=collect(this.state,id);if(isNew){this.game.audio.storyCue?.('clue');this.sync();this.save();}return isNew;}
  sync(){this.world.setState(this.state);const audio=this.game.audio;const released=!!this.state.flags.sent;if(audio.released!==released&&audio.ctx)audio.droneGain.gain.setTargetAtTime(released ? 0.012 : 0.07,audio.ctx.currentTime,1);audio.released=released;$('chapter-label').textContent=`第${['','一','二','三','四'][this.state.chapter]}章 / ${CHAPTERS[this.state.chapter]}`;$('clue-count').textContent=`證據 ${this.state.evidence.length} / 11`;}
  save(key=SAVE_KEY){
    const p=this.game.player;const s=structuredClone(this.state);s.position=[p.pos.x,p.pos.y,p.pos.z,p.yaw,p.pitch];
    try{localStorage.setItem(key,JSON.stringify(s));this.state.position=s.position;return true;}catch{this.toast('瀏覽器無法儲存進度；本次仍可繼續遊玩。');return false;}
  }
  toast(text){$('story-toast').textContent=text;$('story-toast').classList.add('show');this.toastTime=5;}
  /** 聲音合約 D：新的聲音一律走可選鏈結，實作還沒到位時不會壞。 */
  sfx(kind,opts){this.game.audio.horror?.(kind,opts);}
  preludeJournal(){const records=preludeRecords(this.state);this.show({eyebrow:'出發以前・山村調查',title:'我親眼確認過的事',body:records.length?records.map(([title,text])=>`<section class="archive-record"><h3>${escape(title)}</h3><p>${escape(text)}</p></section>`).join(''):'<p>目前還沒有序章調查紀錄。</p>',kind:'journal',dismiss:true,options:this.state.scene==='temple'?[{text:'返回目前筆記',action:()=>this.journal()}]:[{text:'收起紀錄',action:()=>{}}]});this.addPictureJournalLink(()=>this.preludeJournal());}
  active(id){const s=this.state,f=s.flags;
    if(id.startsWith('rite'))return !!this.ritual;
    if(this.ritual)return false;
    if(['rules','exit','return','incense'].includes(id))return id==='return'?this.game.player.pos.y<0:id==='exit'?!!(f.sealed||f.sent):id==='incense'?!f.incense:true;
    if(id==='descent')return true;
    if(id==='stage')return s.chapter>=3&&!f.stage;
    if(id==='loopmark')return !!f.stage&&!f.loopSolved;
    if(id==='divination')return !!f.stage&&!!f.loopSolved&&!f.key;
    if(id==='altar')return s.evidence.includes('names')&&s.evidence.includes('confession')&&!f.sealed&&!f.sent;
    if(NOTES[id])return noteOpen(s,id);
    if(EVIDENCE[id]){if(s.evidence.includes(id))return false;if(id==='relic')return s.evidence.includes('births');if(id==='death')return !!f.key;if(id==='births')return s.evidence.includes('death');if(['names','confession'].includes(id))return !!f.underground;return !!f.incense;}
    return false;
  }
  focused(){if(this.chase||this.modal)return null;const cam=this.game.camera;cam.getWorldDirection(this.look);let best=null,score=0;
    for(const t of this.world.targets){if(!this.active(t.id))continue;this.delta.copy(t.position).sub(cam.position);const d=this.delta.length();if(d>3.25||d<.05)continue;const dot=this.delta.normalize().dot(this.look);if(dot<0.68)continue;if(this.game.map.world.occluded?.(cam.position,t.position))continue;const sc=dot-d*.035;if(sc>score){score=sc;best=t;}}
    return best;
  }
  interact(id){if(this.modal||this.chase||!this.active(id))return false;const s=this.state,f=s.flags;
    if(id.startsWith('rite')){this.ritualAction(id);return true;}
    if(id==='rules'){this.show({eyebrow:'廟埕・天公爐',title:'天公爐上的刻字',visual:'temple-rules',body:paragraphs('爐身燻得發黑，爐緣刻著一圈字，字口裡塞滿了香灰。從正面讀起，繞著爐走一圈，剛好讀完。\n「七月初一開後殿。先上戲台點名，殿內無人，門自外扣。」\n「問者敲三下，問：裡面還有沒有人。問路可，勿報己名。」\n「門內喚你名，勿應。亡者不叫活人。」\n爐裡還插著幾炷香在悶燒，香灰是熱的。這座廟已經封了兩年。小時候大人說過：有人燒香記著的地方，它不敢靠近。')+'<aside class="deduction">要是應了它，就退回香火旁。</aside>',dismiss:true});return true;}
    if(id==='incense'){f.incense=true;s.chapter=2;this.sync();this.game.audio.storyCue?.('gate');this.save();this.dialogue([
      ['我','三炷香還在燒，香灰卻積了很厚。阿哲的工具箱就在供桌旁，蓋子開著。'],
      ['山門方向','砰。'],
      ['我','沒有風。門是自己關上的。'],
      ['我','手機上的時間還是 02:47。我進山門，早就不只一分鐘了。'],
    ],()=>{this.world.triggerScare('gate');this.toast('檢查一樓東西兩張工作桌，再上西北樓梯找錄音機。');},'設備還在，人去了哪裡',0,'beat-temple-arrival');return true;}
    if(id==='stage'){this.stage();return true;}
    if(id==='loopmark'){this.loopPass=(this.loopPass||0)+1;this.world.setLoopPass(this.loopPass);
      if(this.loopPass<3){this.game.player.teleport(-13,6.9,-16,-Math.PI/2,0);this.dialogue(this.loopPass===1?[['我','又是這段回廊。紅線還繫在同一根柱腳，地上的彈珠是五顆。']]:[['走廊裡的男孩聲','一、二、三、四、五。一、二、三、四、五。'],['我','你漏了一個。'],['走廊裡的男孩聲','沒有漏。第六個是別人替她喊的。']],()=>this.toast('回廊又回到原處。查看紅線旁留下的記號。'),'重複的回廊');}
      else{f.loopSolved=true;this.sync();this.save();this.dialogue([['牆後很輕的聲音','第三顆，別踩到。'],['我','彈珠變成六顆了。紅線的結一直朝著中央供桌。'],['我','跟著聲音走，只會繞回原地。這一次，我跟著東西走。']],()=>this.afterStage());}return true;}
    if(id==='divination'){this.divination();return true;}
    if(id==='descent'){
      if(!f.key||!s.evidence.includes('death')){this.show({title:'封住的暗道',body:paragraphs(!f.key?'暗道的銅鎖生了鏽。得先找到開得了它的鑰匙。':'鎖孔裡塞著一截充電線頭，和三樓東北桌那個充電座是同一種。先確認阿哲留下的手機。')});return true;}
      // 第一次碰暗道：身後阿哲的錄音機自己倒帶，放出 10/29 那一晚從暗道底下錄到的點名（一次性）。
      if(BEATS&&!f.underground&&!this.hasSeen('story:camp')&&this.campTape('hatch'))return true;
      this.descend();return true;
    }
    if(id==='return'){this.game.player.teleport(5.3,16.9,-20.5,Math.PI,0);this.save();this.toast('已返回四樓。可沿樓梯回頭尋找遺漏的證物。');return true;}
    if(id==='altar'){this.finalChoice();return true;}
    if(id==='exit'){this.finish(f.sent?'C':'A');return true;}
    if(NOTES[id]){const first=readNote(s,id);if(first){this.game.audio.storyCue?.('clue');this.save();}
      // 阿哲的地鋪：讀完以後，按下那台還在錄的錄音機（只有第一次）。其餘讀物第一次讀完給一句提示。
      this.note(id,()=>{if(id==='camp'&&!this.hasSeen('story:camp'))this.campTape('camp');else if(first&&NOTES[id].after)this.toast(NOTES[id].after);});return true;}
    if(EVIDENCE[id]){
      this.collect(id);this.document(id,()=>{
        if(id==='tape'){this.world.triggerScare('tape');this.game.audio.presence(.7);this.sfx('whisper',{pan:.7,dist:1.2});this.nextClue();}
        else if(id==='death')this.dialogue([
          ['我','十月二十九日 02:47，那三通我看到了。我沒有接。',()=>this.sfx('static',{intensity:.6})],
          ['我','草稿匣是空的。最後一則草稿「鑰匙拿到就上來。我在。」是他十月二十九日存的，送出時間是今晚 02:47。它替他送給了我。'],
          ['我','我沒接，它才去找別人。志豪、柏翰，然後繞回來，用阿哲的聲音。'],
          ['我','這支手機要帶出去。他沒說完的那半句，要有人聽完。'],
        ],()=>{this.world.triggerScare('phone');this.game.audio.presence(-.6);this.toast('西北木尺架留著另一組名字。也可以先帶鑰匙到四樓。');});
        else if(id==='births')this.dialogue([['我','林小雨。照片最右邊的那一個，叫這個名字。'],['我','我不是想不起來。是有人教過我，不要想。']],()=>this.toast('門框背面的陶牌指向西牆缺口。去老樹下找布兔。'));
        else if(id==='relic')this.dialogue([['我','名字對得上。左耳的縫線也一樣。'],
          ...(s.notes?.includes('flashlight')?[['我','鞋墊下是志豪的字。二樓佛龕前，他跪著寫「鞋在老樹下」，說的就是這一隻。他小時候就還回來了，今年還是被一通電話叫回來找。']]:[]),
          ['很輕的聲音','輪到你數了。',()=>this.sfx('hum',{pan:-.5,dist:4})]],()=>{this.world.triggerScare('relic');this.toast('布兔已收好。從西牆缺口回廟裡。');});
        else if(id==='names')this.dialogue([['牆後的童聲','都出來了。沒有別人。都出來了。沒有別人。',()=>this.sfx('whisper',{pan:-.8,dist:1})],['我','五個聲音。裡面有一個是我的。'],
          ...(s.notes?.includes('register')?[['我','十六個名字，最後一個是美蘭阿姨。牆上只刻她「未歸」。名冊上，她在「還」那一格寫的是自己。']]:[])],()=>this.nextClue());
        else if(id==='confession')this.dialogue([
          ['童年柏翰','後殿今天晚上聽得到妳爸爸。真的。',()=>this.sfx('sub',{intensity:.7})],
          ['童年志豪','鞋我藏起來了。讓她找久一點。'],
          ['童年佩珊','……六。有。'],
          ['童年阿哲','先扣上。大人等一下就來。'],
          ['門內的孩子','我的鞋找不到了。等我一下。'],
          ['年幼的我','都出來了。'],
          ['我','五個人，一人一句。沒有一句是想害她的。'],
          ['我',this.behindDoor()],
          ['我','我隔著門跟她說：我等一下回來。這一句，我欠了二十八年。'],
        ],()=>{this.save(SAVE_KEY+'-decision');this.toast('到地下神壇決定怎麼處理這一分鐘。也可以先回地上補齊線索。');});
        else this.nextClue();
      });return true;
    }return false;
  }
  nextClue(){if(this.state.chapter===3&&!this.state.flags.stage){this.game.audio.woodenFish?.(3);this.toast('廟埕東側傳來三聲木魚，像有人在催點名。接著是手機貼著木板震動的聲音。去舊戲台。');}else{const next=objectives(this.state)[0];this.toast(next.title+'。'+next.location+'。');}}
  stage(){this.world.silhouettes.visible=true;this.world.stageLight.color.setHex(0xf26426);this.world.stageLight.intensity=24;
    this.game.audio.score?.cue('stage'); // 配樂：戲台點名（一到五平均地數，第六聲是錯的）
    this.dialogue([
      ['錄音裡的男人','借聲之前，殿裡不能有人。點名。'],
      ['台上的孩子','一、二、三、四、五。',()=>this.game.audio.score?.motif('rollcall')],
      ['第五張椅子','……六。有。',()=>this.game.audio.score?.motif('count6'),'beat-rollcall'],
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
  voiceTrap(source){if(source==='camp'){this.campTrap();return;}this.game.audio.breathCue?.();
    const silent=()=>{if(source==='stage'){this.world.triggerScare('stage');this.game.audio.presence(.7);this.afterStage();}else this.toast('回去查看木筊。計數器底座刻著：問路，勿報姓名。');};
    const answer=()=>{this.state.answers++;this.beginChase(source);};
    const heard=this.state.road?.peishan?'佩珊說過：裡面不管誰叫你，都不要應。':'天公爐的爐緣刻著：門內喚你名，勿應。';
    if(source==='divination'&&this.state.road?.peishan){
      this.show({eyebrow:'聲音正在等你的回答',title:'「你在哪裡？」',body:paragraphs('佩珊的聲音，從樓梯口傳上來。\n「訊息我收到了。已經報警……你在哪裡？」\n和 02:39 那通電話是同一句。連翻紙的聲音，都停在同一個地方。'),kind:'voice-trap',options:[
        {text:'不出聲，手不離開木筊',action:()=>this.dialogue([['佩珊的聲音','你在哪裡？你在哪裡？你在——'],['牆後很輕的聲音','她沒有上山。']],silent)},
        {text:'「佩珊？我在二樓。」',action:answer},
        {text:'留意聲音，不出聲',action:()=>this.show({title:'同一通電話',body:paragraphs('它沒有借到佩珊的聲音。她一通都沒接。\n它只是把我在山下聽過的那一句，照原樣放了一次。'),options:[{text:'保持沉默',action:silent},{text:'還是回答它',action:answer}]})},
      ]});return;
    }
    const where=source==='stage'?'幕布後面傳來阿哲的聲音。位置很低，像有人趴在地上，從布底下往外說話。':'供桌底下傳來阿哲的聲音。位置很低，像有人蜷在桌腳旁邊。';
    this.show({eyebrow:'聲音正在等你的回答',title:'「以安，你回我一句。」',body:paragraphs(`${where}\n「你回我一句，我就知道你還在。」\n${heard}`),kind:'voice-trap',options:[
      {text:'保持沉默，退回香火旁',action:()=>this.dialogue([['像阿哲的聲音','你以前不是這樣的。你以前都會應。'],['錄音裡那個女人的聲音','不回答，很沒禮貌。'],['牆後很輕的聲音','走。']],silent)},
      {text:'「阿哲，是你嗎？」',action:answer},
      {text:'留意聲音，不出聲',action:()=>this.show({title:'一模一樣的吸氣',body:paragraphs('這口吸氣，和電話裡那一口完全一樣。連停頓的長度都沒有變。\n它不是在說話。它在播放。'),options:[{text:'保持沉默',action:silent},{text:'還是回答它',action:answer}]})},
    ]});}
  /** 合約 A：一次性演出記在 state.seen，讀檔後不重演。 */
  hasSeen(id){return !!this.state.seen?.includes(id);}
  markSeen(id){const s=this.state;s.seen??=[];if(!s.seen.includes(id)&&s.seen.length<64)s.seen.push(id);this.syncTraces();}
  /** 四樓錄音機的紅燈：帶子還在錄，就一直亮著；點名放完以後熄掉。 */
  syncTraces(){const led=this.game.map?.scene?.getObjectByName?.('AzheRecorderLed');if(led)led.visible=!this.hasSeen('story:camp');}
  /** 第四章「鑰匙到地下」之間的轉折：阿哲的錄音機。from='hatch' 是手碰到暗道時自己播放，'camp' 是讀完地鋪後按下播放。 */
  campTape(from='camp'){
    if(this.modal||this.chase||this.ritual||this.state.ending||(this.scene&&this.scene!=='story:camp'))return false;
    this.scene='story:camp';this.campFrom=from;this.game.audio.presence?.(-.7);
    this.game.audio.score?.cue('camp'); // 配樂：錄音機的點名（遊戲暫停中，先把持續層擺好）
    const open=from==='hatch'
      ?[['我','手剛碰到暗道的銅鎖，身後西牆下喀的一聲。阿哲的錄音機自己倒了帶，開始播放。',()=>this.sfx('creak',{pan:-.8,dist:6})]]
      :[['我','我按下停止，把帶子倒回去一段，再按播放。',()=>this.sfx('static',{pan:-.3,dist:1,intensity:.35})]];
    this.dialogue([...open,
      ['錄音機裡，阿哲的聲音','十月二十九號，兩點四十五。麥克風放下去了。剪掉的那一分鐘接好了，天亮放給以安聽。'],
      ['錄音機裡，阿哲的聲音','……我的手機在響。我沒有碰它，它自己在打給以安。三通，他沒接。'],
      ['錄音機裡','叩。叩。叩。聲音是從麥克風那一頭，暗道底下傳上來的。',()=>this.sfx('knock',{pan:.5,dist:4})],
      ['錄音機裡，一個小女孩的聲音','點名。',()=>this.game.audio.score?.cue('camp:roll')],
      ['錄音機裡，小女孩的聲音','陳以安。'],
      ['錄音機裡','很久，沒有人應。'],
      ['錄音機裡，小女孩的聲音','張明哲。'],
      ['錄音機裡，阿哲的聲音','……小雨？'],
      ['錄音機裡，小女孩的聲音','張明哲。'],
      ['錄音機裡，阿哲的聲音','有。',()=>this.sfx('breath',{pan:-.5,dist:2}),'beat-camp-call'],
      ['我','喊到自己的名字，誰都會應。他只是像小時候點名那樣，應了一聲。'],
      ['錄音機裡','睡袋拉鍊的聲音。腳步往暗道走，越來越遠。'],
      ['錄音機裡，小女孩的聲音','許志豪。吳柏翰。周佩珊。'],
    ],()=>this.campTrap(),'還在錄的錄音機');
    return true;
  }
  /** 規矩的第三次考驗：這一次叫的是自己的名字，而且是點名。選項 0 永遠是沉默。 */
  campTrap(){this.scene='story:camp';this.game.audio.breathCue?.();
    const heard=this.state.road?.peishan?'佩珊說過：裡面不管誰叫你，都不要應。':'天公爐的爐緣刻著：門內喚你名，勿應。';
    this.show({eyebrow:'聲音正在等你的回答',title:'「陳以安。」',body:paragraphs(`點到佩珊，停了一拍，又回到第一個名字。\n「陳以安。」\n喇叭沙沙響，在等。\n${heard}`),kind:'voice-trap',options:[
      {text:'不出聲，手按在停止鍵上',action:()=>this.campSilent()},
      {text:'「有。」',action:()=>this.campAnswer()},
      {text:'留意聲音，不出聲',action:()=>this.show({title:'帶子早就轉到底了',body:paragraphs('計數停在最後一格，捲帶軸是空轉的。\n喇叭裡的聲音不是從帶子上來的。它在等這一聲，好把點名補齊。'),options:[{text:'保持沉默',action:()=>this.campSilent()},{text:'還是回答它',action:()=>this.campAnswer()}]})},
    ]});
  }
  campSilent(){
    this.dialogue([
      ['錄音機裡，小女孩的聲音','陳以安……沒有來。'],
      ['錄音機裡，小女孩的聲音','沒關係。我再等一下。'],
      ['我','那是我說的。二十八年前，我隔著門跟她說：我等一下回來。'],
      ['暗道底下','叩。叩。叩。',()=>this.sfx('knock',{pan:0,dist:3})],
    ],()=>{this.markSeen('story:camp');this.scene=null;this.save();
      if(this.campFrom==='hatch')this.descend();else this.toast('暗道底下有人敲了三下。用銅鑰匙打開神壇東側的暗道。');},'還在錄的錄音機');
  }
  campAnswer(){this.state.answers++;
    this.dialogue([['錄音機裡，我自己的聲音','有。'],['錄音機裡，小女孩的聲音','找到你了。',()=>this.sfx('whisper',{pan:0,dist:1})]],()=>{
      this.scene=null;this.beginChase('camp');
      // 它從聲音的來處出來：人在暗道邊，它從西牆的地鋪過來；人在地鋪邊，它從暗道上來。
      const p=this.game.player.pos;this.world.ghost.root.position.set(p.x<0?5.3:-8.4,p.y,p.x<0?-23.3:-23.6);
    },'聲音正在等你的回答');
  }
  /** 下到地下封印室。第一次會先看到暗道邊那三雙鞋。 */
  descend(){const f=this.state.flags;
    const go=()=>{f.underground=true;this.game.player.teleport(55,-7,-13.5,0,0);this.sync();this.save();this.sfx('sub',{intensity:.8});this.dialogue([['我','往下的石階比廟還舊。上面這四層樓，是蓋在後殿上面的。'],['門內，阿哲的聲音','以安，我在慈雲寺。後面的門打不開。'],['我','同一句話，同一口吸氣。可是這一次，聲音是從門的另一邊傳出來的。']],()=>this.toast('地下封印室：調查西牆的手印，和門前石座上的舊鎖。'),'把最後一句說完');};
    if(f.underground){go();return;}
    this.dialogue([
      ['我','暗道蓋旁邊排著三雙鞋，鞋尖都朝著暗道，像進屋前脫在門口：一雙沾泥的工作靴、一雙藍白拖、一雙後跟被踩扁的球鞋。'],
      ['我','阿哲、志豪、柏翰。我的鞋還穿在腳上。'],
    ],go,'把最後一句說完',0,'three-friends-shoes');
  }
  /** 第四章收尾：玩家查到的東西，決定以安能說出門後有誰。 */
  behindDoor(){const s=this.state,n=s.notes||[];
    const meilan=s.evidence.includes('names')||['register','tablet','shoes'].some(id=>n.includes(id));
    return `門的另一邊有阿哲、志豪、柏翰，有小雨${meilan?'，還有隔年回來應了她的美蘭阿姨':''}。`;
  }
  afterStage(){this.toast(this.state.flags.loopSolved?'到二樓中央供桌擲筊。計數器底座刻著：問路，勿報姓名。':'回到二樓西側回廊，找紅線旁留下的記號。');this.save();}
  divination(){this.show({eyebrow:'二樓・問神',title:'有問必答，以名為引',body:paragraphs('兩片木筊躺在積灰的供桌上。桌沿刻著八個字：有問必答，以名為引。\n計數器底下那枚木片寫的是：問路，勿報姓名。'),options:[
    {text:'「通往後殿的路在哪裡？」',action:()=>{this.state.flags.key=true;this.state.chapter=4;this.sync();this.save();this.game.audio.storyCue?.('clue');this.dialogue([['我','一平一凸，聖筊。抽屜自己滑開，裡面是一把銅鑰匙，齒缺了一角。'],['門後的聲音','你以前會開，現在也會。'],['我','抽屜內側貼著阿哲的藍色便條：「三樓東北桌，手機在充電。」'],
      // 第三章的鉤子：手機停在 02:47，卻收到了訊息。發訊的就是便條上那支插在三樓充電的手機。
      ['口袋裡','嗡——。手機震了一下。',()=>this.sfx('static',{pan:.2,dist:.5,intensity:.35})],
      ['阿哲傳來的訊息','鑰匙拿到就上來。我在。',null,'beat-phone-draft'],
      ['我','傳送時間 02:47。他的手機不在他身上，插在三樓的充電座上。'],
    ],()=>this.toast('前往三樓東北收存桌，找傳訊息給你的那支手機。'));}},
    {text:'「我是陳以安，你認得我嗎？」',action:()=>{this.state.answers++;this.dialogue([['我','兩片木筊都立了起來。'],['供桌底下','陳、以、安。記住了。']],()=>this.beginChase('divination'));}},
    {text:'「後面有人嗎？」',action:()=>this.voiceTrap('divination')},
  ]});}
  beginChase(source){const p=this.game.player;const upstairs=p.pos.y>5;const safe=upstairs?this.world.safeZones[1]:this.world.safeZones[0];
    this.chase={source,time:0,safe:safe.clone(),checkpoint:[p.pos.x,p.pos.y,p.pos.z,p.yaw,p.pitch]};p.storyChase=true;
    const ghost=this.world.ghost.root;ghost.visible=true;ghost.position.set(upstairs?5:25.1,p.pos.y,upstairs?-25:-3.25);
    this.game.audio.storyCue?.('threat');$('chase-hud').classList.remove('hidden');this.toast(`你應了它。按住 Shift 退回${upstairs?'西側回廊那爐香':'天公爐的香火'}旁，或拉開距離撐到聲音散去。`);
  }
  endChase(caught){const c=this.chase;if(!c)return;this.chase=null;this.game.player.storyChase=false;this.world.ghost.root.visible=false;$('chase-hud').classList.add('hidden');$('danger-vignette').style.opacity=0;
    if(caught){this.state.deaths++;this.game.player.teleport(...c.checkpoint);
      const n=this.state.deaths;const line=n===1?'紅布蓋住了你的眼睛。你聽見自己的呼吸，從別人的喉嚨裡傳回來。':n===2?'紅布又蓋下來。這一次它喘氣的方式，已經和你一模一樣。':'紅布蓋下來以前，你聽見它用你的聲音，練習叫你自己的名字。';
      this.show({eyebrow:'聲音又靠近了一點',title:'你回答了',body:paragraphs(line+'\n已取得的證據仍然保留。'),options:[{text:'回到這次呼名之前',action:()=>this.voiceTrap(c.source)}]});}
    else{if(c.source==='camp')this.markSeen('story:camp');this.save();if(c.source==='stage')this.afterStage();else if(c.source==='camp')this.toast('聲音退去了。錄音機的紅燈熄了。暗道在四樓神壇東側。');else this.toast('聲音退去了。可以重新擲筊。');}
  }
  finalChoice(){this.save(SAVE_KEY+'-decision');const s=this.state,n=s.answers;
    const owed=n>0?`今晚我應過它${times(n)}次。門裡現在說話的，用的就是那幾句。`:'今晚我一聲都沒有應它。它手上屬於我的，還是只有二十八年前那一句。';
    this.show({eyebrow:'最後的抉擇',title:'門裡只剩你的聲音',body:paragraphs(`門裡一遍一遍放著「都出來了」。後面接著我自己的聲音，說我沒有做錯。\n${owed}\n紅繩還繫在神壇後面，門的另一邊忽然安靜下來，像在等我開口。\n我可以把紅繩重新繫緊，也可以照它說的，解開佛像眼睛上的紅布。${s.evidence.includes('ritual')?'送行盤是第三條路：名、物、證。':'或者，把她的名字留下來。'}`),options:[
    // finale：三條路都是可以玩的演出（src/story/finale.js）。演出中不自動存檔，讀檔一律回到這裡。
    {text:'重新繫緊紅繩，把門封回去',action:()=>(this.finale??=createFinale(this)).start('A')},
    {text:'解開覆眼的紅布，相信門裡的聲音',action:()=>(this.finale??=createFinale(this)).start('B')},
    {text:'留下她的名字，開始送行',action:()=>this.prepareRitual()},
    {text:'先離開，繼續調查',action:()=>{}},
  ]});}
  prepareRitual(){if(!trueEndingReady(this.state)){const missing=missingEvidence(this.state).map(hint);this.show({title:'還不能把她送走',body:`<p>我不能再用一句答應，代替真的把她帶出去。名字、她的東西、那一晚的順序，我還缺：</p><ul class="missing-evidence">${missing.map(m=>`<li><strong>${escape(m.title)}</strong><span>${escape(m.location)}</span></li>`).join('')}</ul>`,options:[{text:'回頭找齊證據與遺物',action:()=>{}}]});return;}
    this.show({title:'送行',body:paragraphs('送行和借聲相反：不問，只說。\n一、左側空牌位：說出她的名字。\n二、中央供盤：把她的東西還給她。\n三、右側錄音機：把那一分鐘說完。\n香一點，地下的燈會一盞一盞熄掉。背後不管是誰在叫你，不要回頭，也不要應。作證不是回答。'),options:[{text:'點燃三炷香',action:()=>(this.finale??=createFinale(this)).start('C')},{text:'稍後再做',action:()=>{}}]});
  }
  /** 除錯（章節跳轉）：直接開始某個結局；phase 是 finale.js 的段落名稱（例如 'c-six'），省略時從頭開始。讀檔一樣回到最後抉擇。 */
  startFinale(kind,phase){this.save(SAVE_KEY+'-decision');this.finale??=createFinale(this);if(phase)this.finale.debug.to(phase);else this.finale.start(kind);}
  /** 送行三個位置的 E：順序、失敗重試與演出都在結局的時間軸裡（src/story/finale.js）。 */
  ritualAction(id){return this.finale?.action(id)??false;}
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
    // finale：送行途中的選擇（只在這一輪演出裡記著，回到最後抉擇就重來）
    const seen=s.seen||[];
    if(ending==='C'&&seen.includes('finale:six-answered'))out.push('點名點到六的時候，你替她應了一聲。那一聲現在在它那裡。');
    else if(ending==='C'&&seen.includes('finale:six-held'))out.push('點名點到六，這一次沒有人替她喊。是她自己應的。');
    if(ending==='C'&&seen.includes('finale:let-go'))out.push('那把鑰匙，你又放開過一次，和二十八年前一樣。後來你沒有再放。');
    if(ending==='C'&&seen.includes('finale:looked-back'))out.push('你在黑暗裡回過頭。那張臉，你這輩子都會記得。');
    return out.map(t=>`<aside class="deduction">${escape(t)}</aside>`).join('');
  }
  finish(ending){this.finale?.end();this.state.ending=ending;this.chase=null;this.ritual=null;this.scene=null;this.game.player.enabled=false;this.world.ghost.root.visible=false;
    const endingVisual='beat-ending-'+ending.toLowerCase();
    this.state.pictures=normalizePictures([...(this.state.pictures||[]),endingVisual]);
    const e=ENDINGS[ending];try{const unlocked=JSON.parse(localStorage.getItem('ols-endings')||'[]');localStorage.setItem('ols-endings',JSON.stringify([...new Set([...unlocked,ending])]));}catch{}
    // 看完結局以後，「續寫」從最後抉擇重新開始，不會卡在演出的半途
    try{const d=readSave(SAVE_KEY+'-decision');if(d){d.pictures=normalizePictures([...(d.pictures||[]),...this.state.pictures]);const saved=JSON.stringify(d);localStorage.setItem(SAVE_KEY+'-decision',saved);localStorage.setItem(SAVE_KEY,saved);}}catch{}
    this.show({eyebrow:e.subtitle,title:e.name,visual:endingVisual,body:paragraphs(e.text)+this.aftermath(ending)+`<p class="ending-final">${escape(e.final)}</p>${e.memorial?`<p class="ending-final">${escape(e.memorial)}</p>`:''}<div class="ending-stats"><span>證據 ${this.state.evidence.length}/11</span><span>回應 ${this.state.answers} 次</span><span>被追上 ${this.state.deaths} 次</span><span>調查 ${Math.max(1,Math.round(this.state.elapsed/60))} 分鐘</span></div>`,kind:'ending',options:[{text:'回到最後抉擇',action:()=>{const s=readSave(SAVE_KEY+'-decision');if(s){this.finale?.restore();this.state=s;this.state.ending=null;this.world.sealedBuddha.visible=true;this.game.player.teleport(55,-7,-21.6,0,0);this.sync();this.save();}}},{text:'返回標題畫面',action:()=>this.onLobby()}]});
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
    const n=s.notes||[],read=id=>n.includes(id);
    if(has('diary'))t+=' 問路，勿報姓名。';
    if(has('ritual'))t+=' 送行的順序：名、物、證。';
    // story：朋友們留下的東西。讀到兩樣以上，就知道他們都來過、都還在門後。
    if(['flashlight','chalk','camp'].filter(read).length>=2&&!has('confession'))t+=' 志豪、柏翰、阿哲都來過。東西留在原地，人在門的另一邊。';
    if(has('relic')&&['shoes','register','tablet'].some(read))t+=' 白衣的女人是林美蘭。她應了聲，它就一直穿著她。';
    else if(has('relic'))t+=' 補兔耳的紅線，和白衣女人左腕上的是同一種。';
    else if(read('robe'))t+=' 問者的紅線要問完才剪。那一晚的線沒有人剪過。';
    if(read('bucket'))t+=' 郭家還了二十八尊紙人，它一尊都沒收。';
    return t;
  }
  journal(){const s=this.state;const list=objectives(s);const notes=(s.notes||[]).filter(id=>NOTES[id]);
    this.show({eyebrow:`調查筆記　${s.evidence.length}/11`,title:'目前查到的事',body:`<div class="journal-goal"><small>目前線索</small>${list.map(o=>`<p>${escape(o.title)}<br><span>${escape(o.location)}</span></p>`).join('')}</div><div class="route-note">路線：山門 → 廟埕 → 一樓正殿。<br>西北樓梯上二樓；二樓東側上三樓；三樓北側上四樓。<br>古戲台在廟埕東側，亂葬崗由西牆缺口進入。<br>地下入口在四樓神壇東側，地下南側石階可返回。</div><div class="journal-grid">${Object.entries(EVIDENCE).map(([id,e])=>`<button data-evidence="${id}" ${s.evidence.includes(id)?'':'disabled'}><small>${s.evidence.includes(id)?'已取得':'尚未取得'}</small><strong>${s.evidence.includes(id)?escape(e.title):'尚未確認的線索'}</strong><span>${s.evidence.includes(id)?escape(e.place):''}</span></button>`).join('')}</div>${notes.length?`<div class="journal-notes"><small>順手讀過的東西（不計入證據）</small>${notes.map(id=>`<button class="note-link" data-note="${id}">${escape(NOTES[id].title)}　·　${escape(NOTES[id].place)}</button>`).join('')}</div>`:''}<aside class="deduction">${escape(this.deduction())}</aside>`,dismiss:true,kind:'journal',options:[{text:'收起筆記',action:()=>{}}]});
    $('story-layer').querySelectorAll('[data-evidence]').forEach(b=>b.addEventListener('click',()=>this.document(b.dataset.evidence,()=>this.journal())));
    $('story-layer').querySelectorAll('[data-note]').forEach(b=>b.addEventListener('click',()=>this.note(b.dataset.note,()=>this.journal())));
    if(preludeRecords(s).length){const b=document.createElement('button');b.className='prelude-link';b.textContent='回看住處、山村與佩珊的紀錄';b.onclick=()=>this.preludeJournal();$('story-layer').querySelector('.route-note').before(b);}
    this.addPictureJournalLink();
  }
  /** 方向提示箭頭要指的地方：{to, label?, danger?}；null 時箭頭淡出。閱讀、演出、恐怖段落與結局中不指路；追逐時改指香火。 */
  guide(){const s=this.state;
    if(this.modal||s.ending||this.scene||this.ritual||this.transitioning||this.busy)return null;
    if(this.chase)return {to:this.guideTo.copy(this.chase.safe).setY(this.chase.safe.y+1),label:'香火',danger:true};
    const goal=objectives(s)[0],t=goal&&this.world.targets.find(t=>t.id===goal.id);
    return t?{to:t.position}:null;
  }
  /** 每一幀更新箭頭。目標在別層或屋外時，地圖的 route() 會先指向樓梯、門口（src/core/nav.js）。 */
  updateWaypoint(dt){const g=this.guide(),p=this.game.player.pos;
    const r=g&&this.game.map?.route?.(p,g.to);
    this.waypoint.update(dt,g&&{point:r?r.point:g.to,label:r?.via?r.label:(g.label||''),danger:!!g.danger},p);
  }
  update(dt){this.updateWaypoint(dt);if(this.modal||this.state.ending){$('interact-prompt').textContent='';return;}
    this.state.elapsed+=dt;this.tick+=dt;if(this.toastTime>0){this.toastTime-=dt;if(this.toastTime<=0)$('story-toast').classList.remove('show');}
    if(this.chase){const c=this.chase;c.time+=dt;const g=this.world.ghost.root,p=this.game.player.pos;this.delta.copy(p).sub(g.position);this.delta.y=0;const d=this.delta.length();
      if(c.time>1.2&&d>0.2){this.delta.normalize();const next={x:g.position.x+this.delta.x*3.15*dt,z:g.position.z+this.delta.z*3.15*dt};this.game.map.world.resolve(next,0.22,g.position.y);g.position.x=next.x;g.position.z=next.z;g.rotation.y=Math.atan2(this.delta.x,this.delta.z);}
      const safeDist=Math.hypot(p.x-c.safe.x,p.z-c.safe.z);$('chase-hud').textContent=`不要回答　退回香火旁 ${Math.round(safeDist)} m　${Math.max(0,Math.ceil(24-c.time))} 秒`;$('danger-vignette').style.opacity=String(Math.max(.08,1-d/12));
      if(d<0.85&&Math.abs(p.y-g.position.y)<2&&c.time>1.2){this.endChase(true);return;}
      if((safeDist<2.2&&Math.abs(p.y-c.safe.y)<1)||c.time>=24){this.endChase(false);return;}
    }
    // finale：結局演出（喚名、歸物、見證、門後、出口）由 src/story/finale.js 的時間軸驅動；它接管畫面提示時直接回傳。
    if(this.ritual){if(this.ritual.update?.(dt))return;}
    if(this.tick<0.12)return;this.tick=0;const p=this.game.player.pos;const focused=this.focused();$('interact-prompt').innerHTML=focused?`<kbd>E</kbd><span>${escape(focused.label)}</span>`:'';
    const goal=objectives(this.state)[0];const target=this.world.targets.find(t=>t.id===goal.id);
    $('objective-title').textContent=goal.title;$('objective-place').textContent=goal.location;
    if(target){const d=p.distanceTo(target.position);const dy=target.position.y-p.y;$('objective-distance').textContent=`${Math.round(d)} m${dy>4?' · 往樓上':dy<-4?' · 往樓下':''}`;}
    // 提示光點只留給「現在能調查、而且還沒讀過」的東西；實際顯示由 storyWorld 依距離決定。
    for(const t of this.world.targets)t.live=this.active(t.id)&&!(NOTES[t.id]&&this.state.notes?.includes(t.id));
    if((this.state.flags.sent||this.state.flags.sealed)&&p.z>24&&Math.abs(p.x)<4)this.finish(this.state.flags.sent?'C':'A');
  }
  dispose(){this.finale?.dispose();this.waypoint?.dispose();window.removeEventListener('keydown',this.onKey);window.removeEventListener('beforeunload',this.onUnload);$('story-layer')?.remove();$('story-hud')?.remove();this.modal=null;}
}
