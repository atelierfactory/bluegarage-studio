// 計算済みの指と腕の道筋を保存する。楽譜が変わったら古い道筋は使わない。
export function planKey(song){
 const p=song.players.find(p=>p.id===song.solo.player);let h=2166136261;
 const text=JSON.stringify(['concerto-motion-4',p.notes.map(n=>[n.p,n.s,n.d,n.v,n.hand??n.h,n.arpGroup??null]),song.tempoMap]);
 for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16);
}
export function packMotion(song,motion){
 return{version:1,key:planKey(song),notes:motion.notes,issues:motion.issues,releases:motion.releases,hands:Object.fromEntries(['L','R'].map(h=>[h,motion.hands[h].map(g=>({s:g.s,notes:g.notes.map(n=>n._i),contacts:g.contacts.map(n=>n._i),palm:g.palm,move:g.move,fingerPoses:g.fingerPoses,requestedPalm:g.requestedPalm}))]))};
}
export function unpackMotion(data){
 const notes=data.notes;return{notes,issues:data.issues,releases:data.releases,hands:Object.fromEntries(['L','R'].map(h=>[h,data.hands[h].map(g=>({...g,notes:g.notes.map(i=>notes[i]),contacts:g.contacts.map(i=>notes[i])}))]))};
}
