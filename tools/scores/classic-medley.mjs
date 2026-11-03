// クラシックの名曲メドレー (約 1 分半) — VESPER BAND のチンパンジー用 (2026-11-02)。
// 曲はどれも作曲者の死後 70 年以上たって権利が切れたもの。旋律だけを借り、編曲 (和音・ベース・ドラム・音色) は新しく書く。
//   R.シュトラウス「ツァラトゥストラはかく語りき」冒頭 (1896・1949 没) → オッフェンバック「天国と地獄」の galop (1858・1880 没)
//   → グリーグ「山の魔王の宮殿にて」(1875・1907 没) → リムスキー＝コルサコフ「熊蜂の飛行」(1900・1908 没)
//   → ロッシーニ「ウィリアム・テル」序曲の終わり (1829・1868 没) → ベートーヴェン「運命」の冒頭 4 音 (1808・1827 没) で終わる
// 体の決まり (critic.js): 右手 48〜84・5 音まで / 足鍵盤 24〜36 / スティック 1 本 / テンポは一番速い 136 で検査されるので、
// 遅い所 (ツァラトゥストラ 66・魔王の 96〜) でもスティックの間隔は 136 の時の間隔で書く。
// 画面に出る日本語 (曲名・説明・場面の一言・区切りの名前) は TEXT にまとめ、別に書いてもらった文を入れる。
import {score} from './score.mjs';
import {makeTrack} from '../../public/js/state.js';
import {normalizePatch2} from '../../public/js/synth2.js';
import TEXT from './classic-medley.text.mjs';
import fs from 'node:fs';
// トルコ行進曲の音は、パブリックドメインの楽譜 (Mutopia Project piece 108) の MIDI から取り出した物 (source_turca/SOURCE.txt)
const TURCA=JSON.parse(fs.readFileSync(new URL('./source_turca/turca_notes.json',import.meta.url),'utf8'));

const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const m=s=>{const r=/^([A-G])([#b]?)(-?\d)$/.exec(s);if(!r)throw Error(`bad note ${s}`);return 12*(+r[3]+1)+NOTE[r[1]]+(r[2]==='#'?1:r[2]==='b'?-1:0);};
const BAR=4;

// 区切り (小節数)。拍は 4/4
// 2026-11-03 さとるん「ウィリアム・テルは天国と地獄とかぶって面白くない」「終わりはちゃらりーん、鼻から牛乳の曲がいい」: テルと運命を外し、
// バッハ『トッカータとフーガ ニ短調』の冒頭で終わる。「トッカータの尺は運命くらい」「その前に別の感じの楽しい曲。熊蜂のあとちょっと下がって、
// そこから一気に最高潮」: モーツァルト『トルコ行進曲』(1 回目は小さく軽く → ドラムが強くなる 1 小節 → 2 回目は全開) を入れ、トッカータは 2 小節
const PARTS=[['zara',4],['cancan',9],['king',8],['bee',7],['turk',14],['toccata',3]];
const START={};{let b=0;for(const [k,n] of PARTS){START[k]=b;b+=n;}}
const TOTAL=PARTS.reduce((a,p)=>a+p[1],0);

export default function medley(){
 const s=score({
  id:'classic-medley',title:TEXT.title,tempo:136,key:'C major / C minor',
  composer:TEXT.composer,licenseText:TEXT.license,
  sections:PARTS.map(([k,n])=>[TEXT.sections[k],n]),
  concept:TEXT.concept,
  volume:[-1,-2,-5],
  lead:{name:'MEDLEY / BRASS',description:'金管のように太く、和音でも単音でも前に出るリード',
   osc:[{wave:'supersaw',level:.74,unison:7,spread:34,width:.8,phaseRand:true},{wave:'saw',level:.36,octave:-1,detune:-4,phaseRand:true}],
   sub:{wave:'square',octave:-1,level:.16},noise:{color:'white',level:.03,decay:.02},
   filter:{model:'ladder',cutoff:3000,resonance:.18,envAmount:2.0,keyTrack:.5,velAmount:.45,drive:.12},
   ampEnv:{a:.006,d:.32,s:.68,r:.12},filterEnv:{a:.004,d:.22,s:.3,r:.22},
   lfo1:{wave:'sine',rate:5.4,sync:false,division:'1/4',depth:.08,target:'pitch',fadeIn:.4,retrig:true},
   drive:{amount:.16,asym:.2},
   fx:{chorus:{mix:.12,rate:.5,depth:.26},delay:{mix:.10,time:.75,feedback:.28,tone:4600,pingpong:true},reverb:{mix:.20,decay:2.2,damp:.5,preDelay:.02}},level:-3},
  // 足鍵盤は C1〜C2 (32〜65 Hz) なので、音色を 1 オクターブ上で鳴らす (オルガンの足鍵盤の高い音栓と同じ)。こもりも開く。
  // 2026-11-03 さとるん「足だけになるところ、低すぎてなんだかわからない」: 前は 1 オクターブ下を足し、520 Hz で切っていた
  bass:{name:'MEDLEY / TUBA',description:'ノコギリ+矩形+サブの太いモノベース',
   osc:[{wave:'saw',level:.66,octave:1,phaseRand:false},{wave:'square',level:.4,octave:1,detune:4,phaseRand:false}],
   sub:{wave:'sine',octave:-1,level:.12},noise:{color:'white',level:0,decay:.05},
   filter:{model:'ladder',cutoff:1100,resonance:.18,envAmount:2.0,keyTrack:.4,velAmount:.3,drive:.2},
   ampEnv:{a:.002,d:.2,s:.78,r:.08},filterEnv:{a:.001,d:.14,s:.22,r:.08},
   voice:{mono:true,legato:true,glide:.02},drive:{amount:.22,asym:.3},
   fx:{chorus:{mix:0,rate:.5,depth:0},delay:{mix:0,time:.5,feedback:0,tone:2000,pingpong:false},reverb:{mix:.05,decay:1.0,damp:.8,preDelay:0}},level:0},
 });

 /* ───────── 集める所 ───────── */
 const rh=[],bs=[],dr=[],kk=[],knobs=[],marks=[],WH=[];
 // 右手: ps = 鍵の並び, f = 指 (無ければ後で決める)
 const R=(bar,b,ps,d,v,f=null)=>rh.push({s:bar*BAR+b,ps:(Array.isArray(ps)?ps:[ps]).map(x=>typeof x==='string'?m(x):x),d,v,f});
 const P=(bar,b,p,d,v=106)=>bs.push({s:bar*BAR+b,p:typeof p==='string'?m(p):p,d,v});
 const D=(bar,list)=>{for(const [b,k,v] of list)dr.push({s:bar*BAR+b,k,v});};
 const K=(bar,list,v=110)=>{for(const b of list)kk.push({s:bar*BAR+b,v:Math.min(127,v+(b===0?6:0))});};
 const knob=(bar,b,param,d,to)=>knobs.push({param,s:+(bar*BAR+b).toFixed(4),d,to});
 const mark=(bar,name)=>marks.push([bar,name]);
 // 旋律の下に和音の音を足す (近い順・12 半音以内)
 const under=(p,pcs,count)=>{const out=[p];for(let q=p-1;q>=p-12&&out.length<count;q--){if(pcs.includes(((q%12)+12)%12))out.push(q);}return out.sort((a,b)=>a-b);};
 const PCS={C:[0,4,7],Cm:[0,3,7],G7:[7,11,2,5],F:[5,9,0],Ab:[8,0,3],Am:[9,0,4],E7:[4,8,11,2]};

 /* ───────── 1. ツァラトゥストラ (4 小節・66): オルガンの低い C の上に C–G–C、長調と短調の和音、ティンパニ ───────── */
 {const b0=START.zara;
  for(let i=0;i<4;i++)mark(b0+i,'C');
  P(b0,0,24,7.8,96);P(b0+2,0,24,7.8,104);
  R(b0,0,'C4',1.9,96);R(b0,2,'G4',1.9,100);
  R(b0+1,0,'C5',1.4,108);R(b0+1,1.5,['C4','E4','G4','C5'],.4,116);R(b0+1,2,['C4','Eb4','G4','C5'],1.9,104);
  R(b0+2,0,'C4',1.9,104);R(b0+2,2,'G4',1.9,108);
  R(b0+3,0,'C5',.9,114);R(b0+3,1,['C4','Eb4','G4','C5'],.4,112);R(b0+3,1.5,['E4','G4','C5','E5'],2.3,124);   // 最後の和音は 1 オクターブの中 (模型の大きさの手では、ド4〜ミ5 の 10 度に指が開かない・2026-11-03)
  K(b0,[0],96);K(b0+1,[1.5],104);K(b0+2,[0],104);K(b0+3,[0,1,1.5],112);
  // ティンパニ: フロアタム (C) とロータム (G)。1 小節目の終わりから低い C のロール、和音のたびにクラッシュ、
  // 3 小節目は 16 分で交互にだんだん強く、最後は強打 (2026-11-03 さとるん「最初のティンパニ、もっとダイナミックに」)
  D(b0,[2.5,2.75,3,3.25,3.5,3.75].map((b,i)=>[b,'t3',56+i*8]));
  // 16 分は同じタムのロール、タムの持ちかえは 8 分ごと (検査は曲でいちばん速いテンポで間を見るので、16 分で持ちかえると間に合わない扱い)
  D(b0+1,[[0,'t3',112],[1.5,'cr',118],...[2,2.25,2.5,2.75,3,3.25,3.5,3.75].map((b,i)=>[b,'t3',96+i*4])]);
  D(b0+2,[...[0,.25,.5,.75,1,1.25,1.5,1.75].map((b,i)=>[b,'t3',100+i*2+(i%2?0:8)]),[2.25,'t2',114],[2.75,'t3',116],[3.25,'t2',118],[3.75,'t3',120]]);
  D(b0+3,[[0,'t3',124],[.5,'t2',120],[1,'t3',124],[1.5,'cr',127],...[2.5,2.75,3,3.25,3.5].map((b,i)=>[b,'t3',110+i*4])]);
 }

 /* ───────── 2. 天国と地獄 (9 小節・136): 1 小節の前ふり (ズン・チャ) → 旋律 2 回 ───────── */
 {const b0=START.cancan;
  // 旋律: 2/4 の 1 小節 = 8 分 4 つ。'-' は前の音を伸ばす。オクターブ 5 (C6 = 84 が一番上の鍵)
  const A=[['C5','-','-','-'],['D5','F5','E5','D5'],['G5','-','G5','-'],['G5','A5','E5','F5'],['D5','-','D5','-'],['D5','F5','E5','D5'],['C5','C6','B5','A5'],['G5','F5','E5','D5']];
  const B=[['C5','-','-','-'],['D5','F5','E5','D5'],['G5','-','G5','-'],['G5','A5','E5','F5'],['D5','-','D5','-'],['D5','F5','E5','D5'],['C5','G5','D5','E5'],['C5','-','-','-']];
  const HA=['C','G7','C','C','G7','G7','C','G7'],HB=['C','G7','C','C','G7','G7','C','C'];
  // 前ふり: ズン (足鍵盤) チャ (右手の和音) を 8 分の裏で
  mark(b0,'C');
  for(const b of[.5,1.5,2.5,3.5])R(b0,b,['E4','G4','C5'],.3,96+(b>2?8:0));
  const oompah=(bar,ch,half)=>{const [r,f]=ch==='C'?[24,31]:[31,26];P(bar,half*2,r,.4,110);P(bar,half*2+1,f,.4,100);};
  oompah(b0,'C',0);oompah(b0,'C',1);
  D(b0,[[0,'cr',116],[.5,'sn',100],[1,'hh',80],[1.5,'sn',104],[2,'hh',82],[2.5,'sn',108],[3,'sn',112],[3.25,'sn',116],[3.5,'sn',120]]);
  K(b0,[0,1,2,3]);
  // 2026-11-03 さとるん「2 回しが飽きる・音がスカスカでよくわからない」: 1 回目は旋律の下に和音の音を 1 つ重ねて 2 音、
  // 2 回目は 3 音の和音で強く。前は 1 音ずつで、和音はのばす音だけだった
  const phrase=(bar0,mel,harm,v,voices)=>{
   for(let h=0;h<8;h++){const bar=bar0+Math.floor(h/2),half=h%2,ch=harm[h];
    if(!half)mark(bar,ch==='G7'?'G7':'C');
    const slots=mel[h];
    for(let k=0;k<4;k++){const p=slots[k];if(p==='-')continue;let len=1;while(k+len<4&&slots[k+len]==='-')len++;
     const b=half*2+k*.5,d=len*.5-.06,pp=m(p);
     R(bar,b,under(pp,PCS[ch],len>=2?voices+1:voices),d,v+(k===0?8:0));}
    oompah(bar,ch,half);
   }};
  phrase(b0+1,A,HA,98,2);phrase(b0+5,B,HB,108,3);
  // ドラム: 拍の頭はハイハット、裏はスネア (ズン・チャ)。4 小節ごとにクラッシュ
  for(let i=1;i<9;i++){const bar=b0+i;
   // 2 回目 (5〜8 小節目): 小節ごとにクラッシュ、裏のスネアに 16 分を足して前へ進む感じに
   if(i>=5&&i<8)D(bar,[[0,'cr',116],[.5,'sn',106],[.75,'sn',88],[1,'sn',96],[1.5,'sn',108],[2,'hh',86],[2.5,'sn',108],[2.75,'sn',90],[3,'sn',98],[3.5,'sn',112]]);
   else if(i===4)D(bar,[[0,'hh',84],[.5,'sn',104],[1,'hh',84],[1.5,'sn',108],[2,'t1',110],[2.5,'t1',112],[3,'t2',114],[3.5,'t3',118]]);
   else if(i===8)D(bar,[[0,'hh',86],[.5,'sn',108],[1,'hh',86],[1.5,'sn',112],[2,'cr',122]]);
   else D(bar,[0,.5,1,1.5,2,2.5,3,3.5].map(b=>[b,b%1?'sn':(b===0&&(i===1||i===5)?'cr':'hh'),b%1?102:(b===0&&(i===1||i===5)?118:82)]));
   K(bar,i===8?[0,1,2]:[0,1,2,3]);
  }
 }

 /* ───────── 3. 山の魔王の宮殿にて (8 小節・96→136 だんだん速く) ───────── */
 // 1 回目は足鍵盤だけで旋律 (右手はつまみ)、2 回目は右手のオクターブ＋足鍵盤の同じ旋律
 {const b0=START.king;
  const MEL=[['C','D','Eb','F','G','Eb','G','-'],['F#','D','F#','-','F','Db','F','-'],['C','D','Eb','F','G','Eb','G','C+'],['Bb','G','Eb','G','Bb','-','-','-']];
  const PED={C:24,'C#':25,Db:25,D:26,Eb:27,E:28,F:29,'F#':30,G:31,Ab:32,A:33,Bb:34,'C+':36};
  const HK=['Cm','G7','Cm','Cm'];
  for(let rep=0;rep<2;rep++)for(let i=0;i<4;i++){const bar=b0+rep*4+i,slots=MEL[i];mark(bar,HK[i]==='Cm'?'Cm':'G');
   for(let k=0;k<8;k++){const n=slots[k];if(n==='-')continue;let len=1;while(k+len<8&&slots[k+len]==='-')len++;
    const b=k*.5,v=(rep?100:86)+i*4+(k===0?6:0);
    P(bar,b,PED[n],Math.min(len*.5-.12,.9),v);
    if(rep){const hi=n==='C+'?m('C6'):m(n.replace('Db','C#').replace('Eb','D#').replace('Bb','A#')+'5');R(bar,b,[hi-12,hi],len>=2?len*.5-.08:.32,v+6,[1,5]);}
   }
   if(!rep){D(bar,[[0,'hh',60+i*4],[1,'hh',58+i*4],[2,'hh',62+i*4],[3,'hh',60+i*4]]);K(bar,[0,2],90+i*3);}
   else if(i<3){D(bar,[0,.5,1,1.5,2,2.5,3,3.5].map(b=>[b,b===0?'cr':b%1?'hh':'sn',b===0?110+i*3:b%1?76:100+i*4]));K(bar,[0,1,2,3],104+i*3);}
   else {D(bar,[[0,'cr',120],[.5,'sn',110],[1,'sn',114],[1.5,'t1',114],[2,'t1',118],[2.5,'t2',118],[3,'t3',122],[3.5,'t3',124]]);K(bar,[0,1,2,3],116);}
  }
  // 1 回目の間、右手はつまみ: こもらせる → クセを足す → 2 回目の前に開く
  knob(b0,1,'cutoff',1.5,.3);knob(b0+1,2,'resonance',1.5,.55);knob(b0+3,0,'cutoff',2.0,.85);
  // 揺れを速く深く: 2 回目の狂乱と熊蜂の羽音 (2026-11-03 さとるん「後半、シンセの音が似たようなものが続きやや飽きる」)
  knob(b0+2,.25,'lfoRate',1.0,.9);knob(b0+2,1.75,'lfoDepth',1.0,.18);   // 深すぎると熊蜂の半音の高さがぼやける (.35 → .18)
 }

 /* ───────── 4. 熊蜂の飛行 (6 小節＋ドラムだけの 1 小節・136): 16 分の半音階 ───────── */
 {const b0=START.bee;
  const down=(top)=>{const t=m(top);return [0,-1,-2,-3,-2,-3,-4,-5,-4,-5,-6,-7,-8,-9,-10,-11].map(x=>t+x);};
  const fig=()=>[0,-1,-2,-3,-4,1,0,-1];
  // 1 小節目で G5 から G4 の上まで半音で下り、2 小節目からはソの回りの細かい動き (16 分 1 つで大きく跳ばない)
  const twice=(top)=>[...fig(),...fig()].map(x=>m(top)+x);
  const bars=[down('G5'),twice('G4'),twice('G4'),twice('C5'),twice('G4'),[...fig().map(x=>m('G4')+x),m('G4'),m('A4'),m('B4'),m('C5'),m('D5'),m('Eb5'),m('F5'),m('G5')]];
  const HB=['G7','G7','G7','Cm','G7','G7'];
  bars.forEach((ps,i)=>{const bar=b0+i;mark(bar,HB[i]==='Cm'?'Cm':'G');
   // 1 音は 16 分の 6 割 (前は 8 割)。音色の消える長さも 0.34 → 0.12 秒 (さとるん「前の音が次の音に混ざって疾走感が消えている」)
   ps.forEach((p,q)=>{const last=i===5&&q===15;R(bar,q*.25,[p],last?.45:.15,q%4===0?100:88);});
   const r=HB[i]==='Cm'?24:31;P(bar,0,r,.9,108);P(bar,1,r,.4,96);P(bar,2,r,.9,104);P(bar,3,r,.4,96);
   D(bar,[[0,i===0?'cr':'hh',i===0?118:80],...(i===0?[]:[[.25,'hh',64]]),[.5,'hh',70],[1,'sn',108],[1.5,'hh',72],[1.75,'hh',64],[2,'hh',76],[2.25,'hh',64],[2.5,'hh',70],[3,'sn',112],[3.5,'hh',72],...(i===5?[]:[[3.75,'hh',66]])]);
   K(bar,[0,2,2.5]);
  });
  // ドラムだけの 1 小節: 右手は歪みのつまみを上げる
  const brk=b0+6;mark(brk,'G');
  P(brk,0,31,1.8,110);P(brk,2,26,1.8,108);
  D(brk,[[0,'sn',104],[.25,'sn',106],[.5,'sn',108],[.75,'sn',110],[1,'sn',112],[1.25,'sn',114],[1.5,'sn',116],[2,'t1',114],[2.5,'t2',116],[3,'t3',120],[3.5,'t3',124]]);
  K(brk,[0,1,2,3]);
  knob(brk,1.25,'lfoDepth',.75,.05);   // 羽音の揺れを止める (この小節の 4 拍目にトルコ行進曲の弱起が入るので、つまみは 1 つだけ)
 }

 /* ───────── 5. モーツァルト『トルコ行進曲』(ピアノ・ソナタ K.331 の終楽章) (14 小節・126) ───────── */
 // 音は楽譜のデータ (TURCA・Mutopia のパブリックドメインの楽譜) をそのまま弾く。楽譜の流れのとおりにつなぐ
 // (2026-11-03 さとるん「明るいとこもう一回り」「初めのところからもっと滑らかに繋がって」「いきなりトッカータに行くのも変」):
 //   弱起 (熊蜂のあとのドラムだけの小節の 4 拍目) → イ短調の旋律 (楽譜の 1〜4 小節 → 21〜24 小節の終わり方) … 小さく軽く
 //   → そのまま明るいイ長調 (25〜32 小節) → 明るい所をもう一回り、16 分のオクターブで (89〜96 小節) → 終わりの和音 (97〜99 小節)
 //   → イ長調の和音をのばしてティンパニのロール、テンポをゆるめる (イ長調はトッカータのニ短調へ向かう和音) → トッカータ
 // 25 小節目からは、いちばん高い音 (ド♯6) がシンセの鍵盤 (上はド6) からはみ出すので 1 オクターブ下げて弾く
 {const b0=START.turk,T=b0*BAR,SEG=TURCA.segments;
  const at=(beat)=>[Math.floor(beat/BAR),beat-Math.floor(beat/BAR)*BAR];
  // 右手: 同じ時刻の音は和音にまとめる。off = この区間の 0 拍目を置く拍 (曲の頭から)
  const play=(seg,off,shift,v,acc,extra=null)=>{const by=new Map();for(const [s0,d,p] of (extra?.[seg]??SEG[seg]).right){const k=+(s0+off).toFixed(4);if(!by.has(k))by.set(k,{d,ps:[]});const e=by.get(k);e.ps.push(p+shift);e.d=Math.min(e.d,d);}
   for(const [t,e] of by){const [bar,b]=at(t);R(bar,b,e.ps.sort((x,y)=>x-y),Math.max(.12,e.d-.06),v+(Math.abs(b-Math.round(b))<1e-6&&Math.round(b)%2===0?acc:0));}};
  // 足鍵盤: 左手のいちばん低い音を 1 拍ごとに (足鍵盤の C1〜C2 に入れる)
  const bass=(seg,off,v)=>{const low=new Map();for(const [s0,d,p] of SEG[seg].left){const t=s0+off;if(Math.abs(t-Math.round(t))>1e-6)continue;const k=Math.round(t);if(!low.has(k)||p<low.get(k))low.set(k,p);}
   for(const [t,p] of low){if(t<T)continue;let q=p;while(q>36)q-=12;while(q<24)q+=12;const [bar,b]=at(t);P(bar,b,q,.8,v);}};
  play('theme_a',T-1,0,74,8);bass('theme_a',T-1,80);
  play('theme_end',T+7,0,80,8);bass('theme_end',T+7,86);
  play('refrain',T+15,-12,110,8);bass('refrain',T+15,110);
  // 2 回目の明るい所は楽譜では分散オクターブ (16 分で 下・上・下・上) なので、1 音ずつだと 1 回目のオクターブの和音より 3 dB ほど小さく、
  // 薄く聞こえる (2026-11-03 さとるん「明るいとこの 2 回し目、シンセの音圧が下がります」)。16 分の組の頭は上の音も一緒に鳴らしてオクターブにする
  {const r=SEG.refrain16.right,ex=[];for(const [s0,d,p] of r){const up=r.find(x=>Math.abs(x[0]-(s0+.25))<1e-6&&x[2]===p+12);if(up&&Math.abs(s0*2-Math.round(s0*2))<1e-6)ex.push([s0,d,p+12]);}
   SEG.refrain16={...SEG.refrain16,right:[...r,...ex]};}
  // 口笛の間の右手は、1 拍ずつの和音 (トルコ行進曲らしい「タン・タン・タン・タン」) にする (2026-11-03 さとるん「口笛の時、みぎてはそこまで早く
  // 動かなくていい、今早すぎて気持ち悪い」「手がすごく早く動いてますが、それに連動した音が出ていない」): 前は旋律を 16 分の分散オクターブで弾いていて、
  // 16 分の 2 つ目 (上の音だけをもう一度) はほとんど聞こえないのに、手だけが 16 分で上下し、オクターブの跳びで指が 1 コマに 8 cm 動いていた。
  // 旋律は口笛にまかせ、和音は手の幅 (1 オクターブ) の中で、外側の音 (ラ) をなるべく動かさない並べ方にする
  {const C={A:['A3','C#4','E4','A4'],D:['A3','D4','F#4','A4'],B7:['A3','B3','D#4','F#4'],E:['G#3','B3','E4','G#4']};
   const prog=[[143,'A'],[144,'A'],[145,'A'],[146,'A'],[147,'A'],[148,'D'],[149,'B7'],[150,'E'],[151,'E'],[152,'A'],[153,'A'],[154,'A'],[155,'A'],[156,'D'],[157,'E'],[158,'A']];
   for(const [t,c] of prog){const [bar,b]=at(t);R(bar,b,C[c],t===158?.9:.42,b===0?124:112);}}
  // 口笛の所のベース (右足) は、足鍵盤を駆けまわる (2026-11-03 さとるん「1 拍ずつになってしまっているから、もっと超かっこいい、
  // 疾走感ある、超複雑な、えぇ、足そこまで動くの、みたいなめちゃめちゃ過激な感じに」「足がワープしたりせず、ちゃんと滑らかに動くように」
  // 「8 分でウォーキングみたいになってるのいいのですが、16 とかも入ったり、もっと複雑なリズムがいい」)。
  // 和音は楽譜のまま (イ長 | ニ長・ロの属七の嬰ニ低音 (D# F# A B)・ホ長 | イ長 | ニ長 (後半に B)・ホ長・イ長)。
  // リズムは 1 拍ごとに変える: 16 分 4 つ・休みから入る・裏の 16 分にアクセント (シンコペーション)・付点・6 連符のトリル。
  // 足鍵盤は C1〜C2 の 1 オクターブ。6 連符は隣の鍵 (2 半音まで)、16 分音符は約 12 cm まで、大きく跳ぶ (15〜20 cm) のは 8 分以上の間があるときだけ。
  // 6 連符の駆け上がり (レ〜シ) は、白鍵と黒鍵の行き来で足が前後にも 8.5 cm 動き、1 コマ 49 mm の速さになったので 16 分にした
  {const t0=T+32,A1=33,Gs1=32,Fs1=30,E1=28,D1=26,Ds1=27,Cs1=25,B1=35,X=6;   // X: 6 連符の 1 つ分 = 1/6 拍
   // 拍の頭の音は和音の音にする (右手が 1 拍ずつ和音を弾くので、拍の頭の経過音は和音とぶつかって濁る)
   const line=[   // [拍, 音, 長さ (省くと 16 分), 強さ (省くと ふつう)]
    [0,A1,.2,122],[.5,B1],[.75,Gs1],                       [1,A1],[1.25,B1],[1.75,Fs1,.2,118],
    [2.25,E1],[2.5,D1],[2.75,Cs1],                         [3,E1,.13,110],[3.25,Fs1],[3.5,Gs1],[3.75,A1],
    [4,A1,.6,122],[4.75,D1],                               [5,Ds1,.2,114],[5.25,Fs1],[5.5,A1],[5.75,B1],
    [6,Gs1,.2,122],[6.5,E1],[6.75,Fs1],                    [7.25,Gs1,.2,118],[7.75,B1,.2,118],
    ...[A1,Gs1,A1,Gs1,A1,B1].map((p,k)=>[8+k/X,p,.12,k?90:122]),   [9,A1],[9.25,Fs1],[9.5,E1],[9.75,Cs1],
    [10.25,E1,.2,118],[10.5,Fs1],[10.75,Gs1],              [11,A1],[11.25,Gs1],[11.75,E1,.2,118],
    [12,D1,.2,122],[12.5,Fs1],[12.75,B1],                  [13,Gs1],[13.25,E1],[13.5,Gs1],[13.75,B1],
    [14,A1,.45,122],[14.5,E1,.4,112]];
   for(const [o,p,d=.13,v=96] of line){const t=+(t0+o).toFixed(4),[bar,b]=at(t);P(bar,b,p,d,v);}}
  // 口笛 (2026-11-03 さとるん「明るいとこの 2 周目、もっとはなやかに」「オクターブ上で猿が口笛吹く」「耳からかけるマイクの謎が最後に解ける」):
  // 2 回目の明るい所で、チンパンジーが頭のマイクで旋律を口笛で吹く。音は 1 回目の明るい所の旋律 (楽譜の 25〜32 小節の上の音) を楽譜の高さのまま。
  // シンセはここを 1 オクターブ下げて弾いているので、口笛はシンセの 1 オクターブ上になる。8 分音符はつなげて (レガート) 吹く
  {const top=new Map();for(const [s0,d,p] of SEG.refrain.right){const k=+s0.toFixed(4);if(!top.has(k)||p>top.get(k)[1])top.set(k,[d,p]);}
   const list=[...top].sort((a,b)=>a[0]-b[0]);
   list.forEach(([s0,[d,p]],i)=>{const next=list[i+1]?.[0]??s0+d;WH.push({s:T+31+s0,d:Math.min(d,next-s0)-.03,p,v:100+(Math.abs(s0-Math.round(s0))<1e-6&&Math.round(s0)%2===0?10:0)});});}
  play('coda',T+47,-12,120,4);bass('coda',T+47,120);
  // 終わりのイ長調の和音をのばす (テンポをゆるめながら)
  // 和音は 2 拍目の頭で切って、3 拍目から小節の終わりまで全部の音を止める。トッカータの前に息つぎを入れる
  // (2026-11-03 さとるん「トッカータのチャラリーンに行くときそのまま行っちゃうので、音がつながらないように」)。
  // その間に右手でリバーブを上げて、トッカータを教会のオルガンのように響かせる (最後の和音の余韻にもなる)
  // (つまみは右手が空いてから曲でいちばん速いテンポで 0.45 秒あと。トッカータの頭は 2 分の 1 拍おくらせて、つまみのあとの間を空ける)
  R(b0+13,1,['E4','A4','C#5','E5'].map(m),1.0,124);P(b0+13,1,33,1.0,122);
  knob(b0+13,3.1,'reverb',.7,.6);
  for(let i=0;i<14;i++)mark(b0+i,i<4?'Am':'A');
  // ドラム: イ短調はハイハットだけ小さく → 明るい所は全開 → 16 分の所はクラッシュを増やす → 終わりの和音で強打 → ロール
  for(let i=0;i<4;i++){D(b0+i,[0,.5,1,1.5,2,2.5,3,3.5].map((b,j)=>[b,'hh',(j%2?54:64)+i*3]));K(b0+i,[0,2],78+i*3);}
  for(let i=4;i<8;i++){D(b0+i,[[0,'cr',114],[.5,'sn',100],[1,'hh',88],[1.5,'sn',106],[2,'cr',116],[2.5,'sn',104],[3,'hh',90],[3.5,'sn',110]]);K(b0+i,[0,1,2,3],110);}
  for(let i=8;i<12;i++){D(b0+i,[[0,'cr',120],[.5,'sn',106],[1,'cr',112],[1.5,'sn',110],[2,'cr',122],[2.5,'sn',110],[3,'cr',114],[3.5,'sn',116]]);K(b0+i,[0,1,2,3],116);}
  D(b0+12,[[0,'cr',124],[1,'t1',112],[2,'cr',124],[3,'t2',116]]);K(b0+12,[0,1,2,3],120);
  D(b0+13,[[0,'cr',126],[1,'t3',90],...[1.25,1.5,1.75].map((b,i)=>[b,'t3',100+i*8]),[2,'t3',124]]);K(b0+13,[0,1,2],120);
 }

 /* ───────── 6. バッハ『トッカータとフーガ ニ短調』BWV 565 の冒頭 (2 小節・84 → 64): チャラリーン チャラリラ チャーチャーン ───────── */
 {const b0=START.toccata;mark(b0,'Dm');mark(b0+1,'Dm');
  // チャラリーン (ラ・ソ・ラ) チャラリラ (ソ・ファ・ミ・レ) チャー (ド♯) チャーン (レ: 大きなニ短調の和音)
  R(b0,.5,[m('A5')],.11,110);R(b0,.625,[m('G5')],.11,102);R(b0,.75,[m('A4'),m('A5')],1.1,120);
  R(b0,2,[m('G5')],.2,108);R(b0,2.25,[m('F5')],.2,106);R(b0,2.5,[m('E5')],.2,108);R(b0,2.75,[m('D5')],.2,110);R(b0,3,[m('C#5')],.9,116);
  // 最後の和音は 4 拍のばし、最後のクラッシュの所で離す。そのあとはクラッシュとリバーブの響きだけを残す
  // (2026-11-03 さとるん「最後も打つっと切れるのでもっと余韻を」で 6 拍にしたら、次に「最後ちょっとシンセのばしすぎ。シンバルとか叩いてるのはいい感じ」)
  R(b0+1,0,['D4','F4','A4','D5'].map(m),4,127);P(b0+1,0,26,4,124);
  D(b0,[[.75,'cr',120],[3,'t2',108]]);K(b0,[.75],118);
  D(b0+1,[[0,'cr',127],[2,'t3',100],[2.25,'t3',108],[2.5,'t3',116],[2.75,'t3',124]]);K(b0+1,[0],126);
  D(b0+2,[[0,'cr',124]]);K(b0+2,[0],122);
 }

 /* ───────── 書き出し (体に合わせた後始末は overtake-the-night と同じ) ───────── */
 rh.sort((a,b)=>a.s-b.s||a.ps[0]-b.ps[0]);
 for(let i=0;i<rh.length;i++){const e=rh[i];let j=i+1;while(j<rh.length&&rh[j].s<=e.s+1e-6)j++;if(j<rh.length)e.d=Math.min(e.d,+(rh[j].s-e.s-.02).toFixed(4));}
 // 指: 和音は数で、単音は「半音階は黒鍵 3・白鍵 1 (白が続くと 2)」、ほかはフレーズの中の高さの順
 const CHORD_F={1:[3],2:[1,5],3:[1,3,5],4:[1,2,4,5],5:[1,2,3,4,5]};
 const black=p=>[1,3,6,8,10].includes(p%12);
 let phrase=[];const flush=()=>{if(!phrase.length)return;
  const steps=phrase.slice(1).map((e,i)=>Math.abs(e.ps[0]-phrase[i].ps[0]));
  const chromatic=steps.length>=6&&steps.filter(x=>x===1).length>=steps.length*.6;
  if(chromatic){let prevF=0;for(const e of phrase){const f=black(e.ps[0])?3:prevF===1?2:1;e.f=[f];prevF=f;}}
  else{const uniq=[...new Set(phrase.map(e=>e.ps[0]))].sort((a,b)=>a-b);const n=uniq.length;const map=n===1?[3]:n===2?[2,4]:n===3?[1,3,5]:n===4?[1,2,4,5]:null;for(const e of phrase){const r=uniq.indexOf(e.ps[0]);e.f=[map?map[r]:1+Math.round(4*r/(n-1))];}}
  phrase=[];};
 for(const e of rh){if(e.ps.length>1){flush();e.ps.sort((a,b)=>a-b);if(!e.f||e.f.length!==e.ps.length)e.f=CHORD_F[e.ps.length];continue;}
  if(e.f){flush();continue;}
  const prev=phrase[phrase.length-1];if(prev&&e.s-prev.s>1.0)flush();phrase.push(e);}
 flush();
 for(const e of rh)e.ps.forEach((p,i)=>s.n(s.keys,p,e.s,e.d,e.v,e.f[i]));
 bs.sort((a,b)=>a.s-b.s);
 for(let i=0;i+1<bs.length;i++)bs[i].d=Math.min(bs[i].d,+(bs[i+1].s-bs[i].s-.01).toFixed(4));
 for(const b of bs)s.bass(b.p,b.s,b.d,b.v);
 for(const d of dr)s.hit(d.k,d.s,d.v);
 for(const k of kk)s.hit('kick',k.s,k.v);
 s.keys.knobs=knobs;
 // 口笛のパート (4 つ目)。2026-11-03 さとるん「口笛の音が口笛に聞こえない」で作り直した:
 // 前は正弦波に、鳴り始めだけの白い息の音 (ローパス) で、電子音・リコーダー・オカリナに聞こえた (Gemini に 2 回聞いて 3 点・3 点)。
 // 今は、息の音を鳴らし続けて、音の高さに合わせた帯域フィルター (svf-bp・keyTrack 1) で音の高さのまわりだけに通す (息は音より 22 dB 小さい)。
 // 音の出だしで 0.8 半音下からしゃくり上げ (modEnv)、遅れてかかるビブラート (0.27 半音)、音ごとに出だしを付けて少しすべらせる。
 // Gemini に前の音と順番を入れかえて 2 回聞いてもらい、2 回ともこちら (5 点・7 点)。息を強め・音量の揺れを足した案は 2 回とも負けた
 {const w=makeTrack({instrument:'synth',role:'whistle',name:'Whistle (口笛)',volume:0,pan:-.04});w.id='classic-medley-whistle';w.fx.hall=.03;w.fx.room=.02;
  w.synth2=normalizePatch2({name:'MEDLEY / WHISTLE',description:'口笛',
   osc:[{wave:'sine',level:.9,phaseRand:false}],sub:{wave:'sine',octave:-1,level:0},noise:{color:'white',level:.75,decay:8},
   filter:{model:'svf-bp',cutoff:261.63,resonance:.75,envAmount:0,keyTrack:1,velAmount:0,drive:0},
   ampEnv:{a:.03,d:.15,s:.9,r:.08},filterEnv:{a:.01,d:.1,s:1,r:.1},modEnv:{a:.001,d:.07,s:0,r:.05,target:'pitch',amount:-.07},
   lfo1:{wave:'sine',rate:5.4,sync:false,division:'1/4',depth:.15,target:'pitch',fadeIn:.22,retrig:true},
   voice:{mono:true,legato:false,glide:.035},drive:{amount:0,asym:0},
   fx:{chorus:{mix:0,rate:.5,depth:0},delay:{mix:.12,time:.375,feedback:.22,tone:5000,pingpong:true},reverb:{mix:.24,decay:2.0,damp:.4,preDelay:.02}},level:-2.5});
  // 高さは書いた旋律の 1 オクターブ上 (E6〜C#7・1.3〜2.2 kHz・人の口笛のふつうの高さ)。前の高さ (660〜1,110 Hz) では、曲の中で
  // オカリナ・リコーダー・電子音に聞こえた。Gemini に曲の中で順番を入れかえて 2 回ずつ聞いてもらい、前の口笛にも同じ高さの新しい音色にも
  // 2 回とも勝った (8・8 対 4・3、9・8 対 3・4)
  for(const e of WH)s.n(w,e.p+12,e.s,e.d,e.v);
  s.song.tracks.push(w);}
 for(const [b,c] of marks)s.mark(b,c);
 // テンポ: ツァラトゥストラは 66、魔王はだんだん速く、最後の和音の前で少しためる
 const zb=START.cancan*BAR,kb=START.king*BAR,beeB=START.bee*BAR,tk=START.turk*BAR,tb=START.toccata*BAR;
 s.song.tempoMap=[{beat:0,tempo:66},{beat:zb-.01,tempo:66},{beat:zb,tempo:136},{beat:kb-.01,tempo:136},{beat:kb,tempo:96},{beat:beeB-.01,tempo:136},{beat:tk-.01,tempo:136},{beat:tk,tempo:126},{beat:tk+13*BAR,tempo:126},{beat:tb-.01,tempo:88},{beat:tb,tempo:84},{beat:tb+2*BAR,tempo:60},{beat:tb+3*BAR,tempo:56}];   // トルコ行進曲は 120 → 間の 1 小節で 136 へ、トッカータは 84 からゆるめる
 // 体の動き (scene.js が読む): 場面ごとの動き方
 s.song.publicDomain=true;
 // バスドラ・スネア・タムは、手元の音のファイルではクラッシュやハイハットより 3〜9 dB 小さい (強く叩いた音の最初の 0.25 秒で測った)。
 // このメドレーだけ上げる (2026-11-03 さとるん「タムタム、バスドラ、スネアが小さいです」)。数は MIDI の鍵: 36 バスドラ・38 スネア・48/45/41 タム
 {const dt=s.song.tracks.find(t=>t.role==='drums');dt.drumSampleGains={...dt.drumSampleGains,36:6,38:4,48:6,45:6,41:6};}   // 旋律は著作権の切れた曲。band-check は license の「オリジナル」の代わりに、この印と license の「著作権が切れた」を見る
 s.song.moves=[{beat:0,style:'majestic'},{beat:START.cancan*BAR,style:'cancan'},{beat:START.king*BAR,style:'sneak'},{beat:(START.king+4)*BAR,style:'frenzy'},{beat:START.bee*BAR,style:'bee'},{beat:START.turk*BAR,style:'sneak'},{beat:(START.turk+4)*BAR,style:'cancan'},{beat:(START.turk+8)*BAR,style:'frenzy'},{beat:(START.turk+12)*BAR,style:'majestic'},{beat:START.toccata*BAR,style:'majestic'},{beat:(START.toccata+1)*BAR,style:'fate'},{beat:(START.toccata+2)*BAR+2,style:'majestic'}];
 const sec=k=>START[k]*BAR;
 return s.finish(
  {full:sec('king')+6,crash:sec('cancan')+0.02,synth:sec('bee')+1,stick:sec('cancan')+3,pedal:sec('king')+1,knob:sec('king')+1,ar:sec('king')+1},
  TEXT.moments.map(x=>({beat:sec(x.part),text:x.text}))
 );
}
export {START,PARTS,TOTAL,BAR};
