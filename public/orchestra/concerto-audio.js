// ダンパーは鍵を離した時点のペダルで決まる。途中からの再生も同じ離す時刻を使う。
export function pianoReleaseBeat(song,n){
 let end=n.s+n.d;
 for(const p of song.ped??[])if(end>=p.s-1e-6&&end<p.s+p.d-1e-6){end=p.s+p.d;break;}
 return end;
}
// 同じホルンの4本は、録音の選択番号・高さ・持続音の出だしをそれぞれ分ける。
export const HORN_DESKS={hn3:{cents:3,off:.061},hn4:{cents:-2,off:.089}};
