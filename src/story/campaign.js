// The story outline is source material. These names and prop texts extend it for play.
export const SAVE_KEY = 'ols-story-v1';
export const CHAPTERS = ['停在同一分鐘', '還亮著的燈', '少算了一次', '未播出的片段', '把最後一句說完'];
export const EVIDENCE = {
  "photo": {
    "title": "合照背面的時間",
    "place": "書桌・阿哲寄回的照片",
    "date": "照片 1998 年／背註 2026.11.12",
    "image": "children-1998.png",
    "redacted": true,
    "text": "阿哲在整理慈雲寺的舊錄音。下午，他寄來這張照片，要我辨認裡面的人。\n我認得五張臉。右邊那張被紅色墨水浸透，連背面的相紙也皺起來。\n背註只有「02:47，聽到這裡再停」。我把照片翻過來，指尖沾到一點尚未乾的紅色。",
    "inference": "阿哲下午說會再打來。先接電話，問清楚這個時間指的是什麼。"
  },
  "diary": {
    "title": "停在六的計數器",
    "place": "一樓・西側工作桌",
    "date": "外殼刻有「戲台點名」",
    "text": "金屬計數器上卡著 0006。我壓一下歸零鍵，五個輪齒轉回去，最後一格仍停在六。\n背面貼著五條褪色的彩線。第六條被剪斷，纖維陷進轉軸。\n底座有一枚木片，刻著「問路，勿報姓名」。這像是留給後來使用它的人的提醒。",
    "inference": "這裡點過六個人，留下的標記卻只有五份。另一張桌上的燒損物，或許能解釋當晚發生了什麼。"
  },
  "newspaper": {
    "title": "從外側扣上的門閂",
    "place": "一樓・東側工作桌",
    "date": "清理出的火場殘件",
    "text": "一截門框和鐵閂被整塊鋸下。外側的漆只起了泡，朝室內的一面卻已燒穿。\n閂舌仍插在鎖孔裡。門框內沿有一道很低的刮痕，最後停在離地約一公尺的位置。\n旁邊擺著阿哲的測量尺，標了「後殿，內側」。他曾在這裡比對過。",
    "inference": "起火時門是從外面關上的。二樓有阿哲搬來的錄音機，可能錄到開門前後的事。"
  },
  "tape": {
    "title": "被接回去的錄音",
    "place": "二樓・西側樓梯旁",
    "date": "卡帶 A 面・02:47",
    "text": "按下播放。男人說「到了就敲三下」。接著有三次很輕的敲擊，一個女人問「裡面還有沒有——」。\n聲音忽然變成「都出來了」。背景的雨聲也跟著換了位置。\n磁帶上有一小段透明膠帶。我按下停止鍵。喇叭停了，身後卻把那個女人未說完的半句接下去。\n「人？」",
    "inference": "有人剪接過撤離當晚的錄音。三份線索指向廟埕戲台，當年的點名就是在那裡進行。"
  },
  "stage": {
    "title": "第六張椅子",
    "place": "廟埕東側・舊戲台",
    "date": "錄音裡沒有留下的片段",
    "text": "空相框映出背後的座位。五張椅子上坐著孩子，第六張朝著幕布。\n台上的聲音問「都出來了？」五個孩子點頭。幕布後還有敲門聲。\n穿黃衣的孩子把手藏到背後。我低頭時，自己的右手也握緊了。\n這一段沒有火，沒有尖叫。只有五個人，等第六個聲音自己停下來。",
    "inference": "照片裡穿黃衣的孩子是我。我曾在那場點名裡。回二樓找出椅腳上同樣的紅線記號。"
  },
  "ritual": {
    "title": "被磨平的送行盤",
    "place": "二樓・西北經架前的桌面",
    "date": "盤底的三個凹槽",
    "text": "木盤刻著三幅小圖。一塊牌位、一隻補耳的兔子、一個張口作證的人。\n盤沿刻有「名有其人，物有其主，事有其證」。對應的人名全部被刮掉，刮屑積在縫裡。\n背面的舊刻痕寫著「先記其名，再歸其物，末留其事」。阿哲在旁邊夾了一枚錄音機接頭。",
    "inference": "這是送行的順序。等查出名字與當晚的事，才能決定該替誰完成它。"
  },
  "death": {
    "title": "阿哲留下的手機",
    "place": "三樓・東北收存桌",
    "date": "最後一段原始錄音・2026.10.29",
    "text": "手機卡在充電座裡，螢幕裂紋和阿哲用的一樣。錄音最後修改於十月二十九日。\n「以安，我在慈雲寺。後面的門打不開。帶那張照片來。」\n停頓後，他的聲音突然放低。\n「剛才那句別傳。我把封起來的磁帶接回去了，電話就開始自己撥號。如果你收到——」\n檔案在這裡中斷。十二日的來電，連那口吸氣都與前半段相同。",
    "inference": "電話使用了阿哲較早的錄音。他現在在哪裡仍無法確定。先比對西側木尺上的名字，再帶鑰匙上四樓。"
  },
  "births": {
    "title": "門框上的六道身高",
    "place": "三樓・西北木尺架",
    "date": "暑假留下的刻痕・1998",
    "text": "拆下的門框上刻著六道身高。陳以安、張明哲、許志豪、吳柏翰、周佩珊。最矮的一道被補土蓋住。\n我刮開已鬆動的邊角，下面是「林小雨」。旁邊畫著一隻左耳歪掉的兔子。\n背面掛著半枚陶牌，另一面是往西牆缺口的箭頭與老樹。\n這是她自己留下的字。她的名字從來沒有消失，只是一直被蓋著。",
    "inference": "第六個孩子叫林小雨。沿西牆缺口到老樹下，找那隻補過左耳的布兔。"
  },
  "relic": {
    "title": "補過左耳的布兔",
    "place": "西牆外・老樹下的石座",
    "date": "姓名布標「林小雨」",
    "text": "石座上有一個防雨布包。兔子的左耳用不同顏色的線縫過，和門框上的小圖一樣。\n我抬起它，底下壓著一隻童鞋。鞋裡塞滿乾香灰。\n腦中浮出一小段聲音。「輪到你數了，我站在這裡。」\n我記得自己答應替她留位子。卻想不起後來讓她等了多久。",
    "inference": "布標、身高刻痕與照片互相吻合。這隻兔子屬於林小雨，可以放回送行盤。"
  },
  "names": {
    "title": "五個重疊的手印",
    "place": "地下・封存室西牆",
    "date": "大手印下面的小手印",
    "text": "牆上的紅色像一排成人手印。我貼近照，才看見每個掌心下面還有一個較小的輪廓。\n五個孩子的名字被大人的姓名蓋住。旁邊刻著當年練過的回答。「都出來了。沒有別人。」\n每一遍的「別人」都刻得更深。牆後現在也在說這句話，聲音換成我、阿哲、佩珊。\n手印上方還刻著「借亡者之聲，以慰生人」。村裡曾在這裡呼喚死去的人，後來卻把一個活著的孩子留在門後。\n牆裡留住了我們練習的每一遍。阿哲把剪斷的磁帶接回去，它就開始找照片裡的人，等一次新的回答。",
    "inference": "大人讓五個孩子重複同一個說法，直到錄音裡不再有第六個人。舊鎖就在身後的石座上。"
  },
  "confession": {
    "title": "掌心裡的齒痕",
    "place": "地下・門前石座上的舊鎖",
    "date": "被省略的最後一分鐘",
    "text": "銅鑰匙轉進舊鎖。缺齒卡住的位置，正好壓在我右手的舊疤上。\n我想起大人要我們站在戲台點名。小雨還在後殿，說她的鞋不見了。阿哲讓我先把門扣上，等人來處理。\n裡面的聲音忽然換成我母親。大人點起火，我害怕了。我跟著大家說「都出來了」。\n聲音停以前，她一直說的是「我還在」。\n現在，門裡用我的聲音說「你沒有做錯」。它只播放我願意留下的那一段。",
    "inference": "當年我扣了門，也留下了錯誤的回答。要讓這段事情結束，就必須補上她的名字、遺物與完整的經過。"
  }
};

export const ENDINGS = {
  A: { name: '說好不說', subtitle: '結局 A · 約定仍在', text: '你重新封住了神壇，趁天亮前走出慈雲寺。\n\n幾個月後，手機在深夜響起。\n這一次，電話裡傳來你自己的聲音。\n\n「你確定，出來的是你嗎？」', final: '有些門，被關上不代表事情已經結束。' },
  B: { name: '替身', subtitle: '結局 B · 借來的聲音', text: '紅繩落下的瞬間，所有佛像同時轉向你。\n你想喊出聲，喉嚨裡卻只剩一口香灰。\n\n隔著矇眼紅布的縫隙，你看見另一個自己走向山門。\n它拿起你的手機，用你的聲音說：\n\n「我回來了。」', final: '祂終於有了自己的聲音。你的聲音。' },
  C: { name: '把話說完', subtitle: '結局 C · 真結局', text: '你說出林小雨的名字，歸還紅布兔，也承認了自己扣上門閂的那一刻。\n五個孩子當年的回答、門閂的方向與被剪接的錄音，被一起送到山外。\n阿哲的手機也帶了出來。他最後的警告，終於有人聽完。\n\n紅繩收緊，地下的聲音第一次無人應答。\n晨光穿過殿門，小雨的身影漸漸消散。\n\n「這次，你沒有把我留下來。」', final: '記住一個人，也是一種把她帶回家的方式。' },
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
  s.road.peishan = ['trust','question','silence'].includes(raw.road?.peishan) ? raw.road.peishan : null;
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
  if (!s.flags.stage) return [{ id: 'stage', title: '把錄音帶到廟埕東側的舊戲台', location: '廟埕東側' }];
  if (!s.flags.loopSolved) return [{ id: 'loopmark', title: '返回二樓，找出回廊中留下的記號', location: '二樓・西側回廊' }];
  if (!s.flags.key) return [{ id: 'divination', title: '擲筊，詢問通往後殿的路', location: '二樓・中央供桌' }];
  if (!s.evidence.includes('death')) return [{ id: 'death', title: '到三樓找到阿哲的手機', location: EVIDENCE.death.place }];
  if (!s.flags.underground) return [{ id: 'descent', title: '以銅鑰匙開啟封印暗道', location: '四樓・神壇東側' }];
  const truths = ['names', 'confession'].filter(id => !s.evidence.includes(id));
  if (truths.length) return truths.map(id => ({ id, title: `調查${EVIDENCE[id].title}`, location: EVIDENCE[id].place }));
  return [{ id: 'altar', title: '在神壇前作出最後的選擇', location: '地下・中央神壇' }];
}
