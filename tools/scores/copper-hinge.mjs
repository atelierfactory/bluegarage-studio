// 銅の蝶番 — slow, swung half-time. The bass finishes the lead's sentences.
// No form, rhythm grid or automation cue sheet is shared with the other pieces.
import {score} from './score.mjs';
export default function copper(){
 const s=score({id:'copper-hinge',title:'銅の蝶番 — 影の返答',tempo:100,key:'C Dorian',sections:[['低い声の呼びかけ',4],['跳ねる問い',10],['足だけの返答',4],['重い二拍',8],['三小節の影',3],['九小節の独白',9],['蝶番を締める',4],['倍に走る足音',8],['最後のひと言',2]],concept:'跳ねる三連の裏拍、二拍目を待つ重い太鼓。「ド・ソ・シ♭・ミ♭」の問いを右足が引き取る。168拍からスネアの位置を増やし、同じ速さのまま倍に走る。',volume:[0,-2,-5],lead:{name:'COPPER / AFTERIMAGE',osc:[{wave:'pulse',level:.58,pw:.32,unison:3,spread:13,width:.58},{wave:'saw',level:.23,detune:-7}],filter:{model:'ladder',cutoff:1500,resonance:.25,envAmount:1.8,keyTrack:.38,velAmount:.18},ampEnv:{a:.003,d:.15,s:.44,r:.85},filterEnv:{a:.002,d:.14,s:.1,r:.12},drive:{amount:.20,asym:.18},lfo1:{wave:"sine",rate:2.5,sync:true,division:"1/4",depth:.015,target:"cutoff",fadeIn:.06,retrig:false},fx:{chorus:{mix:.08,rate:.65,depth:.14},delay:{mix:.10,time:2/3,feedback:.41,tone:3900},reverb:{mix:.08,decay:1.6,damp:.64}},level:-1},bass:{name:'COPPER / TALKBACK',osc:[{wave:'pulse',level:.49,pw:.41},{wave:'triangle',level:.56}],filter:{model:'ladder',cutoff:930,resonance:.22,envAmount:1.3,keyTrack:.26},ampEnv:{a:.003,d:.15,s:.58,r:.09},filterEnv:{a:.002,d:.18,s:.10,r:.10},drive:{amount:.15,asym:.14},voice:{mono:true,glide:.012,legato:false},level:0}});
 const cues=[[3,'cutoff',.83],[7,'envAmount',.49],[13,'drive',.51],[16,'resonance',.60],[24,'cutoff',.29],[26,'delay',.72],[28,'reverb',.61],[32,'envAmount',.25],[36,'lfoDepth',.20],[38,'resonance',.42],[40,'cutoff',.94],[41,'delay',.14],[45,'drive',.62],[49,'reverb',.18]];
 const rests=new Set(cues.map(c=>c[0]));s.keys.knobs=cues.map(([b,param,to])=>({param,to,s:b*4+.92,d:2.12}));
 const single=(b,p,t,d=.24,v=103,f=3)=>{if(!rests.has(b))s.key(p,b*4+t,d,v,f);};
 const stab=(b,p,t,d=.20,v=106)=>{if(!rests.has(b))s.chord(p,b*4+t,d,v);};
 const cascade=(b,notes,start=0,v=105)=>notes.forEach((p,i)=>{if(i%2===0)stab(b,p>=60?[p-12,p]:[p,p+12],start+i*.25,.19,v+i%3*3);else single(b,p,start+i*.25,.19,v+(i%3)*3,[1,2,3,1,2,3,4,5][i%8]);});
 // A deliberately uneven four-note hook, with a low octave answer before the bar ends.
 function ask(b,wide=false){
  [[0,72,.52],[2/3,67,.78],[5/3,70,.25],[2,63,.62]].forEach(([t,p,d],i)=>stab(b,wide?({72:[60,63,67,72],67:[55,60,63,67],70:[58,62,65,70],63:[51,55,58,63]})[p]:[p-12,p-5,p],t,d,111-i*3));
  single(b,65,3,.22,99,2);single(b,67,10/3,.55,108,4);
 }
 function reply(b,lift=0){
  // The tail rises in thirds; the held flat seventh is the recognisable answer.
  [[0,63,.54],[2/3,67,.23],[1,69,.52],[5/3,70,.88]].forEach(([t,p,d],i)=>stab(b,[p-12+lift,p-5+lift,p+lift],t,d,101+i*4));
  cascade(b,[67,65,63,60].map(p=>p+lift),3,104);
 }
 // Four opening bars introduce the foot first; the upper instrument joins on the offbeat.
 for(const b of[0,1]){stab(b,b?[55,59,62,65]:[60,63,67,70],2/3,.24,97);single(b,b?67:72,8/3,.65,103);}
 cascade(2,[48,51,55,58,60,63,67,70],0,93);stab(2,[60,63,67,72],8/3,.27,112);
 for(let b=4;b<14;b+=2){ask(b);reply(b+1);}
 // Leave a complete gap for the foot's four-note answer; upper notes are punctuations.
 for(const b of[14,15,17]){stab(b,[60,63,67],0,.23,101);stab(b,[58,62,65,70],10/3,.28,106);stab(b,[60,63,67],.5,.18,88);}
 for(let b=18;b<26;b+=2){ask(b,true);reply(b+1,12);}
 stab(27,[60,65,69,74],0,1.4,76);single(27,79,8/3,.7,81);
 // Nine-bar solo: four paired arguments and one extra, hanging dominant bar.
 cascade(29,[60,63,67,70,72,75,79,82,79,75,72,70,67,63,60,58],0,105);
 reply(30,12);ask(31,true);
 cascade(33,[53,57,60,63,65,69,72,75,77,75,72,69],0,108);stab(33,[65,69,72,77],3,.65,114);
 cascade(34,[55,59,62,65,67,71,74,77,79,77,74,71,67,65,62,59],0,105);
 reply(35,12);stab(37,[59,62,65,71],0,1.6,112);cascade(37,[71,74,77,79,83,79,77,74],2,111);
 // The right hand stops to tighten resonance / cutoff; snare grows behind it.
 cascade(39,[48,51,55,58,60,63,67,70,72,75,79,82],0,111);stab(39,[60,63,67,72],3,.65,117);
 // Same hook compressed into straight sixteenths, with hard gaps after each phrase.
 for(let b=42;b<50;b++){
  if(b%2===0){[[0,[60,63,67,72]],[.75,[55,60,63,67]],[1.5,[58,62,65,70]],[2,[51,55,58,63]]].forEach(([t,p])=>stab(b,p,t,.22,116));cascade(b,[63,65,67,70,72,75],2.5,111);}
  else{cascade(b,[72,75,79,82,79,75,72,70],0,113);[2,2.75,3.5].forEach(t=>stab(b,[60,63,67,72],t,.22,117));}
 }
 ask(50,true);stab(51,[60,63,67,72],0,.55,120);single(51,67,1,.25,108,2);single(51,70,5/3,.25,106,4);stab(51,[60,63,67,72],8/3,.95,119);
 // Foot: anticipations at thirds of beats, leaps with >=0.40 seconds travel time.
 // The short accent is released before the 0.45-second hand travel; its tail remains audible.
 for(const [b]of cues)s.chord(b>=38&&b<42?[59,62,65,71]:[60,63,67,72],b*4,.14,109);
 const roots=[24,27,29,31,24,29];
 for(let b=0;b<52;b++){
  const at=b*4,root=roots[b%6];s.mark(b,['Cm9','Eb6','F9','G7','Cm9','F9'][b%6]);
  if(b>=14&&b<18){[[1/3,24],[1,31],[5/3,34],[7/3,27],[10/3,29]].forEach(([t,p])=>s.bass(p,at+t,.27,113));continue;}
  if(b>=26&&b<29){s.bass(root,at+1/3,.85,85);s.bass(root===24?36:root-5,at+7/3,.65,88);continue;}
  if(b===51){s.bass(24,at+1/3,.55,112);s.bass(36,at+8/3,.9,112);continue;}
  [[1/3,root],[1,root===24?36:root+3<=36?root+3:root-3],[5/3,root===24?34:root+2],[7/3,root],[10/3,root+5<=36?root+5:root-5]].forEach(([t,p])=>s.bass(p,at+t,.26,103+(t===1/3?8:0)));
 }
 // Swung hats, a single heavy snare on beat 3, and ghost strokes of the same snare.
 for(let b=0;b<52;b++){
  const at=b*4,quiet=b>=26&&b<29,double=b>=42&&b<50,cr=rests.has(b)||b%2===0||[9,19,21,23,29,33,35,37,39,43,47,51].includes(b);
  if(quiet){s.hit(cr?'cr':'hh',at,88);s.hit('sn',at+2,75);s.hit('kick',at,85);continue;}
  if(b===51){s.hit('cr',at,119);s.hit('sn',at+1,108);s.hit('cr',at+8/3,127);s.hit('kick',at,117);s.hit('kick',at+8/3,121);continue;}
  if([3,13,16,38,40,41].includes(b)){s.hit('cr',at,118);for(const t of[2/3,1,4/3,5/3,2,7/3])s.hit('sn',at+t,80+t*14);s.hit('t1',at+8/3,112);s.hit('t3',at+10/3,118);}
  else if([17,25,37,49].includes(b)){[[0,'cr'],[2/3,'t1'],[4/3,'t2'],[2,'t3'],[8/3,'sn'],[10/3,'sn']].forEach(([t,k])=>s.hit(k,at+t,112));}
  else{[[0,cr?'cr':'hh'],[2/3,'hh'],[1,double?'sn':'hh'],[5/3,'hh'],[2,double?'hh':'sn'],[8/3,'hh'],[3,double?'sn':'hh'],[10/3,'hh']].forEach(([t,k])=>s.hit(k,at+t,k==='cr'?120:k==='sn'?118:t%1?64:78));}
  (double?[0,1.5,2,3.5]:[0,5/3,3]).forEach(t=>s.hit('kick',at+t,113+(t===0?5:0)));
 }
 return s.finish({full:168,crash:168.02,synth:169,stick:58,pedal:57,knob:13.98,ar:13.98},[{beat:16,text:'跳ねる四つの音が、低い返事を待つ。'},{beat:56,text:'右手が黙り、右足が主旋律に答える。'},{beat:104,text:'三小節だけ響きの中へ引く。'},{beat:148,text:'九小節の独白の最後で、解決を一小節遅らせる。'},{beat:168,text:'太鼓の間隔が変わり、同じ速さなのに倍に走り出す。'}]);
}
