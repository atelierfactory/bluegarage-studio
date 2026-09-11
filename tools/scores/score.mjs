// Not an arranger: only score notation, track creation and patch normalization.
import {defaultSong,makeTrack} from '../../public/js/state.js';
import {normalizePatch2} from '../../public/js/synth2.js';
import {BAND_DRUM_SAMPLE_GAINS} from '../../public/js/drum-balance.js';
import {DRUM_KEYS,KICK} from '../../public/band/prompts.js';
export const license='オリジナル。このアプリ VESPER BAND のために GPT-6 Astra が作曲（2026-09-10、第3稿）。曲ごとに旋律・構成・伴奏・音色を新たに制作。既存曲の演奏データや外部素材は使用していません。';
export function score({id,title,tempo,meter=4,key,sections,concept,lead,bass,volume=[-1,-2,-5]}){
 const song=defaultSong();Object.assign(song,{title,tempo,timeSig:meter,key,kind:'repertoire',composer:'GPT-6 Astra',license,concept});song.sections=sections.map(([name,bars])=>({name,bars,description:name}));song.master.hallDecay=1.6;song.master.roomDecay=.45;
 const keys=makeTrack({instrument:'synth',role:'keys',name:'Synth (右手)',volume:volume[0],pan:.08}),pedal=makeTrack({instrument:'synth-bass',role:'pedal',name:'Bass Pedal (右足)',volume:volume[1]}),drums=makeTrack({instrument:'drums',role:'drums',name:'Drums (左手 + 左足)',volume:volume[2]});
 keys.synth2=normalizePatch2(lead);pedal.synth2=normalizePatch2(bass);keys.knobs=[];drums.drumSampleGains={...BAND_DRUM_SAMPLE_GAINS};song.tracks=[keys,pedal,drums];for(const t of song.tracks){t.id=`${id}-${t.role}`;t.fx.hall=.012;t.fx.room=t===drums?.10:.02;}
 let seq=0;const n=(track,p,s,d,v=100,f)=>{const note={id:`${id}-v3-${++seq}`,p,s:+s.toFixed(4),d:+d.toFixed(4),v:Math.round(v),...(track===keys?{h:'R',f:f??3}:{})};track.notes.push(note);return note;};
 const api={song,keys,pedal,drums,n,key:(p,s,d=.20,v=106,f=3)=>n(keys,p,s,d,v,f),bass:(p,s,d=.30,v=107)=>n(pedal,p,s,d,v),hit:(k,s,v=105)=>{const note=n(drums,k==='kick'?KICK:DRUM_KEYS[k],s,.20,v);if(k!=='kick')note.k=k;},chord:(pitches,s,d=.20,v=104)=>{const fingers={1:[3],2:[1,5],3:[1,3,5],4:[1,2,4,5],5:[1,2,3,4,5]}[pitches.length];pitches.forEach((p,i)=>n(keys,p,s,d,v+(i===pitches.length-1?5:0),fingers[i]));},mark:(bar,chord)=>song.chordProgression.push({bar,beat:0,chord}),finish:(shots,moments)=>{for(const t of song.tracks)t.notes.sort((a,b)=>a.s-b.s||a.p-b.p);keys.knobs.sort((a,b)=>a.s-b.s);song.shots=shots;song.moments=moments;return {id,song};}};return api;
}
