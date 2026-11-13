// The story outline is source material. These names and prop texts extend it for play.
export const SAVE_KEY = 'ols-story-v1';
export const CHAPTERS = ['重返廢廟', '沒有人拜的廟', '第六個孩子', '不能回答的聲音', '神明不在神桌上'];
export const EVIDENCE = {
  photo: { title: '被塗去的第六張臉', place: '未署名的信封', date: '1998 年・夏', image: 'children-1998.png', redacted: true, text: '六個孩子站在慈雲寺前。最右邊女孩的臉被紅筆反覆塗掉。\n背面寫著：「你們答應過我，不會把我留在那裡。」\n中間那個穿黃衣的孩子，是小時候的我。可是，我記不得她。', inference: '照片上有六個孩子。' },
  diary: { title: '阿哲的童年日記', place: '一樓・西側書桌', date: '1998.08.16', text: '小雨說，後殿的神會說話。\n我們六個決定今晚去問祂，長大以後還會不會在一起。\n阿嬤說，問路可以，不要報自己的名字。\n如果有人用媽媽的聲音叫你，千萬別答應。\n\n最後一行的筆跡突然變得很重：\n「祂問我們，誰願意留下來？」', inference: '問神遊戲是入口；回答呼名，是允許它靠近。' },
  newspaper: { title: '遭剪改的火災報紙', place: '一樓・東側供桌', date: '1998.08.17', text: '山村廟宇深夜失火，五名孩童自行脫困。\n無人傷亡，無失蹤人口。\n\n剪報下壓著另一張底稿：\n「目擊者稱六名孩童曾走出山門，一名女童隨後被村民帶回寺內。」\n數字「六」被劃掉，旁邊用紅筆寫著：「統一說法。」', inference: '六人曾經出門；女孩又被帶回去。' },
  tape: { title: '母親的錄音帶', place: '二樓・樓梯旁', date: '1998.08.17・00:13', text: '女人：「她站在門外，叫我媽。可她從來不用那個聲音。」\n男人：「妳開門了？」\n女人：「沒有。那不是我的女兒。」\n小女孩：「媽媽，妳剛剛答應我了。」\n\n錄音末尾，是許多人拖著同一個腳步聲回到廟裡。', inference: '被帶回寺裡的是女孩，也是借用她聲音的東西。' },
  stage: { title: '戲台上的火災記憶', place: '廟埕東側・古戲台', date: '被刪去的那一夜', text: '六個孩子從後殿跑出來。小雨最後走出山門，卻說著一個死去老人的話。\n村民將她帶回去。阿哲抓住我的手，把鐵鑰匙塞進我的掌心。\n「鎖起來。她已經不是小雨了。」\n火光裡，我聽見真正的她在哭。', inference: '我不只是目擊者。我拿過那把鑰匙。' },
  ritual: { title: '送魂殘頁', place: '二樓・西北經架', date: '無日期', text: '借聲者，無聲；借名者，無名。\n覆其眼，不是怕祂看見我們，是怕我們把祂認成所愛之人。\n\n送魂須備全證、故人遺物。三炷香燃盡之前，依次完成：\n一、喚真名。\n二、歸還遺物。\n三、承認所為，留下見證。\n\n只讀出亡者的真名，切勿應答暗處的呼喚。', inference: '送魂順序：喚名 → 歸物 → 見證。' },
  death: { title: '好友的死亡通知', place: '三樓・東北納骨櫃', date: '2026.10.29', text: '姓名：張明哲。\n發現地點：慈雲寺舊山道。\n隨身物：一部無 SIM 卡的手機、一張六人合照。\n\n我收到電話的日期，是十一月十二日。\n阿哲已經死了十四天。\n\n從來沒有失聯好友在廟裡等我。打電話的，一直都是「它」。', inference: '電話中的聲音不能被信任。' },
  births: { title: '六人的生辰簿', place: '三樓・西北牌位架', date: '借聲祭・封存名冊', text: '陳以安、張明哲、許志豪、吳柏翰、周佩珊、林小雨。\n六個名字，六份生辰。\n遺物：母親縫製的紅布兔，左耳補縫。\n她的名字被刮了三次，卻仍能在紙背看見。\n沒有名字的墳，在西牆缺口外的老樹下。\n\n【夾頁：林美蘭未寄出的信】\n郭師父，你說等天亮，我等了。你說火停了就能開門，我也等了。\n我說那不是我的女兒，是因為我害怕。不是要你們不要她。\n後來她叫我的那一聲，真的是她。她說腳很冷。\n你們誰去看過她有沒有穿鞋？\n如果所有人都說沒這個孩子，我要把她的名字寫在哪裡？\n——美蘭', inference: '第六個孩子叫林小雨；母親的恐懼被剪成了放棄女孩的藉口。' },
  relic: { title: '林小雨的紅布兔', place: '亂葬崗・無名小墳', date: '1998 → 2026', text: '紅布幾乎褪成褐色，左耳被重新縫過。\n線頭下面藏著小小的姓名布標：林小雨。\n\n照片裡，她一直把這隻兔子抱在胸前。\n我記得她說過：「如果迷路了，拿著它，我就找得到你。」', inference: '這件遺物屬於真正的小雨，不屬於地下的東西。' },
  names: { title: '村民的封口名牆', place: '地下・封印室西牆', date: '1998.08.18', text: '牆上刻滿村民的名字。每個名字後面都有一道朱紅手印。\n「借亡者之聲，以慰生人。」\n「今封後殿，永不開言。」\n\n最底下是五個幼小的手印，與同一句話：\n「說好不說。」\n\n這不是保護我們的約定，是讓她從世界上消失的約定。', inference: '村民以借聲儀式召來異物，再以集體沉默掩蓋火災。' },
  confession: { title: '鎖門人的記憶', place: '地下・神壇前', date: '1998.08.17・00:47', text: '我想起來了。\n鑰匙在我的手裡。門內的小雨說：「以安，不要把我留下。」\n我還是轉動了鑰匙。\n\n大人點起火，說這樣就不會再聽見她。\n但她真正的聲音，一直在提醒我不要回頭、不要回答。\n\n保護我的，是小雨殘存的記憶；模仿她、要我拆開封印的，是地下的東西。', inference: '承認自己的責任，才能終止這個約定。' },
};

export const ENDINGS = {
  A: { name: '說好不說', subtitle: '結局 A · 約定仍在', text: '你重新封住了神壇，趁天亮前走出慈雲寺。\n\n幾個月後，手機在深夜響起。\n這一次，電話裡傳來你自己的聲音。\n\n「你確定，出來的是你嗎？」', final: '有些門，被關上不代表事情已經結束。' },
  B: { name: '替身', subtitle: '結局 B · 借來的聲音', text: '紅繩落下的瞬間，所有佛像同時轉向你。\n你想喊出聲，喉嚨裡卻只剩一口香灰。\n\n隔著矇眼紅布的縫隙，你看見另一個自己走向山門。\n它拿起你的手機，用你的聲音說：\n\n「我回來了。」', final: '祂終於有了自己的聲音。你的聲音。' },
  C: { name: '不再沉默', subtitle: '結局 C · 真結局', text: '你說出林小雨的名字，歸還紅布兔，也承認了自己轉動鑰匙的那一刻。\n六個孩子的名字、村民的證詞與死亡紀錄，被完整留下。\n\n紅繩收緊，地下的聲音第一次無人應答。\n晨光穿過殿門，小雨的身影漸漸消散。\n\n「這次，你沒有把我留下來。」', final: '記住一個人，也是一種把她帶回家的方式。' },
};

export function newState() {
  return { version: 1, scene: 'temple', home: {step:0,notes:[]}, road: {step:0,notes:[]}, chapter: 1, evidence: ['photo'], flags: {}, answers: 0, deaths: 0, elapsed: 0, ending: null, position: null };
}
export function validateSave(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.evidence) || !raw.flags || typeof raw.flags !== 'object' || Array.isArray(raw.flags)) return null;
  const s = newState();
  s.scene = ['home','road','temple'].includes(raw.scene) ? raw.scene : 'temple';
  s.home.step = Number.isInteger(raw.home?.step) ? Math.max(0,Math.min(6,raw.home.step)) : 0;
  s.home.notes = Array.isArray(raw.home?.notes) ? [...new Set(raw.home.notes.filter(n=>['calendar','message','window'].includes(n)))] : [];
  s.road.step = Number.isInteger(raw.road?.step) ? Math.max(0,Math.min(5,raw.road.step)) : 0;
  s.road.notes = Array.isArray(raw.road?.notes) ? [...new Set(raw.road.notes.filter(n=>['car','kiln'].includes(n)))] : [];
  s.evidence = [...new Set(['photo', ...raw.evidence.filter(id => typeof id==='string'&&Object.hasOwn(EVIDENCE,id))])];
  for (const key of ['incense','stage','loopSolved','key','underground','ritualReady','sealed','sent','prologueComplete']) s.flags[key] = raw.flags[key] === true;
  if(s.flags.key) s.flags.loopSolved=true;
  s.chapter = s.flags.key ? 4 : s.flags.incense && ['diary','newspaper','tape'].every(id => s.evidence.includes(id)) ? 3 : s.flags.incense ? 2 : 1;
  for (const key of ['answers', 'deaths', 'elapsed']) s[key] = Number.isFinite(raw[key]) ? Math.max(0, raw[key]) : 0;
  s.ending = Object.hasOwn(ENDINGS,raw.ending) ? raw.ending : null;
  const p = raw.position;
  if (Array.isArray(p) && p.length === 5 && p.every(Number.isFinite) && p[0] >= -84 && p[0] <= 67 && p[1] >= -7.2 && p[1] <= 30 && p[2] >= -47 && p[2] <= 54) s.position = p;
  if(s.scene==='home'&&s.position&&(Math.abs(p[0])>3.7||Math.abs(p[2])>3.7||Math.abs(p[1])>.2))s.position=null;
  if(s.scene==='road'&&s.position&&(Math.abs(p[0])>16||p[2]<-42||p[2]>39||p[1]<-.2||p[1]>1))s.position=null;
  return s;
}
export function collect(s, id) {
  if (!Object.hasOwn(EVIDENCE,id) || s.evidence.includes(id)) return false;
  s.evidence.push(id);
  if (s.flags.incense && ['diary','newspaper','tape'].every(e => s.evidence.includes(e))) s.chapter = Math.max(s.chapter, 3);
  return true;
}
export function trueEndingReady(s) { return Object.keys(EVIDENCE).every(id => s.evidence.includes(id)); }
export function missingEvidence(s) { return Object.keys(EVIDENCE).filter(id => !s.evidence.includes(id)); }
export function objectives(s) {
  if (s.flags.sent || s.flags.sealed) return [{ id: 'exit', title: '沿參道離開慈雲寺', location: '山門外' }];
  if (!s.flags.incense) return [{ id: 'incense', title: '調查仍在燃燒的三炷香', location: '一樓・正殿供桌' }];
  const clues = ['diary', 'newspaper', 'tape'].filter(id => !s.evidence.includes(id));
  if (clues.length) return clues.map(id => ({ id, title: `尋找${EVIDENCE[id].title}`, location: EVIDENCE[id].place }));
  if (!s.flags.stage) return [{ id: 'stage', title: '調查重演火災的古戲台', location: '廟埕東側' }];
  if (!s.flags.loopSolved) return [{ id: 'loopmark', title: '返回二樓，找出回廊中留下的記號', location: '二樓・西側回廊' }];
  if (!s.flags.key) return [{ id: 'divination', title: '擲筊，詢問通往後殿的路', location: '二樓・中央供桌' }];
  if (!s.evidence.includes('death')) return [{ id: 'death', title: '尋找阿哲留下的紀錄', location: EVIDENCE.death.place }];
  if (!s.flags.underground) return [{ id: 'descent', title: '以銅鑰匙開啟封印暗道', location: '四樓・神壇東側' }];
  const truths = ['names', 'confession'].filter(id => !s.evidence.includes(id));
  if (truths.length) return truths.map(id => ({ id, title: `調查${EVIDENCE[id].title}`, location: EVIDENCE[id].place }));
  return [{ id: 'altar', title: '在神壇前作出最後的選擇', location: '地下・中央神壇' }];
}
