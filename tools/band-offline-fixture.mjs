// Node-only recorder for the native Web Audio boundary. The input is actual
// SynthCore PCM, returned dry; this fixture does NOT claim to emulate native FX.
class Param {
 constructor(){this.value=0;}
 setValueAtTime(v){this.value=v;}
}
class AudioNode {
 constructor(ctx,kind){this.kind=kind;this.edges=[];this.gain=new Param();this.frequency=new Param();this.delayTime=new Param();this.Q=new Param();ctx.nodes.push(this);}
 connect(node){this.edges.push(node);}
 disconnect(){this.disconnected=true;this.edges=[];}
 start(){this.started=true;}
 stop(){this.stopped=true;}
}
export class RecordedOfflineContext {
 static instances=[];
 static wait=null;
 static fail=false;
 constructor(channels,length,rate){this.sampleRate=rate;this.length=length;this.currentTime=0;this.nodes=[];this.destination={};RecordedOfflineContext.instances.push(this);}
 createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return {sampleRate:rate,length,getChannelData:i=>data[i]};}
 async startRendering(){if(RecordedOfflineContext.wait)await RecordedOfflineContext.wait;if(RecordedOfflineContext.fail)throw Error('injected offline failure');return this.nodes.find(n=>n.kind==='BufferSource').buffer;}
}
for(const kind of['Gain','BufferSource','ChannelSplitter','ChannelMerger','Delay','Oscillator','BiquadFilter','Convolver'])RecordedOfflineContext.prototype[`create${kind}`]=function(){return new AudioNode(this,kind);};
