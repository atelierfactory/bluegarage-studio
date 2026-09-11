// 硝子の環流 — a four-on-the-floor night drive in D minor.
// Its two-bar cell rises a minor third, falls a semitone, then answers down a fifth.
// The 6-bar vacuum and the full-bar blackout deliberately interrupt the 8-bar grid.
import {score} from './score.mjs';
export default function glass(){
 const s=score({id:'glass-current',title:'硝子の環流 — 零時の加速',tempo:132,key:'D minor → E minor',sections:[['点火の四拍',4],['窓を流れる主旋律',8],['圧力',4],['最初の環流',12],['六小節の無重力',6],['足からの返答',8],['出口へ登る',6],['暗転',1],['一段高い夜',12],['光の尾',3]],concept:'四つ打ちの上で「レ・ファ・ミ・ラ」の短い問いを育てる。6小節の谷、右足との返答、一小節の暗転を経て、196拍から全体を一音上げて帰る。',lead:{name:'GLASS / ZERO HOUR',osc:[{wave:'supersaw',level:.71,spread:38,width:.84},{wave:'saw',level:.17,detune:-5}],filter:{model:'ladder',cutoff:1700,resonance:.16,envAmount:.65,keyTrack:.28,velAmount:.15},ampEnv:{a:.004,d:.16,s:.76,r:1.15},filterEnv:{a:.005,d:.20,s:.2,r:.2},drive:{amount:.12,asym:.06},fx:{chorus:{mix:.15,rate:.35,depth:.22},delay:{mix:.13,time:.75,feedback:.36,tone:4900},reverb:{mix:.14,decay:2.1,damp:.52}},level:-1},bass:{name:'GLASS / SUBWAY',osc:[{wave:'saw',level:.55,phaseRand:false},{wave:'triangle',level:.48,phaseRand:false}],sub:{wave:'sine',octave:-1,level:.06},filter:{model:'ladder',cutoff:740,resonance:.12,envAmount:1.15,keyTrack:.28},ampEnv:{a:.003,d:.15,s:.7,r:.08},filterEnv:{a:.002,d:.16,s:.1,r:.10},drive:{amount:.18},voice:{mono:true,glide:.008,legato:false},level:0}});
 // A score-specific cue sheet. A released chord rings while the hand turns.
 const cues=[[2,'envAmount',.36],[10,'drive',.40],[12,'resonance',.48],[14,'cutoff',.94],[26,'cutoff',.28],[28,'delay',.66],[30,'reverb',.64],[33,'envAmount',.19],[39,'delay',.18],[42,'drive',.56],[44,'resonance',.56],[46,'cutoff',.97],[47,'reverb',.20],[55,'envAmount',.31],[59,'drive',.63],[62,'cutoff',.47]];
 const rests=new Set(cues.map(c=>c[0]));s.keys.knobs=cues.map(([b,param,to])=>({param,to,s:b*4+1.08,d:1.72}));
 const tone=(b,p,t,d=.20,v=109,f=3)=>{if(!rests.has(b))s.key(p,b*4+t,d,v,f);};
 const chord=(b,p,t,d=.20,v=105)=>{if(!rests.has(b))s.chord(p,b*4+t,d,v);};
 const run=(b,p,t=0,v=104)=>p.forEach((x,i)=>tone(b,x,t+i*.25,.19,v+i%4*2,[1,2,3,1,2,3,4,5][i%8]));
 function question(b,transpose=0,wide=false){
  // The hook is kept audible: long notes carry the motif, short replies live between them.
  const harmony={74:[62,65,69,74],77:[65,69,74,77],76:[64,67,69,76],69:[57,62,65,69]};
  const voice=p=>wide?harmony[p].map(x=>x+transpose):[p-12+transpose,p+transpose];
  [[0,74,.60],[.75,77,.20],[1,76,.65],[2.5,69,.43]].forEach(([t,p,d])=>chord(b,voice(p),t,d,wide?112:107));
  [69,72,74].forEach((p,i)=>tone(b,p+transpose,1.75+i*.25,.19,93+i*4,i+1));
  run(b,[69,72,74,76].map(x=>x+transpose),3,111);
 }
 function answer(b,transpose=0,wide=false){
  [[0,72,.42],[.5,74,.42],[1,69,.65],[2,65,.20],[2.25,67,.20],[2.5,69,.43]].forEach(([t,p,d])=>chord(b,wide?[p-12+transpose,p-5+transpose,p+transpose]:[p-12+transpose,p+transpose],t,d,109));
  run(b,[69,72,76,74].map(x=>x+transpose),3,107);
 }
 // Ignition: bass and drums state the pulse before the tune appears in fragments.
 chord(0,[50,57,62,65],0,.7,96);run(0,[50,53,57,62,65,69,74,77],2,87);
 chord(1,[60,64,67,72],0,.35,97);tone(1,74,2,.6,102);tone(1,77,2.75,.2,105);tone(1,76,3,.65,104);
 run(3,[50,53,57,62,65,69,74,77,81,77,74,69,65,62,57,53],0,95);
 for(let b=4;b<12;b+=2){question(b);answer(b+1);}
 run(13,[57,60,64,67,69,72,76,79,81,79,76,72,69,67,64,60],0,99);
 for(const t of[0,.5,1,1.5])chord(15,[61,64,69,73],t,.18,110);run(15,[69,73,76,81,79,76,73,69],2,109);
 for(let b=16;b<28;b+=4){question(b,0,true);answer(b+1,0,true);run(b+2,[48,52,55,60,64,67,72,76,79,76,72,67],0,112);chord(b+2,[64,67,72,76],3,.8,112);answer(b+3,0,true);}
 // In the vacuum, the four notes are stretched across two bars, not arpeggiated.
 for(const [b,p]of[[29,74],[31,77],[32,76]]){chord(b,[p-12,p],0,1.35,78);tone(b,69,2.5,.75,80);}
 // Call-and-response: the right hand leaves beat 2 to the foot's answer.
 for(let b=34;b<42;b++){const p=b%2?72:74;chord(b,[p-12,p],0,.55,102);tone(b,p+3,.75,.18,107);tone(b,p+2,1,.65,103);run(b,[65,69,72,74],3,96);}
 for(const b of[43,45]){run(b,[50,53,57,62,65,69,74,77,81,77,74,69],0,109);for(const t of[3,3.5,3.75])chord(b,[62,65,69,74],t,.18,116);}
 // Bar 48 has no new attack in any limb: one complete bar before the transposed return.
 for(let b=49;b<61;b+=2){question(b,2,true);answer(b+1,2,true);}
 run(61,[52,55,59,64,67,71,76,79,83,79,76,71],0,114);chord(61,[64,67,71,76],3,.8,115);
 chord(63,[64,67,71,76],0,2.8,121);tone(63,83,3,.6,101);
 // Bass: offbeats sustain the dance; the middle section takes over the hook.
 for(const [b]of cues)s.chord(b>=49?[64,67,71,76]:[62,65,69,74],b*4,.075,110);
 const roots=[26,34,29,24];
 for(let b=0;b<64;b++){
  if(b===48)continue;let root=roots[b%4];if(b>=49)root=root===34?24:root+2;s.mark(b,b>=49?'Em / C / G / D':['Dm(add9)','Bbmaj7','F','C'][b%4]);
  if(b===63){s.bass(28,b*4,2.7,116);continue;}
  if(b>=28&&b<34){s.bass(root,b*4+.5,.85,86);s.bass(root>30?root-5:root+5,b*4+2.5,.7,87);continue;}
  if(b>=34&&b<42){[[.5,26],[1.5,29],[2.25,28],[3.25,33]].forEach(([t,p])=>s.bass(p,b*4+t,.33,110));continue;}
  const fifth=root+5<=36?root+5:root-5;[[.5,root],[1.5,fifth],[2.5,root],[3.5,root+(root<=32?2:-2)]].forEach(([t,p])=>s.bass(p,b*4+t,.31,107+(t===.5?6:0)));
 }
 // Straight dance pulse, snare on 2 and 4; fills are authored around the one stick.
 for(let b=0;b<64;b++){
  if(b===48)continue;const quiet=b>=28&&b<34,peak=b>=16&&b<28||b>=49&&b<61,cr=peak||rests.has(b)||[0,3,4,8,34,38,41,43,45,61,63].includes(b),at=b*4;
  if(b===63){s.hit('cr',at,127);s.hit('kick',at,122);continue;}
  if(quiet){s.hit(cr?'cr':'hh',at,cr?91:55);s.hit('sn',at+2,77);s.hit('kick',at,91);continue;}
  if(rests.has(b)){s.hit('cr',at,116);for(const t of[.75,1,1.25,1.5,1.75,2])s.hit('sn',at+t,82+t*14);s.hit('t1',at+2.5,109);s.hit('t2',at+3,117);s.hit('t3',at+3.5,121);}
  else if([3,15,27,41,61].includes(b)){s.hit(cr?'cr':'sn',at,119);[[.75,'t1'],[1.25,'t1'],[1.75,'t2'],[2.25,'t2'],[2.75,'t3'],[3.5,'sn']].forEach(([t,k])=>s.hit(k,at+t,113));}
  else{[[0,cr?'cr':'hh'],[.5,'hh'],[1,'sn'],[1.5,'hh'],[2,'hh'],[2.5,'hh'],[3,'sn'],[3.5,'hh']].forEach(([t,k])=>s.hit(k,at+t,k==='cr'?122:k==='sn'?116:t%1?70:82));}
  [0,1,2,3].forEach(t=>s.hit('kick',at+t,116));
 }
 return s.finish({full:196,crash:196.02,synth:196.8,stick:67,pedal:66,knob:185.94,ar:185.94},[{beat:16,text:'短い「レ・ファ・ミ・ラ」が歌い始める。'},{beat:64,text:'太い和音へ広がる最初の山。'},{beat:136,text:'右手の問いに、右足が同じ形で返す。'},{beat:192,text:'全員が一小節休む。'},{beat:196,text:'一音高くなった主旋律とクラッシュで最後の山。'}]);
}
