// 白磁の螺旋 — 3/4, E minor opening into G major, with two-against-three at the crest.
// The three-note seed E–F#–B grows from a single line into a broad, singing arch.
import {score} from './score.mjs';
export default function porcelain(){
 const s=score({id:'porcelain-tide',title:'白磁の螺旋',tempo:108,meter:3,key:'E minor / G major',sections:[['三つの灯',8],['小さな螺旋',12],['五小節の階段',5],['白い水柱',12],['底の静けさ',8],['十小節かけて浮く',10],['二つの大きな波',12],['水面に残る輪',5]],concept:'三拍子の中で「ミ・ファ♯・シ」が大きく育つ。五小節の寄り道と深い谷を挟み、165拍から二拍ずつの大きな旋律が三拍子をまたぐ。最後は速さでなく歌の広がりで持ち上げる。',volume:[0,-3,-6],lead:{name:'PORCELAIN / HELIX',osc:[{wave:'supersaw',level:.58,spread:31,width:.94},{wave:'wt:bell',level:.26,morph:.33,detune:3}],filter:{model:'ladder',cutoff:1850,resonance:.16,envAmount:.46,keyTrack:.4,velAmount:.12},ampEnv:{a:.013,d:.24,s:.72,r:1.4},filterEnv:{a:.012,d:.34,s:.23,r:.55},drive:{amount:.08,asym:.03},lfo1:{wave:"sine",rate:.65,depth:.012,target:"cutoff",fadeIn:.15,retrig:false},fx:{chorus:{mix:.18,rate:.28,depth:.26},delay:{mix:.16,time:.75,feedback:.39,tone:5700},reverb:{mix:.21,decay:3.4,damp:.49}},level:-1},bass:{name:'PORCELAIN / DEPTH',osc:[{wave:'triangle',level:.70},{wave:'saw',level:.29}],sub:{wave:'sine',octave:-1,level:.10},filter:{model:'ladder',cutoff:800,resonance:.10,envAmount:.90,keyTrack:.3},ampEnv:{a:.005,d:.23,s:.76,r:.16},filterEnv:{a:.005,d:.25,s:.15,r:.15},drive:{amount:.09},voice:{mono:true,glide:.018,legato:false},level:0}});
 const cues=[[5,'envAmount',.20],[11,'cutoff',.80],[18,'drive',.37],[22,'resonance',.48],[24,'cutoff',.94],[35,'cutoff',.27],[37,'delay',.69],[40,'reverb',.73],[43,'lfoDepth',.19],[48,'delay',.22],[52,'drive',.51],[54,'cutoff',.97],[61,'resonance',.32],[65,'reverb',.28],[69,'cutoff',.40]];
 const rests=new Set(cues.map(c=>c[0]));s.keys.knobs=cues.map(([b,param,to])=>({param,to,s:b*3+.92,d:1.33}));
 const key=(b,p,t,d=.19,v=102,f=3)=>{if(!rests.has(b))s.key(p,b*3+t,d,v,f);};
 const chord=(b,p,t,d=.20,v=102)=>{if(!rests.has(b))s.chord(p,b*3+t,d,v);};
 const arpeggio=(b,notes,velocity=101)=>notes.forEach((p,i)=>chord(b,p>=60?[p-12,p]:[p,p+12],i*.25,.19,velocity+i%3*2));
 function seed(b,answer=false,full=false){
  if(!answer){chord(b,full?[64,67,71,76]:[64,71,76],0,.72,full?115:101);chord(b,full?[66,69,74,78]:[66,74,78],.875,.56,full?113:103);chord(b,full?[71,74,78,83]:[71,78,83],1.625,.82,full?116:107);key(b,81,2.625,.23,109,4);}
  else{[[0,79,.68],[.75,78,.43],[1.25,76,.43],[1.75,74,.43],[2.25,71,.60]].forEach(([t,p,d])=>chord(b,full?({79:[67,71,74,79],78:[66,69,74,78],76:[64,67,71,76],74:[62,67,71,74],71:[59,62,66,71]})[p]:[p-12,p-5,p],t,d,full?115:105));}
 }
 const rising=[52,55,59,64,67,71,76,79,83,79,76,71],falling=[79,76,71,67,64,59,55,52,55,59,64,67];
 // Each of the first three lights occupies a bar. The rest of the opening unwinds it.
 for(const[b,p]of[[0,76],[1,78],[2,83]]){chord(b,[p-12,p],0,1.2,86);[p-12,p-7,p-5,p-12].forEach((x,i)=>key(b,x,2+i*.25,.19,83+i*3,i+1));}
 arpeggio(3,rising,88);seed(4);arpeggio(6,falling,92);seed(7,true);
 for(let b=8;b<20;b+=4){seed(b);seed(b+1,true);arpeggio(b+2,rising,100);arpeggio(b+3,falling,99);}
 // Five-bar climb: bass roots move E–F#–G–A–B rather than resolving after four.
 arpeggio(20,[52,55,59,64,67,71,76,79,76,71,67,64],105);
 arpeggio(21,[54,57,60,66,69,72,78,81,78,72,69,66],106);
 arpeggio(23,[57,60,64,69,72,76,81,84,81,76,72,69],109);
 for(let b=25;b<37;b+=4){seed(b,false,true);seed(b+1,true,true);arpeggio(b+2,rising,113);for(const t of[0,.75,1.5,2.25])chord(b+3,[64,67,71,76],t,.52,113);}
 // Quiet section: the melody is deliberately incomplete; bass completes E–F#–B.
 for(const b of[38,39,41,42,44]){chord(b,[64,67,71,78],0,1.45,77);key(b,b%2?83:79,2,.65,84,5);}
 for(const b of[45,46,47,49,50,51,53]){arpeggio(b,b%2?rising:falling,98+(b-45)*2);}
 // Final crest: a two-beat melodic pulse crosses the three-beat bar line.
 // Four bars form one six-note arch, each landing followed by flowing inner notes.
 const arch=[79,81,83,81,78,79],voicings={79:[67,71,74,79],81:[69,72,76,81],83:[71,74,79,83],78:[66,69,74,78]};
 for(let group=0;group<3;group++)for(let phraseNote=0;phraseNote<6;phraseNote++){
  const offset=group*12+phraseNote*2,b=55+Math.floor(offset/3),t=offset%3,harmony=voicings[arch[phraseNote]];
  chord(b,harmony,t,.68,116+(group===2?3:0));
  // Five quick inner voices fill the gap; the next main note is exactly two beats later.
  [harmony[0],harmony[1],harmony[2],harmony[3],harmony[2]].forEach((p,i)=>{
   const off=offset+.75+i*.25,bar=55+Math.floor(off/3),within=off%3;
   chord(bar,[p-12,p],within,.19,108+i%3*3);
  });
 }
 // Coda: the three lights return one at a time, and the last chord settles in G major.
 seed(67);seed(68,true);arpeggio(70,[55,59,62,67,71,74,79,83,79,74,71,67],98);chord(71,[67,71,74,79],0,2.55,112);
 for(const [b]of cues)s.chord(b>=55?[67,71,74,79]:[64,67,71,78],b*3,.08,b>=37&&b<45?87:110);
 const roots=[28,31,24,26];
 for(let b=0;b<72;b++){
  const at=b*3,quiet=b>=37&&b<45,root=b>=55?[31,26,28,24][b%4]:b>=20&&b<25?[28,30,31,33,35][b-20]:roots[b%4];s.mark(b,b>=55?['Gmaj9','D','Em','Cmaj7'][b%4]:['Em(add9)','G','Cmaj7','D'][b%4]);
  if(b===71){s.bass(31,at+.5,2.3,107);continue;}
  if(quiet){[[.5,28],[1.5,30],[2.5,35]].forEach(([t,p])=>s.bass(p,at+t,.38,87));continue;}
  const next=root>31?root-2:root+2;[[.5,root],[1.5,next],[2.5,root+5<=36?root+5:root-5]].forEach(([t,p])=>s.bass(p,at+t,.34,b>=55?113:102));
 }
 // Three-beat lilt, with toms carrying the third beat. The crest adds a broad crash each bar.
 for(let b=0;b<72;b++){
  const at=b*3,quiet=b>=37&&b<45,peak=b>=25&&b<37||b>=55&&b<67,cr=peak||rests.has(b)||[0,3,8,14,20,23,45,47,50,53,67,71].includes(b);
  if(b===71){s.hit('cr',at,123);s.hit('kick',at,114);continue;}
  if(quiet){s.hit(cr?'cr':'hh',at,cr?89:48);s.hit('t2',at+1.5,70);s.hit('kick',at,83);continue;}
  if(rests.has(b)){s.hit('cr',at,113);s.hit('sn',at+.5,83);s.hit('sn',at+.75,90);s.hit('sn',at+1,97);s.hit('sn',at+1.25,105);s.hit('t1',at+1.75,110);s.hit('t2',at+2.25,117);}
  else if([7,19,23,36,53,66,70].includes(b)){[[0,cr?'cr':'t1'],[.5,'t1'],[1,'t2'],[1.5,'t2'],[2.25,'t3']].forEach(([t,k])=>s.hit(k,at+t,112));}
  else{[[0,cr?'cr':'hh'],[.5,'hh'],[1,'sn'],[1.5,'hh'],[2,'t1'],[2.5,'hh']].forEach(([t,k])=>s.hit(k,at+t,k==='cr'?120:k==='sn'?108:k==='t1'?97:64));}
  (b>=55?[0,1.5]:[0,1.75]).forEach(t=>s.hit('kick',at+t,b>=55?115:103));
 }
 return s.finish({full:165,crash:165.02,synth:166,stick:79,pedal:75,knob:163.585,ar:163.585},[{beat:24,text:'三つの音が、三拍子の歌になる。'},{beat:60,text:'五小節の階段。四小節で終わると思う所から、もう一段登る。'},{beat:75,text:'長い主旋律と細かな音が交代する最初の山。'},{beat:111,text:'右手が余韻を残し、右足が歌を引き継ぐ。'},{beat:165,text:'大きな旋律が三拍子をまたいで広がる最後の山。'}]);
}
