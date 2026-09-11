// Resolve the hand's task on the audio clock. A sounding gesture always owns
// the hand; an earlier gesture's release window must never hide the next one.
import {LIMITS} from './prompts.js';
const clamp=v=>Math.max(0,Math.min(1,v));
export function knobMotionAt(events,now,toSec){
 let previous=null,next=null;
 for(const event of events){const start=toSec(event.s),end=toSec(event.s+event.d);
  if(now>=start-1e-8&&now<end-1e-8)return {event,there:1};
  if(start>now){next={event,start};break;}
  previous={event,end};
 }
 const after=LIMITS.knobAfter*.6;
 if(previous&&next&&next.start-previous.end<=LIMITS.knobBefore+after){
  const progress=clamp((now-previous.end)/(next.start-previous.end||1));
  return {event:next.event,there:1,travel:{from:previous.event,progress}};
 }
 if(previous&&now<previous.end+after)return {event:previous.event,there:1-clamp((now-previous.end)/after)};
 if(next&&now>=next.start-LIMITS.knobBefore)return {event:next.event,there:clamp((now-(next.start-LIMITS.knobBefore))/(LIMITS.knobBefore*.8))};
 return null;
}
