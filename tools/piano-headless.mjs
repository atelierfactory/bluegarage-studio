// Stub only canvas painting, never THREE geometry, matrices, bones or IK.
const paint = new Proxy({measureText:s=>({width:s.length*22})},{get:(o,k)=>o[k]??(()=>{})});
globalThis.document ??= {createElement:()=>({getContext:()=>paint})};
export const {PianoStage} = await import('../public/piano/scene.js');
