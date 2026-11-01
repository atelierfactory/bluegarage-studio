// 曲の解釈欄のフェーダーを再生・シーク・書き出しで共通に使う。印刷の強弱は変えない。
export function valueAt(points,beat){
 let last=points[0]??[0,0];if(beat<last[0])return last[1];
 for(let i=1;i<points.length;i++){const p=points[i];if(beat<p[0])return last[1]+(p[1]-last[1])*(beat-last[0])/Math.max(1e-9,p[0]-last[0]);last=p;}return last[1];
}
export function mixDb(song,family,beat){
 const m=song.solo?song.interpretation?.mix:null;if(!m)return 0;
 let db=(m.family?.[family]??0)+valueAt(m.automation?.[family]??[],beat)+valueAt(m.quiet??[],beat);
 if(family===m.morendo?.family)db+=m.morendo.db*Math.max(0,Math.min(1,(beat-m.morendo.s)/(m.morendo.e-m.morendo.s)));
 return db;
}
export function applyConcertoMix(ctx,G,base,fromSec,song,toSec){
 const m=song.solo?song.interpretation?.mix:null;if(!m)return;
 const points=new Set([0,...Object.values(m.automation??{}).flat().map(p=>p[0]),...(m.quiet??[]).map(p=>p[0]),m.morendo?.s,m.morendo?.e].filter(Number.isFinite));
 if(m.morendo)for(let b=m.morendo.s;b<m.morendo.e;b+=.25)points.add(b);
 const beats=[...points].sort((a,b)=>a-b);let fromBeat=0;
 // 時間の逆引きはこの小さな折れ線だけ。曲の変速の中も同じ変換を使う。
 let lo=0,hi=song.ending.cutoffBeat+4;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(toSec(mid)<fromSec)lo=mid;else hi=mid;}fromBeat=(lo+hi)/2;
 for(const [family,f]of Object.entries(G.fam)){
  const gain=f.out.gain,t0=Math.max(ctx.currentTime,base+fromSec);gain.cancelScheduledValues(0);gain.setValueAtTime(f.base*Math.pow(10,mixDb(song,family,fromBeat)/20),t0);
  for(const beat of beats)if(toSec(beat)>fromSec)gain.linearRampToValueAtTime(f.base*Math.pow(10,mixDb(song,family,beat)/20),base+toSec(beat));
 }
}
