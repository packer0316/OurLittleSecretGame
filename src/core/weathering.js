import * as THREE from 'three';

/**
 * 風化疊層：在既有 PBR 材質上，以「世界座標」再疊一層大尺度的髒污。
 * 不增加 draw call、不增加幾何，只多兩次小貼圖取樣：
 *   - 大塊色差（讓整面牆／地板不再是同一塊貼圖重複）
 *   - 垂直水痕（雨水、滲水從上往下流）
 *   - 牆腳的潮濕與霉（依樓層高度，自動貼著每一層的地面）
 *   - 朝上表面的積塵
 *   - 地面低窪處的積水（粗糙度降低、顏色變深、法線變平）
 *   - 天花板下緣的煤煙
 * 用法：weather(material, { blotch, streak, damp, dust, wet, soot, levels, ... })
 */

let maskTex = null;

/** 256² 可無縫重複的遮罩：R 大塊雲霧、G 中頻雜訊（水痕／邊緣）、B 細碎斑點 */
export function weatherMask() {
  if (maskTex) return maskTex;
  const S = 256, data = new Uint8Array(S * S * 4);
  const hash = (x, y, s) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // 週期性 value noise：格點座標對 period 取餘數，貼圖才能無縫重複
  const noise = (x, y, period, seed) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const w = (v) => ((v % period) + period) % period;
    const a = hash(w(ix), w(iy), seed), b = hash(w(ix + 1), w(iy), seed), c = hash(w(ix), w(iy + 1), seed), d = hash(w(ix + 1), w(iy + 1), seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (u, v, base, oct, seed) => {
    let amp = 0.5, f = base, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += amp * noise(u * f, v * f, f, seed + i * 17); n += amp; amp *= 0.5; f *= 2; }
    return s / n;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = (y * S + x) * 4;
    const r = fbm(u, v, 3, 5, 11);
    const g = fbm(u, v, 8, 4, 53);
    const b = 1 - Math.abs(fbm(u, v, 12, 3, 97) * 2 - 1); // 脊狀：細裂紋與斑點
    data[i] = Math.max(0, Math.min(255, (r - 0.5) * 1.9 * 255 + 128));
    data[i + 1] = Math.max(0, Math.min(255, (g - 0.5) * 1.9 * 255 + 128));
    data[i + 2] = Math.max(0, Math.min(255, Math.pow(b, 3) * 255));
    data[i + 3] = 255;
  }
  maskTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  maskTex.wrapS = maskTex.wrapT = THREE.RepeatWrapping;
  maskTex.magFilter = THREE.LinearFilter;
  maskTex.minFilter = THREE.LinearMipmapLinearFilter;
  maskTex.generateMipmaps = true;
  maskTex.colorSpace = THREE.NoColorSpace;
  maskTex.needsUpdate = true;
  return maskTex;
}

const VERT_DECL = /* glsl */ `
varying vec3 wxPos;
varying vec3 wxNrm;
`;
const VERT_BODY = /* glsl */ `
{
  vec4 wxP = vec4(transformed, 1.0);
  vec3 wxN = objectNormal;
  #ifdef USE_INSTANCING
    wxP = instanceMatrix * wxP;
    wxN = mat3(instanceMatrix) * wxN;
  #endif
  wxPos = (modelMatrix * wxP).xyz;
  wxNrm = normalize(mat3(modelMatrix) * wxN);
}
`;
const FRAG_DECL = /* glsl */ `
varying vec3 wxPos;
varying vec3 wxNrm;
uniform sampler2D wxMask;
uniform vec4 wxScale;   // x 大塊, y 水痕橫向, z 水痕縱向, w 細節
uniform vec4 wxAmt;     // x 色差, y 水痕, z 牆腳潮濕, w 積塵
uniform vec4 wxWet;     // x 積水量, y 積水粗糙度, z 積水門檻, w 天花板煤煙
uniform vec3 wxDampTint;
uniform vec3 wxDustTint;
uniform vec3 wxSootTint;
uniform float wxDampH;
uniform float wxCeil;   // 樓層淨高（計算天花板煤煙用）
uniform float wxFlat;   // 積水處把法線壓平的程度
uniform float wxLevels[6];
uniform vec4 wxRects[6];  // 每個地面高度適用的範圍 (x1, z1, x2, z2)
`;
const FRAG_COLOR = /* glsl */ `
vec3 wxAn = abs(wxNrm);
float wxWall = 1.0 - smoothstep(0.35, 0.75, wxAn.y);
vec2 wxUvW = wxAn.x > wxAn.z ? vec2(wxPos.z + wxPos.x * 0.37, wxPos.y) : vec2(wxPos.x + wxPos.z * 0.37, wxPos.y);
vec2 wxUvB = mix(wxPos.xz, wxUvW, step(0.5, wxWall));
vec3 wxA = texture2D(wxMask, wxUvB * wxScale.x).rgb;
vec3 wxB = texture2D(wxMask, wxUvB * wxScale.w + wxA.rg * 0.21).rgb;
float wxBlotch = wxA.r * 0.62 + wxB.r * 0.38;
// 1) 大尺度色差
diffuseColor.rgb *= clamp(mix(1.0, 0.38 + 1.25 * wxBlotch, wxAmt.x), 0.0, 1.18);
// 2) 垂直水痕
float wxSt = texture2D(wxMask, vec2(wxUvW.x * wxScale.y, wxUvW.y * wxScale.z) + wxA.gb * 0.04).g;
float wxStreak = smoothstep(0.52, 0.86, wxSt) * wxWall * smoothstep(0.28, 0.6, wxA.g + wxB.b * 0.3);
diffuseColor.rgb *= 1.0 - wxAmt.y * wxStreak * 0.62;
// 3) 牆腳潮濕與霉：取所在樓層地面以上的高度
float wxH = 1000.0;
float wxUp = 1000.0;
for (int i = 0; i < 6; i++) {
  float d = wxPos.y - wxLevels[i];
  vec4 rc = wxRects[i];
  if (d > -0.06 && wxPos.x > rc.x && wxPos.x < rc.z && wxPos.z > rc.y && wxPos.z < rc.w) wxH = min(wxH, d);
}
wxUp = wxCeil - wxH;
float wxEdge = wxDampH * (0.35 + 1.3 * wxA.g) * (0.7 + 0.6 * wxB.r);
float wxDamp = (1.0 - smoothstep(0.0, max(wxEdge, 0.001), wxH)) * wxWall;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * wxDampTint, wxDamp * wxAmt.z);
// 4) 天花板下緣的煤煙
float wxSoot = (1.0 - smoothstep(0.0, 1.5 + 1.6 * wxA.r, wxUp)) * wxWall * step(0.0, wxUp) * wxWet.w;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * wxSootTint, wxSoot);
// 5) 朝上表面的積塵
float wxDust = smoothstep(0.55, 0.96, wxNrm.y) * wxAmt.w * (0.45 + 0.75 * wxB.g);
diffuseColor.rgb = mix(diffuseColor.rgb, wxDustTint, clamp(wxDust, 0.0, 1.0));
// 6) 積水：地面上大塊遮罩偏低的區域，或牆腳滲水
float wxPuddle = smoothstep(wxWet.z + 0.1, wxWet.z - 0.1, wxBlotch) * (1.0 - wxWall) * step(0.0, wxNrm.y);
float wxWetMask = clamp(wxPuddle + wxDamp * 0.55 * step(0.001, wxAmt.z), 0.0, 1.0) * wxWet.x;
diffuseColor.rgb *= 1.0 - 0.42 * wxWetMask;
`;
const FRAG_ROUGH = /* glsl */ `
roughnessFactor = mix(roughnessFactor, wxWet.y, wxWetMask * wxWetMask);
roughnessFactor = clamp(roughnessFactor + (wxBlotch - 0.5) * 0.22 * wxAmt.x, 0.04, 1.0);
`;
const FRAG_NORMAL = /* glsl */ `
normal = normalize(mix(normal, nonPerturbedNormal, clamp(wxWetMask * 1.6, 0.0, 1.0) * wxFlat));
`;

/**
 * @param {THREE.MeshStandardMaterial} mat
 * @param {object} o
 *   blotch 0..1 大塊色差；streak 0..1 垂直水痕；damp 0..1 牆腳潮濕；dust 0..1 積塵；
 *   wet 0..1 積水量；wetRough 積水處粗糙度；wetLevel 積水門檻（越大積水越多）；soot 0..1 天花板煤煙；
 *   levels 各層地面高度（最多 6 個）；dampH 潮濕帶高度；ceil 樓層淨高；
 *   scale 大塊尺度（公尺）、fine 細節尺度（公尺）
 */
export function weather(mat, o = {}) {
  // levels 的每一項可以是數字（到處適用），或 { y, rect: [x1, z1, x2, z2] }（只在該範圍內適用）
  const src = (o.levels || [0]).slice(0, 6);
  const levels = src.map((l) => (typeof l === 'number' ? l : l.y));
  const rects = src.map((l) => (typeof l === 'number' || !l.rect ? new THREE.Vector4(-1e6, -1e6, 1e6, 1e6) : new THREE.Vector4(...l.rect)));
  while (levels.length < 6) { levels.push(-9999); rects.push(new THREE.Vector4(0, 0, -1, -1)); }
  const scale = o.scale || 9, fine = o.fine || 2.3;
  const u = {
    wxMask: { value: weatherMask() },
    wxScale: { value: new THREE.Vector4(1 / scale, 1 / (o.streakW || 1.7), 1 / (o.streakL || 14), 1 / fine) },
    wxAmt: { value: new THREE.Vector4(o.blotch ?? 0.5, o.streak ?? 0.5, o.damp ?? 0.6, o.dust ?? 0) },
    wxWet: { value: new THREE.Vector4(o.wet ?? 0, o.wetRough ?? 0.12, o.wetLevel ?? 0.4, o.soot ?? 0) },
    wxDampTint: { value: new THREE.Color(o.dampTint ?? 0x5f6a4c) },
    wxDustTint: { value: new THREE.Color(o.dustTint ?? 0x6b6457) },
    wxSootTint: { value: new THREE.Color(o.sootTint ?? 0x3a322c) },
    wxDampH: { value: o.dampH ?? 0.8 },
    wxCeil: { value: o.ceil ?? 1000 },
    wxFlat: { value: o.flatten ?? 0.85 },
    wxLevels: { value: levels },
    wxRects: { value: rects },
  };
  mat.userData.weather = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL);
  };
  mat.customProgramCacheKey = () => 'weather-v3';
  mat.needsUpdate = true;
  return mat;
}
