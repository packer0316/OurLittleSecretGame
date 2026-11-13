// Editable game UI overlay. Keep the underlying photograph intact for ending C.
import fs from 'node:fs';
import {mulberry32} from '../src/core/utils.js';
const rng=mulberry32(19980817),paths=[];
const n=v=>v.toFixed(2);
const ink=['#340a09','#4e0c0b','#67100d','#821912','#941d16'];
function path(d,width,opacity,color){paths.push(`<path d="${d}" stroke="${color}" stroke-width="${n(width)}" opacity="${n(opacity)}"/>`);}
// Uneven, overlapping strokes. No silhouette border and no repeating stripe pattern.
for(let i=0;i<108;i++){
  const cx=96+(rng()-.5)*24,cy=110+(rng()-.5)*98;
  const angle=i%5===0?1.0+rng()*.7:-.7+rng()*1.25,length=55+rng()*67;
  const dx=Math.cos(angle)*length*.5,dy=Math.sin(angle)*length*.5;
  const ax=cx-dx,ay=cy-dy,bx=cx+dx,by=cy+dy;
  const jitter=()=> (rng()-.5)*29;
  path(`M ${n(ax)} ${n(ay)} C ${n(cx-dx*.4+jitter())} ${n(cy-dy*.4+jitter())}, ${n(cx+dx*.5+jitter())} ${n(cy+dy*.5+jitter())}, ${n(bx)} ${n(by)}`,.9+rng()*2.6,.5+rng()*.47,ink[Math.floor(rng()*ink.length)]);
}
// A few frantic reversals and strokes that run beyond the dense center.
for(let i=0;i<12;i++){
  const x=39+rng()*78,y=42+rng()*103;
  path(`M ${n(x)} ${n(y)} C ${n(x+60)} ${n(y-36)}, ${n(x-19)} ${n(y+45)}, ${n(x+31)} ${n(y+13)} S ${n(x-17)} ${n(y+64)}, ${n(x+40)} ${n(y+40)}`,.65+rng()*1.9,.48+rng()*.42,ink[i%ink.length]);
}
path('M 56 41 C 81 67, 132 138, 149 192',1.6,.76,'#64100d');
path('M 145 29 C 128 58, 67 153, 48 207',1.1,.72,'#64100d');
path('M 26 102 C 63 91, 137 77, 174 58',.9,.7,'#7b1710');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240" viewBox="0 0 200 240"><defs><filter id="ink" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence baseFrequency=".48" numOctaves="2" seed="27" result="grain"/><feDisplacementMap in="SourceGraphic" in2="grain" scale="1.3" xChannelSelector="R" yChannelSelector="G"/></filter></defs><g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#ink)">${paths.join('')}</g></svg>`;
fs.writeFileSync(new URL('../public/assets/story/photo-defacement.svg',import.meta.url),svg);
console.log('Saved irregular ink overlay; original photograph preserved.');
