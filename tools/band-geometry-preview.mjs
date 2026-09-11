// Diagnostic CPU rasterizer, NOT a WebGL screenshot or a material/lighting reference.
// Lets a browserless reviewer see silhouettes, assembly and occlusion of actual geometry.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
import {beatToSec} from '../public/js/state.js';
import {partsFromSong} from '../public/band/model.js';
import {knobDefaults} from '../public/js/synth2.js';
const ctx={fillRect(){},strokeRect(){},fillText(){},measureText:s=>({width:s.length*22})};globalThis.document={createElement:()=>({getContext:()=>ctx})};
const{BandStage}=await import('../public/band/scene.js');const stage=new BandStage(null,{headless:true});
const{song}=JSON.parse(fs.readFileSync(new URL('../public/band/repertoire/glass-current.band.json',import.meta.url)));stage.setSong(partsFromSong(song),knobDefaults(song.tracks[0].synth2));
const view=process.argv[2]??'knob',w=960,h=640;stage.w=w;stage.h=h;stage.poseAt(song.shots[view]??song.shots.knob,b=>beatToSec(b,song));stage.setShot(view);stage.scene.updateMatrixWorld(true);const camera=stage.shotCamera;camera.updateMatrixWorld();
const depth=new Float32Array(w*h).fill(Infinity),image=Buffer.alloc(w*h*3);for(let i=0;i<image.length;i+=3){image[i]=13;image[i+1]=15;image[i+2]=18;}
const light=new THREE.Vector3(.5,1,.7).normalize(),tri=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()],ndc=tri.map(()=>new THREE.Vector3()),ns=tri.map(()=>new THREE.Vector3()),world=new THREE.Matrix4(),inst=new THREE.Matrix4();
function raster(mesh,matrix){const g=mesh.geometry,attr=g.attributes.position,norm=g.attributes.normal,index=g.index,mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;if(!attr||!mat||!mesh.visible)return;const nmat=new THREE.Matrix3().getNormalMatrix(matrix),color=mat.color?.clone()??new THREE.Color(.5,.5,.5);color.convertLinearToSRGB();const cc=[color.r,color.g,color.b];
 const start=g.drawRange.start,lim=Math.min(index?.count??attr.count,Number.isFinite(g.drawRange.count)?start+g.drawRange.count:Infinity);
 for(let i=start;i+2<lim;i+=3){for(let j=0;j<3;j++){const k=index?index.getX(i+j):i+j;tri[j].fromBufferAttribute(attr,k).applyMatrix4(matrix);ndc[j].copy(tri[j]).project(camera);if(norm)ns[j].fromBufferAttribute(norm,k).applyMatrix3(nmat).normalize();}
  if(ndc.some(p=>p.z<-.99||p.z>.9999))continue;const xs=ndc.map(p=>(p.x+1)*w/2),ys=ndc.map(p=>(1-p.y)*h/2),area=(xs[1]-xs[0])*(ys[2]-ys[0])-(ys[1]-ys[0])*(xs[2]-xs[0]);if(Math.abs(area)<.01)continue;if(mat.side!==THREE.DoubleSide&&area>0)continue;
  const minX=Math.max(0,Math.floor(Math.min(...xs))),maxX=Math.min(w-1,Math.ceil(Math.max(...xs))),minY=Math.max(0,Math.floor(Math.min(...ys))),maxY=Math.min(h-1,Math.ceil(Math.max(...ys)));if(minX>maxX||minY>maxY)continue;
  const shade=ns.map(n=>.32+.60*Math.max(0,n.dot(light))+.08*Math.max(0,-n.z));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const a=((xs[1]-x)*(ys[2]-y)-(ys[1]-y)*(xs[2]-x))/area,b=((xs[2]-x)*(ys[0]-y)-(ys[2]-y)*(xs[0]-x))/area,c=1-a-b;if(a<0||b<0||c<0)continue;const z=a*ndc[0].z+b*ndc[1].z+c*ndc[2].z,p=y*w+x;if(z>=depth[p])continue;depth[p]=z;const l=mat.isMeshBasicMaterial?1:a*shade[0]+b*shade[1]+c*shade[2];for(let j=0;j<3;j++)image[p*3+j]=Math.max(0,Math.min(255,Math.round(cc[j]*255*l)));}
 }
}
stage.scene.traverse(mesh=>{if(!mesh.isMesh)return;if(mesh.isInstancedMesh){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,inst);world.multiplyMatrices(mesh.matrixWorld,inst);raster(mesh,world);}}else raster(mesh,mesh.matrixWorld);});
const dir=new URL('../astra/shots/',import.meta.url);fs.mkdirSync(dir,{recursive:true});const png=new URL(`geometry-${view}.png`,dir),ppm=Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`),image]);execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','ppm','-i','pipe:0',png.pathname],{input:ppm});console.log(`${png.pathname} (geometry diagnostic only)`);
