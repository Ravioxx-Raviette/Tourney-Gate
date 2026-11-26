import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../static/vendor/three/three.module.min.js';
import {surroundingsLayout,buildVenueSurroundings} from '../static/js/venue-surroundings.mjs';
const capacities={'silver-lance':60,'five-banners':60,'iron-colosseum':80,'kings-mark':48,'victors-feast':48};
const overlap=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ;
test('larger parking inventories and separate placements for each physical venue',()=>{
 const pairs=[];
 for(const [slug,count] of Object.entries(capacities)){
  const p=surroundingsLayout(slug);assert.equal(p.bays.length,count);assert.ok(p.motorcycles.length>=16);
  assert.ok(p.bays.filter(b=>b.occupied).length>12);assert.ok(p.bays.filter(b=>b.accessible).length>=2);
  assert.ok(!overlap(p.parking,p.arena));assert.ok(!overlap(p.food,p.arena));assert.ok(!overlap(p.parking,p.food));
  if(slug!=='five-banners')pairs.push(p.parking.side+'/'+p.food.side);
 }
 assert.equal(new Set(pairs).size,4);
 assert.deepEqual(surroundingsLayout('silver-lance'),surroundingsLayout('five-banners'));
});
test('cars, stalls and picnic furniture use each venue miniature chair scale',()=>{
 for(const slug of Object.keys(capacities)){
  const p=surroundingsLayout(slug),d=p.dimensions;
  assert.ok(d.carWidth/d.chairWidth>=3&&d.carWidth/d.chairWidth<=4.5);
  assert.ok(d.stallWidth/d.chairWidth>=5&&d.stallWidth/d.chairWidth<=8);
  assert.ok(d.picnicSeatHeight/d.chairWidth>=.65&&d.picnicSeatHeight/d.chairWidth<=1.2);
  assert.ok(d.stallHeight<3.2,'stalls no longer tower over miniature furniture');
 }
});
test('rotated area highlights and bounds cover the actual small-scale scenery',()=>{
 for(const slug of Object.keys(capacities)){
  const rig=buildVenueSurroundings(THREE,slug);rig.group.updateMatrixWorld(true);
  const actual=new THREE.Box3().setFromObject(rig.group);assert.ok(rig.bounds.containsBox(actual));
  for(const key of ['parking','food']){
   const highlight=new THREE.Box3().setFromObject(rig.highlights[key]);const area=rig.layout[key];
   assert.ok(Math.abs(highlight.min.x-area.minX)<.01&&Math.abs(highlight.max.z-area.maxZ)<.01);
  }
  assert.ok(rig.lights.every(l=>!l.castShadow));rig.dispose();
 }
});
