// 固定された曲が実際に読む末尾だけを残す。波形の途中やループは切らない。
export function retainedSeconds(inst,r,ev,fullDuration,{estimate=false}={}){
 if(r.oneShot)return Math.min(fullDuration,r.end??fullDuration);
 if(r.loop)return Math.min(fullDuration,r.loop[1]+1/48000);
 let offset=ev.offset??0,early=0;
 if(ev.mode==='legato'){offset+=estimate?1.8:inst.rise(r,2.5,1.8);early=.022;}
 else if(ev.mode==='portato')offset+=estimate?1.2:inst.rise(r,4,1.2);
 else if(ev.mode==='str')offset+=estimate?(ev.v>=80?1.2:4):(ev.v>=80?inst.rise(r,5,1.2):inst.settle(r,2,.4));
 else if(ev.mode==='plain'&&(ev.fam==='woodwind'||ev.fam==='brass'))offset+=estimate?.38:Math.max(0,inst.rise(r,20,.4)-.02);
 const rate=2**(((ev.p-r.kc)*(r.kt??1)+((r.tune??0)+(ev.cents??0))/100)/12),release=Math.max(.005,ev.release??r.env.r);
 // release()の実際の停止は離鍵+2.5r+.02秒。さらに40ms分を残す。
 return Math.min(fullDuration,(r.off??0)+offset+(Math.max(.02,ev.dur)+early+2.5*release+.06)*rate);
}
export function trimConcertoBuffer(ctx,inst,s,buffer,uses){
 for(const {r}of uses)if(r.loop)inst.env(r);
 const seconds=Math.max(...uses.map(({r,ev})=>retainedSeconds(inst,r,ev,buffer.duration))),length=Math.min(buffer.length,Math.max(1,Math.ceil(seconds*buffer.sampleRate)));
 if(length===buffer.length)return buffer;
 const cut=ctx.createBuffer(buffer.numberOfChannels,length,buffer.sampleRate);
 for(let c=0;c<buffer.numberOfChannels;c++)cut.copyToChannel(buffer.getChannelData(c).subarray(0,length),c);
 return cut;
}
