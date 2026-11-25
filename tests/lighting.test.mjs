import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../static/vendor/three/three.module.min.js';
import {fixtureDefinitions,buildVenueLighting} from '../static/js/venue-lighting.mjs';
const keys=['silver-lance','five-banners','iron-colosseum','kings-mark','victors-feast'];
test('every venue has twelve physically anchored fixtures and separate field/interior layouts',()=>{
 for(const key of keys){const defs=fixtureDefinitions(key);assert.equal(defs.length,12);assert.ok(defs.every(f=>f.position[1]>2));assert.equal(new Set(defs.map(f=>f.position.join())).size,12);}
 assert.notDeepEqual(fixtureDefinitions('iron-colosseum'),fixtureDefinitions('silver-lance'));
 assert.ok(fixtureDefinitions('victors-feast').every(f=>['wall','hanging'].includes(f.kind)));
 assert.deepEqual(fixtureDefinitions('unknown'),[]);
});
test('night switching is reversible and never accumulates lights or moves their positions',()=>{
 for(const key of keys){const rig=buildVenueLighting(THREE,key),positions=rig.lights.map(l=>l.position.toArray());const count=rig.group.children.length;
 for(let n=0;n<5;n++){rig.setNight(true);assert.ok(rig.lights.every(l=>l.visible));rig.setNight(false);assert.ok(rig.lights.every(l=>!l.visible));}
 assert.deepEqual(rig.lights.map(l=>l.position.toArray()),positions);assert.equal(rig.group.children.length,count);
 assert.equal(rig.lights.filter(l=>l.castShadow).length,2);const parent=new THREE.Group();parent.add(rig.group);rig.dispose();assert.equal(parent.children.length,0);}
});
test('mobile keeps all useful lights but disables expensive practical shadows',()=>{for(const key of keys){const rig=buildVenueLighting(THREE,key,{mobile:true});assert.equal(rig.lights.length,12);assert.ok(rig.lights.every(l=>!l.castShadow));rig.dispose();}});
