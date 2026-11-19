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
      this.show({eyebrow:'11 月 12 日・23:42　住處',title:'阿哲寄回的照片',body:'<p>阿哲接了慈雲寺的案子，要在廟封掉以前把舊錄音整理完。十月底他找過我幾次，我都沒有回。</p><p>今天下午他傳訊息，說寄了一張照片要我認人。管理員送上來的信封沒有郵戳，封口沾著潮濕的木屑。</p><p>裡面是我們小時候的合照，和一張字條：「照片先還你。02:47，聽到這裡再停。」</p>',options:[{text:h.step===0?'把照片放到檯燈下':'端詳燈下的照片',action:()=>h.step===0?this.placePhoto():this.interact('photo')}]});return true;
    }
    if(id==='photo'){
      this.document('photo',()=>{if(h.step<2){this.advance(2);this.game.audio.phoneRing();this.toast('手機螢幕亮起。阿哲打來了。');}});return true;
    }
    if(id==='phone'){
      if(h.step>2){this.show({title:'通話紀錄',body:'<p>張明哲　11/12 23:47　通話 00:00。</p><p>我明明和他說了話。錄音裡卻只有雨聲，和一口重複了兩次的吸氣。</p><p>往上滑還有一筆：張明哲　10/29 02:47　未接三通。那三通我看到了，沒有回。</p>',options:[{text:'重播那口呼吸',action:()=>this.game.audio.breathCue()},{text:'放下手機',action:()=>{}}]});return true;}
      this.world.answerPhone();
      this.game.audio.breathCue();this.dialogue([
        ['電話裡的男人','以安，照片到了嗎？幫我看背面的時間。'],
        ['我','02:47。這是什麼的時間？你還在廟裡？'],
        ['電話裡的男人','我在慈雲寺。後面的門打不開。帶那張照片來。'],
        ['我','哪一扇門？你被關在裡面？你先別掛，我找人。'],
        ['電話裡的男人','……以安，照片到了嗎？幫我看背面的時間。'],
      ],()=>{
        this.game.audio.breathCue();this.show({eyebrow:'對方重複了第一句',title:'電話還沒掛斷',body:'<p>同一句話，同一口吸氣。我把手機拿離耳邊。門外有人敲了三下。</p><p>「管理員。剛才送錯東西了，請開一下門。」</p><p>我住七樓。管理員上來以前都會先按對講機，今晚對講機沒有亮過。</p><p>媽以前教過：夜裡有人敲三下，先不要應。我一直以為那是哄小孩的。</p>',options:[{text:'不出聲，等門外安靜',action:()=>this.afterCall(false)},{text:'隔著門問：「誰在外面？」',action:()=>this.afterCall(true)}]});
      },'23:47・阿哲來電');return true;
    }
    if(id==='slip'){
      this.show({eyebrow:'玄關・門縫下',title:'退回來的封口',body:`<p>從門下滑進來的，是剛才那個信封的封口。撕口和桌上的信封對得起來。</p><p>上面多了一行字：「照片收到，請回答。」背面寫著我家的樓層，「七樓」寫了兩次，兩次的筆畫一模一樣。</p><p>我按對講機找管理室。那頭是通的，沒有人說話，只聽見話筒垂在半空，一下一下撞著桌腳。</p><p>${h.answered?'我剛才應了它一聲。它現在知道門裡的人是我。':'我一聲都沒有應。它還是知道照片在誰手上。'}</p><aside class="deduction">先拿玄關右側矮櫃上的鑰匙與手電筒。阿哲說門打不開，我得親自去看。</aside>`,options:[{text:'收起封口，準備去找阿哲',action:()=>this.advance(4)}]});return true;
    }
    if(id==='kit'){
      this.advance(5);this.game.player.flashOn=true;this.game.audio.click();this.toast('鑰匙與手電筒已拿取。F 可切換；出門後沿舊山路去慈雲寺。');return true;
    }
    if(id==='door'){
      if(h.step<5){this.show({title:'門外沒有人',body:`<p>貓眼裡只有樓梯間。聲控燈亮著，卻沒有腳步聲。</p><p>${h.step<3?'先看完阿哲寄回的照片，再等他的電話。':h.step<4?'門縫下面，多了一角折過的紙。':'先拿矮櫃上的鑰匙與手電筒。'}</p>`});return true;}
      this.show({eyebrow:'23:56・出發',title:'關燈之前',body:'<p>我把照片放進外套，傳訊息給佩珊：「阿哲說他困在慈雲寺，我上山看。一小時後沒回電就報警。」</p><p>門只開一條縫。走廊的聲控燈沒有亮。地上有一排濕腳印，每一個都停在我門口。</p><p>沒有離開的那一排。</p>',options:[{text:'關上門，前往舊山路',action:()=>this.travel()},{text:'再檢查一下房間',action:()=>{}}]});return true;
    }
    const optional={
      calendar:['停在十二日的月曆','我在十二日圈了「回阿哲電話」。這通電話，我拖了兩個禮拜。\n旁邊多了一道昨天沒有的筆痕，從十二日劃到十三日，停在格子中間。\n筆尖在那裡壓破了紙。牆上卻沒有痕跡。'],
      window:['雨聲裡少了一拍','對面公寓大多熄燈了。隔著雨，我聽見有人拖椅子，像在替誰挪位子。\n我停住，那聲音也停。我往左挪一步，它又拖了一下。\n這裡是七樓。窗外沒有陽台。'],
      message:['沒有送出的語音','草稿匣裡有兩段沒送出的語音，都是錄給阿哲的。\n十月三十日：「你半夜連打三通是怎樣。廟裡的事，我不想再談。」\n今天下午：「照片到了。你說聽不清楚的是哪一段？晚上再打給我。」\n第二段的最後，有椅子拖過地面的聲音。那時候家裡只有我。'],
    }[id];
    if(optional){if(!h.notes.includes(id)){h.notes.push(id);this.sync();this.save();}this.show({eyebrow:'住處・可回看的筆記',title:optional[0],body:optional[1].split('\n').map(t=>`<p>${t}</p>`).join('')});return true;}return false;
  }
  placePhoto(){
    this.advance(1);this.busy=true;this.game.player.enabled=false;this.game.player.keys=Object.create(null);this.game.player.vel.set(0,0,0);
    this.toast('把照片移到燈下……');this.world.placePhoto(()=>{if(this.game.story!==this)return;this.busy=false;this.interact('photo');});
  }
  afterCall(answered){
    // 規矩在選項出現前就說過了：應門算一次回答，之後的文字會記得。
    if(answered&&!this.state.home.answered){this.state.home.answered=true;this.state.answers++;}
    this.advance(3);this.dialogue(answered?[
      ['門外，我自己的聲音','誰在外面？'],['我','它把我的話原樣還回來。連中間換氣的地方都一樣。'],['電話斷線前','……照片到了嗎？'],
    ]:[['門外的聲音','……放門口了。'],['電話斷線前','……照片到了嗎？'],['我','通話斷了。螢幕上的通話時間是 00:00。']],()=>{this.world.startDoorEvent();this.toast('門外有人。走向玄關，留意門底。');},'通話中斷之後');
  }
  travel(){
    this.transitioning=true;this.state.home.step=6;this.state.flags.prologueComplete=true;this.state.scene='road';this.state.position=null;
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(this.state));}catch{this.transitioning=false;this.toast('無法保存出發進度，請先釋出瀏覽器儲存空間。');return;}
    this.onTravel('road');
  }
  journal(){const h=this.state.home;this.show({eyebrow:'出發之前・住處筆記',title:'還沒離開家，事情已經開始了',body:`<p>目前：${goals[Math.min(h.step,5)][1]}</p><p>23:42　阿哲寄回我的那張合照，背面寫著 02:47。<br>${h.step>=3?`23:47　阿哲的來電把第一句重複了一次。門外敲了三下。${h.answered?'我應了。':'我沒有應。'}<br>`:''}${h.step>=4?'23:51　信封的封口從門外滑了回來：「照片收到，請回答。」':''}</p><p>已調查：${h.notes.map(n=>({calendar:'月曆',window:'窗外雨聲',message:'沒送出的語音'})[n]).join('、')||'尚無額外筆記'}</p><aside class="deduction">${h.step>=3?'夜裡有人敲三下，先不要應。':'燈光照得見的東西，和聲音說的，不一定一樣。'}</aside>`,dismiss:true});}
  update(dt){
    if(this.modal||this.transitioning||this.busy){$('interact-prompt').textContent='';return;}
    this.state.elapsed+=dt;this.tick+=dt;
    if(this.toastTime>0){this.toastTime-=dt;if(this.toastTime<=0)$('story-toast').classList.remove('show');}
    if(this.tick<.1)return;this.tick=0;
    const target=this.focused();$('interact-prompt').innerHTML=target?`<kbd>E</kbd><span>${target.label}</span>`:'';
    const goal=goals[Math.min(this.state.home.step,5)];$('objective-title').textContent=this.world.doorEventActive?'走向玄關，留意門縫下方':goal[1];$('objective-place').textContent=goal[2];$('objective-distance').textContent='';$('waypoint').classList.add('hidden');
  }
}
