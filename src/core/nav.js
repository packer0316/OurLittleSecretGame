import * as THREE from 'three';

/**
 * 方向提示的路線。地圖切成幾個「區域」，區域之間以出入口（門、樓梯兩端、山門、牆的缺口……）相連。
 * route(from, to) 回傳玩家下一步該走向的點：和目標同一區時就是目標本身，否則是往目標那條路上的下一個出入口。
 *
 *   zone(p)   位置 → 區域名稱
 *   links     [a, b, [x, y, z], opts]：a、b 兩區經過這個點相通（預設雙向）。點的高度取「顯示箭頭的高度」，約離地 1 m。
 *     opts.label   箭頭上的字；給 [a→b, b→a] 兩個字串時依方向不同（例如樓梯的上樓／下樓）
 *     opts.r       走到這個點多近（水平距離）就改指下一個點，預設 1.4 m
 *     opts.stay    要按 E 才會傳送過去的點（暗道、地下石階）：走到旁邊也不跳過
 *     opts.oneway  只能 a→b
 */
export function createRoute({ zone, links, near = 1.4 }) {
  const adj = new Map();
  const add = (a, b, link) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, link }); };
  for (const [a, b, p, o = {}] of links) {
    const [ab, ba] = Array.isArray(o.label) ? o.label : [o.label || '', o.label || ''];
    const base = { point: new THREE.Vector3(...p), r: o.r ?? near, stay: !!o.stay };
    add(a, b, { ...base, label: ab });
    if (!o.oneway) add(b, a, { ...base, label: ba });
  }
  // 區域只有十幾個：每一組起訖只做一次廣度優先搜尋，之後查表
  const cache = new Map();
  function path(a, b) {
    const key = a + '>' + b;
    if (cache.has(key)) return cache.get(key);
    const prev = new Map([[a, null]]), queue = [a];
    while (queue.length) {
      const z = queue.shift();
      if (z === b) break;
      for (const e of adj.get(z) || []) if (!prev.has(e.to)) { prev.set(e.to, { from: z, link: e.link }); queue.push(e.to); }
    }
    let hops = null;
    if (prev.has(b)) { hops = []; for (let z = b; prev.get(z); z = prev.get(z).from) hops.unshift(prev.get(z).link); }
    cache.set(key, hops);
    return hops;
  }
  const out = { point: new THREE.Vector3(), label: '', via: false };
  return function route(from, to) {
    const a = zone(from), b = zone(to);
    const hops = a && b && a !== b ? path(a, b) : null;
    if (hops) for (const l of hops) {
      // 已經走到這個出入口旁邊（同一層、水平距離夠近）就直接指下一個，免得箭頭指著自己腳下
      const close = Math.hypot(l.point.x - from.x, l.point.z - from.z) < l.r && Math.abs(l.point.y - from.y) < 2.6;
      if (l.stay || !close) { out.point.copy(l.point); out.label = l.label; out.via = true; return out; }
    }
    out.point.copy(to); out.label = ''; out.via = false;
    return out;
  };
}
