import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../static/vendor/three/three.module.min.js';
import {readFileSync} from 'node:fs';
import {royalSeatPosition} from '../static/js/seat-layout.mjs';
import {surroundingsLayout, buildVenueSurroundings, fitSurroundingsPreset} from '../static/js/venue-surroundings.mjs';
const slugs=['silver-lance','five-banners','iron-colosseum','kings-mark','victors-feast'];
const overlaps=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ;
test('every layout separates parking, concessions and pedestrian routes from the arena',()=>{
 for(const slug of slugs){const p=surroundingsLayout(slug);
  assert.ok(p.bays.length>=48);assert.ok(p.bays.filter(b=>b.accessible).length>=2);
  assert.ok(p.motorcycles.length>=16);assert.equal(p.stalls.length,4);
  assert.equal(p.stalls.filter(s=>s.kind==='drinks').length,1);
  assert.ok(!overlaps(p.parking,p.arena));assert.ok(!overlaps(p.food,p.arena));
  assert.ok(p.walkways.length>=6);
  for(const path of p.walkways)for(const stall of p.stalls)assert.ok(!overlaps(stall,path));
  for(const path of p.walkways)for(const bay of p.bays)assert.ok(!overlaps(bay,path));
 }
 assert.deepEqual(surroundingsLayout('silver-lance'),surroundingsLayout('five-banners'));
 assert.equal(surroundingsLayout('unknown'),null);
});
test('camera fitting contains every bounding-box corner in wide and narrow views',()=>{
 const bounds=new THREE.Box3(new THREE.Vector3(-50,-.5,-20),new THREE.Vector3(25,13,45));
 for(const aspect of [0.5,1,1.8])for(const top of [false,true]){
  const preset=fitSurroundingsPreset(THREE,bounds,{aspect,fov:37,top});
  const camera=new THREE.PerspectiveCamera(37,aspect,.5,preset.far);camera.position.fromArray(preset.pos);camera.lookAt(...preset.target);camera.updateMatrixWorld();
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
   const point=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(point.x)<=1&&Math.abs(point.y)<=1&&Math.abs(point.z)<=1);
  }
 }
});
test('night lighting is reversible, budgeted, and cleanup releases owned GPU resources once',()=>{
 for(const slug of slugs){const r=buildVenueSurroundings(THREE,slug);const count=r.group.children.length;
  assert.ok(r.lights.length<=2);assert.ok(r.lights.every(l=>!l.castShadow));
  for(let i=0;i<4;i++){r.setNight(true);assert.ok(r.lights.every(l=>l.visible));r.setNight(false);assert.ok(r.lights.every(l=>!l.visible));}
  assert.equal(r.group.children.length,count);
  const parent=new THREE.Group();parent.add(r.group);let disposed=0;
  r.group.traverse(o=>{o.geometry?.addEventListener('dispose',()=>disposed++);});
  r.dispose();assert.equal(parent.children.length,0);assert.ok(disposed>0);const once=disposed;r.dispose();assert.equal(disposed,once);
 }
});
test('layouts adapt to real arena extents rather than overlapping larger structures',()=>{
 const bounds=new THREE.Box3(new THREE.Vector3(-31,-1,-23),new THREE.Vector3(29,16,21));
 const r=buildVenueSurroundings(THREE,'iron-colosseum',{arenaBounds:bounds});
 assert.ok(!overlaps(r.layout.parking,r.layout.arena));assert.ok(!overlaps(r.layout.food,r.layout.arena));
 for(const key of ['parking','food'])assert.ok(r.zones[key]);r.dispose();
});
test('actual exported arena models retain their geometry and receive non-overlapping exterior layouts',()=>{
 const source=readFileSync(new URL('../static/js/venue3d.js',import.meta.url),'utf8');
 const buildersSource=source.slice(source.indexOf('const REDUCED_MOTION'),source.indexOf('export class Venue3DViewer'));
 const gradient={addColorStop(){}};
 const context=new Proxy({measureText:text=>({width:text.length*20}),createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(object,key)=>object[key]||(()=>{})});
 const document={createElement:()=>({width:0,height:0,getContext:()=>context})};
 const builders=new Function('THREE','matchMedia','document','royalSeatPosition',buildersSource+';return VENUE_BUILDERS;')(THREE,()=>({matches:false}),document,royalSeatPosition);
 for(const slug of slugs){
  const venue=builders[slug](),before=new THREE.Box3().setFromObject(venue.root);
  assert.ok(!venue.root.getObjectByName('Detailed festival surroundings'));
  const scenery=buildVenueSurroundings(THREE,slug,{arenaBounds:before});
  assert.ok(!overlaps(scenery.layout.food,scenery.layout.arena));assert.ok(!overlaps(scenery.layout.parking,scenery.layout.arena));
  assert.deepEqual(new THREE.Box3().setFromObject(venue.root),before);
  const actual=new THREE.Box3().setFromObject(scenery.group);
  assert.ok(scenery.bounds.containsBox(actual),JSON.stringify({slug,expected:scenery.bounds,actual}));
  for(const aspect of [.5,2.4]){
   const preset=fitSurroundingsPreset(THREE,scenery.bounds,{aspect,parts:scenery.framingParts});
   const camera=new THREE.PerspectiveCamera(37,aspect,.5,preset.far);camera.position.fromArray(preset.pos);camera.lookAt(...preset.target);camera.updateMatrixWorld();
   for(const box of scenery.framingParts)for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&Math.abs(p.z)<=1);
   }
  }
  scenery.dispose();
 }
});
test('the entrance promenade has no physical obstacles at pedestrian height',()=>{
 for(const slug of slugs){
  const r=buildVenueSurroundings(THREE,slug),walks=r.layout.walkways,matrix=new THREE.Matrix4();
  r.group.updateMatrixWorld(true);
  r.group.traverse(mesh=>{
   if(!mesh.isMesh)return;
   mesh.geometry.computeBoundingBox();
   const inspect=transform=>{
    const b=mesh.geometry.boundingBox.clone().applyMatrix4(transform);
    if(b.min.y<2*r.layout.scale&&b.max.y>.2*r.layout.scale)for(const walk of walks)assert.ok(!overlaps({minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z},walk),'unobstructed promenade');
   };
   if(mesh.isInstancedMesh)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);inspect(matrix.clone().premultiply(mesh.matrixWorld));}
   else inspect(mesh.matrixWorld);
  });r.dispose();
 }
});
test('scenery batches keep a bounded draw budget and dispose sign textures',()=>{
 let textureDisposals=0;
 const r=buildVenueSurroundings(THREE,'iron-colosseum',{labelMaterialFactory:()=>{
  const map=new THREE.Texture();map.addEventListener('dispose',()=>textureDisposals++);return new THREE.MeshStandardMaterial({map});
 }});
 let meshes=0;r.group.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes<85);
 r.dispose();assert.equal(textureDisposals,5);
});
