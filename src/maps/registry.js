/** 可探索的地圖清單（大廳會依此產生選單） */
export const MAPS = [
  {id:'home',name:'未署名的信',subtitle:'住處・雨夜',available:true,intro:['2026 年 11 月 12 日・23:42','住處，書桌前'],load:()=>import('./home/index.js')},
  {id:'road',name:'沒有人等車',subtitle:'舊山路・慈雲里',available:true,intro:['2026 年 11 月 13 日・02:16','慈雲里舊山道'],load:()=>import('./road/index.js')},
  {
    id: 'temple',
    name: '慈雲寺',
    subtitle: '廢棄的廟宇 ・ 深夜',
    desc: '山腳下荒廢多年的四層大廟，西側緊鄰無人祭拜的亂葬崗。據說廟裡每一尊佛像的雙眼，都被人用紅布矇了起來。',
    tags: ['四層樓大殿', '亂葬崗', '探索'],
    thumb: 'assets/ui/temple.jpg',
    intro: ['2026 年 11 月 13 日・02:47', '慈雲寺 山門外'],
    available: true,
    load: () => import('./temple/index.js'),
  },
  { id: 'locked-1', name: '？？？', subtitle: '尚未開放', desc: '這個地點的資料仍被封存。', tags: [], available: false },
  { id: 'locked-2', name: '？？？', subtitle: '尚未開放', desc: '這個地點的資料仍被封存。', tags: [], available: false },
];
