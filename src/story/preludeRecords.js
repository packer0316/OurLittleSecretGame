/** Only return records the player has actually encountered. Never reveal later chapters. */
export function preludeRecords(s){
  const out=[],h=s.home||{step:0,notes:[]},r=s.road||{step:0,notes:[]};
  if(h.step>=1)out.push(['未署名的信','11 月 12 日 23:42。沒有郵戳，收件人卻是童年的筆跡。信上寫著：你們答應過我，不會把我留在那裡。']);
  if(h.step>=3)out.push(['23:47 的來電','聲音自稱阿哲，說自己困在慈雲寺。同一口吸氣重複兩次，通話紀錄卻顯示零秒。這是聲音的說法，尚未得到身分證明。']);
  if(h.step>=4)out.push(['門縫字條','門外的人用了母親的聲音。字條寫著：你在家。這次不要假裝沒聽見。紙背是公寓的舊通知單。']);
  const optional={calendar:['月曆','十二日被劃向十三日，筆尖壓破紙面。'],window:['窗外雨聲','七樓窗外的拖椅聲，跟著我停下。'],message:['未送出的語音','半個月前，我拒絕了阿哲追問往事。錄音裡出現「可是我還在這裡」，當時家中只有我。']};
  for(const id of h.notes)if(optional[id])out.push(optional[id]);
  if(r.step>=1)out.push(['停駛的候車亭','末班 18:40，路線兩年前已停駛。長椅卻留著人形乾燥區域。']);
  if(r.step>=2)out.push(['慈雲里遷離公告','2024 年完成撤離，私人祭儀與夜間焚燒停止。手寫告示提醒：不要只憑聲音開門。榮昌紙紮行的名字被描了三次。']);
  if(r.step>=3)out.push(['紙紮行的成人殘留物','桌上工牌屬於郭建成，46 歲。腐壞的手、焦黑小腿與不相連的血肉，像在模仿同一口呼吸。']);
  if(r.step>=4)out.push(['借聲登記簿','紙身留不到天亮；要留住聲音，須取應允者之肉。最新一頁是我的名字，但「已應允」欄空著。']);
  if(r.notes.includes('car'))out.push(['車內時鐘','手機顯示 02:16，車上仍是 23:47。後視鏡多了一根紅線。']);
  if(r.notes.includes('kiln'))out.push(['爐灰與義齒','尚溫爐灰中有成人義齒與熔化鈕扣。牆上寫著：燒掉舊的聲音，新的人才肯說話。']);
  if(r.peishan)out.push(['佩珊的回電','訊息延遲到達。佩珊提醒：照片裡的人數，要自己數；真正的小雨會留下物件。她會保留我傳回去的紀錄，不會替任何人刪掉名字。']);
  return out;
}
