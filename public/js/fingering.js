// Whole-score fingering: ordered chords, hand-position paths and recurring-key memory.
export function autoFinger(notes, { tracks = [], tempo = 90 } = {}) {

  const out = notes.map((n) => ({ ...n }));
  if (!out.length) return out;
  const writtenHands = new Set(out.filter(n => n.h === "L" || n.h === "R"));
  // 1. 手
  const byTrack = new Map();
  for (const n of out) if (n.track != null) (byTrack.get(n.track) ?? byTrack.set(n.track, []).get(n.track)).push(n);
  const noteTracks = [...byTrack.entries()].filter(([, arr]) => arr.length > 0);
  const needHand = out.some((n) => n.h !== "L" && n.h !== "R");
  if (needHand) {
    if (noteTracks.length >= 2) {
      const avg = (arr) => arr.reduce((a, n) => a + n.p, 0) / arr.length;
      const sorted = noteTracks.sort((a, b) => avg(b[1]) - avg(a[1]));
      const rightIds = new Set(sorted.slice(0, Math.max(1, Math.floor(sorted.length / 2))).map(([id]) => id));
      for (const n of out) if (n.h !== "L" && n.h !== "R") n.h = rightIds.has(n.track) ? "R" : "L";
    } else {
      // 同時の塊ごとに分ける
      out.sort((a, b) => a.s - b.s || a.p - b.p);
      let i = 0;
      while (i < out.length) {
        let j = i; while (j < out.length && out[j].s - out[i].s < 0.05) j++;
        const g = out.slice(i, j).sort((a, b) => a.p - b.p);
        if (g.length === 1) { if (!writtenHands.has(g[0])) g[0].h = g[0].p < 60 ? "L" : "R"; }
        else {
          // 一番大きい隙間で切る (ただし片手 16 半音以内)。隙間が無ければ 60 で切る
          let cut = -1, best = 0;
          for (let k = 1; k < g.length; k++) { const gap = g[k].p - g[k - 1].p; if (gap > best && gap >= 5) { best = gap; cut = k; } }
          if (cut < 0) cut = g.findIndex((n) => n.p >= 60); if (cut < 0) cut = g.length;
          if (cut === 0 && g[g.length - 1].p - g[0].p <= 16 && g[0].p < 58) cut = g.length;
          g.forEach((n, k) => { if (!writtenHands.has(n)) n.h = k < cut ? "L" : "R"; });
          // 片手が 10 度を超えるなら真ん中で切り直す
          for (const h of ["L", "R"]) { const hs = g.filter((n) => n.h === h); if (hs.length && hs[hs.length - 1].p - hs[0].p > 16) { const mid = Math.floor(g.length / 2); g.forEach((n, k) => { if (!writtenHands.has(n)) n.h = k < mid ? "L" : "R"; }); } }
        }
        i = j;
      }
    }
  }
  // 1b. 片手で同時に 15 半音 (10 度) を超えて広がる塊は、楽譜の段の都合なので、届く方の手に端の音を移す
  {
    const srt = out.slice().sort((a, b) => a.s - b.s || a.p - b.p);
    let i = 0;
    while (i < srt.length) {
      let j = i; while (j < srt.length && srt[j].s - srt[i].s < 0.05) j++;
      const g = srt.slice(i, j);
      for (const h of ["L", "R"]) {
        const other = h === "L" ? "R" : "L";
        for (let guard = 0; guard < 6; guard++) {
          const hs = g.filter((n) => n.h === h).sort((a, b) => a.p - b.p);
          if (hs.length < 2 || (new Set(hs.map(n => n.p)).size <= 5 && hs[hs.length - 1].p - hs[0].p <= 15)) break;
          const os = g.filter((n) => n.h === other).map((n) => n.p);
          const cand = h === "L" ? hs[hs.length - 1] : hs[0];   // 左手なら一番高い音、右手なら一番低い音
          const fits = new Set([...os,cand.p]).size <= 5 && (!os.length || Math.max(...os,cand.p)-Math.min(...os,cand.p)<=15);
          if (!fits || writtenHands.has(cand)) break;
          cand.h = other;
        }
      }
      i = j;
    }
  }
  // Each hand is solved over the whole score; written finger numbers are constraints.
  for (const h of ["L", "R"]) planFingers(out.filter(n => n.h === h), h, tempo);
  return out;
}

const black = p => [1, 3, 6, 8, 10].includes(p % 12);
const combinations = (count, start = 1) => count === 0 ? [[]] : Array.from({length:6-start}, (_,i) => start+i)
  .flatMap(f => combinations(count-1, f+1).map(rest => [f, ...rest]));
const choices = Array.from({length:6}, (_,n) => combinations(n));

function planFingers(notes, hand, tempo) {
  const sign = hand === "R" ? 1 : -1;
  notes.sort((a,b) => a.s-b.s || sign*(a.p-b.p));
  const groups = [];
  for (const n of notes) {
    let g = groups.at(-1);
    if (!g || n.s-g.s >= .05) groups.push(g = {s:n.s, notes:[]});
    g.notes.push(n);
  }
  for (const g of groups) {
    g.notes.sort((a,b) => sign*(a.p-b.p));
    const pitches = [...new Set(g.notes.map(n => n.p))];
    g.keys = pitches;
    const available = choices[Math.min(5,pitches.length)].map(fs => pitches.map((p,i) => fs[Math.min(i,fs.length-1)]));
    g.candidates = available.filter(fs => g.notes.every(n => n.f == null || n.f === fs[pitches.indexOf(n.p)]))
      .map(fs => {
        const x = pitches.reduce((v,p,i) => v + sign*p - (fs[i]-3)*2.4, 0)/pitches.length;
        const spread = pitches.reduce((v,p,i) => v + (sign*p-(fs[i]-3)*2.4-x)**2, 0);
        return {fs, x, cost:spread*.13 + pitches.reduce((v,p,i) => v + (black(p) && (fs[i]===1||fs[i]===5) ? 1.8 : 0), 0)};
      });
    // Explicit, conflicting data is left to the stage's persistent contact planner.
    if (!g.candidates.length) g.candidates = [{fs:pitches.map(p => g.notes.find(n=>n.p===p).f ?? 3), x:sign*pitches.reduce((a,b)=>a+b,0)/pitches.length, cost:0}];
  }
  if (!groups.length) return;
  let preferred = new Map(), path;
  // Alternating whole-score passes learn a usual finger for each key, then choose
  // connected hand positions. This couples repeated phrases separated by rests.
  for (let pass=0; pass<5; pass++) {
    let prev=[];
    const layers=[];
    for (let gi=0; gi<groups.length; gi++) {
      const g=groups[gi], before=groups[gi-1];
      const layer=g.candidates.map(c => {
        let local=c.cost;
        g.keys.forEach((p,i) => {if (preferred.has(p) && preferred.get(p)!==c.fs[i]) local+=pass ? 38 : 0;});
        let best=Infinity, from=-1;
        if (!gi) best=local;
        else prev.forEach((q,j) => {
          const gap=(g.s-before.s)*60/tempo;
          let cost=q.total+local + Math.abs(c.x-q.x)*.45 + Math.max(0,Math.abs(c.x-q.x)-7)**2*.15/Math.max(.15,gap);
          if (g.keys.length===1 && before.keys.length===1) {
            const delta=sign*(g.keys[0]-before.keys[0]), df=c.fs[0]-q.fs[0];
            if (delta && df===0) cost+=3;
            if (delta*df<0) cost+=(c.fs[0]===1 || q.fs[0]===1) && Math.abs(delta)<=4 ? 1.1 : 9;
            if (!delta && gap<.18 && groups[gi+1]?.keys.length===1 && groups[gi+1].keys[0]===g.keys[0]) cost+=df===0 ? 7 : -1;
          }
          for (let k=0;k<g.keys.length;k++) {
            const old=before.keys.indexOf(g.keys[k]);
            if (old>=0 && c.fs[k]!==q.fs[old]) cost+=5;
          }
          if (cost<best) {best=cost;from=j;}
        });
        return {...c,total:best,from};
      });
      layers.push(layer);prev=layer;
    }
    let at=prev.reduce((b,c,i) => c.total<prev[b].total ? i:b,0);
    path=Array(groups.length);
    for(let i=groups.length-1;i>=0;i--) {path[i]=layers[i][at];at=path[i].from;}
    const votes=new Map();
    groups.forEach((g,i)=>g.keys.forEach((p,k)=>{if(!votes.has(p))votes.set(p,Array(6).fill(0));votes.get(p)[path[i].fs[k]]++;}));
    preferred=new Map([...votes].map(([p,v])=>[p,v.reduce((b,c,i)=>c>v[b]?i:b,1)]));
  }
  // Beam states retain the last finger on *every* key, including previous
  // phrases. Unlike a chord-only Viterbi state this can price real substitutions.
  let beam=[{total:0, memory:new Uint8Array(128), x:null, prev:null}];
  for (let gi=0;gi<groups.length;gi++) {
    const g=groups[gi], next=[];
    for (const old of beam) for(const c of g.candidates) {
      let total=old.total+c.cost*.3+(old.x===null?0:Math.abs(c.x-old.x)*.25);
      const memory=old.memory.slice();
      g.keys.forEach((p,i)=>{if(memory[p] && memory[p]!==c.fs[i])total+=60;memory[p]=c.fs[i];});
      if (gi && g.keys.length===1 && groups[gi-1].keys.length===1) {
        const delta=sign*(g.keys[0]-groups[gi-1].keys[0]), df=c.fs[0]-old.choice.fs[0];
        if(delta && !df)total+=3;
        if(delta*df<0)total+=(c.fs[0]===1||old.choice.fs[0]===1)&&Math.abs(delta)<=4?1:9;
      }
      next.push({total,memory,x:c.x,prev:old,choice:c});
    }
    next.sort((a,b)=>a.total-b.total);
    const seen=new Set();beam=[];
    for(const c of next) {const key=c.memory.join(',');if(seen.has(key))continue;seen.add(key);beam.push(c);if(beam.length===32)break;}
  }
  const beamPath=Array(groups.length);let cursor=beam[0];
  for(let i=groups.length-1;i>=0;i--){beamPath[i]=cursor.choice;cursor=cursor.prev;}
  const changes=plan=>{const last=new Map();let count=0;groups.forEach((g,i)=>g.keys.forEach((p,k)=>{const f=plan[i].fs[k];if(last.has(p)&&last.get(p)!==f)count++;last.set(p,f);}));return count;};
  if(changes(beamPath)<changes(path))path=beamPath;
  // Rapid runs of three or more identical single notes alternate fingers.
  // Slow repetitions and written finger numbers keep their chosen fingering.
  for(let i=0;i<groups.length;) {
    let j=i+1;
    while(groups[i].keys.length===1 && j<groups.length && groups[j].keys.length===1 && groups[j].keys[0]===groups[i].keys[0] && (groups[j].s-groups[j-1].s)*60/tempo<.16)j++;
    if(j-i>=3)for(let k=i+1;k<j;k++)if(groups[k].notes.every(n=>n.f==null)&&path[k].fs[0]===path[k-1].fs[0]) {
      const f=path[k-1].fs[0]===3?2:3;path[k]={...path[k],fs:[f]};
    }
    i=j;
  }
  groups.forEach((g,i)=>g.notes.forEach(n=>{if(n.f==null)n.f=path[i].fs[g.keys.indexOf(n.p)];}));
}
