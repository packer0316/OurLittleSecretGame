/** Records appear only after the corresponding interaction. */
export function preludeRecords(s){
  const out=[],h=s.home||{step:0,notes:[]},r=s.road||{step:0,notes:[]};
  if(h.step>=1)out.push(['阿哲寄回的照片','阿哲在清點慈雲寺的舊錄音，請我辨認合照。照片背面寫著 02:47。']);
  if(h.step>=3)out.push(['23:47 的來電','阿哲說後面的門打不開，接著重複了第一句。門外自稱管理員的人沒有按對講機。']);
  if(h.step>=4)out.push(['門下的封口','剛才撕下的信封封口從門外滑進來，上面多了「照片收到，請回答」。先拿玄關矮櫃的鑰匙與手電筒。']);
  const optional={calendar:['月曆','原本圈起的日期旁多了一道劃痕。'],window:['窗外雨聲','七樓窗外的拖椅聲跟著我停下。'],message:['下午的語音','我問阿哲要聽哪段錄音，錄音末尾多了一聲拖椅聲。']};
  for(const id of h.notes)if(optional[id])out.push(optional[id]);
  if(r.step>=1)out.push(['候車亭','停駛站牌旁有阿哲的電池盒。去石橋對面的公告找管理單位。']);
  if(r.step>=2)out.push(['住戶公告','村民已搬離。榮昌紙紮行代管廟內清點，店裡還亮著燈。']);
  if(r.step>=3)out.push(['工作桌上的手','工牌屬於郭建成，46 歲。光移開後，桌上傳來刮動聲。旁邊是阿哲同款的充電座。']);
  if(r.step>=4)out.push(['攝影機裡的十三秒','阿哲說要把設備搬到寺裡，鏡頭錄到一隻從桌下伸出的手。設備箱標籤寫著正殿西桌。']);
  if(r.notes.includes('car'))out.push(['車內','時鐘停在接電話的時間，空副駕的安全帶扣著。']);
  if(r.notes.includes('kiln'))out.push(['焚化爐','灰裡有陶製牙齒和熔化的鈕扣。爐裡的紅光隨手電筒熄滅。']);
  if(r.peishan)out.push(['佩珊的回電','佩珊已報警，救援正在找山路入口。她會保存我送出的檔案。先確認正殿的設備與阿哲的下落。']);
  return out;
}
