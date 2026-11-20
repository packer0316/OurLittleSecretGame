import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const book=path.join(root,'art-direction/visual-bible-20261120');
const manifest=JSON.parse(fs.readFileSync(path.join(book,'manifest.json'),'utf8'));
const qa=path.join(root,'tmp/visual-bible-qa');fs.mkdirSync(qa,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(book,'index.html')).href);
 const decoded=await page.evaluate(async assets=>Promise.all(assets.map(a=>new Promise(resolve=>{
  const i=new Image();i.onload=()=>resolve({id:a.id,width:i.naturalWidth,height:i.naturalHeight});i.onerror=()=>resolve({id:a.id,error:true});i.src=a.preview;
 }))),manifest.assets);
 assert.ok(decoded.every(a=>!a.error&&a.width>=1000&&a.height>=600),'All selected WebP images must decode');
 for(const category of ['clue','beat','character']){
  const count=manifest.assets.filter(a=>a.category===category).length;
  await page.locator(`[data-category="${category}"]`).click();
  assert.equal(await page.locator('#count').textContent(),count+' 張圖片');
  for(let p=0;p<Math.ceil(count/12);p++){
   await page.locator('.card img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
   await page.screenshot({path:path.join(qa,`${category}-${p+1}.png`),fullPage:true});
   if((p+1)*12<count)await page.locator('#next').click();
  }
 }
 await page.locator('[data-category="clue"]').click();
 await page.locator('.open').first().click();assert.equal(await page.locator('dialog').evaluate(d=>d.open),true);
 const initial=await page.locator('#viewTitle').textContent();await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#viewTitle').textContent(),initial);
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
 await page.locator('#search').fill('xyz-nothing');assert.equal(await page.locator('.card').count(),0);
 await page.locator('#search').fill('門閂');assert.equal(await page.locator('.card').count(),1);
 await page.locator('#search').fill('');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile gallery must not overflow');
 await page.locator('.open').first().click();await page.locator('#large').evaluate(i=>i.decode());
 await page.screenshot({path:path.join(qa,'mobile-lightbox.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(qa,'result.json'),JSON.stringify({decoded:decoded.length,checks:['images decode','category counts','pagination','search','lightbox arrows and Escape','390px mobile'],errors},null,2));
 console.log(JSON.stringify({assets:decoded.length,errors,screenshots:qa}));
} finally {await browser.close()}
