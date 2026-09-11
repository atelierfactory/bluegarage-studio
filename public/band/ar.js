// Score-derived AR: the same seconds-linear values as the synth, including seeks.
// The traces come from measured audio, never from a drawn parameter model.
import {Vector3} from 'three';
import { KNOBS } from '../js/synth2.js';
import { tracePath } from './signal.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const KNOB_MEANINGS={
 cutoff:{name:'音の明るさ',up:'音が明るく鋭くなった',down:'音が柔らかく落ち着いた'},
 resonance:{name:'クセの強さ',up:'音のクセが強くなった',down:'音のクセが穏やかになった'},
 envAmount:{name:'音の立ち上がりの動き',up:'鳴り始めの変化が大きくなった',down:'鳴り始めの変化が小さくなった'},
 lfoRate:{name:'揺れの速さ',up:'揺れが速くなった',down:'揺れがゆっくりになった'},
 lfoDepth:{name:'揺れの深さ',up:'音が大きく揺れるようになった',down:'音の揺れが浅くなった'},
 drive:{name:'音の歪み',up:'音が荒く力強くなった',down:'音が澄んだ響きになった'},
 delay:{name:'やまびこ',up:'やまびこが増えた',down:'やまびこが少なくなった'},
 reverb:{name:'響きの広さ',up:'響きが広がった',down:'響きが近くに集まった'},
};
export function knobChangesAt(defaults,events,beat,toSec,linger=3.2){
 const now=toSec(beat),values={...defaults},out=[];
 for(const [i,e]of events.entries()){
  const start=toSec(e.s),end=toSec(e.s+e.d),from=values[e.param]??.5;
  if(now>=start&&now<end+linger){const progress=clamp((now-start)/(end-start||1)),current=from+(e.to-from)*progress;
   out.push({id:`${i}:${e.param}`,param:e.param,label:KNOBS.find(k=>k.id===e.param)?.label??e.param,...KNOB_MEANINGS[e.param],from,to:e.to,current,progress,active:now<end,opacity:clamp((now-start)/.12)*clamp((end+linger-now)/.65),message:KNOB_MEANINGS[e.param]?.[e.to>=from?'up':'down']??'',s:e.s,d:e.d});
  }
  if(now<end)break;
  values[e.param]=e.to;
 }
 return out.slice(-2);
}
// Project the actual meshes, including every finger. Protecting only the knob
// centre allowed a card to cover the hand or display at oblique camera angles.
const point=new Vector3();
function projectedBounds(object,camera,w,h,clip=true){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 object.updateWorldMatrix(true,true);
 object.traverse(o=>{
  if(!o.isMesh||!o.visible)return;
  if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;
  for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z]){
   point.set(x,y,z).applyMatrix4(o.matrixWorld).project(camera);if(point.z<=-1||point.z>=1)continue;
   const px=(point.x*.5+.5)*w,py=(-point.y*.5+.5)*h;x0=Math.min(x0,px);y0=Math.min(y0,py);x1=Math.max(x1,px);y1=Math.max(y1,py);
  }
 });
 if(!Number.isFinite(x0)||clip&&(x0>w||y0>h||x1<0||y1<0))return null;
 if(clip){x0=clamp(x0,0,w);y0=clamp(y0,0,h);x1=clamp(x1,0,w);y1=clamp(y1,0,h);}
 return {x:x0,y:y0,width:x1-x0,height:y1-y0};
}
export function arProtectedRegions(stage,camera,w,h,{clip=true,allKnobs=false}={}){
 camera.updateMatrixWorld();
 const objects=[['hand',stage.hands.Right.bone],['display',stage.synth.display.surface],
  ...(allKnobs?stage.synth.knobs:(stage.arChanges??[]).map(e=>stage.synth.knobs.find(k=>k.id===e.param))).map(k=>['knob',k.holder])];
 return objects.flatMap(([kind,o])=>{const b=projectedBounds(o,camera,w,h,clip);return b?[{...b,kind}]:[];});
}
export function arLayout(rect,count,anchor=null,protectedRegions=[]){
 if(!count)return [];
 const [x,y,w,h]=rect,focus=anchor??{x:x+w*.55,y:y+h*.55},pad=10,gap=18,width=Math.min(312,w-20);
 const regions=[...protectedRegions,{x:focus.x-12,y:focus.y-12,width:24,height:24}];
 const clampBox=b=>({...b,x:clamp(b.x,x+pad,x+w-pad-b.width),y:clamp(b.y,y+pad,y+h-pad-b.height)});
 const overlap=(a,b,g=8)=>a.x<b.x+b.width+g&&a.x+a.width+g>b.x&&a.y<b.y+b.height+g&&a.y+a.height+g>b.y;
 const dist=b=>Math.hypot(focus.x-clamp(focus.x,b.x,b.x+b.width),focus.y-clamp(focus.y,b.y,b.y+b.height));
 const candidates=[];
 for(const height of[178,144,82,34]){
  if(height>h-20)continue;
  const positions=[{x:x+pad,y:y+pad},{x:x+w-width-pad,y:y+pad},{x:x+pad,y:y+h-height-pad},{x:x+w-width-pad,y:y+h-height-pad}];
  for(const r of regions){
   const xs=[r.x-width-gap,r.x+r.width+gap,focus.x-width*.5];
   const ys=[r.y-height-gap,r.y+r.height+gap,focus.y-height*.5];
   for(const xx of xs)for(const yy of ys)positions.push({x:xx,y:yy});
  }
  const seen=new Set();
  for(const p of positions){const b=clampBox({...p,width,height}),key=`${b.x},${b.y}`;if(seen.has(key)||regions.some(r=>overlap(b,r)))continue;seen.add(key);
   // Favor a readable full card, with a short wire, above the instrument.
   const score=dist(b)+(178-height)*2+(b.y>focus.y?18:0);candidates.push({...b,score});
  }
 }
 candidates.sort((a,b)=>a.score-b.score);
 const hasGraphSpace=candidates.some(b=>b.height>=82);let best=null;
 for(const current of candidates){
  // Prefer the current measured comparison over two title-only strips.
  if(hasGraphSpace&&current.height<82)continue;
  const previous=count>1?candidates.find(b=>!overlap(b,current)):null;
  const score=current.score+(count>1?(previous?previous.score*.3:230):0);
  if(!best||score<best.score)best={score,boxes:previous?[previous,current]:[current]};
 }
 // An exceptionally tight viewport has no honest in-air placement. Keep the
 // instrument clear; normal mobile split views have room for a compact card.
 return best?.boxes??[];
}
export class KnobAR{
 constructor(parent){
  this.root=document.createElement('div');this.root.className='band-ar';this.root.setAttribute('aria-hidden','true');parent.appendChild(this.root);this.layers=[];
  for(let i=0;i<2;i++){
   const layer=document.createElement('div');layer.className='ar-viewport';this.root.appendChild(layer);
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('ar-wires');layer.appendChild(svg);
   const cards=[];
   for(let j=0;j<2;j++){
    const line=document.createElementNS('http://www.w3.org/2000/svg','path');svg.appendChild(line);
    const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('r','3');svg.appendChild(dot);
    const card=document.createElement('div');card.className='ar-card';
    card.innerHTML='<div class="ar-title"><b></b><span></span></div><div class="ar-values"><strong></strong><small></small></div><div class="ar-meter"><i></i><em></em></div><svg class="ar-graph" viewBox="0 0 216 32" preserveAspectRatio="none"><path class="ar-before"/><path class="ar-current"/></svg><div class="ar-message"></div><div class="ar-caption"></div>';
    layer.appendChild(card);cards.push({card,line,dot,title:card.querySelector('b'),meaning:card.querySelector('.ar-title span'),values:card.querySelector('strong'),goal:card.querySelector('small'),meter:card.querySelector('i'),start:card.querySelector('em'),before:card.querySelector('.ar-before'),current:card.querySelector('.ar-current'),message:card.querySelector('.ar-message'),caption:card.querySelector('.ar-caption')});
   }
   this.layers.push({layer,svg,cards});
  }
 }
 render(stage){
  const views=stage.getViews();
  this.layers.forEach(({layer,svg,cards},i)=>{
   const view=views[i];layer.hidden=!view;if(!view)return;
   const [x,by,w,h]=view.rect,y=stage.h-by-h;
   Object.assign(layer.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`});svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
   const events=stage.arChanges??[],latest=events.at(-1);let focus=null;
   if(latest){const p=stage.synth.knobs.find(k=>k.id===latest.param).holder.getWorldPosition(stage._arPoint).project(view.camera);if(p.z>-1&&p.z<1)focus={x:(p.x*.5+.5)*w,y:(-p.y*.5+.5)*h};}
   const protectedRegions=events.length?arProtectedRegions(stage,view.camera,w,h):[];
   const positions=arLayout([0,0,w,h],events.length,focus,protectedRegions),shown=events.slice(events.length-positions.length);
   cards.forEach((c,j)=>{
    const e=shown[j],p=positions[j];c.card.hidden=c.line.hidden=c.dot.hidden=!e||!p;
    c.line.style.display=c.dot.style.display=e&&p?'':'none';if(!e||!p)return;
    const anchor=stage.synth.knobs.find(k=>k.id===e.param).holder.getWorldPosition(stage._arPoint);
    anchor.project(view.camera);const ax=(anchor.x*.5+.5)*w,ay=(-anchor.y*.5+.5)*h,visible=anchor.z>-1&&anchor.z<1&&ax>=0&&ax<=w&&ay>=0&&ay<=h;
    Object.assign(c.card.style,{left:`${p.x}px`,top:`${p.y}px`,width:`${p.width}px`,height:`${p.height}px`,opacity:e.opacity});
    c.title.textContent=e.label;c.meaning.textContent=e.name;c.values.textContent=`${Math.round(e.from*100)} → ${Math.round(e.current*100)}`;c.goal.textContent=`目標 ${Math.round(e.to*100)} / 100`;
    c.meter.style.width=`${e.current*100}%`;c.start.style.left=`${e.from*100}%`;
    const trace=stage.signalTraces?.[e.id];c.before.setAttribute('d',tracePath(trace?.before?.spectrum));c.current.setAttribute('d',tracePath(trace?.current?.spectrum));c.caption.textContent=trace?.caption??'再生すると実音を測ります';c.message.textContent=e.message;
    c.card.classList.toggle('turning',e.active);c.card.classList.toggle('compact',p.height<178);c.card.classList.toggle('summary',p.height<80);c.card.classList.toggle('banner',p.height===82);
    let endX,endY,elbowX,elbowY;
    if(ax<p.x||ax>p.x+p.width){endX=ax<p.x?p.x:p.x+p.width;endY=clamp(ay,p.y+10,p.y+p.height-10);elbowX=endX+(ax<p.x?-14:14);elbowY=endY;}
    else {endX=clamp(ax,p.x+12,p.x+p.width-12);endY=ay<p.y?p.y:p.y+p.height;elbowX=endX;elbowY=endY+(ay<p.y?-14:14);}
    c.line.setAttribute('d',`M${ax},${ay} L${elbowX},${elbowY} L${endX},${endY}`);c.line.style.opacity=visible?e.opacity:0;
    c.dot.setAttribute('cx',ax);c.dot.setAttribute('cy',ay);c.dot.style.opacity=visible?e.opacity:0;
   });
  });
 }
 dispose(){this.root.remove();}
}
