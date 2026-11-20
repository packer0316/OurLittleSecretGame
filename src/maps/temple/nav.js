import { FLOORS, STAIRS, stairRect, PLINTH, COMPOUND, STEPS } from './layout.js';
import { createRoute } from '../../core/nav.js';

/**
 * 慈雲寺的方向提示路線（src/core/nav.js）。區域：
 *   approach 山門外參道 · court 廟埕（含古戲台）· grave 亂葬崗 · porch 大殿前廊（台基上）
 *   f1 f2 f3 一到三樓 · s0 s1 s2 三座樓梯（兩側有扶手，只能從兩端上下）
 *   t4n t4e t4w t4s 四樓露台的北、東、西、南側 · f4 四樓殿內 · under 地下封印室（只能用暗道／石階傳送）
 * 三樓上四樓的樓梯在殿的北側露台，殿門卻開在南面：露台要從東側繞過去。
 */
const HALL = FLOORS[0], ROOM = FLOORS[3];
const UP = 1.0; // 出入口的箭頭停在離地約 1 m 的地方
const inside = (p, r, mx = 0, mz = mx) => p.x > r.x1 - mx && p.x < r.x2 + mx && p.z > r.z1 - mz && p.z < r.z2 + mz;
const level = (y) => (y > 16.4 ? 3 : y > 11.4 ? 2 : y > 6.4 ? 1 : 0);
const RAMPS = STAIRS.map((s) => ({ ...s, rect: stairRect(s) }));

/** 樓梯一端往外 0.5 m、離地 1 m 的點：top=false 是下端，true 是上端 */
function stairEnd(s, top) {
  const dir = Math.sign(s.u1 - s.u0), u = top ? s.u1 + dir * 0.5 : s.u0 - dir * 0.5, v = (s.v1 + s.v2) / 2, y = (top ? s.y1 : s.y0) + UP;
  return s.axis === 'z' ? [v, y, u] : [u, y, v];
}

function zone(p) {
  if (p.x > 45) return 'under';
  for (let i = 0; i < RAMPS.length; i++) {
    const s = RAMPS[i];
    // 沿樓梯方向多算 0.6 m（站在第一階前），寬度方向只多 0.1 m（扶手外側不算）
    if (!inside(p, s.rect, s.axis === 'x' ? 0.6 : 0.1, s.axis === 'z' ? 0.6 : 0.1)) continue;
    const t = Math.min(1, Math.max(0, ((s.axis === 'z' ? p.z : p.x) - s.u0) / (s.u1 - s.u0)));
    if (Math.abs(p.y - (s.y0 + t * (s.y1 - s.y0))) < 1.4) return 's' + i; // 站在樓梯底下的人不算在樓梯上
  }
  if (inside(p, PLINTH) && p.y > 0.5) {
    const i = level(p.y);
    if (i === 0) return inside(p, HALL) ? 'f1' : 'porch';
    if (i === 1) return 'f2';
    if (i === 2) return 'f3';
    if (inside(p, ROOM)) return 'f4';
    return p.z > ROOM.z2 ? 't4s' : p.x > ROOM.x2 ? 't4e' : p.x < ROOM.x1 ? 't4w' : 't4n';
  }
  if (p.x < COMPOUND.x1) return 'grave';
  if (p.z > COMPOUND.z2) return 'approach';
  return 'court';
}

/** targets：storyWorld.targets（暗道與地下石階的位置取自那裡）；ground(x, z)：室外地面高度 */
export function createTempleRoute({ targets, ground = () => 0 }) {
  const at = (id) => targets.find((t) => t.id === id)?.position.toArray();
  const out = (x, z) => [x, ground(x, z) + UP, z];
  const stairs = ['上樓', '下樓'], terrace = { label: '露台', r: 2.2 };
  const links = [
    ['approach', 'court', out(0, COMPOUND.z2), { label: '山門', r: 2 }],
    ['court', 'grave', out(COMPOUND.x1, 0), { label: '西牆缺口', r: 2.2 }],
    ['court', 'porch', [0, 0.5 + UP, (STEPS.z1 + STEPS.z2) / 2], { label: '石階', r: 1.6 }],
    ['porch', 'f1', [0, HALL.y + UP, HALL.z2], { label: '殿門' }],
    ['f1', 's0', stairEnd(STAIRS[0], false), { label: stairs }],
    ['s0', 'f2', stairEnd(STAIRS[0], true), { label: stairs }],
    ['f2', 's1', stairEnd(STAIRS[1], false), { label: stairs }],
    ['s1', 'f3', stairEnd(STAIRS[1], true), { label: stairs }],
    ['f3', 's2', stairEnd(STAIRS[2], false), { label: stairs }],
    ['s2', 't4n', stairEnd(STAIRS[2], true), { label: stairs }],
    ['t4n', 't4e', [ROOM.x2 + 2.5, ROOM.y + UP, ROOM.z1 - 1.5], terrace],
    ['t4e', 't4s', [ROOM.x2 + 2.5, ROOM.y + UP, ROOM.z2 + 1.6], terrace],
    ['t4w', 't4s', [ROOM.x1 - 2.5, ROOM.y + UP, ROOM.z2 + 1.6], terrace],
    ['t4s', 'f4', [0, ROOM.y + UP, ROOM.z2], { label: '殿門' }],
  ];
  const down = at('descent'), back = at('return');
  if (down) links.push(['f4', 'under', down, { label: '暗道', stay: true, oneway: true }]);
  if (back) links.push(['under', 'f4', back, { label: '回四樓', stay: true, oneway: true }]);
  return createRoute({ zone, links });
}
