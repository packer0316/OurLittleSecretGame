import * as THREE from 'three';

// 箭頭圖形：中心在 (0,0)，尖端朝下（+y）在 (0,13)；上面一道細的折線是「往下指」的拖影。畫面上放大 1.375 倍
const SCALE = 1.375;
const ARROW = `<svg class="wp-arrow" viewBox="-14 -16 28 32" width="${28 * SCALE}" height="${32 * SCALE}" aria-hidden="true">`
  + '<path class="wp-trail" d="M-6 -13.5 L0 -9 L6 -13.5"/>'
  + '<path class="wp-head" d="M0 13 L-10.5 -5 L0 0 L10.5 -5 Z"/></svg>';
const TIP = 13 * SCALE;
const smooth = (t) => t * t * (3 - 2 * t);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * 方向提示箭頭（HUD）。一直留在畫面上告訴玩家往哪走：
 *   目標在畫面內：箭頭停在目標正上方，尖端由上往下指著它，上方標示距離（經過出入口時加上「上樓」「殿門」等字）。
 *   目標在畫面外或身後：箭頭貼著畫面邊緣，尖端指向該轉過去的方向。
 * 兩種狀態之間平滑過渡。每一幀呼叫 update(dt, goal, from)；goal = { point, label, danger } 或 null（淡出）。
 */
export function createWaypoint(el, camera) {
  el.className = 'waypoint';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="wp-rot">${ARROW}</div><span class="wp-label"></span>`;
  const rot = el.firstElementChild, label = el.lastElementChild;
  const cam = new THREE.Vector3(), ndc = new THREE.Vector3(), lastFrom = new THREE.Vector3();
  let W = innerWidth, H = innerHeight;
  const onResize = () => { W = innerWidth; H = innerHeight; };
  addEventListener('resize', onResize);
  // alpha 整體淡入淡出；on 0→1 是「貼邊」→「停在目標上方」；side 目標在正後方時維持上一次的左右邊
  let alpha = 0, on = 0, side = 1, ex = 0, ey = 0, ea = 0, ox = 0, oy = 0, fresh = true, visible = false, text = '', danger = false;

  function setVisible(v) { if (v !== visible) { visible = v; el.style.visibility = v ? 'visible' : 'hidden'; } }

  function update(dt, goal, from) {
    const step = Math.min(Math.max(dt, 0), 0.1), k = (rate) => 1 - Math.exp(-rate * step);
    alpha += ((goal ? 1 : 0) - alpha) * k(goal ? 5 : 10);
    if (!goal) {
      if (alpha < 0.01) { setVisible(false); fresh = true; } else el.style.opacity = (alpha * (0.9 + 0.1 * smooth(on))).toFixed(3);
      return;
    }
    setVisible(true);
    if (from) { if (lastFrom.distanceToSquared(from) > 16) fresh = true; lastFrom.copy(from); } // 傳送後不要從舊位置滑過來

    camera.updateMatrixWorld();
    cam.copy(goal.point).applyMatrix4(camera.matrixWorldInverse); // 相機座標：+x 右、+y 上、-z 前方
    const front = cam.z < -0.05;
    const dist = from ? from.distanceTo(goal.point) : cam.length();
    // 箭頭只能待在這個框裡：避開左上的目標欄、下方的字幕與提示
    const L = Math.max(64, W * 0.05), R = W - L, T = Math.max(110, H * 0.14), B = H - Math.max(96, H * 0.13);
    const cx = W / 2, cy = H / 2;

    // 目標在畫面上的位置；箭頭中心擺在它上方，越近抬得越高，免得壓在物件上
    let onScreen = false;
    if (front) {
      ndc.copy(cam).applyMatrix4(camera.projectionMatrix);
      const sx = (ndc.x * 0.5 + 0.5) * W, sy = (-ndc.y * 0.5 + 0.5) * H;
      ox = sx; oy = sy - TIP - 10 - 30 / Math.max(1, dist);
      onScreen = ox >= L && ox <= R && oy >= T && oy <= B;
    }

    // 貼邊的方向：前方用投影位置；身後改用相機座標的左右（正後方時維持原本那一側）
    let dx, dy;
    if (front) { dx = ox - cx; dy = oy - cy; if (Math.abs(dx) > W * 0.02) side = Math.sign(dx); }
    else {
      if (Math.abs(cam.x) > 0.25 * Math.abs(cam.z)) side = Math.sign(cam.x);
      dx = side; dy = Math.max(-0.35, Math.min(0.35, -cam.y / (Math.hypot(cam.x, cam.z) + 1e-3)));
    }
    if (Math.abs(dx) + Math.abs(dy) < 1e-6) { dx = 0; dy = 1; }
    const tx = dx > 0 ? (R - cx) / dx : dx < 0 ? (L - cx) / dx : Infinity;
    const ty = dy > 0 ? (B - cy) / dy : dy < 0 ? (T - cy) / dy : Infinity;
    const t = Math.min(tx, ty), edgeX = cx + dx * t, edgeY = cy + dy * t;
    const edgeA = Math.atan2(-dx, dy); // CSS rotate：0 是尖端朝下

    if (fresh) { ex = edgeX; ey = edgeY; ea = edgeA; on = onScreen ? 1 : 0; fresh = false; }
    else { const a = k(12); ex += (edgeX - ex) * a; ey += (edgeY - ey) * a; ea = wrap(ea + wrap(edgeA - ea) * k(12)); }
    on += ((onScreen ? 1 : 0) - on) * k(9);
    const e = smooth(Math.min(1, Math.max(0, on)));
    // 停在目標上方時完全跟著目標（不延遲）；貼邊時才平滑滑動
    const x = ex + (ox - ex) * e, y = ey + (oy - ey) * e, angle = ea * (1 - e);

    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    rot.style.transform = `rotate(${angle.toFixed(4)}rad)`;
    el.style.opacity = (alpha * (0.9 + 0.1 * e)).toFixed(3);
    label.style.opacity = (0.75 + 0.25 * e).toFixed(3);
    const next = `${goal.label ? goal.label + ' · ' : ''}${Math.max(1, Math.round(dist))} m`;
    if (next !== text) { text = next; label.textContent = next; }
    if (!!goal.danger !== danger) { danger = !!goal.danger; el.classList.toggle('danger', danger); }
  }

  function dispose() { removeEventListener('resize', onResize); }
  return { update, dispose };
}
