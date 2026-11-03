// Resolve the hand's task on the audio clock. A sounding gesture always owns
// the hand; an earlier gesture's release window must never hide the next one.
import {LIMITS} from './prompts.js';
// つまみから鍵盤へ戻る時間 (秒)。右手の音を置かない 0.25 秒 (LIMITS.knobAfter) の 9 割を使う。
// 前は 6 割 (0.15 秒) で、つまみから鍵盤まで約 30 cm を 1 コマ最大 8 cm で戻っていた (2026-11-03 さとるん「手がワープしているように見えます」)
export const KNOB_BACK=LIMITS.knobAfter*.9;
const clamp=v=>Math.max(0,Math.min(1,v));
export function knobMotionAt(events,now,toSec){
 let previous=null,next=null;
 for(const event of events){const start=toSec(event.s),end=toSec(event.s+event.d);
  if(now>=start-1e-8&&now<end-1e-8)return {event,there:1};
  if(start>now){next={event,start};break;}
  previous={event,end};
 }
 const after=KNOB_BACK;
 if(previous&&next&&next.start-previous.end<=LIMITS.knobBefore+after){
  const progress=clamp((now-previous.end)/(next.start-previous.end||1));
  return {event:next.event,there:1,travel:{from:previous.event,progress}};
 }
 if(previous&&now<previous.end+after)return {event:previous.event,there:1-clamp((now-previous.end)/after)};
 if(next&&now>=next.start-LIMITS.knobBefore)return {event:next.event,there:clamp((now-(next.start-LIMITS.knobBefore))/(LIMITS.knobBefore*.8))};
 return null;
}
