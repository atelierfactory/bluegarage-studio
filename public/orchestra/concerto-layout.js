// 協奏曲の後列。34弦席と既存の管はそのまま、追加の金管だけ専用のひな壇へ置く。
import * as THREE from 'three';
import {polar,yawToward} from './layout.js';
export function addConcertoSeats(layout){
 const rows=[['hn3',6.9,-40,.7,'horn'],['hn4',6.9,-49,.7,'horn'],['tb1',7.6,10,.9,'trombone'],['tb2',7.6,20,.9,'trombone'],['tb3',7.6,30,.9,'trombone']];
 for(const [id,r,angle,floorY,instrument]of rows){const pos=polar(r,angle,floorY),sp=polar(r-.65,angle,floorY),stand={id:id+'.desk',pos:sp,yaw:yawToward(sp,pos),floorY,sheetY:floorY+.93,players:[id+'.0']};
  const s={id:id+'.0',player:id,index:0,robot:layout.seats.length,family:'brass',instrument,instrumentKind:instrument,desk:0,part:'solo',row:6,r,angle,pos,yaw:yawToward(pos),floorY,seatTop:floorY+.46,kind:'chair',stand};
  layout.seats.push(s);layout.stands.push(stand);layout.byPlayer[id]=[s];
 }
 layout.risers=[...layout.risers,{name:'horns-extra',r0:6.45,r1:7.4,a0:-54,a1:-35,top:.7},{name:'trombones',r0:7.05,r1:8.2,a0:5,a1:35,top:.9}];return layout;
}
