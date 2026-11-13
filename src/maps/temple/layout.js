/**
 * 廢棄廟宇地圖配置（單位：公尺）
 * 座標：+X 東、-X 西（亂葬崗方向）、-Z 北（廟宇深處）、+Z 南（入口）
 */

// 四層樓的大殿，每層往內縮，形成樓閣式輪廓
export const FLOORS = [
  { name: '一樓・大雄寶殿', y: 0.9, h: 6.0, x1: -20, x2: 20, z1: -34, z2: -12 },
  { name: '二樓・萬佛殿', y: 6.9, h: 5.0, x1: -17.5, x2: 17.5, z1: -32, z2: -14 },
  { name: '三樓・地藏殿', y: 11.9, h: 5.0, x1: -15, x2: 15, z1: -30, z2: -16 },
  { name: '四樓・封印之間', y: 16.9, h: 4.5, x1: -10, x2: 10, z1: -27, z2: -19.2 },
];
export const WALL_T = 0.4;
export const SLAB = 0.3;

// 台基與正面石階
export const PLINTH = { x1: -22.5, x2: 22.5, z1: -36.5, z2: -7.5, y: 0.9 };
export const STEPS = { x1: -7, x2: 7, z1: -7.5, z2: -5.25, n: 6 };

// 樓梯：axis 為延伸方向，u0→u1 由低到高，v1~v2 為寬度範圍
export const STAIRS = [
  { axis: 'z', u0: -27, u1: -17, v1: -17, v2: -15.2, y0: 0.9, y1: 6.9 }, // 1F→2F（西側）
  { axis: 'z', u0: -18, u1: -26.5, v1: 12.6, v2: 14.4, y0: 6.9, y1: 11.9 }, // 2F→3F（東側）
  { axis: 'x', u0: -8.5, u1: 0, v1: -29.5, v2: -27.8, y0: 11.9, y1: 16.9 }, // 3F→4F 露台（北側）
];
export function stairRect(s) {
  return s.axis === 'z'
    ? { x1: s.v1, x2: s.v2, z1: Math.min(s.u0, s.u1), z2: Math.max(s.u0, s.u1) }
    : { x1: Math.min(s.u0, s.u1), x2: Math.max(s.u0, s.u1), z1: s.v1, z2: s.v2 };
}

// 圍牆、山門、西牆缺口（通往亂葬崗）
export const COMPOUND = { x1: -30, x2: 30, z1: -41, z2: 22, wallH: 2.8, wallT: 0.55 };
export const GATE = { halfW: 2.0, z: 22 };
export const BREACH = { z1: -3.2, z2: 3.2 };

export const GRAVEYARD = { x1: -80, x2: -33, z1: -42, z2: 36 };
export const PIT = { x: -47, z: 9 }; // 塌陷的墳
export const BOUNDS = { x1: -84, x2: 37, z1: -47, z2: 54 };
export const SPAWN = { x: 0, z: 49, yaw: 0 };

// 月亮方向（位於廟宇後方偏西，讓廟成為逆光剪影）
export const MOON_DIR = [-0.42, 0.58, -0.7];
export const FOG_COLOR = 0x070a10;
