import { Story } from './Story.js';
import { SAVE_KEY } from './campaign.js';
const $=id=>document.getElementById(id);
const goals=[['bus','查看路旁的停駛站牌','停車處前方・候車亭'],['notice','穿過石橋，尋找村裡的消息','街道右側・遷離公告'],['remains','找出焦味的來源','右前方・榮昌紙紮行'],['ledger','檢查作坊桌上的充電座','作坊右側・充電座'],['gate','沿阿哲留下的線索進寺','村落盡頭・舊參道']];
export class RoadStory extends Story {
  constructor(game,options={}){super(game,options);this.state.scene='road';this.state.road??={step:0,notes:[]};this.onTravel=options.onTravel;this.bridgeCue=false;this.callNotified=false;this.sync();this.onRadio=e=>{if(e.code==='KeyR'&&!e.repeat&&game.running&&!this.modal&&this.state.road.step>=4&&!this.state.road.peishan)this.peishanCall();};window.addEventListener('keydown',this.onRadio);}
  start(){if(this.started)return;this.started=true;this.save();this.toast('山路被落石堵住，只能把車停在這裡。先查看路旁站牌。');}
  sync(){this.world.setState(this.state);$('chapter-label').textContent='序章之二 / 沒有人等車';$('clue-count').textContent=`山村紀錄 ${Math.min(this.state.road?.step||0,4)} / 4`;}
  advance(n){this.state.road.step=Math.max(this.state.road.step,n);this.sync();this.save();}
  active(id){return !this.transitioning&&(id===goals[Math.min(this.state.road?.step||0,4)][0]||['car','kiln','gate'].includes(id)||['bus','notice','remains','ledger'].indexOf(id)<(this.state.road?.step||0)&&['bus','notice','remains','ledger'].includes(id));}
  interact(id){if(this.modal||this.transitioning||!this.active(id))return false;const r=this.state.road;
    if(id==='bus'){
      this.show({eyebrow:'02:16・慈雲里候車亭',title:'有人替我留了位子',body:'<p>班次在兩年前就停了。濕透的長椅中央，卻留著一塊剛好能坐一人的乾處。</p><p>下面有一個相機電池盒，貼著阿哲工作室的藍色貼紙。盒子裡還有水，貼紙沒有褪色。</p><p>從這裡能看見石橋對面的住戶公告。也許上面留著廟方的聯絡方式。</p>',options:[{text:'拍下電池盒，穿過石橋',action:()=>this.advance(1)}]});return true;
    }
    if(id==='notice'){
      this.show({eyebrow:'慈雲里・住戶公告',title:'整條街都搬走了',body:'<p>住戶因地層滑動，於 2024 年完成撤離。廟內清點由榮昌紙紮行代管，鑰匙寄放在作坊。</p><p>聯絡電話撥不出去。公告下面有一道濕的手指印，從作坊地址一直劃到我的鞋邊。</p><p>街道右前方，那間店的燈還亮著。</p>',options:[{text:'去作坊找鑰匙和阿哲',action:()=>{this.advance(2);this.toast('街道右前方，榮昌紙紮行的入口亮著燈。');}}]});return true;
    }
    if(id==='remains'){
      this.show({eyebrow:'榮昌紙紮行・工作桌',title:'還沒完成的手',body:'<p>裁紙桌上擺著一隻手。關節露出的纖維像皮，也像濕紙。無名指的婚戒已陷進指根。</p><p>工牌寫著「郭建成，46 歲」。我叫了兩次名字，店裡沒有回應。</p><p>當我把手電筒移開，桌面傳來指甲刮木頭的聲音。照回去時，手的位置變了。</p><p>右側小桌有個藍色充電座，和站牌旁的電池盒同款。</p>',options:[{text:'查看右側充電座',action:()=>{this.advance(3);this.world.triggerScare?.('workshop');}}]});return true;
    }
    if(id==='ledger'){
      this.show({eyebrow:'作坊・相機充電座',title:'十三秒的空畫面',body:'<p>充電座接著一台小型攝影機。檔案列表裡只有十三秒。</p><p>鏡頭對著空無一人的工作桌。阿哲在畫面外說「人都走了，我把設備搬到寺裡」。</p><p>影片播到一半，那隻手從桌子底下慢慢伸上來。鏡頭後的阿哲仍在收線，完全沒有轉身。</p><p>檔案最後照到設備箱的標籤「正殿西桌」。到那裡才能繼續找他。</p>',options:[{text:'複製影片，走向村尾舊參道',action:()=>this.advance(4)}]});return true;
    }
    if(id==='gate'){
      if(r.step<4){this.show({title:'慈雲寺的舊參道',body:'<p>山上沒有電話訊號。我還沒確認阿哲是否進了寺，先查完作坊留下的設備。</p>'});return true;}
      this.show({eyebrow:'02:43・山村盡頭',title:'有人跟到這裡',body:'<p>我停在石階前，身後卻多走了一步。這次我轉身等著，街上仍然沒有人。</p><p>攝影機的畫面指向正殿西桌。我把手機調成錄音，沿著那三盞燈往上走。</p>',options:[{text:'沿參道進入慈雲寺',action:()=>this.travel()},{text:'再看看村裡',action:()=>{}}]});return true;
    }
    if(['car','kiln'].includes(id)){
      if(!r.notes.includes(id)){r.notes.push(id);this.save();}
      this.show(id==='car'?{title:'車上的時鐘',body:'<p>給佩珊的訊息停在傳送中。手機時間 02:16，車上的時鐘卻停在我接電話的 23:47。</p><p>副駕駛安全帶扣著。我剛才一直是一個人開車。</p>'}:{title:'沒有燒完的東西',body:'<p>爐灰還有溫度。一排陶製牙齒嵌在灰裡，旁邊是熔化的金屬鈕扣。</p><p>我關掉手電筒，爐內的紅點也跟著熄了。再打開，紅點才重新出現。</p>'});return true;
    }return false;
  }
  travel(){this.transitioning=true;this.state.road.step=5;this.state.scene='temple';this.state.flags.prologueComplete=true;this.state.position=null;try{localStorage.setItem(SAVE_KEY,JSON.stringify(this.state));}catch{this.transitioning=false;this.toast('無法保存進寺進度，請先釋出儲存空間。');return;}this.onTravel('temple');}
  peishanCall(){
    this.show({eyebrow:'02:39・訊號恢復',title:'佩珊終於回電',body:'<p>「我收到你的訊息了。已經報警，落石擋住山路，他們正在找別的入口。你在哪裡？」</p><p>我報出慈雲里。她翻找資料的聲音停了。</p>',options:[
      {text:'「阿哲的設備在這裡，我得找到他。」',action:()=>this.peishanReply('trust')},
      {text:'「你今天有和阿哲說過話嗎？」',action:()=>this.peishanReply('question')},
      {text:'先聽她說完',action:()=>this.peishanReply('silence')},
    ]});
  }
  peishanReply(choice){
    const first=choice==='question'?['佩珊','沒有。他傳過照片，但我打回去，一直只有雜音。']:choice==='silence'?['佩珊','別掛。我會留在線上，你先找個能看清路的地方。']:['佩珊','把你看到的拍下來，傳給我。我會轉給來找你們的人。'];
    this.dialogue([first,['我','他說後面的門打不開。影片裡的設備標籤寫著正殿。'],['佩珊','先找他的手機或相機。確認他真的在那裡，再決定下一步。'],['我','如果斷線呢？'],['佩珊','我會一直等你的檔案。傳不出來就先存著，別刪。']],()=>{this.state.road.peishan=choice;this.save();this.toast('佩珊正在聯絡救援。先到正殿確認阿哲的設備。');},'山外有人正在找你');
  }
  journal(){this.preludeJournal();}
  update(dt){
    if(this.modal||this.transitioning){$('interact-prompt').textContent='';return;}this.state.elapsed+=dt;this.tick+=dt;
    if(this.toastTime>0){this.toastTime-=dt;if(this.toastTime<=0)$('story-toast').classList.remove('show');}
    const p=this.game.player.pos;
    if(!this.callNotified&&this.state.road.step>=4&&!this.state.road.peishan&&p.z>-14){this.callNotified=true;this.game.audio.phoneRing();this.toast('手機恢復訊號。佩珊回電了。按 R 接聽，或先沿路前進。');}
    if(!this.bridgeCue&&p.z<11&&p.z>7){this.bridgeCue=true;this.world.triggerScare?.('bridge');this.toast('我已經停步了。橋下卻又響了一步。');}
    if(this.tick<.12)return;this.tick=0;const target=this.focused();$('interact-prompt').innerHTML=target?`<kbd>E</kbd><span>${target.label}</span>`:'';
    const goal=goals[Math.min(this.state.road.step,4)],t=this.world.targets.find(t=>t.id===goal[0]);$('objective-title').textContent=goal[1];$('objective-place').textContent=goal[2]+(this.callNotified&&!this.state.road.peishan?' · R 接聽佩珊回電':'');$('objective-distance').textContent=`${Math.round(p.distanceTo(t.position))} m`;$('waypoint').classList.add('hidden');
  }
  dispose(){window.removeEventListener('keydown',this.onRadio);super.dispose();}
}
