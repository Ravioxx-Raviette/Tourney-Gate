import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../static/vendor/three/three.module.min.js';
import {createAtlasLighting, buildAtlasFixtures} from '../static/js/atlas-lighting.mjs';

function fixture(dark=false) {
 const scene=new THREE.Scene(); scene.background=new THREE.Color(); scene.fog=new THREE.FogExp2(0,0.0068);
 const hemi=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight(),rim=new THREE.DirectionalLight();
 const fixtures=buildAtlasFixtures(THREE,[{position:[1,2,3],light:true},{position:[4,2,3]}]); scene.add(fixtures.group);
 const windows=[new THREE.MeshStandardMaterial({emissive:0xff9d2e})];
 const rig=createAtlasLighting(THREE,{scene,hemi,sun,rim,fixtures,windows,dark});
 return {scene,hemi,sun,rim,fixtures,rig,windows};
}
test('initial dark theme is moonlit and readable, with warm practical lights',()=>{
 const day=fixture(),night=fixture(true);
 assert.ok(night.sun.intensity<day.sun.intensity); assert.ok(night.hemi.intensity>=0.65);
 assert.ok(night.fixtures.lights.every(l=>l.visible&&l.intensity>0));
 assert.ok(night.windows[0].emissiveIntensity>day.windows[0].emissiveIntensity);
});
test('900ms transition reverses from current appearance and settles at latest intent',()=>{
 const f=fixture();const day=f.sun.intensity;f.rig.setNight(true,0);f.rig.update(450);
 const mid=f.sun.intensity;assert.ok(mid<day&&mid>0.85);
 f.rig.setNight(false,450);f.rig.update(450);assert.equal(f.sun.intensity,mid);
 f.rig.update(1350);assert.equal(f.sun.intensity,day);assert.ok(f.fixtures.lights.every(l=>!l.visible));
});
test('reduced motion applies immediately including an in-flight transition',()=>{
 const f=fixture();f.rig.setNight(true,0);f.rig.update(100);
 f.rig.update(101,{reduced:true});assert.ok(Math.abs(f.sun.intensity-0.85)<1e-9);
 f.rig.setNight(false,102,true);f.rig.update(102,{reduced:true});assert.equal(f.sun.intensity,1.85);
});
test('invasion tint composes with night, restores night and parchment has final priority',()=>{
 const f=fixture(true);const normal=f.scene.fog.color.clone();
 f.rig.update(1,{invasion:{phase:'active',wave:3}});f.rig.update(901,{invasion:{phase:'active',wave:3}});
 assert.ok(f.sun.intensity<0.85);assert.notDeepEqual(f.scene.fog.color,normal);
 f.rig.update(902);f.rig.update(1802);assert.ok(Math.abs(f.sun.intensity-0.85)<1e-9);assert.deepEqual(f.scene.fog.color,normal);
 f.rig.update(1803,{strategicBlend:1,invasion:{phase:'active',wave:3}});
 assert.equal(f.scene.background.getHex(),0xf2e5c5);assert.equal(f.scene.fog.color.getHex(),0xf2e5c5);
});
test('fixtures keep a fixed budget and dispose owned resources',()=>{
 const defs=Array.from({length:20},(_,i)=>({position:[i,1,0],light:true}));
 const f=buildAtlasFixtures(THREE,defs);assert.equal(f.lights.length,4);assert.ok(f.lights.every(l=>!l.castShadow));
 const parent=new THREE.Group();parent.add(f.group);let disposed=0;
 f.group.traverse(o=>{if(o.geometry)o.geometry.addEventListener('dispose',()=>disposed++);});
 f.dispose();assert.equal(parent.children.length,0);assert.ok(disposed>0);
});
test('warning, reign and boss overlays preserve the chosen theme and restore it after recovery',()=>{
 for(const dark of [false,true])for(const invasion of [{phase:'warning',wave:0},{phase:'reign',wave:2},{phase:'active',wave:1},{phase:'active',wave:3}]){
  const f=fixture(dark),base=f.sun.intensity;
  f.rig.update(1,{invasion,reduced:true});assert.ok(f.sun.intensity<base);
  f.rig.update(2,{invasion:{phase:'rebuild'},reduced:true});assert.equal(f.sun.intensity,base);
 }
});
