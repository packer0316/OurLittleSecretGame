import { Story } from './Story.js';
import { SAVE_KEY } from './campaign.js';
const $=id=>document.getElementById(id);
const goals=[['bus','查看路旁的停駛站牌','停車處前方・候車亭'],['notice','穿過石橋，尋找村裡的消息','街道右側・遷離公告'],['remains','找出焦味的來源','右前方・榮昌紙紮行'],['ledger','查明作坊曾經做過什麼','作坊右側・登記簿'],['gate','帶著查證過的事實進寺','村落盡頭・舊參道']];
export class RoadStory extends Story {
  constructor(game,options={}){super(game,options);this.state.scene='road';this.state.road??={step:0,notes:[]};this.onTravel=options.onTravel;this.bridgeCue=false;this.callNotified=false;this.sync();this.onRadio=e=>{if(e.code==='KeyR'&&!e.repeat&&game.running&&!this.modal&&this.state.road.step>=4&&!this.state.road.peishan)this.peishanCall();};window.addEventListener('keydown',this.onRadio);}
  start(){if(this.started)return;this.started=true;this.save();this.toast('山路被落石堵住，只能把車停在這裡。先查看路旁站牌。');}
  sync(){this.world.setState(this.state);$('chapter-label').textContent='序章之二 / 沒有人等車';$('clue-count').textContent=`山村紀錄 ${Math.min(this.state.road?.step||0,4)} / 4`;}
  advance(n){this.state.road.step=Math.max(this.state.road.step,n);this.sync();this.save();}
  active(id){return !this.transitioning&&(id===goals[Math.min(this.state.road?.step||0,4)][0]||['car','kiln','gate'].includes(id)||['bus','notice','remains','ledger'].indexOf(id)<(this.state.road?.step||0)&&['bus','notice','remains','ledger'].includes(id));}
  interact(id){if(this.modal||this.transitioning||!this.active(id))return false;const r=this.state.road;
    if(id==='bus'){
      this.show({eyebrow:'02:16・慈雲里候車亭',title:'末班車早就停駛了',body:'<p>最後一班：18:40。路線停駛通知是兩年前貼上的，紙已被雨洗得發白。</p><p>長椅下擺著一雙拖鞋。鞋尖朝路外，椅面有一塊人形的乾燥區域，像剛有人起身。</p><p>時刻表背面有人刻字：「聽到車來，不要招手。車上坐的是回不去的人。」</p><aside class="deduction">前面不是另一座寺廟，而是被撤空的慈雲里。先穿過石橋找住戶公告。</aside>',options:[{text:'記下站名，往村裡走',action:()=>this.advance(1)}]});return true;
    }
    if(id==='notice'){
      this.show({eyebrow:'慈雲里・最後一張住戶通知',title:'夜間請勿代為開門',body:'<p>因地層滑動，住戶已於 2024 年完成撤離。私人祭儀與夜間焚燒停止。</p><p>下方是另一種筆跡：「即使是認識的人，也請先看見他的臉。勿只憑聲音開門。」</p><p>所有商家地址都被劃去，只有「榮昌紙紮行」被描了三次。風從那個方向帶來焦味，混著甜得發膩的油氣。</p>',options:[{text:'沿街尋找紙紮作坊',action:()=>{this.advance(2);this.toast('街道右前方有一間門還開著的紙紮行。');}}]});return true;
    }
    if(id==='remains'){
      this.show({eyebrow:'榮昌紙紮行・工作桌',title:'不是紙做的',body:'<p>焦黑的小腿擺在裁紙桌上，皮膚裂口露出暗紅的組織。另一邊是一隻腐壞的手，關節上的皮肉已經脫落。</p><p>桌角夾著工牌：「郭建成，46 歲，紙紮匠」。旁邊的婚戒，內側刻著同一個姓。</p><p>我後退時，兩塊不相連的血肉一起收縮。它們不是在抽動，而是用同一個節拍……吸氣。</p><p>手掌上有兩套掌紋，重疊著。像有什麼東西試著照著一隻手，再長出一隻。</p><aside class="deduction">登記簿在右側矮桌。先查清楚這裡在製作什麼。</aside>',options:[{text:'記下工牌，查看登記簿',action:()=>{this.advance(3);this.game.audio.breathCue();}}]});return true;
    }
    if(id==='ledger'){
      this.show({eyebrow:'作坊・燒焦的登記簿',title:'聲音要有地方住',body:'<p>「紙身只留到天亮。要留得久，須取應允者之肉，照生人之形補齊。」</p><p>「名不合，燒。聲不合，燒。能叫出家人的名字，才算接回來。」</p><p>最新一頁沒有供奉者，只有三個字：「陳以安」。日期是今天，下面的「已應允」欄位空著。</p><p>背頁寫著：「真正的那個，會留下物件。借來的那個，只要你回話。」</p><aside class="deduction">作坊不是在救回死人，而是在替聲音做身體。我沒有答應它。阿哲的話也必須在寺裡找到證據。</aside>',options:[{text:'拍下記錄，走向村尾舊參道',action:()=>this.advance(4)}]});return true;
    }
    if(id==='gate'){
      if(r.step<4){this.show({title:'慈雲寺的舊參道',body:`<p>路通往山上。${r.step<2?'村子為什麼空了？先查看站牌與住戶公告。':'焦味還在。先查明作坊裡留下的東西。'}</p>`});return true;}
      this.show({eyebrow:'02:43・山村盡頭',title:'從來沒有第二個腳步聲',body:'<p>我一路以為身後有人跟著。停下時才發現，那個腳步總比我慢一拍。</p><p>它不是另一個人正在走。它是在學我。</p><p>前方山門亮著三盞燈。我把手機錄影打開，這次，至少要留下看得見的事實。</p>',options:[{text:'沿參道進入慈雲寺',action:()=>this.travel()},{text:'再看看村裡',action:()=>{}}]});return true;
    }
    if(['car','kiln'].includes(id)){
      if(!r.notes.includes(id)){r.notes.push(id);this.save();}
      this.show(id==='car'?{title:'尚未送達的訊息',body:'<p>給佩珊的訊息停在「傳送中」。手機時間 02:16，車上時鐘卻一直顯示 23:47。</p><p>車內後視鏡被一條紅線綁住。我不記得自己放過。</p>'}:{title:'爐灰中的牙',body:'<p>灰不是冷的。碎紙間有熔掉的金屬鈕扣，一枚成人義齒卡在爐底。</p><p>牆上用炭寫著：「燒掉舊的聲音，新的人才肯說話。」</p><p>爐口沒有風，紅布尾端卻往裡飄。</p>'});return true;
    }return false;
  }
  travel(){this.transitioning=true;this.state.road.step=5;this.state.scene='temple';this.state.flags.prologueComplete=true;this.state.position=null;try{localStorage.setItem(SAVE_KEY,JSON.stringify(this.state));}catch{this.transitioning=false;this.toast('無法保存進寺進度，請先釋出儲存空間。');return;}this.onTravel('temple');}
  peishanCall(){
    this.show({eyebrow:'02:39・訊號恢復',title:'周佩珊回電',body:'<p>「你的訊息剛剛才到。以安，你真的回去了？」</p><p>這一次，電話裡有汽車經過的聲音，還有她把窗戶關上的響動。她沒有催我報出姓名。</p>',options:[
      {text:'「我找到紙紮行。這裡有人做過什麼。」',action:()=>this.peishanReply('trust')},
      {text:'「先告訴我，照片裡有幾個孩子？」',action:()=>this.peishanReply('question')},
      {text:'先不說話，聽她把話說完',action:()=>this.peishanReply('silence')},
    ]});
  }
  peishanReply(choice){
    const first=choice==='question'?['佩珊','你不要讓我替你數。把照片放大，一個一個看。以前我們就是聽別人說只有五個。']:choice==='silence'?['佩珊','你可以不回答。我只想讓你知道，有人在等你回來。']:['佩珊','把你看見的留下來。照片、日期、每個人的名字。別再只有我們口頭說過。'];
    this.dialogue([first,['我','我記不得照片右邊那個女孩。可是看到她，我就不敢把門關上。'],['佩珊','你以前也這樣說。後來你說不記得，我就跟著裝不知道。'],['我','如果裡面有什麼叫我呢？'],['佩珊','先看東西，不要只聽話。她如果真的留下什麼，你會認得。'],['佩珊','錄影傳給我。我不替你保密了，也不替自己保密。']],()=>{this.state.road.peishan=choice;this.save();this.toast('佩珊的回電已留在筆記。沿村尾舊參道進寺。');},'有人在山外等你');
  }
  journal(){const r=this.state.road;this.show({title:'進寺以前，查到的事',eyebrow:'山村紀錄',body:`<p>目前：${goals[Math.min(r.step,4)][1]}</p><p>${r.step>=1?'候車亭：路線已停駛。<br>':''}${r.step>=2?'撤離公告：私人祭儀仍有人偷偷進行。<br>':''}${r.step>=3?'作坊：成年工匠的肢體，與模仿呼吸的血肉。<br>':''}${r.step>=4?'登記簿：聲音需要身體，也需要活人的應允。':''}</p><aside class="deduction">舊山路 → 石橋 → 慈雲里告示 → 右側紙紮行 → 村尾舊參道。<br>這些紀錄保存在筆記，不改動寺內十一件主線證物的取得條件。</aside>`,dismiss:true});}
  update(dt){
    if(this.modal||this.transitioning){$('interact-prompt').textContent='';return;}this.state.elapsed+=dt;this.tick+=dt;
    if(this.toastTime>0){this.toastTime-=dt;if(this.toastTime<=0)$('story-toast').classList.remove('show');}
    const p=this.game.player.pos;
    if(!this.callNotified&&this.state.road.step>=4&&!this.state.road.peishan&&p.z>-14){this.callNotified=true;this.game.audio.phoneRing();this.toast('手機恢復訊號。佩珊回電了。按 R 接聽，或先沿路前進。');}
    if(!this.bridgeCue&&p.z<11&&p.z>7){this.bridgeCue=true;this.game.audio.breathCue();this.toast('橋下傳來自己的咳嗽聲。你還沒有咳嗽。');}
    if(this.tick<.12)return;this.tick=0;const target=this.focused();$('interact-prompt').innerHTML=target?`<kbd>E</kbd><span>${target.label}</span>`:'';
    const goal=goals[Math.min(this.state.road.step,4)],t=this.world.targets.find(t=>t.id===goal[0]);$('objective-title').textContent=goal[1];$('objective-place').textContent=goal[2]+(this.callNotified&&!this.state.road.peishan?' · R 接聽佩珊回電':'');$('objective-distance').textContent=`${Math.round(p.distanceTo(t.position))} m`;$('waypoint').classList.add('hidden');
  }
  dispose(){window.removeEventListener('keydown',this.onRadio);super.dispose();}
}
