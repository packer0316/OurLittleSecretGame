import { Story } from './Story.js';
import { SAVE_KEY } from './campaign.js';

const $=id=>document.getElementById(id);
const goals=[['letter','拆開桌上沒有郵戳的信','書桌・信封'],['photo','找出照片裡不對勁的地方','書桌・六人合照'],['phone','手機響了。來電顯示「阿哲」','書桌・手機'],['slip','門外安靜了。查看門縫','玄關・門下的紙'],['kit','帶上鑰匙與手電筒','玄關・矮櫃'],['door','出發前，再確認一次門外','玄關・大門']];

/** Uses the same reading, keyboard, pointer-lock and save UI as the temple. */
export class HomeStory extends Story {
  constructor(game,options={}){
    super(game,options);this.state.scene='home';this.state.home??={step:0,notes:[]};this.onTravel=options.onTravel;
    this.ringClock=0;this.sync();if(this.state.home.step>=5)game.player.flashOn=true;
  }
  start(){if(this.started)return;this.started=true;this.save();this.toast(this.state.home.step?'已回到住處。筆記保留了出發前的調查。':'雨下了一整晚。管理員說，這封信今天下午就在門口。');}
  sync(){
    this.world.setState(this.state);const h=this.state.home||{step:0,notes:[]};
    $('chapter-label').textContent='序章 / 未署名的信';$('clue-count').textContent=`住處筆記 ${h.notes.length} / 3`;
    this.game.player.flashAvailable=h.step>=5;
    if(h.step<5){this.game.player.flashOn=false;this.game.player.flashPower=0;}
  }
  advance(step){this.state.home.step=Math.max(step,this.state.home.step);this.sync();this.save();}
  active(id){const n=this.state.home?.step||0;return id===goals[Math.min(n,5)][0]||['calendar','window','message','door'].includes(id)||id==='letter'&&n>0||id==='photo'&&n>1||id==='phone'&&n>2;}
  focused(){
    // Small desk props require a tighter view cone so the letter cannot steal the photo's focus.
    const target=super.focused();if(!target)return null;
    let best=null,score=0;const cam=this.game.camera;cam.getWorldDirection(this.look);
    for(const t of this.world.targets){if(!this.active(t.id))continue;this.delta.copy(t.position).sub(cam.position);const d=this.delta.length(),dot=this.delta.normalize().dot(this.look);if(d>2.7||dot<.965||this.game.map.world.occluded(cam.position,t.position))continue;const s=dot-d*.005;if(s>score){score=s;best=t;}}
    return best;
  }
  interact(id){if(this.modal||!this.active(id)||this.transitioning)return false;const h=this.state.home;
    if(id==='letter'){
      this.show({eyebrow:'11 月 12 日・23:42　住處',title:'沒有寄件人的信',body:'<p>信封沒有郵戳，也沒有膠水。封口繞著一根細紅線，像從衣服上拆下來的。</p><p>地址寫得很新，收件人卻是我小學時的名字筆跡。</p><p>「你們答應過我，不會把我留在那裡。」</p><p>紙張聞起來像雨水和燒過的頭髮。信封裡滑出一張合照。</p>',options:[{text:'把照片放到檯燈下',action:()=>{this.advance(1);this.toast('合照落在信封右邊。先看看照片。');}}]});return true;
    }
    if(id==='photo'){
      this.document('photo',()=>{if(h.step<2){this.advance(2);this.game.audio.phoneRing();this.toast('手機螢幕亮起。阿哲打來了。');}});return true;
    }
    if(id==='phone'){
      if(h.step>2){this.show({title:'通話紀錄',body:'<p>張明哲　23:47　通話 00:00。</p><p>我明明和他說了話。錄音裡卻只有雨聲，還有一口被重複了兩次的吸氣。</p>',options:[{text:'重播那口呼吸',action:()=>this.game.audio.breathCue()},{text:'放下手機',action:()=>{}}]});return true;}
      this.game.audio.breathCue();this.dialogue([
        ['電話裡的男人','以安。先不要說話。你收到照片了嗎？'],
        ['我','阿哲？你換號碼了？白天怎麼一直聯絡不上你？'],
        ['電話裡的男人','我在慈雲寺。她不讓我走。你記得那扇門怎麼開。'],
        ['我','你讓她接電話。我可以報警——'],
        ['電話裡的男人','不要叫別人。這次，別再留下一個。'],
      ],()=>{
        this.game.audio.breathCue();this.show({eyebrow:'同一口吸氣，分毫不差',title:'電話還沒掛斷',body:'<p>聽筒裡的雨停了。門外卻響起三下敲門聲。</p><p>一個像我母親的聲音隔著門說：「以安，你在家嗎？」</p><p>母親住在另一個縣市。她今晚沒有說要來。</p>',options:[{text:'不出聲，等門外安靜',action:()=>this.afterCall(false)},{text:'透過門問：「誰在外面？」',action:()=>this.afterCall(true)}]});
      },'23:47・阿哲來電');return true;
    }
    if(id==='slip'){
      this.show({eyebrow:'玄關・門縫下',title:'你在家',body:'<p>字條貼著地面，像剛從門底塞進來。紙邊乾燥，只有中央濕得發黑。</p><p>「你在家。這次不要假裝沒聽見。」</p><p>翻到背面，是這棟公寓的舊住戶通知單。上面沒有我的名字。</p><aside class="deduction">它不需要知道我的住址。它可能早就進來過。</aside>',options:[{text:'收起字條，準備去找阿哲',action:()=>this.advance(4)}]});return true;
    }
    if(id==='kit'){
      this.advance(5);this.game.player.flashOn=true;this.game.audio.click();this.toast('鑰匙與手電筒已拿取。F 可切換；出門後沿舊山路去慈雲寺。');return true;
    }
    if(id==='door'){
      if(h.step<5){this.show({title:'門外沒有人',body:`<p>貓眼裡只有樓梯間。聲控燈亮著，卻沒有腳步。</p><p>${h.step<3?'先看完那封信。阿哲或許知道照片是誰寄的。':h.step<4?'門縫下面，多了一角折過的紙。':'先拿矮櫃上的鑰匙與手電筒。'}</p>`});return true;}
      this.show({eyebrow:'23:56・出發',title:'關燈之前',body:'<p>我把照片放進外套，傳了訊息給佩珊：「我去一趟慈雲寺。如果天亮沒回電，直接找警察。」</p><p>門外的地板很乾。只有一排濕腳印，從我的房門一路走向樓梯。</p><p>腳印的腳尖，全都朝著我。</p>',options:[{text:'關上門，前往舊山路',action:()=>this.travel()},{text:'再檢查一下房間',action:()=>{}}]});return true;
    }
    const optional={
      calendar:['停在十二日的月曆','我把「回阿哲電話」圈了起來。旁邊有一條昨天沒看見的直線，從十二日劃到十三日。\n筆尖在十三日壓破了紙，牆上卻沒有痕跡。'],
      window:['雨聲裡少了一拍','對面公寓大多熄燈了。隔著雨，我聽到有人拖動椅子。\n我停住，那聲音也停住。我往左挪一步，它又拖了一下。\n這是七樓。窗外沒有陽台。'],
      message:['沒有送出的語音','手機草稿裡，留著我半個月前錄給阿哲的訊息：\n「那張照片我找不到了。以前的事……不要再說了。」\n錄音末尾有一個很輕的聲音：「可是我還在這裡。」\n那時候我家裡只有我。'],
    }[id];
    if(optional){if(!h.notes.includes(id)){h.notes.push(id);this.sync();this.save();}this.show({eyebrow:'住處・可回看的筆記',title:optional[0],body:optional[1].split('\n').map(t=>`<p>${t}</p>`).join('')});return true;}return false;
  }
  afterCall(answered){
    this.advance(3);this.game.audio.storyCue('gate');this.dialogue(answered?[
      ['門外，自己的聲音','誰在外面？'],['我','它把我的話原樣說了一次。連停頓都一樣。'],['電話裡很遠的童聲','不要讓它再學會一句。'],
    ]:[['門外的聲音','我知道你在家。'],['電話裡很遠的童聲','先看留下的東西。不要只聽聲音。'],['我','通話中斷了。螢幕上卻顯示，通話時間是零。']],()=>this.toast('門縫底下出現一張紙。走到玄關，低頭調查。'),'三下敲門之後');
  }
  travel(){
    this.transitioning=true;this.state.home.step=6;this.state.flags.prologueComplete=true;this.state.scene='road';this.state.position=null;
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(this.state));}catch{this.transitioning=false;this.toast('無法保存出發進度，請先釋出瀏覽器儲存空間。');return;}
    this.onTravel('road');
  }
  journal(){const h=this.state.home;this.show({eyebrow:'出發之前・住處筆記',title:'還沒離開家，事情已經開始了',body:`<p>目前：${goals[Math.min(h.step,5)][1]}</p><p>23:42　信封沒有郵戳。<br>${h.step>=2?'23:47　阿哲來電；吸氣聲重複。<br>':''}${h.step>=4?'23:51　門外字條知道我在家。':''}</p><p>已調查：${h.notes.map(n=>({calendar:'月曆',window:'窗外雨聲',message:'未送出的語音'})[n]).join('、')||'尚無額外筆記'}</p><aside class="deduction">燈光照得見的證據，與聲音所說的，不一定相同。</aside>`,dismiss:true});}
  update(dt){
    if(this.modal||this.transitioning){$('interact-prompt').textContent='';return;}
    this.state.elapsed+=dt;this.tick+=dt;this.ringClock+=dt;
    if(this.state.home.step===2&&this.ringClock>5){this.ringClock=0;this.game.audio.phoneRing();}
    if(this.toastTime>0){this.toastTime-=dt;if(this.toastTime<=0)$('story-toast').classList.remove('show');}
    if(this.tick<.1)return;this.tick=0;
    const target=this.focused();$('interact-prompt').innerHTML=target?`<kbd>E</kbd><span>${target.label}</span>`:'';
    const goal=goals[Math.min(this.state.home.step,5)];$('objective-title').textContent=goal[1];$('objective-place').textContent=goal[2];$('objective-distance').textContent='';$('waypoint').classList.add('hidden');
  }
}
