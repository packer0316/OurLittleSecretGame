import * as THREE from 'three';
import { mulberry32 } from './utils.js';

export const HANDWRITING_FAMILY='OLSPaperHand';
let fontReady;
export function loadHandwriting(){
  // Wait before drawing: a canvas does not repaint itself when a webfont arrives.
  return fontReady??=new FontFace(HANDWRITING_FAMILY,`url("${import.meta.env.BASE_URL}assets/fonts/ChenYuluoyan-2.0-Thin.ttf")`).load().then(font=>{document.fonts.add(font);return font;}).catch(error=>{fontReady=null;throw error;});
}

/** Original handwritten glyphs with modest pen pressure, spacing and baseline variation. */
export function handwrittenPaper(lines,{aspect=.42/.29,seed=247}={}){
  const rng=mulberry32(seed),canvas=document.createElement('canvas');canvas.width=1536;canvas.height=Math.round(canvas.width/aspect);
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.fillStyle='#b9ae92';ctx.fillRect(0,0,w,h);
  for(let i=0;i<22000;i++){ctx.fillStyle=`rgba(58,42,25,${rng()*.055})`;ctx.fillRect(rng()*w,rng()*h,1+rng()*2,.5+rng());}
  const edge=ctx.createLinearGradient(0,0,w,h);edge.addColorStop(0,'#62513b16');edge.addColorStop(.22,'#e7d7b008');edge.addColorStop(1,'#5c483820');ctx.fillStyle=edge;ctx.fillRect(0,0,w,h);
  // A faint old fold interrupts the sheet, without printing a border around it.
  ctx.strokeStyle='#58442e15';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w*.51,0);ctx.bezierCurveTo(w*.505,h*.3,w*.515,h*.7,w*.51,h);ctx.stroke();
  const size=w*.071;
  lines.forEach((line,row)=>{
    if(!line)return;
    let x=w*(.085+(rng()-.5)*.035);const baseline=h*.21+row*h*.18;
    for(const glyph of line){
      const localSize=size*(.94+rng()*.12);ctx.font=`${localSize}px "${HANDWRITING_FAMILY}"`;const advance=ctx.measureText(glyph).width;
      ctx.save();ctx.translate(x,baseline+(rng()-.5)*size*.085);ctx.rotate((rng()-.5)*.052);ctx.scale(1+(rng()-.5)*.05,1+(rng()-.5)*.035);
      ctx.fillStyle=`rgba(34,29,26,${.78+rng()*.2})`;ctx.fillText(glyph,0,0);
      // A small pressure-dependent ink spread, not a repeated offset drop shadow.
      ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.22+rng()*.32;ctx.strokeText(glyph,0,0);ctx.restore();
      x+=advance+size*(.035+rng()*.05);
    }
  });
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}
