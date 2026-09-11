import {beatToSec,noteEndBeat} from '../js/state.js';
export const PIANO_VELOCITY_TRACKING=.35;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const db=p=>10*Math.log10(Math.max(1e-16,p));
const quantile=(a,q)=>a[Math.min(a.length-1,Math.floor(a.length*q))]??1e-16;

// Power-domain estimate, not a PCM render or a LUFS measurement. It accounts
// for the recorded layers, rate, velocity curve, note release, pedal and overlap.
export function estimatePiano(song,table,tracking=null) {
  const tr=song.tracks.find(t=>t.instrument==='piano');
  if(!tr?.notes.length)return {medianDb:-80,topDb:-80,maxDb:-80};
  const notes=tr.notes.slice().sort((a,b)=>a.s-b.s), step=.05;
  const end=Math.max(...notes.map(n=>beatToSec(noteEndBeat(n,song),song)))+2;
  const power=new Float64Array(Math.ceil(end/step)+1),next=new Map(),off=Array(notes.length);
  for(let i=notes.length-1;i>=0;i--){off[i]=next.get(notes[i].p)??Infinity;next.set(notes[i].p,beatToSec(notes[i].s,song));}
  notes.forEach((n,i)=>{
    const r=table.regions.find(r=>n.p>=r.k[0]&&n.p<=r.k[1]&&n.v>=r.v[0]&&n.v<=r.v[1]);if(!r)return;
    const s=beatToSec(n.s,song),e=beatToSec(noteEndBeat(n,song),song),rate=2**((n.p-r.kc)/12);
    const vt=tracking??r.vt,g=r.g*(1-vt+vt*(n.v/127)**2),fade=r.release/3;
    const tail=Math.min(e+Math.max(.2,r.release*2),off[i]+.5,s+12/rate);
    const last=r.power.at(-1),decay=clamp(Math.log(Math.max(1e-12,r.power.at(-10))/Math.max(1e-12,last))/.45,.15,8);
    for(let j=Math.ceil(s/step);j<power.length&&j*step<tail;j++) {
      const age=(j*step-s)*rate,at=age/table.step,k=Math.floor(at);
      const p=k<r.power.length-1?r.power[k]+(r.power[k+1]-r.power[k])*(at-k):last*Math.exp(-decay*Math.max(0,age-2));
      const release=Math.exp(-Math.max(0,j*step-e)/Math.max(.01,fade));
      const choke=clamp(1-(j*step-off[i])/.5,0,1);
      const expression=n.v2!=null?1+(clamp((n.v2/Math.max(1,n.v))**2,.03,4)-1)*clamp((j*step-s)/(e-s),0,1):1;
      power[j]+=p*(g*release*choke*expression)**2;
    }
  });
  const smoothed=[];let sum=0;
  for(let i=0;i<power.length;i++){sum+=power[i]-(i>=8?power[i-8]:0);smoothed.push(Math.max(0,sum/Math.min(8,i+1)));}
  const max=Math.max(...smoothed),active=smoothed.filter(p=>p>max*1e-5).sort((a,b)=>a-b);
  const faders=(tr.volume??-4)+(song.master?.volume??-4);
  return {medianDb:db(quantile(active,.5))+faders,topDb:db(quantile(active,.9))+faders,maxDb:db(max)+faders};
}

export function pianoBalance(song,table) {
  const notes=song.tracks.find(t=>t.instrument==='piano')?.notes??[];
  const reference={...song,master:{...song.master,volume:-4}};
  const before=estimatePiano(reference,table),afterCurve=estimatePiano(reference,table,PIANO_VELOCITY_TRACKING);
  // Calibration is Claude's measured Entertainer median at default faders.
  const offset=table.calibration?.modelOffsetDb??0;
  const mean=notes.reduce((a,n)=>a+n.v,0)/Math.max(1,notes.length);
  const target=-20.5-clamp((76-mean)*.09,0,3.5);
  const gainDb=Math.round(clamp(target-afterCurve.medianDb-offset,0,15)*10)/10;
  return {gainDb,velocityTracking:PIANO_VELOCITY_TRACKING,targetDb:target,
    predictedBeforeDb:before.medianDb+offset,predictedMedianDb:afterCurve.medianDb+offset+gainDb,
    predictedTopDb:afterCurve.topDb+offset+gainDb,curveLiftDb:afterCurve.medianDb-before.medianDb,
    method:'sample-energy estimate, calibrated to the supplied Entertainer median; allow ±4 dB'};
}

export function applyPianoBalance(song,table) {
  const tr=song.tracks.find(t=>t.instrument==='piano');if(!tr)return null;
  const report=pianoBalance(song,table);
  tr.pianoPlayback={velocityTracking:PIANO_VELOCITY_TRACKING};
  // Makeup follows the bus compressor, so it does not drive it harder.
  song.master.pianoGainDb=report.gainDb;
  return report;
}
