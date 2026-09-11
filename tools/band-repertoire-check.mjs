// Run the actual writer against an in-memory filesystem: never regenerate music
// merely to test that another composer's listening candidates survive.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const file=new URL('./make-band-repertoire.mjs',import.meta.url),source=fs.readFileSync(file,'utf8');
const existing=JSON.parse(fs.readFileSync(new URL('../public/band/repertoire/index.json',import.meta.url)));
async function run(index){
 const writes=new Map(),context=vm.createContext({URL,console:{log(){},error(){}},process:{exitCode:0}});
 const fake={readFileSync:()=>JSON.stringify(index),writeFileSync:(path,body)=>writes.set(path.pathname,body)};
 const main=new vm.SourceTextModule(source,{context,initializeImportMeta:meta=>{meta.url=file.href;}});
 await main.link(async name=>{const obj=name==='node:fs'?{default:fake}:await import(new URL(name,file));return new vm.SyntheticModule(Object.keys(obj),function(){for(const[k,v]of Object.entries(obj))this.setExport(k,v);},{context});});
 await main.evaluate();return writes;
}
const writes=await run(existing),out=JSON.parse([...writes].find(([p])=>p.endsWith('/index.json'))[1]);
const candidates=existing.filter(x=>x.candidate);assert.equal(candidates.length,3);
for(const item of candidates){assert.deepEqual(out.find(x=>x.file===item.file),item);assert.ok(![...writes.keys()].some(p=>p.endsWith('/'+item.file)));}
assert.equal(out.length,existing.length);
await assert.rejects(run(existing.map((x,i)=>i===0?{...x,candidate:true}:x)),/Refusing to overwrite/);
console.log('PASS: 3 candidate entries and files preserved; owned-candidate collision rejects before writing. Actual repertoire untouched.');
