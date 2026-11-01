// 印刷の強弱は録音のなめらかな線、独奏の声分けは1単位0.75dBで重ねる。
export function pianoLevelDb(levels,p,v){
 const a=levels.pitches[p];if(v<=a[0].v)return a[0].smoothDb+(v-a[0].v)*.35;
 for(let i=1;i<a.length;i++)if(v<=a[i].v){const x=a[i-1],y=a[i];return x.smoothDb+(y.smoothDb-x.smoothDb)*(v-x.v)/(y.v-x.v);}
 const last=a.at(-1);return last.smoothDb+(v-last.v)*.15;
}
export function pianoGain(levels,inst,r,p,printed,performed){
 if(!levels||r.rel)return 1;
 const raw=levels.samples[r.s]?.rms;if(!raw)return 1;
 const target=pianoLevelDb(levels,p,printed)+(performed-printed)*.75;
 return Math.pow(10,target/20)/(raw*r.g*inst.velGain(r,Math.round(performed)));
}
