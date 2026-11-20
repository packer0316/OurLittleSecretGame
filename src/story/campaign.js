// 劇情資料。完整的因果鏈與作者真相見 故事/01_完整劇情與章節設計.md。
// 寫作規則：每份證物最多五個短段；先回答一個問題，再留下一個問題。
import { normalizePictures } from './illustrations.js';
export const SAVE_KEY = 'ols-story-v1';
export const CHAPTERS = ['停在同一分鐘', '還亮著的燈', '多應了一聲', '未播出的片段', '把最後一句說完'];
export const EVIDENCE = {
  photo: {
    title: '合照背面的時間',
    place: '書桌・阿哲寄回的照片',
    date: '照片 1998 年暑假／背面是阿哲的字',
    image: 'children-1998.webp',
    redacted: true,
    text: '1998 年暑假，慈雲寺山門前。我認得五張臉：我、阿哲、志豪、柏翰、佩珊。\n最右邊的女孩抱著一隻布兔，臉被紅筆塗掉了。筆畫又短又亂，下手很重，相紙被戳破了幾個洞。\n背面是阿哲的字：「02:47，聽到這裡再停。」角落還有一行鉛筆寫的舊字，是小孩的筆跡：「陳以安的」。\n我數了兩次，照片裡是六個人。我記得的那個暑假，只有五個。',
    inference: '這是我自己的那一張，我卻不記得第六個人。阿哲說晚上會打來。先接電話，問清楚 02:47 指的是什麼。',
  },
  diary: {
    title: '停在六的計數器',
    place: '一樓・西側工作桌',
    date: '外殼刻有「戲台點名」',
    text: '手按的金屬計數器，卡在 0006。我壓下歸零鍵，五個輪齒轉回去，最後一格還是六。\n背面綁著五條褪色的彩線，一條一個結。第六條被剪斷，線頭捲進轉軸，拔不出來。\n底座壓著一枚木片，刻著「問路，勿報姓名」。\n阿哲在旁邊貼了一張藍色便條：「點名按了六下。第六下是誰應的？」',
    inference: '點名點到六，留下記號的只有五個人。東桌那截燒過的門框，也許能說明第六個去了哪裡。',
  },
  newspaper: {
    title: '從外側扣上的門閂',
    place: '一樓・東側工作桌',
    date: '清理出的火場殘件',
    text: '一截門框連著鐵閂，被整塊鋸下來。朝外的漆只起了泡，朝裡的那一面燒穿了。火是從裡面燒的。\n閂舌還插在扣環裡。門是從外面扣上的，到最後都沒有人拉開。\n門框底部開著一個巴掌寬的小口，邊緣燻得最黑。內側離地不到一公尺的地方，有一排很淺的抓痕。\n阿哲的捲尺壓在上面，標著「後殿，內側，高 98」。',
    inference: '起火的時候，門裡有一個不到一公尺高的人。二樓有阿哲搬來的錄音機，也許錄到了那一晚。',
  },
  tape: {
    title: '被接回去的錄音',
    place: '二樓・西側樓梯旁',
    date: '留聲帶・1998 年七月初一',
    text: '卡帶盒的紙卡上用鋼筆記著時刻。最後一行是 02:47，後面被刀片刮掉了。\n我按下播放。男人說：「到了就敲三下。」三下很輕的敲門聲。一個女人問：「裡面還有沒有——」\n計數走到 02:47。接點上貼著一段新的透明膠帶。我想起照片背面的字，按了停止。\n機身上有阿哲的藍色便條：「原本這裡直接跳到『都出來了』。中間剪掉的一分鐘封在地下，我接回去了。」\n喇叭停了。身後有人把那個女人沒問完的半句接下去：「人？」',
    inference: '02:47 是錄音被剪斷的地方。有人問裡面還有沒有人，原本的回答是事後接上去的。當年的點名在廟埕東側的戲台。',
  },
  stage: {
    title: '第六張椅子',
    place: '廟埕東側・舊戲台',
    date: '錄音裡沒有留下的片段',
    text: '空相框的玻璃映出我背後的座位。五張椅子上坐著孩子。第六張背對大家，玻璃裡，那上面只放著一隻布兔，替人佔著位子。\n點名點到六。第六聲「有」，是第五張椅子上的女孩替那隻兔子喊的。\n後來台上又問了一次：「都出來了？」五個孩子點頭。幕布後面有人敲了三下，沒有人回頭。\n穿黃衣的孩子把右手藏到背後。我低頭，自己的右手也握著。\n第二張椅子底下壓著阿哲工作室的識別證。第三、第四張椅子底下，各有一支螢幕朝下的手機，其中一支還在震。',
    inference: '穿黃衣的是我，那場點名我在。椅子下的東西是現在的：有人比我先到，東西替他們佔著位子。回二樓，找椅腳上那種紅線記號。',
  },
  ritual: {
    title: '被磨平的送行盤',
    place: '二樓・西北經架前的桌面',
    date: '盤底的三個凹槽',
    text: '木盤上刻著三幅小圖：一塊牌位、一隻補過耳朵的兔子、一個張口說話的人。\n盤沿刻著「名有其人，物有其主，事有其證」。對應的三個名字全被刮掉，木屑還積在縫裡。\n背面是另一種刀工：「先記其名，再歸其物，末留其事」。和借聲相反，這個順序不問，只說。\n阿哲夾了一張藍色便條：「名字我找到了。東西在老樹下。最後一樣，要當年在門邊的人自己來說，我一個人不夠。六個人的照片也要帶來。」',
    inference: '這是把人送走的順序，不是把聲音叫回來的。阿哲缺的那個人是我。等查出名字和那一晚，再決定替誰完成它。',
  },
  death: {
    title: '阿哲留下的手機',
    place: '三樓・東北收存桌',
    date: '沒有送出的語音・2026.10.29',
    text: '手機插在充電座上，螢幕的裂痕我認得。最後一段語音備忘錄停在十月二十九日，沒有送出。\n「以安，我在慈雲寺。後面的門打不開。帶那張照片來。」\n他停了很久，聲音壓低：「剛才那句別傳。我把剪掉的那一分鐘接回去了，電話開始自己撥號，照點名的順序。有人用她的聲音叫我。我要是應了——」\n錄音斷在這裡。十二日打到我家的就是前半段，連那口吸氣都一樣。\n撥出紀錄：我，10/29 02:47，未接三通。志豪，11/2 23:47，已接。柏翰，11/7 23:47，已接。佩珊，11/9 起每晚 23:47，未接。我，11/12 23:47，已接。',
    inference: '打給我的是兩週前的錄音。接了電話的人，都在三個小時後的 02:47 到了這裡，把東西留在戲台的椅子下。第二張椅子下是阿哲的識別證。他應了。先看西北桌的木尺架，再帶鑰匙上四樓。',
  },
  births: {
    title: '門框上的六道身高',
    place: '三樓・西北木尺架',
    date: '暑假留下的刻痕・1998',
    text: '拆下來的門框上刻著六道身高，旁邊是小孩的字：陳以安、張明哲、許志豪、吳柏翰、周佩珊。這是點名的順序。\n最矮的一道被補土蓋住。我摳開鬆掉的邊角，底下是「林小雨」，旁邊畫著一隻左耳歪掉的兔子。\n她在自己的刻痕下面多寫了一行：「七月初一要去聽爸爸。柏翰說後殿聽得到。」\n門框背面掛著半枚陶牌，畫著西牆的缺口和一棵老樹。',
    inference: '第六個孩子叫林小雨。那天晚上她躲進後殿，是想聽死去的爸爸說話。沿西牆缺口到老樹下，找那隻左耳歪掉的布兔。',
  },
  relic: {
    title: '補過左耳的布兔',
    place: '西牆外・老樹下的石座',
    date: '姓名布標「林小雨」',
    text: '防雨布包裡是一隻紅布兔。左耳用紅線重新縫過，針腳又密又直，是大人的手。\n布標繡著「林小雨」，背面另有一行小字：「耳朵媽媽補好了。」\n兔子底下壓著一隻童鞋，鞋裡塞滿乾掉的香灰。鞋墊下有一張作業簿撕下來的紙：「鞋是我藏的。我只是想讓她找久一點。許志豪」\n我想起她的聲音：「輪到你數了。兔子幫我佔位子，你要來後殿找我喔。」我答應了。我不記得後來讓她等了多久。',
    inference: '布標、刻痕和照片對得起來，這隻兔子是林小雨的。她回後殿是為了找那隻鞋。補耳朵的那種紅線，我今晚在別的地方也看過。',
  },
  names: {
    title: '五個重疊的手印',
    place: '地下・封存室西牆',
    date: '大手印下面的小手印',
    text: '牆上是一排紅色的大人手印。貼近看，五個掌心底下各壓著一個小的。是大人抓著我們的手按上去的。\n旁邊刻著練過的那句話：「都出來了。沒有別人。」同一句刻了幾十遍，越後面刻得越深。\n最上面是「借亡者之聲，以慰生人」。底下補了一行小字：「內有應者，不得開門。此後誰說出她的名字，誰就是替它應聲。」\n牆腳的鐵盒裡有五支乾掉的紅筆，和四張塗掉同一張臉的合照。大人要我們自己動手，說這樣才算數。少的那一張在我外套裡，是我塗的。\n十六個名字的最後一個是林美蘭，筆畫抖得最厲害。旁邊補刻著：「隔年七月初一，往後殿，未歸。」',
    inference: '大人相信，只要沒有人再說出她的名字，門後的東西就沒有人可以叫。他們把這句謊當成保護，教到連我們自己都信。舊鎖在身後的石座上。',
  },
  confession: {
    title: '掌心裡的齒痕',
    place: '地下・門前石座上的舊鎖',
    date: '被省略的那一分鐘',
    text: '銅鑰匙插進舊鎖。缺角卡住的位置，正好壓在我右手掌心的舊疤上。\n點名過後，小雨跑回後殿找鞋。阿哲說借聲快開始了，先扣上，等大人走了再放她。門是我扣的。我隔著門說：「我等一下回來。」\n02:47，美蘭阿姨敲了三下，照規矩問：「裡面還有沒有人？」門裡應了：「有。媽媽，我還在。」\n大人說，殿裡有活人應了聲，門就不能開。接著門裡傳出美蘭阿姨哄小孩的聲音，可是阿姨就站在門外，嘴是閉著的。郭師父說先還再開，點著那尊還沒寫名字的紙人，從門底的小口推進去。殿裡全是布幔。\n等到要開門，鎖已經燙得卡死。我轉過鑰匙，我放手了。戲台上又問了一次。她還在說「我還在」。我聽見了。我跟著大家說：「都出來了。」',
    inference: '門是我扣的，謊也是我說的。大人不是存心要燒死她，他們只是選了一個不必再聽她說話的做法。要讓這件事結束，得把她的名字、她的東西和那一分鐘，一樣一樣還回去。',
  },
};

// 可選的可讀物：不計入十一組證據，不影響任何結局門檻。
// after：第一次讀完、收起時的一句提示（相當於證物的推論，但只出現一次）。開放時機見 noteOpen()。
export const NOTES = {
  log: {
    title: '阿哲的清點日誌',
    place: '一樓・西側工作桌',
    text: '10/27　郭先生把鑰匙給我，人不肯進山門。他說郭家的人不能再進後殿。我問為什麼，他只說「還沒還完」。\n10/28　計數器、門閂、身高刻痕都找到了，送行盤也在。小時候的事，我記得的比我以為的多。\n10/29　地下有一台封起來的錄音機，帶子只有一分鐘。標籤是郭師父的字：「戊寅七月初一　02:47 起　勿放」。\n我接這個案子就是為了這一分鐘。那天是我叫以安扣門的。我得知道她最後喊的是誰。\n最後一行寫得很急：「聽完了。她沒有喊任何人的名字。她只是一直回答同一句：我還在。」',
  },
  robe: {
    title: '問者的素衣',
    place: '一樓・東側工作桌旁的木箱',
    text: '東桌旁的木箱上疊著一件摺好的白色素衣，領口縫著布條：「戊寅七月初一　問者　林」。箱子上貼著阿哲的便條：「跟門框一起從地下搬上來的。」\n左邊袖口繫著一圈紅線，打了三個死結。線頭不是剪斷的，是燒斷的，末端捲成一小粒黑。\n衣襟上別著一把小剪刀，刀柄綁著紙條：「問完剪線」。刀口很亮，沒有用過。\n胸口的布皺成兩團，是被兩隻手用力抓過的形狀，一直沒有攤平。',
    after: '那一晚問話的是一個姓林的女人。她的線沒有剪，她沒有問完。',
  },
  rulebook: {
    title: '郭師父的規矩簿',
    place: '二樓・錄音機旁',
    text: '線裝的小簿子，是榮昌紙紮行的帳本改的。前半本抄著借聲的規矩。\n「問者素衣，左腕繫紅線，線頭繫門環。問完剪線。」\n「借一聲，還一尊。紙人寫亡者名，天亮前自送口入殿焚化。不還，它自己來取。」\n「殿內有人應聲，不得開門。民國六十年，阿土伯替溺死的兒子開了門。走出來的人到死都只會講他兒子那三句話。」\n最後一頁的墨色不同：「戊寅年那一尊，沒寫名字。次日全寺佛像覆目。神明沒看見，就不必作證。」',
  },
  flashlight: {
    title: '還亮著的手電筒',
    place: '二樓・北側佛龕前',
    text: '最下層佛龕前橫著一支手電筒，開關卡在亮的位置。握把纏著電工膠帶，用白色油漆筆寫著「許志豪」。他家開水電行，工具都這樣寫名字。\n十一月二日到今天，電池早該沒電了。光照著佛龕底下一塊被撬開的踢腳板，裡面是空的。\n灰上有兩個跪出來的膝蓋印。旁邊用手指寫著，越寫越歪：「鞋在老樹下。我放回去了。妳不要再找了。」\n膝蓋印朝著佛龕，沒有轉回來的痕跡。他沒有帶走手電筒，是摸黑走的。',
    after: '志豪來過。他在這裡找一隻鞋，最後是跟著聲音，摸黑走的。',
  },
  chalk: {
    title: '柱子上的粉筆字',
    place: '三樓・北側柱子',
    text: '柱子上用粉筆寫著「都出來了」，一筆一畫，像寫在黑板上。一樓、二樓樓梯口的柱子上，也是同一句。\n這一根寫得最多，從腰一路寫到柱腳。最上面那一行旁邊擠著一排小字：「電話裡問我：裡面還有沒有人。」\n最後一遍被劃掉了。旁邊換了很小的字，壓得很用力，粉筆斷在最後一筆：「還有一個」。\n柱腳有一盒白粉筆，盒蓋貼著標籤：三年二班　吳老師。柏翰在電話裡答的就是這一句。他一路寫上樓，寫到這裡，改了口。',
    after: '柏翰一路寫著同一句謊話上樓。寫到最後，他說了實話。不管說哪一句，都是回答。',
  },
  tablet: {
    title: '翻過去的木牌',
    place: '三樓・西牆牌位架',
    text: '牌位架最下層，有一塊沒上漆的木牌被翻了過去。正面沒有刻字，背面用原子筆寫滿了，字擠在角落。\n「小雨，媽媽明年七月初一再來問一次。這一次不問妳爸爸，問妳。」\n底下一行，筆跡一樣，墨色比較新：「他們說不能應。媽媽想好了，這次妳叫，媽媽就應。」\n木牌頂端鑽了一個小孔，穿著一截紅線，線頭也是燒斷的。',
    after: '她在火災之後就決定了：隔年七月初一，她要回來，而且要應。',
  },
  camp: {
    title: '阿哲的地鋪',
    place: '四樓・西牆下',
    text: '西牆下鋪著睡墊和睡袋，枕頭是捲起來的外套。旁邊有泡麵碗、保溫瓶和三箱卡帶。阿哲在這裡睡了不只一晚。\n睡袋的拉鍊拉開一半，被子掀在一邊，像有人半夜被叫起來。\n錄音機放在枕頭旁，錄音鍵還壓著，紅燈亮著。帶子早就轉到底了。\n麥克風的線從錄音機拉出去，貼著地板繞過神壇，一路拉到暗道，從蓋板的縫塞了下去。他在錄門底下的聲音。',
  },
  register: {
    title: '郭師父的問者名冊',
    place: '四樓・西牆下的卡帶箱上',
    text: '硬殼名冊，封面是毛筆字：「慈雲寺借聲　問者名冊」。阿哲在裡面夾滿了藍色便條。\n一年一行：問者、亡者、要問的話、還了幾尊。每一行最後都蓋著一個紅色的「還」字。\n戊寅年：問者林美蘭，亡者林正雄，要問的話是「孩子的爸，你那邊冷不冷」。「還」那一格沒有蓋章，旁邊小字：紙人一尊，未書名。\n下一行換了一個人的字，一筆一畫寫得很工整：「己卯年七月初一　問者林美蘭　亡者（空白）　還：本人」。\n這一行也沒有蓋章。名冊到這裡就沒有了。阿哲的便條貼在旁邊：「這一行是她自己寫的。」',
    after: '美蘭阿姨隔年回來，自己填了名冊。借一聲，還一尊。她還的是自己。',
  },
  bucket: {
    title: '燒黑的鐵桶',
    place: '四樓・暗道東側',
    text: '暗道旁放著一個燒黑的鐵桶。桶腳壓著榮昌紙紮行的送貨單：「十月三十一日　還願紙人二十八尊　郭建成親送」。\n桶裡是燒剩的竹骨，一副一副疊著。手腳都燒完了，紙糊的臉卻一張都沒燒掉，五官是畫上去的，全都朝著暗道。\n桶底的灰被抹平，上面用手指寫著：「二十八尊都還了。它不收。」\n桶邊丟著一隻白色棉紗手套，裡面是空的。拇指那一截被撐得很長，長得不像人的手。',
    after: '郭建成終於自己進了山門，一次還了二十八尊。它一尊都沒有收。',
  },
  shoes: {
    title: '門前的一雙女鞋',
    place: '地下・神壇東側',
    text: '神壇東側整齊擺著一雙大人的女鞋，鞋尖朝著門。\n左腳那隻裡面放著一截剪斷的紅線，和補兔耳的是同一種。\n鞋墊上有原子筆的字，被腳跟磨得很淡：「小雨，媽媽這次有應。」\n只有走進去的這一雙，沒有走出來的。',
  },
};

export const ENDINGS = {
  // finale：結局卡片是演出之後的尾聲，不再重述剛剛玩過的事。memorial 是卡片最後一行。
  A: { name: '說好不說', subtitle: '結局 A · 約定仍在', text: '搜救隊問：「裡面還有沒有人？」\n你說：「都出來了。」\n和二十八年前一模一樣的四個字。這一次，沒有大人教你。\n\n沒有人下去地下。紅繩是你親手繫緊的，門後面那三個人，再也沒有人去找。\n阿哲的手機被你鎖進抽屜，電池一格一格掉光。佩珊打來，你沒有接。\n\n幾個月後，手機在 23:47 響起。來電顯示是你自己的名字。\n「你確定，出來的是你嗎？」', final: '你守住了那個約定。它也守住了你。', memorial: '這一次，連名字都沒有留下。' },
  B: { name: '替身', subtitle: '結局 B · 借來的聲音', text: '天亮以後，下山的那個人穿著你的外套，用你的聲音向搜救隊道謝，說裡面沒有別人了。\n他記得你的密碼、你母親的生日，也記得 23:47。\n\n你坐在第六張椅子上，紅布蓋著眼睛。每天晚上都有人點名，點到六，你的嘴就自己應一聲「有」。\n你想喊，喉嚨裡只剩一口香灰。\n\n他撥給佩珊：\n「我出來了。換妳了。」', final: '它終於有了自己的聲音。是你的。', memorial: '第六張椅子上，一直有人。' },
  C: { name: '把話說完', subtitle: '結局 C · 真結局', text: '天亮的時候，搜救隊從神壇後面那扇門抬出三個人。阿哲、志豪、柏翰靠牆坐成一排，都還有呼吸。\n阿哲醒來說的第一句話，是一個名字。\n\n計數器、門閂、被接回去的那一分鐘、阿哲的手機，你一樣一樣交出去，也一樣一樣說給人聽。二十八年前你塗掉的那張臉，你用鉛筆，一筆一筆描了回來。\n\n慈雲寺的佛像再也沒有蒙眼。地下那扇門開著，門口只剩一截剪斷的紅線。\n你右手掌心那道疤，到現在摸起來，還是燙的。', final: '這次，你沒有把她留下來。', memorial: '林小雨　1991－1998　她一直說，她還在。' },
};

// 目標欄與缺件清單只描述「看得見的物件」，不提前說出證物名稱。
const HINTS = {
  diary: ['檢查西桌上的計數器', '一樓・西側工作桌'],
  newspaper: ['檢查東桌上燒過的門框', '一樓・東側工作桌'],
  tape: ['播放阿哲搬來的舊錄音機', '二樓・西側樓梯旁'],
  ritual: ['查看經架前的三槽木盤', '二樓・西北經架前'],
  births: ['比對木尺架上的身高刻痕', '三樓・西北木尺架'],
  relic: ['到老樹下找石座上的布包', '西牆缺口外・老樹下'],
  names: ['調查西牆上的手印', '地下・封存室西牆'],
  confession: ['調查門前石座上的舊鎖', '地下・門前石座'],
};
export function hint(id) { const h = HINTS[id]; return h ? { id, title: h[0], location: h[1] } : { id, title: EVIDENCE[id].title, location: EVIDENCE[id].place }; }

export function newState() {
  // seen：已經演過的一次性演出（寺內恐怖段落、結局階段等）的 id，讓讀檔後不重演。由各演出自行寫入並呼叫 story.save()。
  return { version: 1, scene: 'temple', home: {step:0,notes:[],answered:false}, road: {step:0,notes:[]}, chapter: 1, evidence: ['photo'], notes: [], seen: [], pictures: [], flags: {}, answers: 0, deaths: 0, elapsed: 0, ending: null, position: null };
}
export function validateSave(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.evidence) || !raw.flags || typeof raw.flags !== 'object' || Array.isArray(raw.flags)) return null;
  const s = newState();
  s.scene = ['home','road','temple'].includes(raw.scene) ? raw.scene : 'temple';
  s.home.step = Number.isInteger(raw.home?.step) ? Math.max(0,Math.min(6,raw.home.step)) : 0;
  s.home.notes = Array.isArray(raw.home?.notes) ? [...new Set(raw.home.notes.filter(n=>['calendar','message','window'].includes(n)))] : [];
  s.home.answered = raw.home?.answered === true;
  s.road.step = Number.isInteger(raw.road?.step) ? Math.max(0,Math.min(5,raw.road.step)) : 0;
  s.road.notes = Array.isArray(raw.road?.notes) ? [...new Set(raw.road.notes.filter(n=>['car','kiln'].includes(n)))] : [];
  s.road.peishan = ['trust','question','silence'].includes(raw.road?.peishan) ? raw.road.peishan : null;
  s.evidence = [...new Set(['photo', ...raw.evidence.filter(id => typeof id==='string'&&Object.hasOwn(EVIDENCE,id))])];
  s.notes = Array.isArray(raw.notes) ? [...new Set(raw.notes.filter(id => typeof id==='string'&&Object.hasOwn(NOTES,id)))] : [];
  s.pictures = normalizePictures(raw.pictures);
  s.seen = Array.isArray(raw.seen) ? [...new Set(raw.seen.filter(id => typeof id==='string'&&/^[a-z][a-z0-9_:-]{0,39}$/.test(id)))].slice(0,64) : [];
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
// 可選讀物的開放時機：跟著章節走，避免提前說出還沒查到的名字（例如木牌上的「小雨」要等身高刻痕之後）。
const NOTE_OPEN = {
  log: (s) => s.flags.incense, robe: (s) => s.flags.incense, rulebook: (s) => s.flags.incense, flashlight: (s) => s.flags.incense,
  chalk: (s) => s.flags.stage, tablet: (s) => s.evidence.includes('births'),
  camp: (s) => s.flags.key, register: (s) => s.flags.key, bucket: (s) => s.flags.key,
  shoes: (s) => s.flags.underground,
};
/** 這份可選讀物現在能不能調查（只看劇情進度，不看讀過沒有）。 */
export function noteOpen(s, id) { return Object.hasOwn(NOTE_OPEN, id) && !!NOTE_OPEN[id](s); }
/** Optional readables never gate progress; returns true the first time one is read. */
export function readNote(s, id) {
  if (!Object.hasOwn(NOTES,id)) return false;
  s.notes ??= [];
  if (s.notes.includes(id)) return false;
  s.notes.push(id);
  return true;
}
export function trueEndingReady(s) { return Object.keys(EVIDENCE).every(id => s.evidence.includes(id)); }
export function missingEvidence(s) { return Object.keys(EVIDENCE).filter(id => !s.evidence.includes(id)); }
export function objectives(s) {
  if (s.flags.sent || s.flags.sealed) return [{ id: 'exit', title: '沿參道離開慈雲寺', location: '山門外' }];
  if (!s.flags.incense) return [{ id: 'incense', title: '調查仍在燃燒的三炷香', location: '一樓・正殿供桌' }];
  const clues = ['diary', 'newspaper', 'tape'].filter(id => !s.evidence.includes(id));
  if (clues.length) return clues.map(hint);
  if (!s.flags.stage) return [{ id: 'stage', title: '到舊戲台，查當年的點名', location: '廟埕東側・舊戲台' }];
  if (!s.flags.loopSolved) return [{ id: 'loopmark', title: '回二樓回廊，找紅線旁的記號', location: '二樓・西側回廊' }];
  if (!s.flags.key) return [{ id: 'divination', title: '擲筊，只問通往後殿的路', location: '二樓・中央供桌' }];
  if (!s.evidence.includes('death')) return [{ id: 'death', title: '到三樓找阿哲的手機', location: EVIDENCE.death.place }];
  if (!s.flags.underground) return [{ id: 'descent', title: '用銅鑰匙打開封住的暗道', location: '四樓・神壇東側' }];
  const truths = ['names', 'confession'].filter(id => !s.evidence.includes(id));
  if (truths.length) return truths.map(hint);
  return [{ id: 'altar', title: '在神壇前作出最後的選擇', location: '地下・中央神壇' }];
}
