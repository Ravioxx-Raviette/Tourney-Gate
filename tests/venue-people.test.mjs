import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../static/vendor/three/three.module.min.js';
import {createVenuePeople,peopleProfile,readPeoplePreference,writePeoplePreference} from '../static/js/venue-people.mjs';
import {surroundingsLayout} from '../static/js/venue-surroundings.mjs';
const slugs=['silver-lance','five-banners','iron-colosseum','kings-mark','victors-feast'];
for(const slug of slugs)test(`${slug}: bounded, scaled crowds and safe paths`,()=>{
 const layout=surroundingsLayout(slug),crowd=createVenuePeople(THREE,slug,{layout});
 const small=createVenuePeople(THREE,slug,{layout,mobile:true});
 assert.ok(crowd.people.length<=peopleProfile(slug).limit);assert.ok(small.people.length<=48);
 assert.ok(crowd.people.some(p=>p.role==='spectator'));assert.ok(crowd.people.some(p=>p.role==='visitor'));assert.ok(crowd.people.some(p=>p.role==='performer'));
 const seats=crowd.people.filter(p=>p.role==='spectator');assert.equal(new Set(seats.map(p=>p.anchor.join(','))).size,seats.length);
 assert.ok(crowd.people.every(p=>p.height<=layout.profile.chair*3.3));
 for(const person of crowd.people.filter(p=>p.role==='visitor')){
  assert.equal(person.anchor[1],.045);
  assert.equal(person.path.length,2);
  for(const point of person.path)assert.ok(layout.walkways.some(r=>point[0]>=r.minX&&point[0]<=r.maxX&&point[2]>=r.minZ&&point[2]<=r.maxZ));
 }
 crowd.update(.04);assert.ok(crowd.group.children.length<=10);
 for(const mesh of crowd.group.children)assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));
 // Every sampled point of each visitor loop remains on an existing paved strip.
 for(let step=0;step<100;step++){
  crowd.update(.05);
  for(const person of crowd.people.filter(p=>p.role==='visitor')){
   const f=person.frame;
   assert.ok(layout.walkways.some(r=>f.x>=r.minX&&f.x<=r.maxX&&f.z>=r.minZ&&f.z<=r.maxZ));
  }
 }
 assert.equal(crowd.group.children.filter(m=>m.isLight).length,0);
 crowd.dispose();small.dispose();
});
test('motion, visibility and cleanup are reversible without changing initial paths',()=>{
 const crowd=createVenuePeople(THREE,'silver-lance',{layout:surroundingsLayout('silver-lance')});
 const matrices=()=>crowd.group.children.map(m=>Array.from(m.instanceMatrix.array));
 const initial=matrices();crowd.update(.04);assert.notDeepEqual(matrices(),initial);
 crowd.setMotionEnabled(false);const frozen=matrices();crowd.update(10);assert.deepEqual(matrices(),frozen);
 crowd.setMotionEnabled(true);crowd.setVisible(false);crowd.update(10);assert.deepEqual(matrices(),frozen);
 crowd.setVisible(true);crowd.update(.04);assert.notDeepEqual(matrices(),frozen);
 const parent=new THREE.Group();parent.add(crowd.group);
 const resources=new Set();crowd.group.traverse(m=>{if(m.geometry)resources.add(m.geometry);if(m.material)resources.add(m.material);});
 let disposed=0;for(const r of resources)r.addEventListener('dispose',()=>disposed++);
 crowd.dispose();crowd.dispose();assert.equal(disposed,resources.size);assert.equal(parent.children.length,0);
});
test('preferences default on and tolerate unavailable storage',()=>{
 assert.equal(readPeoplePreference(),true);
 assert.equal(readPeoplePreference({getItem:()=> 'off'}),false);
 assert.equal(readPeoplePreference({getItem(){throw Error('blocked');}}),true);
 const blocked={setItem(){throw Error('blocked');},getItem(){throw Error('blocked');}};
 writePeoplePreference(false,blocked);assert.equal(readPeoplePreference(blocked),false);
 writePeoplePreference(true,blocked);
});
test('archers stand on the three authored shooting platforms and face their targets',()=>{
 const crowd=createVenuePeople(THREE,'kings-mark',{layout:surroundingsLayout('kings-mark')});
 const archers=crowd.people.filter(p=>p.kind==='archer');
 assert.deepEqual(archers.map(p=>p.anchor[0]),[-6.6,0,6.6]);
 assert.ok(archers.every(p=>p.yaw===Math.PI&&p.anchor[2]>1.05&&p.anchor[1]===.13));crowd.dispose();
});

test('refined figures have shaped torsos, articulated limbs and face/hand details within the draw budget',()=>{
 const crowd=createVenuePeople(THREE,'silver-lance',{layout:surroundingsLayout('silver-lance')});
 const part=name=>crowd.group.children.find(m=>m.userData.part===name);
 assert.equal(part('torso')?.geometry.type,'CylinderGeometry');
 assert.equal(part('left-arm')?.geometry.type,'CapsuleGeometry');
 assert.equal(part('left-arm')?.count,crowd.people.length*2);
 assert.ok(part('face-clothing-details')&&part('hair-hands'));
 assert.ok(crowd.group.children.length<=10);crowd.dispose();
});

test('every stationary role and paused visitor has visible, staggered idle motion without drifting',()=>{
 const roles=new Set();
 for(const slug of slugs){
  const crowd=createVenuePeople(THREE,slug,{layout:surroundingsLayout(slug)});
  const head=crowd.group.children.find(m=>m.userData.part==='head');assert.ok(head);
  for(const person of crowd.people)if(person.kind==='walker')person.phase=0;
  crowd.update(.01);
  const before=Array.from(head.instanceMatrix.array);
  for(let i=0;i<10;i++)crowd.update(.05);
  for(let i=0;i<crowd.people.length;i++){
   const person=crowd.people[i];
   if(['seated','squire','attendant','walker','server','musician'].includes(person.kind)){
    assert.notDeepEqual(Array.from(head.instanceMatrix.array.slice(i*16,i*16+16)),before.slice(i*16,i*16+16),person.kind);
    if(!person.path)assert.equal(person.frame.x,person.anchor[0]);
    roles.add(person.kind);
   }
  }
  assert.ok(crowd.people.filter(p=>p.kind==='walker').every(p=>p.frame.walk===0));
  crowd.dispose();
 }
 assert.equal(roles.size,6);
});

test('archery bow grips stay attached to the left hand while drawing',()=>{
 const crowd=createVenuePeople(THREE,'kings-mark',{layout:surroundingsLayout('kings-mark')});
 const hands=crowd.group.children.find(m=>m.userData.part==='hair-hands');
 const bows=crowd.group.children.find(m=>m.geometry.type==='TorusGeometry');
 const matrix=new THREE.Matrix4(),handMatrix=new THREE.Matrix4();
 for(let tick=0;tick<20;tick++){
  crowd.update(.05);let bow=0;
  crowd.people.forEach((p,i)=>{
   if(p.kind!=='archer')return;
   bows.getMatrixAt(bow++,matrix);hands.getMatrixAt(i*3+1,handMatrix);
   const grip=new THREE.Vector3(0,.25,0).applyMatrix4(matrix);
   assert.ok(grip.distanceTo(new THREE.Vector3().setFromMatrixPosition(handMatrix))<1e-6);
  });
 }
 crowd.dispose();
});
