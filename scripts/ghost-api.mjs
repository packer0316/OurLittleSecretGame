// 鬼模型合約 E 的自動檢查（ghost 小組）。需要共用測試伺服器 http://127.0.0.1:5178/。
// 用法：node scripts/ghost-api.mjs    結果另存 artifacts/ghost/api-results.json
// 檢查每個變體的介面、初始狀態、姿勢、追視、抽搐、淡出、多實例、釋放，以及模型的體積與三角形數。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

fs.mkdirSync('artifacts/ghost', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let results = [];
try {
  await page.goto('http://127.0.0.1:5178/?auto&map=temple');
  await page.waitForFunction(() => window.__game?.story && window.__game.running, null, { timeout: 240000 });
  results = await page.evaluate(async () => {
    const g = window.__game, out = [];
    const { createGhost } = await import('/src/maps/temple/ghost.js');
    const src = await (await fetch('/src/maps/temple/ghost.js')).text();
    const THREE = await import(/from "([^"]*three[^"]*)"/.exec(src)[1]);
    const check = (name, fn) => { try { const info = fn(); out.push({ name, pass: true, info }); } catch (e) { out.push({ name, pass: false, error: String(e.message || e) }); } };
    const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
    const METHODS = ['update', 'setPose', 'setFade', 'lookAt', 'setGlitch'];
    const POSES = ['idle', 'reach', 'crawl', 'bowed', 'peek', 'peekR', 'sit', '不存在的姿勢'];
    const v = new THREE.Vector3(), box = new THREE.Box3(), b2 = new THREE.Box3();
    const bounds = (ghost) => {
      box.makeEmpty(); ghost.root.updateMatrixWorld(true);
      ghost.root.traverse((o) => { if (o.isSkinnedMesh && o.visible) { o.computeBoundingBox(); box.union(b2.copy(o.boundingBox).applyMatrix4(o.matrixWorld)); } });
      return box;
    };
    const finite = (ghost) => Object.values(ghost.bones).every((b) => b.getWorldPosition(v).toArray().every(Number.isFinite));
    const size = (await (await fetch('/assets/models/ghost_woman/ghost_woman.glb')).arrayBuffer()).byteLength;
    check('ghost_woman.glb 小於 5 MB', () => { assert(size < 5 * 1048576, `${size} bytes`); return `${(size / 1048576).toFixed(2)} MB`; });
    const cases = [['woman', g.assets], ['shadow', g.assets], ['child', g.assets], ['woman（沒有掃描模型時的回退）', { models: {}, animations: {} }], ['不認得的變體', g.assets]];
    for (const [label, assets] of cases) {
      const variant = label.split('（')[0];
      let a, b;
      check(`${label}：建立兩個實例、介面齊全、初始不可見`, () => {
        a = createGhost(assets, { variant }); b = createGhost(assets, { variant });
        for (const m of METHODS) assert(typeof a[m] === 'function', '缺少 ' + m);
        assert(a.root.isGroup && a.root.visible === false, 'root 初始應為不可見的 Group');
        assert(a.root !== b.root, '兩個實例不應共用 root');
        return { variant: a.variant, clips: a.clips?.length ?? 0, source: a.source };
      });
      if (!a) continue;
      a.root.position.set(0, 0.9, -19); b.root.position.set(1.2, 0.9, -19);
      g.map.scene.add(a.root, b.root); a.root.visible = b.root.visible = true;
      check(`${label}：腳底在 y = 0、身高與面向`, () => {
        a.setPose('idle', true); a.update(1); a.update(1.02);
        const bb = bounds(a), feet = bb.min.y - 0.9, top = bb.max.y - 0.9;
        a.setPose('reach', true); a.update(1.04);
        const hand = a.bones.LeftHand.getWorldPosition(v).z + 19;
        a.setPose('peek', true); a.update(1.06);
        const headX = a.bones.Head.getWorldPosition(v).x;
        assert(Math.abs(feet) < 0.06, `腳底 y = ${feet.toFixed(3)}`);
        assert(variant === 'child' ? top > 1.0 && top < 1.3 : top > 1.5 && top < 1.8, `高度 ${top.toFixed(2)}`);
        assert(hand > 0.3, `reach 的左手應在前方（+Z），實際 ${hand.toFixed(2)}`);
        assert(headX > 0.2, `peek 的頭應往 +X 偏，實際 ${headX.toFixed(2)}`);
        return { feet: +feet.toFixed(3), idleHeight: +top.toFixed(3), reachHandZ: +hand.toFixed(2), peekHeadX: +headX.toFixed(2) };
      });
      check(`${label}：所有姿勢、追視、抽搐、淡出都不出錯`, () => {
        let t = 2; const target = new THREE.Vector3(0.5, 2.4, -12);
        for (const pose of POSES) { a.setPose(pose); for (let i = 0; i < 4; i++) a.update((t += 0.016), i % 2 === 0); assert(finite(a), pose + ' 產生非數值'); }
        a.setPose('idle', true); a.lookAt(target); for (let i = 0; i < 90; i++) a.update((t += 0.016));
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(a.bones.Head.getWorldQuaternion(new THREE.Quaternion()));
        const facing = fwd.dot(target.clone().sub(a.bones.Head.getWorldPosition(v)).normalize());
        target.set(-0.4, 2.4, -26); for (let i = 0; i < 160; i++) a.update((t += 0.016));
        const yawBack = fwd.set(0, 0, 1).applyQuaternion(a.bones.Head.getWorldQuaternion(new THREE.Quaternion())).z;
        a.lookAt(null); a.setGlitch(1); for (let i = 0; i < 40; i++) a.update((t += 0.016), true);
        a.setGlitch(0); a.setFade(0.4); a.update((t += 0.016)); a.setFade(0); a.update((t += 0.016)); a.setFade(1); a.setEyes?.(1); a.update((t += 0.016));
        assert(finite(a), '抽搐後出現非數值');
        assert(facing > 0.75, `追視後頭應朝向目標，dot = ${facing.toFixed(2)}`);
        assert(yawBack < -0.3, `目標在背後時頭應轉過去，頭的前向 z = ${yawBack.toFixed(2)}`);
        return { lookDot: +facing.toFixed(2), headForwardZWhenTargetBehind: +yawBack.toFixed(2) };
      });
      check(`${label}：網格、材質與三角形數`, () => {
        let tris = 0, meshes = 0; const mats = new Set();
        a.root.traverse((o) => { if (o.isMesh && o.visible) { meshes++; mats.add(o.material); tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
        assert(tris <= 60000, `三角形 ${tris}`);
        if (variant === 'shadow') assert(meshes === 1 && mats.size === 1, 'shadow 應該只有一個 draw call');
        return { drawCalls: meshes, materials: mats.size, triangles: Math.round(tris) };
      });
      if (label === 'woman') check('woman：授權模型的動畫、出處與左腕骨頭', () => {
        const wrist = a.root.getObjectByName('mixamorig_LeftHand_011'), cord = a.root.getObjectByName('RedCord');
        assert(a.clips.length >= 1 && /CC BY 4\.0/.test(a.source), 'clips / source');
        assert(wrist && wrist.isBone, '找不到 mixamorig_LeftHand_011');
        assert(cord && cord.parent === wrist, '紅線應掛在左腕骨頭上');
        return { clip: a.clips[0].name, duration: +a.clips[0].duration.toFixed(2), tracks: a.clips[0].tracks.length };
      });
      check(`${label}：dispose 之後離開場景`, () => { a.dispose?.(); b.dispose?.(); if (!a.dispose) g.map.scene.remove(a.root, b.root); assert(!a.root.parent && !b.root.parent, '仍在場景裡'); });
    }
    return out;
  });
} catch (e) { errors.push(e.stack || String(e)); }
for (const r of results) console.log(r.pass ? 'PASS' : 'FAIL', r.name, r.pass ? JSON.stringify(r.info ?? '') : r.error);
console.log('ERRORS', JSON.stringify(errors));
fs.writeFileSync('artifacts/ghost/api-results.json', JSON.stringify({ results, errors }, null, 2));
await browser.close();
if (errors.length || !results.length || results.some((r) => !r.pass)) process.exitCode = 1;
