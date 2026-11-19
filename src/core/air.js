import * as THREE from 'three';

/**
 * 便宜的「空氣感」（氣氛組）。每一種都是單一 draw call、不受光、不投影：
 *   createAirDust   手電筒光束裡的浮塵；也可設定成地下室緩緩落下的灰
 *   createSmoke     香爐上方飄動的煙（朝向鏡頭的細長帶狀面）
 *   createGlassRain 窗玻璃上往下滑的雨痕
 */

/**
 * 浮塵：一組點在攝影機周圍的盒子裡循環，只有落在手電筒光錐裡（或給了 ambient）才看得見。
 * 加進場景後不必每幀呼叫任何東西；需要時改 dust.fall（下沉速度）與 dust.ambient（不靠手電筒的底色）。
 */
export function createAirDust(player, { count = 340, box = [9, 4.6, 9] } = {}) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * box[0]; pos[i * 3 + 1] = Math.random() * box[1]; pos[i * 3 + 2] = Math.random() * box[2];
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const uniforms = {
    time: { value: 0 }, box: { value: new THREE.Vector3(...box) }, cam: { value: new THREE.Vector3() },
    flashPos: { value: new THREE.Vector3() }, flashDir: { value: new THREE.Vector3(0, 0, -1) }, flashCos: { value: 0.8 },
    flashI: { value: 0 }, tint: { value: new THREE.Color(1, 0.93, 0.8) }, ambient: { value: new THREE.Color(0, 0, 0) },
    fall: { value: 0 }, px: { value: 600 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float time, flashCos, flashI, fall, px;
      uniform vec3 box, cam, flashPos, flashDir, tint, ambient;
      varying vec3 vCol;
      void main() {
        vec3 p = position;
        p.y -= time * (0.01 + fall) * (0.5 + seed);
        p.x += sin(time * 0.21 + seed * 40.0) * 0.3;
        p.z += cos(time * 0.17 + seed * 23.0) * 0.3;
        p = mod(p - cam, box) - box * 0.5 + cam; // 以攝影機為中心循環
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = max(0.05, -mv.z);
        vec3 L = p - flashPos;
        float dl = max(0.05, length(L));
        float cone = smoothstep(flashCos, mix(flashCos, 1.0, 0.5), dot(L / dl, flashDir));
        float beam = cone * flashI / (1.0 + dl * dl * 0.1);
        float edge = 1.0 - smoothstep(box.x * 0.33, box.x * 0.5, length(p.xz - cam.xz)); // 盒子邊緣淡出，看不到循環的跳動
        float twinkle = 0.55 + 0.45 * sin(time * (0.8 + seed * 2.4) + seed * 60.0); // 微粒翻轉時忽明忽暗
        vCol = (tint * beam + ambient) * edge * twinkle * smoothstep(0.2, 0.8, d);
        gl_PointSize = clamp(px * (0.005 + 0.009 * seed) / d, 1.0, 4.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() {
        float a = smoothstep(0.5, 0.08, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  const dust = { points, fall: 0, ambient: uniforms.ambient.value, strength: 1 };
  // 在真正要畫的那一刻才讀手電筒狀態，恐怖導演把手電筒壓暗時浮塵也會跟著暗
  points.onBeforeRender = (renderer, scene, camera) => {
    const f = player.flash;
    uniforms.time.value = player.time;
    uniforms.cam.value.copy(camera.position);
    uniforms.flashPos.value.copy(f.position);
    uniforms.flashDir.value.copy(f.target.position).sub(f.position).normalize();
    uniforms.flashCos.value = Math.cos(f.angle);
    uniforms.flashI.value = Math.min(1.2, f.intensity / (player.flashBase || 38)) * 0.55 * dust.strength;
    uniforms.fall.value = dust.fall;
    uniforms.px.value = renderer.getDrawingBufferSize(_size).y * 0.5 * camera.projectionMatrix.elements[5];
  };
  dust.dispose = () => { geo.dispose(); mat.dispose(); };
  return dust;
}
const _size = new THREE.Vector2();

/**
 * 香煙：每個點一條細長的帶子，越往上越寬、越晃、越淡，永遠轉向鏡頭。
 * spots: [[x, y, z], …]；回傳 { mesh, update(t), dispose() }。
 */
export function createSmoke(spots, { height = 1.9, width = 0.34, color = 0x8f8a84, opacity = 0.2 } = {}) {
  const SEG = 18, base = [], uv = [], seed = [], index = [];
  spots.forEach(([x, y, z], k) => {
    const o = k * (SEG + 1) * 2, s = Math.random();
    for (let i = 0; i <= SEG; i++) for (let j = 0; j < 2; j++) { base.push(x, y, z); uv.push(j, i / SEG); seed.push(s); }
    for (let i = 0; i < SEG; i++) { const a = o + i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += height + 1;
  const uniforms = { time: { value: 0 }, size: { value: new THREE.Vector2(width, height) }, tint: { value: new THREE.Color(color) }, opacity: { value: opacity } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float time; uniform vec2 size;
      varying vec2 vUv; varying float vSeed;
      void main() {
        vUv = uv; vSeed = seed;
        float h = uv.y;
        vec3 toCam = cameraPosition - position;
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
        float t = time * 0.55 + seed * 17.0;
        float sway = sin(h * 4.2 - t * 1.6) * 0.07 * h * h + sin(h * 9.5 - t * 2.9 + seed * 5.0) * 0.025 * h;
        float w = size.x * (0.05 + 0.95 * h * h);
        vec3 p = position + vec3(0.0, h * size.y, 0.0) + right * ((uv.x - 0.5) * w + sway);
        p.z += cos(h * 3.1 - t * 1.2) * 0.05 * h * h;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float time, opacity; uniform vec3 tint;
      varying vec2 vUv; varying float vSeed;
      void main() {
        float x = abs(vUv.x - 0.5) * 2.0;
        float strand = 0.6 + 0.4 * sin(vUv.x * 9.0 + vUv.y * 6.0 - time * 0.8 + vSeed * 30.0);
        float a = pow(1.0 - x, 1.6) * smoothstep(0.0, 0.07, vUv.y) * pow(1.0 - vUv.y, 1.25) * strand * opacity;
        gl_FragColor = vec4(tint, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 7;
  return { mesh, update: (t) => { uniforms.time.value = t; }, dispose: () => { geo.dispose(); mat.dispose(); } };
}

/**
 * 窗玻璃上的雨痕：一欄一欄的水珠往下滑、拖著細細的水痕，另有不動的小水珠。加色混合，只在暗處看得到反光。
 * 平面朝 +Z（面向室內）。回傳 { mesh, update(t), dispose() }。
 */
export function createGlassRain(w, h, { color = 0x9fb6c8, strength = 0.5 } = {}) {
  const uniforms = { time: { value: 0 }, tint: { value: new THREE.Color(color) }, strength: { value: strength }, aspect: { value: w / h } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float time, strength, aspect; uniform vec3 tint;
      varying vec2 vUv;
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float layer(vec2 uv, float cols, float speed, float seed) {
        float col = floor(uv.x * cols);
        float r = hash(vec2(col, seed));
        if (r < 0.45) return 0.0; // 不是每一欄都有水
        float fx = fract(uv.x * cols) - 0.5 + (hash(vec2(col, seed + 3.0)) - 0.5) * 0.5;
        fx += sin(uv.y * 23.0 + r * 40.0) * 0.07; // 水痕不是直線
        float cyc = uv.y * (0.5 + r) + time * speed * (0.35 + r) + r * 9.0;
        float head = fract(cyc); // 0 = 水珠所在，往上是拖出的水痕
        float stick = 0.5 + 0.5 * sin(floor(cyc) * 12.9 + time * 0.7); // 走走停停
        float drop = smoothstep(0.34, 0.0, length(vec2(fx, (head - 0.03) * cols / aspect)));
        float trail = smoothstep(0.1, 0.0, abs(fx)) * smoothstep(0.0, 0.04, head) * pow(1.0 - head, 5.0) * 0.7;
        return (drop * 0.45 + trail) * (0.4 + 0.6 * stick);
      }
      void main() {
        float a = layer(vUv, 38.0, 0.16, 1.0) + layer(vUv + 0.37, 61.0, 0.24, 7.0) * 0.6;
        vec2 g = vUv * vec2(90.0 * aspect, 90.0);
        float dots = step(0.955, hash(floor(g))) * smoothstep(0.42, 0.1, length(fract(g) - 0.5)) * 0.16; // 靜止的小水珠
        gl_FragColor = vec4(tint * (a + dots) * strength, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = 4;
  return { mesh, update: (t) => { uniforms.time.value = t; }, dispose: () => { mesh.geometry.dispose(); mat.dispose(); } };
}
