// Per-note trim for local drum samples. An absent map preserves the existing sound.
export const BAND_DRUM_SAMPLE_GAINS = Object.freeze({42:18,49:5});
export function createDrumOutputs(ctx,out,dbs={}){
 const nodes=new Map();
 for(const[key,db]of Object.entries(dbs)){
  const p=Number(key);if(!Number.isInteger(p)||p<0||p>127||!Number.isFinite(db))continue;
  const node=ctx.createGain();node.gain.value=Math.pow(10,Math.max(-24,Math.min(24,db))/20);node.connect(out);nodes.set(p,node);
 }
 return{at:p=>nodes.get(p)??out,dispose(){for(const node of nodes.values())node.disconnect();nodes.clear();}};
}
