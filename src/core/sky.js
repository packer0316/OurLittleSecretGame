import * as THREE from 'three';

/** 程序化夜空：星星、月亮、流動的雲層，地平線融入霧色 */
export function createNightSky({ moonDir, fogColor }) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      moonDir: { value: moonDir.clone().normalize() },
      fogColor: { value: new THREE.Color(fogColor) },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 moonDir;
      uniform vec3 fogColor;
      uniform float time;
      float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      // 整數雜湊：浮點版在部分顯示卡（ANGLE / D3D11）上，同一個格點從相鄰兩格算出來的值不一致，
      // 雲層會沿著格線裂出一條筆直的邊。整數運算每次結果都相同。
      float hash12(vec2 p) {
        uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
        uint n = (q.x ^ q.y) * 1597334673u;
        return float(n >> 8) * (1.0 / 16777215.0);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(vec3(0.018, 0.026, 0.045), vec3(0.003, 0.005, 0.012), pow(h, 0.55));
        // 星星
        vec3 sp = d * 190.0;
        vec3 ip = floor(sp);
        float r = hash13(ip);
        float tw = 0.65 + 0.35 * sin(time * 1.7 + r * 90.0);
        float star = step(0.9962, r) * smoothstep(0.45, 0.0, length(fract(sp) - 0.5)) * tw;
        col += star * vec3(0.75, 0.82, 1.0) * 0.55 * smoothstep(0.02, 0.35, d.y);
        // 月亮
        float md = dot(d, moonDir);
        float disc = smoothstep(0.99935, 0.99962, md);
        float crater = 0.72 + 0.28 * fbm(d.xy * 55.0 + d.z * 21.0);
        col += disc * vec3(1.9, 1.85, 1.7) * crater;
        col += pow(max(md, 0.0), 420.0) * vec3(0.30, 0.36, 0.48) * 0.7;
        col += pow(max(md, 0.0), 14.0) * vec3(0.022, 0.03, 0.048);
        // 雲
        vec2 cuv = d.xz / (d.y + 0.22) * 1.1 + vec2(time * 0.006, time * 0.0025);
        float c = fbm(cuv);
        float cover = smoothstep(0.42, 0.78, c);
        vec3 cloudCol = vec3(0.010, 0.014, 0.022) + pow(max(md, 0.0), 5.0) * vec3(0.10, 0.125, 0.17) * (0.4 + c);
        col = mix(col, cloudCol, cover * 0.9 * smoothstep(-0.02, 0.18, d.y));
        // 地平線融入霧
        col = mix(fogColor, col, smoothstep(-0.03, 0.22, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (renderer, scene, camera) => { mesh.position.copy(camera.position); mesh.updateMatrixWorld(); };
  return { mesh, update: (t) => { mat.uniforms.time.value = t; } };
}
