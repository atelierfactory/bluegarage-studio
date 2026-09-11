// A score-time trajectory, shared by playback, capture and the Node checker.
// The speed is an animation design limit (metres/second), not a medical claim.
export const MOTION_LIMITS = Object.freeze({speed:3.0, minContact:.012, settle:.006, minTravel:.065, maxLead:.48});
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
// Short sinusoidal acceleration/deceleration, continuous velocity and acceleration.
// The wrist can travel through a run without an artificial long stop at each key.
const ramp=.2, peak=1/(1-ramp);
const smooth = (t,r=ramp) => t<r ? (t/2-r*Math.sin(Math.PI*t/r)/(2*Math.PI))/(1-r) : t>1-r ? 1-smooth(1-t,r) : (t-r/2)/(1-r);
const choices = (n, start=0) => n===0 ? [[]] : Array.from({length:5-start},(_,i)=>start+i).flatMap(f=>choices(n-1,f+1).map(a=>[f,...a]));

export function buildMotion(notes, toSec, geometry) {
  const plan=planMotion(notes,toSec,geometry);
  // An isolated, unplayable attack may be visibly released, as authorised for
  // PIANO. Keep it in the score and the diagnostic report; do not pretend to
  // strike it. Only accept the release if the complete new path is feasible.
  if(plan.issues.length===1&&plan.issues[0].kind==='speed') {
    const issue=plan.issues[0],group=plan.hands[issue.h].find(g=>g.notes[0].s===issue.beat);
    if(group?.notes.length===1&&issue.available<.04) {
      const note=group.notes[0],revised=planMotion(notes,toSec,geometry,new Set([note._i]));
      if(!revised.issues.length) {
        revised.releases=[{...issue,i:note._i,p:note.p,f:note.f,reason:'unreachable isolated attack; release and travel to the following note'}];
        return revised;
      }
    }
  }
  return plan;
}

function planMotion(notes, toSec, geometry, released=new Set()) {
  const {keyX, fingerOffsetX, palmFor} = geometry;
  const timed=notes.map((n,i)=>({...n,_i:i,_s:toSec(n.s),_e:toSec(n.s+n.d),_f:clamp((n.f??3)-1,0,4),_visualRelease:released.has(i),...(released.has(i)?{_release:toSec(n.s)}:{})}));
  const hands={}, issues=[];
  for(const h of ['L','R']) {
    const ns=timed.filter(n=>!n._visualRelease&&(n.h==='L'?'L':'R')===h).sort((a,b)=>a._s-b._s||a.p-b.p);
    const groups=[];
    for(const n of ns) {let g=groups.at(-1);if(!g||n._s-g.s>.04||g.notes.some(m=>m._e<=n._s+1e-6||m.p===n.p))groups.push(g={s:n._s,notes:[]});g.notes.push(n);}
    let held=[], previousX=null;
    const memory=new Map();
    for(const [gi,g] of groups.entries()) {
      const future=groups[gi+1];
      const futureX=future?future.notes.reduce((a,n)=>a+keyX(n.p)-fingerOffsetX(h,n._f),0)/future.notes.length:null;
      const fresh=new Set(g.notes);
      held=held.filter(n=>n._e>g.s+.004&&!g.notes.some(m=>m.p===n.p));
      const freshX=g.notes.reduce((a,n)=>a+keyX(n.p)-fingerOffsetX(h,n._f),0)/g.notes.length;
      held=held.filter(n=>Math.abs(keyX(n.p)-freshX)<.095 && !g.notes.some(m=>m._f===n._f&&m.p!==n.p));
      let best=null;
      // Keep already assigned fingers until release. If a new chord needs them,
      // release old contacts; never reshuffle a sounding note on a later frame.
      while(!best) {
        const all=held.concat(g.notes), keys=[...new Set(all.map(n=>n.p))].sort((a,b)=>h==='R'?a-b:b-a);
        for(const fs of choices(keys.length)) {
          if(held.some(n=>fs[keys.indexOf(n.p)]!==n._f))continue;
          let score=0;
          for(const n of g.notes) {const f=fs[keys.indexOf(n.p)];score+=(f===n._f?0:10)+(memory.has(n.p)&&memory.get(n.p)!==f?1.5:0);}
          const x=all.reduce((a,n)=>a+keyX(n.p)-fingerOffsetX(h,fs[keys.indexOf(n.p)]),0)/all.length;
          score+=all.reduce((a,n)=>a+(keyX(n.p)-fingerOffsetX(h,fs[keys.indexOf(n.p)])-x)**2,0)*700;
          if(previousX!==null)score+=Math.abs(x-previousX)*45;
          if(futureX!==null&&future.s-g.s<.4)score+=Math.abs(x-futureX)*30;
          if(!best||score<best.score)best={score,fs,keys,x};
        }
        if(best && best.keys.at(-1)!==undefined && Math.abs(best.keys.at(-1)-best.keys[0])>16 && held.length)best=null;
        if(best)break;
        if(held.length){held.shift();continue;}
        issues.push({kind:'chord',h,beat:g.notes[0].s,notes:g.notes.length});
        // Keep all attacks visible to the checker: impossible contacts fail.
        best={keys:g.notes.map(n=>n.p),fs:g.notes.map(n=>n._f)};
      }
      for(const n of g.notes){n._f=best.fs[best.keys.indexOf(n.p)];memory.set(n.p,n._f);n._release=n._e;}
      g.contacts=held.concat(g.notes);
      g.palm=palmFor(h,g.contacts);
      previousX=g.palm.x;held=g.contacts.slice();
      g.fresh=fresh;
    }
    // A key can be reached from a range of wrist positions. Choose a connected
    // path through those ranges, instead of centring the wrist on every note.
    for(const g of groups) {
      const spread=Math.max(...g.contacts.map(n=>keyX(n.p)-fingerOffsetX(h,n._f)))-Math.min(...g.contacts.map(n=>keyX(n.p)-fingerOffsetX(h,n._f)));
      const room=Math.max(.008,.055-spread*.35);
      g.bounds={lo:g.palm.x-room,hi:g.palm.x+room,z:g.palm.z};
    }
    for(let pass=0;pass<16;pass++) {
      const order=pass%2?groups.slice().reverse():groups;
      for(const g of order) {
        const i=groups.indexOf(g),a=groups[i-1],b=groups[i+1];
        const wa=a?1/Math.max(.04,g.s-a.s):0,wb=b?1/Math.max(.04,b.s-g.s):0;
        if(wa+wb) {
          g.palm.x=clamp(((a?.palm.x??0)*wa+(b?.palm.x??0)*wb)/(wa+wb),g.bounds.lo,g.bounds.hi);
          g.palm.z=clamp(((a?.palm.z??0)*wa+(b?.palm.z??0)*wb)/(wa+wb),g.bounds.z-.014,g.bounds.z+.014);
        }
      }
    }
    for(const g of groups) {geometry.fitPalm?.(h,g);g.home={...g.palm};}
    // Project neighbouring wrist positions back onto actual reachable geometry.
    // This also uses the fingers' fore/aft reach across white and black keys.
    for(let pass=0;pass<8;pass++) {
      for(let k=0;k<groups.length;k++) {
        const i=pass%2?groups.length-1-k:k,g=groups[i],a=groups[i-1],b=groups[i+1];
        const wa=a?1/Math.max(.025,g.s-a.s)**2:0,wb=b?1/Math.max(.025,b.s-g.s)**2:0;
        if(!wa&&!wb)continue;
        const saved={...g.palm},fingerPoses=g.fingerPoses;
        for(const axis of ['x','y','z'])g.palm[axis]=((a?.palm[axis]??0)*wa+(b?.palm[axis]??0)*wb)/(wa+wb);
        g.palm.x=clamp(g.palm.x,g.home.x-.065,g.home.x+.065);
        g.palm.y=clamp(g.palm.y,.765,.815);g.palm.z=clamp(g.palm.z,.025,.145);
        const error=geometry.fitPalm?.(h,g)??0;
        if(error>.002||g.palm.y<.765||g.palm.y>.815||g.palm.z<.025||g.palm.z>.145){g.palm=saved;g.fingerPoses=fingerPoses;}
      }
    }
    for(let i=0;i<groups.length;i++) {
      const a=groups[i],b=groups[i+1];
      if(!b)continue;
      let dist=Math.hypot(b.palm.x-a.palm.x,b.palm.z-a.palm.z,(b.palm.y??0)-(a.palm.y??0));
      let lift=Math.min(.016,dist*.065);
      const pathBudget=peak*dist+Math.PI*lift;
      const travel=Math.max(MOTION_LIMITS.minTravel,pathBudget/MOTION_LIMITS.speed);
      const arrive=b.s-Math.min(MOTION_LIMITS.settle,(b.s-a.s)*.04);
      const start=Math.max(Math.max(...a.notes.map(n=>n._s))+.003,arrive-Math.min(MOTION_LIMITS.maxLead,travel));
      const available=Math.max(.001,arrive-start);
      const accelerationFraction=clamp(1-dist/(MOTION_LIMITS.speed*available),.08,ramp);
      const peakFactor=1/(1-accelerationFraction);
      lift=Math.min(lift,Math.max(0,(MOTION_LIMITS.speed*available-peakFactor*dist)/Math.PI));
      const requiredSpeed=(peakFactor*dist+Math.PI*lift)/available;
      if(requiredSpeed>MOTION_LIMITS.speed+1e-5) {
        issues.push({kind:'speed',h,beat:b.notes[0].s,fromBeat:a.notes.at(-1).s,required:requiredSpeed,available,metres:dist,missingMs:1000*(peakFactor*dist/MOTION_LIMITS.speed-available)});
        // A physically impossible score remains an explicit failure. Limit the
        // real wrist instead of teleporting, hiding a note, or changing its time.
        const ratio=MOTION_LIMITS.speed/requiredSpeed;
        b.requestedPalm={...b.palm};
        for(const axis of ['x','y','z'])b.palm[axis]=a.palm[axis]+(b.palm[axis]-a.palm[axis])*ratio;
        dist*=ratio;lift=0;
      }
      a.move={start,arrive,dist,lift,ramp:accelerationFraction,requiredSpeed};
      for(const n of a.contacts)if(!b.contacts.includes(n)) {
        const reused=b.notes.filter(m=>m._f===n._f).map(m=>m._s-.012);
        let release=Math.min(n._release,b.s,...reused);
        const reachable=sec=>{
          const u=clamp((sec-start)/available,0,1),q=smooth(u,accelerationFraction),palm={};
          for(const axis of ['x','y','z'])palm[axis]=a.palm[axis]+(b.palm[axis]-a.palm[axis])*q;
          palm.y+=Math.sin(Math.PI*u)**2*lift;
          return geometry.canHold?.(h,n,palm)??false;
        };
        // A moving wrist does not by itself require releasing a key. Keep the
        // original hold while the real finger can still reach its surface.
        const until=Math.min(release,b.s);
        if(until>start) {
          let previous=start;
          for(let k=1;k<=6;k++) {
            const at=start+(until-start)*k/6;
            if(!reachable(at)) {
              let lo=previous,hi=at;for(let j=0;j<9;j++){const mid=(lo+hi)/2;if(reachable(mid))lo=mid;else hi=mid;}
              release=Math.min(release,lo);break;
            }
            previous=at;
          }
        }
        n._release=Math.min(n._release,Math.max(n._s+.012,release));
      }
    }
    hands[h]=groups;
  }
  return {hands,notes:timed,issues,releases:[]};
}

export function motionAt(plan,h,sec) {
  const groups=plan.hands[h];
  if(!groups.length)return null;
  let lo=0,hi=groups.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(groups[mid].s<=sec+1e-7)lo=mid+1;else hi=mid;}
  const i=Math.max(0,lo-1),a=groups[i],b=groups[i+1];
  const move=a.move, u=move ? clamp((sec-move.start)/(move.arrive-move.start),0,1):0;
  const q=smooth(u,move?.ramp),palm={...a.palm};
  if(b && u>0){palm.x+=(b.palm.x-a.palm.x)*q;palm.z+=(b.palm.z-a.palm.z)*q;palm.y+=(b.palm.y-a.palm.y)*q;}
  const lift=move?Math.sin(Math.PI*u)**2*move.lift:0;
  const contacts=a.contacts.filter(n=>sec>=n._s-1e-7&&sec<n._release-1e-7);
  const ready=[...a.notes,...(b&&sec>=move.start?b.notes:[])].filter(n=>sec<n._s-1e-7);
  return {palm,lift,contacts,ready,group:a,next:b,progress:u,lead:b?b.s-sec:Infinity,requiredSpeed:move?.requiredSpeed??0};
}
