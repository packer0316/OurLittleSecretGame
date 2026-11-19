import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * 最終後製（單一 pass、三次取樣）：調色、底片顆粒、色散、暗角，
 * 以及恐怖導演逐幀寫入的三個強度（共同簡報的合約 C，預設 0、值域 0..1）：
 *   dread  持續的壓迫感：暗角加重、去飽和、顆粒變粗、視野邊緣往內擠並緩慢蠕動
 *   glitch 瞬間的畫面撕裂：橫向錯位、色版分離、粗雜訊（鬼出現或消失的那幾幀）
 *   pulse  心跳：暗角隨數值收緊，畫面微微放大
 * 光敏安全：這裡沒有任何全螢幕的明暗閃爍。glitch 只移動畫面內容與加雜訊，撕裂圖樣每秒換 11 次、
 * 最多影響三分之一的橫帶；pulse 只壓暗邊緣，頻率由呼叫端決定（請維持每秒 3 次以下）。
 */
export const FilmShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 },
    grain: { value: 0.03 }, vignette: { value: 0.9 }, aberration: { value: 0.0012 },
    dread: { value: 0 }, glitch: { value: 0 }, pulse: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, grain, vignette, aberration, dread, glitch, pulse;
    varying vec2 vUv;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      float dr = clamp(dread, 0.0, 1.0), gt = clamp(glitch, 0.0, 1.0), pu = clamp(pulse, 0.0, 1.0);
      vec2 c = vUv - 0.5;
      float d2 = dot(c, c);
      // 邊緣往中心擠（取樣點只會往內移，不會取到畫面外），壓迫感越高擠得越多，並帶一點緩慢的蠕動
      vec2 uv = vUv - c * d2 * (0.085 * dr + 0.03 * pu);
      uv += vec2(sin(c.y * 11.0 + time * 1.3), cos(c.x * 9.0 - time * 1.1)) * d2 * dr * 0.007;
      // 橫向撕裂：畫面切成不等高的橫帶，其中幾條左右錯位
      float tick = floor(time * 11.0);
      float band = floor(vUv.y * mix(9.0, 34.0, hash(vec2(tick, 3.7))));
      float torn = step(1.0 - 0.34 * gt, hash(vec2(band, tick))) * gt;
      uv.x += torn * (hash(vec2(band * 1.7, tick + 9.0)) - 0.5) * 0.11;
      // 色散：平時極輕，壓迫與撕裂時加重
      vec2 off = c * d2 * (aberration * (1.0 + 2.2 * dr) + 0.002 * pu) * 4.0 + vec2((0.0035 + 0.006 * torn) * gt, 0.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      // 調色：略為去飽和；暗部偏冷青、亮部留住燭火的暖
      col = mix(vec3(l), col, 0.88 - 0.42 * dr);
      col *= mix(vec3(0.90, 0.98, 1.10), vec3(1.03, 1.0, 0.95), smoothstep(0.0, 0.55, l));
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.08 + 0.2 * dr);
      // 顆粒：暗部較明顯；壓迫時顆粒變粗變重
      float cell = 1.0 + 1.6 * dr + 2.0 * gt;
      float n = hash(floor(gl_FragCoord.xy / cell) + fract(time * 7.13) * 913.0) - 0.5;
      col += n * grain * (1.0 + 1.8 * dr + 4.0 * gt) * (0.35 + 0.65 * (1.0 - l));
      col *= 1.0 - 0.12 * gt * step(0.5, fract(gl_FragCoord.y * 0.5));
      // 暗角與心跳
      float edge = smoothstep(0.14 - 0.08 * dr, 0.7, d2);
      col *= 1.0 - min(0.96, edge * 0.6 * (vignette * (1.0 + 0.7 * dr) + 0.9 * pu));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

/**
 * 建立最終後製 pass。Game 以 game.film 持有它並每幀寫入 uniforms.time。
 * 其他系統（例如恐怖導演）只透過 game.film.uniforms.<name>.value 調整強度；
 * 畫質切換會重建 pass，所以要持續作用的值請每幀寫入。
 */
export function createFilmPass() {
  return new ShaderPass(FilmShader);
}
