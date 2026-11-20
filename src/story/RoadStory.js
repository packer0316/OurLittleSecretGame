import { Story } from './Story.js';
import { SAVE_KEY } from './campaign.js';
const $=id=>document.getElementById(id);
const goals=[['bus','查看路旁的停駛站牌','停車處前方・候車亭'],['notice','穿過石橋，尋找村裡的消息','街道右側・遷離公告'],['remains','到代管廟務的作坊找人','右前方・榮昌紙紮行'],['ledger','檢查作坊桌上的充電座','作坊右側・充電座'],['gate','沿阿哲留下的線索進寺','村落盡頭・舊參道']];
export class RoadStory extends Story {
  constructor(game,options={}){super(game,options);this.state.scene='road';this.state.road??={step:0,notes:[]};this.onTravel=options.onTravel;this.bridgeCue=false;this.callNotified=false;this.sync();this.onRadio=e=>{if(e.code==='KeyR'&&!e.repeat&&game.running&&!this.modal&&this.state.road.step>=4&&!this.state.road.peishan)this.peishanCall();};window.addEventListener('keydown',this.onRadio);}
  start(){if(this.started)return;this.started=true;this.save();this.toast(this.state.road?.step?'已繼續山村的調查。J 回看紀錄。':'山路被落石堵住，只能把車停在這裡。先查看路旁站牌。');}
  sync(){this.world.setState(this.state);$('chapter-label').textContent='序章之二 / 沒有人等車';$('clue-count').textContent=`山村紀錄 ${Math.min(this.state.road?.step||0,4)} / 4`;}
  advance(n){this.state.road.step=Math.max(this.state.road.step,n);this.sync();this.save();}
  active(id){return !this.transitioning&&(id===goals[Math.min(this.state.road?.step||0,4)][0]||['car','kiln','gate'].includes(id)||['bus','notice','remains','ledger'].indexOf(id)<(this.state.road?.step||0)&&['bus','notice','remains','ledger'].includes(id));}
  interact(id){if(this.modal||this.transitioning||!this.active(id))return false;const r=this.state.road;
    if(id==='bus'){
      this.show({eyebrow:'02:16・慈雲里候車亭',title:'有人替我留了位子',visual:'road-bus',body:'<p>班次兩年前就停了。整條長椅都是濕的，只有正中央留著一塊乾的，大小剛好坐一個人。</p><p>乾處底下有一個相機電池盒，貼著阿哲工作室的藍色貼紙。盒裡積了雨水，貼紙卻還沒褪色，放在這裡不超過兩個禮拜。</p><p>石橋對面有一面住戶公告。也許上面留著廟方的聯絡方式。</p>',options:[{text:'拍下電池盒，穿過石橋',action:()=>this.advance(1)}]});return true;
    }
    if(id==='notice'){
      this.show({eyebrow:'慈雲里・住戶公告',title:'整條街都搬走了',visual:'road-notice',body:'<p>因地層滑動，全里已於 2024 年撤離。慈雲寺年底前封閉，廟內清點由榮昌紙紮行郭建成代管，鑰匙寄放在作坊。</p><p>公告底下還釘著一張發黃的舊紙：「七月初一借聲。外地親友請先至榮昌登記，一聲一尊。門外有人喊名，勿應。」</p><p>聯絡電話撥不出去。玻璃上有一道濕的指痕，從作坊的地址一路劃下來，停在我的鞋尖前面。</p><p>街道右前方，那間店的燈還亮著。</p>',options:[{text:'去作坊找鑰匙和阿哲',action:()=>{this.advance(2);this.toast('街道右前方，榮昌紙紮行的入口亮著燈。');}}]});return true;
    }
    if(id==='remains'){
      this.show({eyebrow:'榮昌紙紮行・工作桌',title:'還沒完成的手',visual:'road-remains',body:'<p>裁紙桌上擺著一隻手。關節露出來的纖維，像皮，也像泡過水的紙。無名指上的婚戒陷進指根，拔不下來。</p><p>旁邊的工牌寫著「郭建成，46 歲」，就是公告上代管廟務的那個人。我喊了兩聲，店裡沒有人應。</p><p>手底下壓著一本送貨簿。最後一頁只有一行：「借一聲，還一尊。欠到今年，二十八尊。」</p><p>我把手電筒移開，桌面傳來指甲刮木頭的聲音。照回去，那隻手換了位置，食指指著右邊的小桌。</p>',options:[{text:'查看右側充電座',action:()=>{this.advance(3);this.world.triggerScare?.('workshop');this.game.audio.horror?.('scrape',{pan:.4,dist:1.5});}}]});return true;
    }
    if(id==='ledger'){
      this.show({eyebrow:'作坊・相機充電座',title:'十三秒的空畫面',visual:'road-camera',body:'<p>充電座上接著一台小攝影機，電池貼著同樣的藍色貼紙。裡面只有一個檔案，十月二十七日，十三秒。</p><p>鏡頭對著這張工作桌。阿哲在畫面外說：「郭先生說帶子都在廟裡。我把設備搬上去，三天弄完。」</p><p>第七秒，一隻手從桌子底下慢慢伸上來，搭在桌沿。阿哲在鏡頭後面收線，沒有轉身。</p><p>最後一格拍到設備箱的標籤：「正殿西桌」。</p>',options:[{text:'複製影片，走向村尾舊參道',action:()=>this.advance(4)}]});return true;
    }
    if(id==='gate'){
      if(r.step<4){this.show({title:'慈雲寺的舊參道',body:'<p>山上沒有訊號。我還不知道阿哲是不是真的進了寺。先查完作坊裡留下的設備。</p>'});return true;}
      this.show({eyebrow:'02:43・山村盡頭',title:'有人跟到這裡',body:'<p>我在石階前停下。身後多了一步。我轉身等著，整條街沒有人。</p><p>從家裡到這裡，剛好三個小時。再走四分鐘，就是 02:47。</p><p>影片最後指向正殿西桌。我把手機切到錄音，沿著那三盞燈往上走。</p>',options:[{text:'沿參道進入慈雲寺',action:()=>this.travel()},{text:'再看看村裡',action:()=>{}}]});return true;
    }
    if(['car','kiln'].includes(id)){
      if(!r.notes.includes(id)){r.notes.push(id);this.save();}
      this.show(id==='car'?{title:'車上的時鐘',visual:'road-car',body:'<p>給佩珊的訊息還停在傳送中。手機顯示 02:16，車上的時鐘卻停在 23:47，我接起電話的那一分鐘。</p><p>副駕駛座的安全帶扣著。這一路，我是一個人開上來的。</p>'}:{title:'沒有燒完的東西',visual:'road-kiln',body:'<p>爐灰還是溫的。灰裡嵌著一排瓷牙，旁邊是熔成一團的金屬鈕扣。</p><p>紙人不會有牙。</p><p>我關掉手電筒，爐裡的紅點也跟著熄了。再打開，紅點才亮回來，位置比剛才靠近爐口。</p>'});return true;
    }return false;
  }
  travel(){this.transitioning=true;this.state.road.step=5;this.state.scene='temple';this.state.flags.prologueComplete=true;this.state.position=null;try{localStorage.setItem(SAVE_KEY,JSON.stringify(this.state));}catch{this.transitioning=false;this.toast('無法保存進寺進度，請先釋出儲存空間。');return;}this.onTravel('temple');}
  peishanCall(){
    this.show({eyebrow:'02:39・訊號恢復',title:'佩珊終於回電',body:'<p>「訊息我收到了。已經報警，落石把山路堵住，他們在找別的入口。你在哪裡？」</p><p>我說慈雲里。電話那頭翻紙的聲音停了。</p><p>「……以安。你也接到電話了，對不對。23:47。」</p>',options:[
      {text:'「阿哲的設備都在這裡，我得找到他。」',action:()=>this.peishanReply('trust')},
      {text:'「妳怎麼知道是 23:47？」',action:()=>this.peishanReply('question')},
      {text:'先聽她說完',action:()=>this.peishanReply('silence')},
    ]});
  }
  peishanReply(choice){
    const first=choice==='question'?['佩珊','因為它這三天也打給我。阿哲的號碼，每天晚上 23:47。我一通都沒接。']:choice==='silence'?['佩珊','……它這三天也打給我。阿哲的號碼，都是 23:47。我不敢接。']:['佩珊','我知道你一定會去。它這三天也打給我，阿哲的號碼，我一通都沒接。'];
    this.dialogue([first,
      ['佩珊','志豪二號接了。柏翰七號接了。他太太說，他對著電話講了一句「都出來了」，穿上鞋就出門，到現在沒回來。'],
      ['我','阿哲說後面的門打不開。影片裡的設備標籤寫著正殿。'],
      ['佩珊','找他的手機，看最後一段錄音是哪一天的。還有，裡面不管誰叫你，都不要應。'],
      ['我','如果斷線呢？'],
      ['佩珊','我等你的檔案。傳不出來就先存著，一個字都別刪。點名那天的事……等你出來，我當面講。'],
    ],()=>{this.state.road.peishan=choice;this.save();this.toast('佩珊在聯絡救援。先到正殿確認阿哲的設備。');},'山外有人正在找你');
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
