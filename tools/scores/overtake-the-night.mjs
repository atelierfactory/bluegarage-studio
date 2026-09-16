// 夜を追い越して — a night-drive J-pop synth piece for VESPER BAND (Claude Fable 5.1, 2026-09-16).
// A minor at 148 BPM, then a semitone up (B♭ minor) for the last two choruses.
// Every limb is written for the robot's body: one stick, one bass foot, one right hand that also turns the knobs.
import {score} from './score.mjs';

const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const m=s=>{const r=/^([A-G])([#b]?)(-?\d)$/.exec(s);if(!r)throw Error(`bad note ${s}`);return 12*(+r[3]+1)+NOTE[r[1]]+(r[2]==='#'?1:r[2]==='b'?-1:0);};
const T=148,BAR=4;

export default function overtake(){
 const s=score({
  id:'overtake-the-night',title:'夜を追い越して',tempo:T,key:'A minor → B♭ minor',
  composer:'Claude Fable 5.1',
  licenseText:'オリジナル。このアプリ VESPER BAND のために Claude Fable 5.1 が作曲（2026-09-16）。旋律・構成・伴奏・音色を新たに制作。既存曲の演奏データや外部素材は使用していません。',
  sections:[['イントロ',8],['Aメロ',8],['Bメロ',8],['サビ',8],['間奏',4],['Aメロ2',8],['Bメロ2',8],['サビ2',8],['Cメロ',8],['ラストサビ',8],['ラストサビ2',8],['アウトロ',4],['エンディング',2]],
  concept:'夜の街を走り抜けるような、速くて明るいシンセのJ-POP。最初の16分のリフが曲の顔。Aメロは音を絞って語り、Bメロで和音を刻んで溜め、サビの直前に音を全部止めてから一気に開く。サビの主旋律は「ラ・ソ・ミ・ド・レ・ミ」の一度で覚える形。Cメロで一度静かに息をつき、最後は半音上がって二度目のサビへ。つまみは場面が変わる時だけ回す（全部で12回）。',
  volume:[-1,-2,-5],
  lead:{name:'NIGHT / HEADLIGHT',description:'スーパーソーのプラック寄りリード。アタックは硬く、和音でも旋律でも抜ける',
   osc:[{wave:'supersaw',level:.78,unison:7,spread:42,width:.8,phaseRand:true},{wave:'saw',level:.32,octave:-1,detune:-5,phaseRand:true}],
   sub:{wave:'square',octave:-1,level:.18},noise:{color:'white',level:.05,decay:.02},
   filter:{model:'ladder',cutoff:3200,resonance:.22,envAmount:2.4,keyTrack:.5,velAmount:.4,drive:.12},
   ampEnv:{a:.003,d:.30,s:.62,r:.30},filterEnv:{a:.002,d:.18,s:.25,r:.20},
   lfo1:{wave:'sine',rate:5.6,sync:false,division:'1/4',depth:.10,target:'pitch',fadeIn:.35,retrig:true},
   drive:{amount:.18,asym:.2},
   fx:{chorus:{mix:.14,rate:.5,depth:.28},delay:{mix:.16,time:.75,feedback:.34,tone:4800,pingpong:true},reverb:{mix:.17,decay:1.9,damp:.5,preDelay:.02}},level:-3},
  bass:{name:'NIGHT / UNDERPASS',description:'ノコギリ+矩形+サブの太いモノベース。8分の刻みが見える',
   osc:[{wave:'saw',level:.7,phaseRand:false},{wave:'square',level:.45,octave:-1,detune:4,phaseRand:false}],
   sub:{wave:'sine',octave:-1,level:.35},noise:{color:'white',level:0,decay:.05},
   filter:{model:'ladder',cutoff:460,resonance:.2,envAmount:2.2,keyTrack:.4,velAmount:.3,drive:.2},
   ampEnv:{a:.002,d:.2,s:.75,r:.07},filterEnv:{a:.001,d:.14,s:.2,r:.08},
   voice:{mono:true,legato:true,glide:.03},drive:{amount:.25,asym:.3},
   fx:{chorus:{mix:0,rate:.5,depth:0},delay:{mix:0,time:.5,feedback:0,tone:2000,pingpong:false},reverb:{mix:.03,decay:.8,damp:.8,preDelay:0}},level:0},
 });

 /* ───────── collectors ───────── */
 const rh=[],bs=[],dr=[],kk=[];
 // right hand: pitches = array (chord) or one name; t is transpose in semitones
 const R=(bar,t,list,v0=104)=>{for(const [b,p,d=.22,v=v0] of list){const ps=(Array.isArray(p)?p:[p]).map(x=>m(x)+t);rh.push({s:bar*BAR+b,ps,d,v});}};
 const B=(bar,b,p,d,v=106)=>bs.push({s:bar*BAR+b,p,d,v});
 const D=(bar,list)=>{for(const [b,k,v] of list)dr.push({s:bar*BAR+b,k,v});};
 const K=(bar,list,v=112)=>{for(const b of list)kk.push({s:bar*BAR+b,v:Array.isArray(b)?b[1]:v+(b===0?6:0)});};
 const knobs=[];const knob=(bar,b,param,d,to)=>knobs.push({param,s:+(bar*BAR+b).toFixed(4),d,to:+to.toFixed(3)});

 /* ───────── harmony ───────── */
 // chord: name, root in the pedal range (24..36), third size (3 minor / 4 major)
 const CH={
  Am:{n:'Am',r:33,th:3},F:{n:'F',r:29,th:4},C:{n:'C',r:24,th:4},G:{n:'G',r:31,th:4},
  Dm:{n:'Dm',r:26,th:3},Em:{n:'Em',r:28,th:3},E7:{n:'E7',r:28,th:4},
 };
 const up=(c,t)=>{let r=c.r+t;if(r>36)r-=12;if(r<24)r+=12;return {...c,n:t?`${c.n}(+${t})`:c.n,r};};
 const RIFF=['Am','F','C','G'],VERSE=['Am','F','C','G'],PRE=['Dm','Em','F','G'],CHORUS=['F','G','Em','Am','F','G','E7','Am'],BRIDGE=['F','G','Am','Em','F','G','Am','E7'];
 // right-hand stab voicings (A minor); transposed by t when used
 const V={F:['F4','A4','C5'],G:['G4','B4','D5'],Em:['E4','G4','B4'],Am:['A4','C5','E5'],E7:['E4','G#4','B4','D5'],Dm:['D4','F4','A4'],C:['G4','C5','E5']};
 // pedal alternate tone: the fifth below when it fits the 13 keys, else the third above (always within 5 semitones)
 const alt=c=>c.r-5>=24?c.r-5:c.r+c.th;
 // the anticipation played half a beat before the next bar: a chord tone within 5 semitones of both neighbours
 const ant=(c,prev,next)=>{const cands=[c.r,alt(c),c.r+c.th,c.r+7,c.r-12,c.r+12].filter(p=>p>=24&&p<=36&&Math.abs(p-prev)<=5&&Math.abs(p-next)<=5);if(!cands.length)throw Error(`no anticipation for ${c.n}->${next}`);return cands[0];};

 /* ───────── bass patterns (bar, chord, next chord) ───────── */
 const bassRiff=(bar,c,nx)=>{B(bar,0,c.r,.45,112);B(bar,1.5,c.r,.45,104);B(bar,2.5,alt(c),.45,104);B(bar,3.5,ant(c,alt(c),nx.r),.45,108);};
 const bassVerse=(bar,c,nx)=>{B(bar,0,c.r,.45,110);B(bar,1,c.r,.45,100);B(bar,1.5,alt(c),.45,104);B(bar,3,c.r,.45,102);B(bar,3.5,ant(c,c.r,nx.r),.45,106);};
 const bassPreA=(bar,c,nx)=>{B(bar,.5,c.r,.45,108);B(bar,1,c.r,.45,100);B(bar,2.5,c.r,.45,104);B(bar,3,alt(c),.45,102);B(bar,3.5,ant(c,alt(c),nx.r),.45,108);};
 const bassPreB=(bar,c,nx)=>{B(bar,.5,c.r,.45,110);B(bar,1,c.r,.45,104);B(bar,1.5,c.r,.45,104);B(bar,2.5,c.r,.45,106);B(bar,3,c.r,.45,104);B(bar,3.5,ant(c,c.r,nx.r),.45,110);};
 const bassPreEnd=(bar,c)=>{for(const b of[.5,1,1.5,2,2.5])B(bar,b,c.r,.45,108+(b===.5?4:0));};
 const bassChorus=(bar,c,nx)=>{B(bar,0,c.r,.4,112);B(bar,.5,c.r,.45,104);B(bar,1.5,alt(c),.45,106);B(bar,2.5,c.r,.45,106);B(bar,3.5,ant(c,c.r,nx.r),.45,110);};
 const bassBridge=(bar,c)=>{B(bar,0,c.r,1.4,104);B(bar,2,alt(c),.9,98);};

 /* ───────── drum patterns ───────── */
 const HH=68,SN=112,CR=118;
 const beat8=(bar,{crash=false,last=true,accent=0}={})=>{D(bar,[...(crash?[[0,'cr',CR]]:[[0,'hh',HH+12],[.5,'hh',HH]]),[1,'sn',SN+accent],[1.5,'hh',HH],[2.5,'hh',HH+6],[3,'sn',SN+accent],...(last?[[3.5,'hh',HH]]:[])]);};
 const hats=(bar)=>D(bar,[0,.5,1,1.5,2,2.5,3,3.5].map(b=>[b,'hh',b%1?HH-8:HH+6]));
 const fillA=(bar)=>D(bar,[[0,'hh',HH+10],[.5,'hh',HH],[1,'sn',108],[1.5,'sn',112],[2,'t1',108],[2.5,'t2',112],[3.25,'t3',118]]);
 const fillB=(bar)=>D(bar,[[0,'hh',HH+10],[1,'sn',110],[1.5,'t1',104],[2,'t1',110],[2.5,'t2',112],[3.25,'t3',118]]);
 const fillC=(bar)=>D(bar,[[0,'sn',104],[.5,'sn',100],[1,'sn',108],[1.5,'sn',104],[2,'t1',110],[2.5,'t2',114],[3.25,'t3',120]]);
 const build4=(bar,{crash=false,last=true}={})=>D(bar,[[0,crash?'cr':'sn',crash?CR:SN],...(crash?[]:[[.5,'hh',HH]]),[1,'sn',SN],[1.5,'hh',HH],[2,'sn',SN+2],[2.5,'hh',HH],[3,'sn',SN+4],...(last?[[3.5,'hh',HH]]:[])]);
 const build8=(bar,{crash=false}={})=>D(bar,[[0,crash?'cr':'sn',crash?CR:106],...[.5,1,1.5,2,2.5,3,3.5].filter(b=>!(crash&&b===.5)).map((b,i)=>[b,'sn',104+i*2])]);
 const buildStop=(bar)=>D(bar,[[0,'sn',108],[.5,'sn',110],[1,'sn',112],[1.5,'sn',114],[2,'sn',116],[2.5,'sn',118],[3,'t1',120]]);   // silence after beat 3: the drop before the chorus
 const chorusBar=(bar,{crash=true,last=false}={})=>D(bar,[[0,crash?'cr':'hh',crash?CR:HH+12],...(crash?[]:[[.5,'hh',HH]]),[1,'sn',SN+4],[1.5,'hh',HH],[2,'hh',HH+8],[2.5,'hh',HH],[3,'sn',SN+6],...(last?[[3.5,'hh',HH]]:[])]);
 const half=(bar,{crash=false}={})=>D(bar,[...(crash?[[0,'cr',CR-4]]:[[0,'hh',HH+8],[.5,'hh',HH-4]]),[1,'hh',HH],[1.5,'hh',HH-4],[2,'sn',SN],[2.5,'hh',HH],[3,'hh',HH-4],[3.5,'hh',HH]]);

 /* ───────── right-hand material ───────── */
 // The hook riff: 16ths with a doubled octave on beat 2, one bar per chord
 const RIFF_RH={
  Am:[[0,'A4',.4],[.5,'C5'],[.75,'E5'],[1,['A4','A5'],.4],[1.5,'G5'],[1.75,'E5'],[2,'C5',.4],[2.5,'E5'],[2.75,'G5'],[3,'A5'],[3.25,'G5'],[3.5,'E5'],[3.75,'D5']],
  F:[[0,'F4',.4],[.5,'A4'],[.75,'C5'],[1,['F4','F5'],.4],[1.5,'E5'],[1.75,'C5'],[2,'A4',.4],[2.5,'C5'],[2.75,'F5'],[3,'A5'],[3.25,'G5'],[3.5,'F5'],[3.75,'E5']],
  C:[[0,'G4',.4],[.5,'C5'],[.75,'E5'],[1,['G4','G5'],.4],[1.5,'E5'],[1.75,'C5'],[2,'G4',.4],[2.5,'C5'],[2.75,'E5'],[3,'G5'],[3.25,'F5'],[3.5,'E5'],[3.75,'D5']],
  G:[[0,'G4',.4],[.5,'B4'],[.75,'D5'],[1,['G4','G5'],.4],[1.5,'F5'],[1.75,'D5'],[2,'B4',.4],[2.5,'D5'],[2.75,'G5'],[3,'B5'],[3.25,'A5'],[3.5,'G5'],[3.75,'F5']],
 };
 const riffBar=(bar,name,t,v)=>R(bar,t,RIFF_RH[name].map(([b,p,d],i)=>[b,p,d,v+(i%3===0?6:0)]));
 // Verse: a talky melody, the long notes leave room for the bass
 const VERSE_RH=[
  [[0,'E5'],[.25,'E5'],[.5,'E5'],[.75,'D5'],[1,'C5',.45],[1.5,'A4',.7],[2.5,'C5'],[2.75,'D5'],[3,'E5',.45],[3.5,'D5'],[3.75,'C5']],
  [[0,'A4',.7],[.75,'C5'],[1,'A4',.45],[1.5,'F4',.45],[2,'G4',.45],[2.5,'A4',1.2]],
  [[.5,'G4'],[.75,'A4'],[1,'C5',.45],[1.5,'E5',.45],[2,'D5'],[2.25,'C5'],[2.5,'G4',.9],[3.5,'G4'],[3.75,'A4']],
  [[0,'B4',.45],[.5,'D5'],[.75,'E5'],[1,'D5',.45],[1.5,'B4',.45],[2,'A4',.45],[2.5,'B4',1.2]],
  [[0,'E5'],[.25,'E5'],[.5,'E5'],[.75,'D5'],[1,'C5',.45],[1.5,'A4',.7],[2.5,'C5'],[2.75,'D5'],[3,'E5',.45],[3.5,'G5'],[3.75,'E5']],
  [[0,'C5',.7],[.75,'A4'],[1,'C5',.45],[1.5,'F5',.45],[2,'E5',.45],[2.5,'C5',1.2]],
  [[.5,'G4'],[.75,'A4'],[1,'C5',.45],[1.5,'E5',.45],[2,'G5'],[2.25,'E5'],[2.5,'D5',.9],[3.5,'C5'],[3.75,'D5']],
  [[0,'D5'],[.25,'D5'],[.5,'D5'],[.75,'E5'],[1,'D5',.45],[1.5,'B4',.45],[2,'A4',.45],[2.5,'B4',.9],[3.5,'B4'],[3.75,'C5']],
 ];
 // Pre-chorus: four bars of a rising line, then chord stabs that get denser
 const PRE_RH=[
  [[0,'D5',.45],[.5,'F5',.45],[1,'E5'],[1.25,'D5'],[1.5,'A4',.45],[2,['D4','F4','A4'],.2,90],[2.5,'D5'],[2.75,'F5'],[3,'A5',.45],[3.5,'G5'],[3.75,'F5']],
  [[0,'E5',.7],[.75,'G5'],[1,'E5',.45],[1.5,'B4',.45],[2,['E4','G4','B4'],.2,90],[2.5,'E5',.45],[3,'G5',.45],[3.5,'B4',.45]],
  [[0,'F5',.45],[.5,'A5',.45],[1,'G5'],[1.25,'F5'],[1.5,'C5',.45],[2,['F4','A4','C5'],.2,90],[2.5,'F5'],[2.75,'A5'],[3,'C6',.45],[3.5,'A5'],[3.75,'G5']],
  [[0,'G5',.45],[.5,'G5'],[.75,'G5'],[1,'F5',.45],[1.5,'E5',.45],[2,'D5',.45],[2.5,'E5',.45],[3,'F5',.45],[3.5,'G5',.45]],
 ];
 const stabs=(bar,name,t,beats,v=96,d=.2)=>R(bar,t,beats.map((b,i)=>[b,V[name],d,v+(i%2?0:6)]));
 // Chorus: the hook "A G E C D E", the second half climbs to B, the E7 bar pulls back home
 const CHORUS_RH=[
  [[0,['A4','A5'],.7,112],[.75,'G5'],[1,'E5',.45],[1.5,'C5',.45],[2,'D5',.45],[2.5,'E5',.9],[3.5,['F4','A4','C5'],.2,92]],
  [[0,['G4','B4','D5'],.2,94],[.5,'D5'],[.75,'E5'],[1,'G5',.7],[1.75,'F5'],[2,'E5',.45],[2.5,'D5',.9],[3.5,['G4','B4','D5'],.2,92]],
  [[0,['E4','G4','B4'],.2,94],[.5,'C5'],[.75,'D5'],[1,'E5',.45],[1.5,'G5',.45],[2,'F5'],[2.25,'E5'],[2.5,'D5',.45],[3,'B4',.4],[3.5,['E4','G4','B4'],.2,92]],
  [[0,'C5',.45],[.5,'D5',.45],[1,['A4','E5'],.9,110],[2,['A4','C5','E5'],.2,94],[2.5,['A4','C5','E5'],.2,94],[3,['A4','C5','E5'],.2,98],[3.5,'E5'],[3.75,'F5']],
  [[0,['A4','A5'],.7,114],[.75,'G5'],[1,'E5',.45],[1.5,'C5',.45],[2,'D5',.45],[2.5,'E5',.9],[3.5,['F4','A4','C5'],.2,92]],
  [[0,['G4','B4','D5'],.2,94],[.5,'D5'],[.75,'E5'],[1,'G5',.7],[1.75,'A5'],[2,'B5',.45,112],[2.5,'A5',.9,110],[3.5,['G4','B4','D5'],.2,92]],
  [[0,'B5',.45,112],[.5,'A5',.45],[1,'G#5',.45],[1.5,'E5',.4],[2,['E4','G#4','B4','D5'],.2,96],[2.5,'D5',.45],[3,'E5',.45],[3.5,'G#5',.45]],
 ];
 const CHORUS_END={
  riff:[[0,['A4','A5'],1.4,114],[2,['A4','C5','E5'],.2,96],[2.5,['A4','C5','E5'],.2,96],[3,['A4','C5','E5'],.2,100],[3.5,['A4','C5','E5'],.2,104]],
  stop:[[0,['A4','A5'],.8,114]],
  drive:[[0,['A4','A5'],.8,114],[3.5,'E5'],[3.75,'F5']],
  big:[[0,['A4','C5','E5','A5'],1.5,118],[2,['A4','C5','E5','A5'],.2,100],[2.5,['A4','C5','E5','A5'],.2,102],[3,['A4','C5','E5','A5'],.2,106],[3.5,['G4','B4','D5','G5'],.2,108]],
 };
 // Bridge: sustained chords with a quiet tune, then arpeggios climb toward the drop
 const BRIDGE_RH=[
  [[1,['F4','A4','C5'],.9,84],[2,'C5',.45,90],[2.5,'D5',.45,92],[3,'E5',.9,94]],
  [[0,['G4','B4','D5'],1.4,84],[1.5,'D5',.45,90],[2,'E5',.45,92],[2.5,'F5',1.2,94]],
  [[0,['A4','C5','E5'],1.4,86],[1.5,'E5',.45,92],[2,'D5',.45,92],[2.5,'C5',1.2,94]],
  [[0,['E4','G4','B4'],1.4,84],[1.5,'B4',.45,90],[2,'C5',.45,92],[2.5,'D5',1.2,94]],
  [[0,['F4','A4','C5'],.9,92],[1,'C5'],[1.25,'F5'],[1.5,'A5'],[1.75,'F5'],[2,'C5'],[2.25,'F5'],[2.5,'A5'],[2.75,'C6'],[3,'A5'],[3.25,'F5'],[3.5,'C5'],[3.75,'A4']],
  [[0,['G4','B4','D5'],.9,94],[1,'D5'],[1.25,'G5'],[1.5,'B5'],[1.75,'G5'],[2,'D5'],[2.25,'G5'],[2.5,'B5'],[2.75,'G5'],[3,'D5'],[3.25,'G5'],[3.5,'B5'],[3.75,'D5']],
  [[0,['A4','C5','E5'],.9,98],[1,'E5'],[1.25,'F5'],[1.5,'G5'],[1.75,'A5'],[2,'B5',.45,108],[2.5,'C6',.5,112]],
  [],
 ];

 /* ───────── the piece ───────── */
 const marks=[];const mark=(bar,c)=>marks.push([bar,c.n]);
 let bar=0;
 const chordAt=(names,i,t)=>up(CH[names[i%names.length]],t);

 // ── Intro (0..7): the riff alone with kick and bass, drums join at bar 2, full band from bar 4
 for(let i=0;i<8;i++){const c=chordAt(RIFF,i,0),nx=chordAt(RIFF,i+1,0);mark(bar+i,c);
  if(i<7)riffBar(bar+i,RIFF[i%4],0,i<4?96:104);
  else R(bar+i,0,[[0,['G4','B4','D5','G5'],.3,108]]);
  bassRiff(bar+i,c,i===7?chordAt(VERSE,0,0):nx);
  if(i<2)hats(bar+i);else if(i===3||i===7)fillA(bar+i);else beat8(bar+i,{crash:i===4,last:i!==2&&i!==6});
  K(bar+i,i===7?[0,1,2]:[0,1,2,3]);
 }
 knob(7,1.5,'cutoff',1.0,.58);
 bar=8;
 // ── Verse 1 (8..15)
 for(let i=0;i<8;i++){const c=chordAt(VERSE,i,0),nx=i===7?chordAt(PRE,0,0):chordAt(VERSE,i+1,0);mark(bar+i,c);
  R(bar+i,0,VERSE_RH[i],100);bassVerse(bar+i,c,nx);
  if(i%2===1&&i!==7)R(bar+i,0,[[3.25,V[VERSE[i%4]].slice(0,2),.2,86],[3.75,V[VERSE[i%4]].slice(0,2),.2,86]]);
  if(i===3||i===7)fillA(bar+i);else beat8(bar+i,{last:i!==2&&i!==6});
  K(bar+i,[0,2,2.5]);
 }
 bar=16;
 // ── Pre-chorus 1 (16..23): the line climbs, then the stabs, then everything stops
 const preChorus=(bar,t,second)=>{
  for(let i=0;i<8;i++){const c=chordAt(PRE,i,t),nx=i===7?chordAt(CHORUS,0,t):chordAt(PRE,i+1,t);mark(bar+i,c);
   if(i<3)R(bar+i,t,PRE_RH[i],104);
   else if(i===3)R(bar+i,t,second?PRE_RH[3].slice(0,5):PRE_RH[3],106);
   else if(i===4)stabs(bar+i,PRE[0],t,second?[.75,1.5,2,2.5,3,3.5]:[0,.75,1.5,2,2.5,3,3.5],96);
   else if(i===5)stabs(bar+i,PRE[1],t,[0,.75,1.5,2,2.5,3,3.5],98);
   else if(i===6)stabs(bar+i,PRE[2],t,[0,.5,1,1.5,2,2.5,3,3.5],102);
   else stabs(bar+i,PRE[3],t,[0,.25,.5,.75],108,.18);
   if(i<4)bassPreA(bar+i,c,nx);else if(i<7)bassPreB(bar+i,c,nx);else bassPreEnd(bar+i,c);
   if(i<3)beat8(bar+i,{last:i!==2});else if(i===3)fillB(bar+i);else if(i===4)build4(bar+i,{crash:true});else if(i===5)build4(bar+i,{last:false});else if(i===6)build8(bar+i,{crash:true});else buildStop(bar+i);
   K(bar+i,i<4?[0,1.5,2]:i<7?[0,2,3.5]:[0,2]);
  }
  if(second)knob(bar+3,3.15,'resonance',.75,.5);
  knob(bar+7,2.25,'cutoff',1.0,1);
 };
 preChorus(16,0,false);
 bar=24;
 // ── Chorus (24..31)
 const chorus=(bar,t,ending,v=108,octaves=false)=>{
  for(let i=0;i<8;i++){const c=chordAt(CHORUS,i,t),nx=i===7?null:chordAt(CHORUS,i+1,t);mark(bar+i,c);
   const line=i<7?CHORUS_RH[i]:CHORUS_END[ending];
   R(bar+i,t,octaves?line.map(([b,p,d,v2])=>[b,Array.isArray(p)?p:[p.replace(/\d$/,o=>o-1),p],d,v2]):line,v);
   const after=ending==='riff'?chordAt(RIFF,0,t):ending==='stop'?chordAt(BRIDGE,0,t):ending==='drive'?chordAt(CHORUS,0,t):chordAt(RIFF,0,t);
   bassChorus(bar+i,c,nx??after);
   if(i===3)fillA(bar+i);else if(i===7)fillC(bar+i);else chorusBar(bar+i,{crash:true,last:false});
   K(bar+i,[0,1,2,3]);
  }
 };
 chorus(24,0,'riff');
 bar=32;
 // ── Interlude riff (32..35): bright, then the hand leaves the keys to darken the tone for verse 2
 for(let i=0;i<4;i++){const c=chordAt(RIFF,i,0),nx=i===3?chordAt(VERSE,0,0):chordAt(RIFF,i+1,0);mark(bar+i,c);
  if(i<3)riffBar(bar+i,RIFF[i],0,106);else R(bar+i,0,[[0,['G4','B4','D5','G5'],.3,110]]);
  bassRiff(bar+i,c,nx);
  if(i===3)fillA(bar+i);else beat8(bar+i,{crash:i===0,last:i!==2});
  K(bar+i,[0,1,2,3]);
 }
 knob(35,1.5,'cutoff',1.0,.64);
 bar=36;
 // ── Verse 2 (36..43): same tune, the long notes get chord stabs behind them
 for(let i=0;i<8;i++){const c=chordAt(VERSE,i,0),nx=i===7?chordAt(PRE,0,0):chordAt(VERSE,i+1,0);mark(bar+i,c);
  const line=VERSE_RH[i].map(([b,p,d,v])=>[b,p,d&&d>1?.7:d,v]);
  R(bar+i,0,line,102);
  if(i%2===1&&i!==7)stabs(bar+i,VERSE[i%4],0,[3.25,3.75],90);
  bassVerse(bar+i,c,nx);
  if(i===3||i===7)fillA(bar+i);else beat8(bar+i,{crash:i===0,last:i!==2&&i!==6});
  K(bar+i,[0,2,2.5]);
 }
 bar=44;
 // ── Pre-chorus 2 (44..51) with the resonance lift
 preChorus(44,0,true);
 bar=52;
 // ── Chorus 2 (52..59): ends on a held note; the hand turns three knobs while the drums go half-time
 chorus(52,0,'stop',110);
 knob(59,2.0,'cutoff',.75,.6);knob(59,2.75,'resonance',.75,.2);knob(59,3.5,'reverb',.75,.55);
 bar=60;
 // ── Bridge (60..67)
 for(let i=0;i<8;i++){const c=chordAt(BRIDGE,i,0);mark(bar+i,c);
  R(bar+i,0,BRIDGE_RH[i],96);
  bassBridge(bar+i,c);
  if(i===3)fillB(bar+i);else if(i===7)buildStop(bar+i);else half(bar+i,{crash:i===0||i===4});
  K(bar+i,i===7?[0,2]:[0,2.5]);
 }
 knob(67,.25,'cutoff',1.5,1);knob(67,1.75,'reverb',.75,.25);
 bar=68;
 // ── Last chorus ×2 (68..83), a semitone up
 chorus(68,1,'drive',112);
 knob(75,2,'drive',.75,.45);
 chorus(76,1,'big',116,true);
 bar=84;
 // ── Outro riff (84..87) in the new key
 for(let i=0;i<4;i++){const c=chordAt(RIFF,i,1),nx=i===3?up(CH.Am,1):chordAt(RIFF,i+1,1);mark(bar+i,c);
  riffBar(bar+i,RIFF[i],1,108);
  bassRiff(bar+i,c,nx);
  if(i===3)fillA(bar+i);else beat8(bar+i,{crash:i===0,last:i!==2});
  K(bar+i,[0,1,2,3]);
 }
 bar=88;
 // ── Ending (88..89): one big chord, then the reverb opens while it rings
 mark(88,up(CH.Am,1));
 R(88,1,[[0,['A4','C5','E5','A5'],1.2,120]]);
 B(88,0,up(CH.Am,1).r,2.0,114);
 D(88,[[0,'cr',124]]);K(88,[0],118);
 knob(88,2.5,'reverb',1.0,.75);

 /* ───────── emit with body-aware clean-up ───────── */
 rh.sort((a,b)=>a.s-b.s||a.ps[0]-b.ps[0]);
 // a note ends before the next right-hand onset (fingers and hand span are then never shared)
 for(let i=0;i<rh.length;i++){const e=rh[i];let j=i+1;while(j<rh.length&&rh[j].s<=e.s+1e-6)j++;if(j<rh.length)e.d=Math.min(e.d,+(rh[j].s-e.s-.02).toFixed(4));}
 // fingers: chords by count, single notes by their rank inside the phrase
 const CHORD_F={1:[3],2:[1,5],3:[1,3,5],4:[1,2,4,5],5:[1,2,3,4,5]};
 let phrase=[];const flush=()=>{if(!phrase.length)return;const uniq=[...new Set(phrase.map(e=>e.ps[0]))].sort((a,b)=>a-b);const n=uniq.length;const map=n===1?[3]:n===2?[2,4]:n===3?[1,3,5]:n===4?[1,2,4,5]:null;for(const e of phrase){const r=uniq.indexOf(e.ps[0]);e.f=[map?map[r]:1+Math.round(4*r/(n-1))];}phrase=[];};
 for(let i=0;i<rh.length;i++){const e=rh[i];if(e.ps.length>1){flush();e.ps.sort((a,b)=>a-b);e.f=CHORD_F[e.ps.length];continue;}const prev=phrase[phrase.length-1];if(prev&&e.s-prev.s>1.0)flush();phrase.push(e);}
 flush();
 for(const e of rh)e.ps.forEach((p,i)=>s.n(s.keys,p,e.s,e.d,e.v,e.f[i]));
 bs.sort((a,b)=>a.s-b.s);
 for(let i=0;i+1<bs.length;i++)bs[i].d=Math.min(bs[i].d,+(bs[i+1].s-bs[i].s-.01).toFixed(4));
 for(const b of bs)s.bass(b.p,b.s,b.d,b.v);
 for(const d of dr)s.hit(d.k,d.s,d.v);
 for(const k of kk)s.hit('kick',k.s,k.v);
 s.keys.knobs=knobs;
 for(const [b,c] of marks)s.mark(b,c);
 return s.finish(
  {full:96,crash:96.02,synth:96.8,stick:101,pedal:98.5,knob:94.75,ar:94.75},
  [{beat:0,text:'16分のリフが走り出す。この曲の顔。'},{beat:32,text:'音を絞って、夜の街を語る。'},{beat:80,text:'和音を刻んで溜める。全部止めてから、開く。'},{beat:96,text:'サビ。「ラ・ソ・ミ・ド・レ・ミ」。'},{beat:240,text:'一度、息をつく。残響の中で。'},{beat:272,text:'半音上がって、最後のサビ。'},{beat:352,text:'夜を追い越した。'}]
 );
}
