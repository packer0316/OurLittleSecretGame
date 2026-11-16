import { Story } from './Story.js';
import { SAVE_KEY } from './campaign.js';

const $=id=>document.getElementById(id);
const goals=[['letter','查看阿哲寄回的照片','書桌・信封'],['photo','翻看照片背面的時間','書桌・六人合照'],['phone','接聽阿哲的來電','書桌・手機'],['slip','門外安靜了。查看門縫','玄關・門下的紙'],['kit','帶上鑰匙與手電筒','玄關・矮櫃'],['door','出發前，再確認一次門外','玄關・大門']];

/** Uses the same reading, keyboard, pointer-lock and save UI as the temple. */
export class HomeStory extends Story {
  constructor(game,options={}){
    super(game,options);this.state.scene='home';this.state.home??={step:0,notes:[]};this.onTravel=options.onTravel;
    this.sync();if(this.state.home.step>=5)game.player.flashOn=true;
  }
  start(){if(this.started)return;this.started=true;this.save();this.toast(this.state.home.step?'已回到住處。筆記保留了出發前的調查。':'阿哲下午寄來一張舊照片，說晚點打來。先查看書桌上的信封。');}
  sync(){
    this.world.setState(this.state);const h=this.state.home||{step:0,notes:[]};
    $('chapter-label').textContent='序章 / 未播完的錄音';$('clue-count').textContent=`住處筆記 ${h.notes.length} / 3`;
    this.game.player.flashAvailable=h.step>=5;
    if(h.step<5){this.game.player.flashOn=false;this.game.player.flashPower=0;}
  }
  advance(step){this.state.home.step=Math.max(step,this.state.home.step);this.sync();this.save();}
  active(id){if(this.busy)return false;const n=this.state.home?.step||0;if(id==='slip'&&this.world.doorEventActive)return false;return id===goals[Math.min(n,5)][0]||['calendar','window','message','door'].includes(id)||id==='letter'&&n>0||id==='photo'&&n>1||id==='phone'&&n>2;}
  focused(){
    // Small desk props require a tighter view cone so the letter cannot steal the photo's focus.
    const target=super.focused();if(!target)return null;
    let best=null,score=0;const cam=this.game.camera;cam.getWorldDirection(this.look);
    for(const t of this.world.targets){if(!this.active(t.id))continue;this.delta.copy(t.position).sub(cam.position);const d=this.delta.length(),dot=this.delta.normalize().dot(this.look);if(d>2.7||dot<.965||this.game.map.world.occluded(cam.position,t.position))continue;const s=dot-d*.005;if(s>score){score=s;best=t;}}
    return best;
  }
  interact(id){if(this.modal||!this.active(id)||this.transitioning)return false;const h=this.state.home;
    if(id==='letter'){
      this.show({eyebrow:'11 月 12 日・23:42　住處',title:'阿哲寄回的照片',body:'<p>阿哲正在替即將封閉的慈雲寺整理錄音。他下午傳訊息，說有張照片想請我辨認。</p><p>管理員送上來的信封裡，只有一張我們小時候的合照。封口還沾著潮濕的木屑。</p><p>我把檯燈拉近。照片背面有新寫的時間，墨水透到了正面。</p>',options:[{text:h.step===0?'把照片放到檯燈下':'端詳燈下的照片',action:()=>h.step===0?this.placePhoto():this.interact('photo')}]});return true;
    }
    if(id==='photo'){
      this.document('photo',()=>{if(h.step<2){this.advance(2);this.game.audio.phoneRing();this.toast('手機螢幕亮起。阿哲打來了。');}});return true;
    }
    if(id==='phone'){
      if(h.step>2){this.show({title:'通話紀錄',body:'<p>張明哲　23:47　通話 00:00。</p><p>我明明和他說了話。錄音裡卻只有雨聲，還有一口被重複了兩次的吸氣。</p>',options:[{text:'重播那口呼吸',action:()=>this.game.audio.breathCue()},{text:'放下手機',action:()=>{}}]});return true;}
      this.world.answerPhone();
      this.game.audio.breathCue();this.dialogue([
        ['電話裡的男人','以安，照片到了嗎？幫我看背面的時間。'],
        ['我','02:47。這是錄音的位置？你還在廟裡？'],
        ['電話裡的男人','我在慈雲寺。後面的門打不開。帶那張照片來。'],
        ['我','你被反鎖了？我找人幫忙，你先別掛。'],
        ['電話裡的男人','……以安，照片到了嗎？幫我看背面的時間。'],
      ],()=>{
        this.game.audio.breathCue();this.show({eyebrow:'對方重複了第一句',title:'電話還沒掛斷',body:'<p>我把手機拿離耳邊。門外有人敲了三下。</p><p>「管理員。剛才送錯東西了，請開一下門。」</p><p>我住七樓，管理員送件時會先按對講機。這次對講機一直沒有亮。</p>',options:[{text:'不出聲，等門外安靜',action:()=>this.afterCall(false)},{text:'透過門問：「誰在外面？」',action:()=>this.afterCall(true)}]});
      },'23:47・阿哲來電');return true;
    }
    if(id==='slip'){
      this.show({eyebrow:'玄關・門縫下',title:'退回來的封口',body:'<p>門下滑進來的是剛才那個信封的封口。撕口能和桌上的信封接起來。</p><p>上面多了一句「照片收到，請回答」。背面是我家的樓層，數字七被寫了兩次。</p><p>我撥回管理室，沒人接。手機上的阿哲仍停在通話零秒。</p><aside class="deduction">先拿玄關右側矮櫃上的鑰匙與手電筒。我得離開這扇門，再去確認阿哲是否真的受困。</aside>',options:[{text:'收起字條，準備去找阿哲',action:()=>this.advance(4)}]});return true;
    }
    if(id==='kit'){
      this.advance(5);this.game.player.flashOn=true;this.game.audio.click();this.toast('鑰匙與手電筒已拿取。F 可切換；出門後沿舊山路去慈雲寺。');return true;
    }
    if(id==='door'){
      if(h.step<5){this.show({title:'門外沒有人',body:`<p>貓眼裡只有樓梯間。聲控燈亮著，卻沒有腳步。</p><p>${h.step<3?'先看完阿哲寄回的照片，再等他的電話。':h.step<4?'門縫下面，多了一角折過的紙。':'先拿矮櫃上的鑰匙與手電筒。'}</p>`});return true;}
      this.show({eyebrow:'23:56・出發',title:'關燈之前',body:'<p>我把照片放進外套，傳訊息給共同的朋友佩珊：「阿哲說困在慈雲寺，我去山下確認。幫我聯絡廟方，一小時後沒回電就報警。」</p><p>我先打開一條門縫。走廊沒有人，聲控燈也沒有亮。地上有一排濕腳印。</p><p>每個腳印都停在門外，沒有離開的那一排。</p>',options:[{text:'關上門，前往舊山路',action:()=>this.travel()},{text:'再檢查一下房間',action:()=>{}}]});return true;
    }
    const optional={
      calendar:['停在十二日的月曆','我把「回阿哲電話」圈了起來。旁邊有一條昨天沒看見的直線，從十二日劃到十三日。\n筆尖在十三日壓破了紙，牆上卻沒有痕跡。'],
      window:['雨聲裡少了一拍','對面公寓大多熄燈了。隔著雨，我聽到有人拖動椅子。\n我停住，那聲音也停住。我往左挪一步，它又拖了一下。\n這是七樓。窗外沒有陽台。'],
      message:['沒有送出的語音','手機草稿裡，留著我今天下午錄給阿哲的訊息：\n「照片到了。你說聽不清楚的是哪一段？晚上再打給我。」\n錄音末尾，有椅子拖過地面的聲音。\n那時候我家裡只有我。'],
    }[id];
    if(optional){if(!h.notes.includes(id)){h.notes.push(id);this.sync();this.save();}this.show({eyebrow:'住處・可回看的筆記',title:optional[0],body:optional[1].split('\n').map(t=>`<p>${t}</p>`).join('')});return true;}return false;
  }
  placePhoto(){
    this.advance(1);this.busy=true;this.game.player.enabled=false;this.game.player.keys=Object.create(null);this.game.player.vel.set(0,0,0);
    this.toast('把照片移到燈下……');this.world.placePhoto(()=>{if(this.game.story!==this)return;this.busy=false;this.interact('photo');});
  }
  afterCall(answered){
    this.advance(3);this.dialogue(answered?[
      ['門外，自己的聲音','誰在外面？'],['我','它把我的話原樣說了一次。連停頓都一樣。'],['電話斷線前','……照片到了嗎？'],
    ]:[['門外的聲音','放門口了。'],['電話斷線前','……照片到了嗎？'],['我','通話中斷了。螢幕上卻顯示，通話時間是零。']],()=>{this.world.startDoorEvent();this.toast('門外有人。走向玄關，留意門底。');},'通話中斷之後');
  }
  travel(){
    this.transitioning=true;this.state.home.step=6;this.state.flags.prologueComplete=true;this.state.scene='road';this.state.position=null;
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(this.state));}catch{this.transitioning=false;this.toast('無法保存出發進度，請先釋出瀏覽器儲存空間。');return;}
    this.onTravel('road');
  }
  journal(){const h=this.state.home;this.show({eyebrow:'出發之前・住處筆記',title:'還沒離開家，事情已經開始了',body:`<p>目前：${goals[Math.min(h.step,5)][1]}</p><p>23:42　阿哲寄回清點時找到的照片。<br>${h.step>=3?'23:47　阿哲的來電重複了第一句。<br>':''}${h.step>=4?'23:51　信封的封口從門外滑了回來。':''}</p><p>已調查：${h.notes.map(n=>({calendar:'月曆',window:'窗外雨聲',message:'未送出的語音'})[n]).join('、')||'尚無額外筆記'}</p><aside class="deduction">燈光照得見的證據，與聲音所說的，不一定相同。</aside>`,dismiss:true});}
  update(dt){
    if(this.modal||this.transitioning||this.busy){$('interact-prompt').textContent='';return;}
    this.state.elapsed+=dt;this.tick+=dt;
    if(this.toastTime>0){this.toastTime-=dt;if(this.toastTime<=0)$('story-toast').classList.remove('show');}
    if(this.tick<.1)return;this.tick=0;
    const target=this.focused();$('interact-prompt').innerHTML=target?`<kbd>E</kbd><span>${target.label}</span>`:'';
    const goal=goals[Math.min(this.state.home.step,5)];$('objective-title').textContent=this.world.doorEventActive?'走向玄關，留意門縫下方':goal[1];$('objective-place').textContent=goal[2];$('objective-distance').textContent='';$('waypoint').classList.add('hidden');
  }
}
