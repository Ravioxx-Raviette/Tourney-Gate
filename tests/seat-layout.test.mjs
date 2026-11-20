import {test} from 'node:test';
import assert from 'node:assert/strict';
import {royalSeatPosition, seatPreviewPose, previewCandidates} from '../static/js/seat-layout.mjs';

const event = {venue:'The Royal Lists',layout_type:'stands',category:'Joust'};
const tier = {id:1,name:'Royal Box',kind:'seated'};
const seat = {id:1,tier_id:1,section:'Royal',row:'A',number:1,status:'available'};
test('all 300 modeled positions are unique and mirrored north/south',()=>{
 const points=[];
 for(const [kind,rows] of [['royal',2],['noble',8],['commoner',20]]) {
  for(let r=0;r<rows;r++)for(let n=1;n<=10;n++) {
   const p=royalSeatPosition(kind,String.fromCharCode(65+r),n);
   const mirror=royalSeatPosition(kind,String.fromCharCode(65+(r+rows/2)%rows),n);
   assert.equal(p.x,mirror.x); assert.equal(p.y,mirror.y); assert.equal(p.z,-mirror.z);
   points.push(JSON.stringify([p.x,p.y,p.z]));
  }
 }
 assert.equal(points.length,300); assert.equal(new Set(points).size,300);
});
test('model anchors retain the existing seat geometry',()=>{
 assert.deepEqual(royalSeatPosition('royal','A',1),{x:-6.3,y:0.92,z:-4.3,rotY:0});
 const noble=royalSeatPosition('noble','H',10);
 assert.ok(Math.abs(noble.x-7.65)<1e-10); assert.ok(Math.abs(noble.y-3.51)<1e-10);
 const bench=royalSeatPosition('commoner','T',10);
 assert.ok(Math.abs(bench.x-9.3)<1e-10); assert.ok(Math.abs(bench.y-7.555)<1e-10);
});
test('camera is at seated eye level and categories map to matching models',()=>{
 const pose=seatPreviewPose(event,tier,seat);
 assert.equal(pose.slug,'silver-lance'); assert.equal(pose.fov,60);
 assert.equal(pose.position[1],0.92+0.75);
 assert.equal(seatPreviewPose({...event,category:'Grand Melee'},tier,seat).slug,'five-banners');
});
test('custom layouts, tiers and unmapped/retired seats are not invented',()=>{
 for(const input of [{...seat,row:'C'},{...seat,number:11},{...seat,status:'retired'},{...seat,section:'Noble'},{...seat,tier_id:9}])assert.equal(seatPreviewPose(event,tier,input),null);
 assert.equal(seatPreviewPose({...event,venue:'The Great Hall'},tier,seat),null);
 assert.equal(seatPreviewPose(event,{...tier,name:'Custom tier'},seat),null);
 assert.equal(seatPreviewPose(event,{...tier,kind:'counted'},seat),null);
 assert.equal(royalSeatPosition('noble','AA',1),null);
});
test('comparison candidates exclude others holds but retain own reservations',()=>{
 const data={...event,tiers:[tier],seats:[seat,{...seat,id:2,number:2,status:'held'},{...seat,id:3,number:3,status:'booked'}]};
 assert.deepEqual(previewCandidates(data,new Set([2])).map(s=>s.id),[1,2]);
 assert.equal(data.seats[1].status,'held');
});

test('ownership never includes another buyer booked seat or an expired hold',async()=>{
 const {ownPreviewSeats}=await import('../static/js/seat-layout.mjs');
 const data={...event,status:'upcoming',server_time:100,seats:[{...seat,status:'held'},{...seat,id:2,number:2,status:'booked'}]};
 const booking={status:'pending',expires_at:110,items:[{seat_id:1},{seat_id:2}]};
 assert.deepEqual([...ownPreviewSeats(data,booking)],[1]);
 assert.equal(ownPreviewSeats({...data,server_time:110},booking).size,0);
 assert.equal(ownPreviewSeats(data,{...booking,status:'cancelled'}).size,0);
 assert.equal(previewCandidates({...data,tiers:[tier]},new Set([1,2])).some(s=>s.id===2),false);
});

test('reset after dragging overview restores the exact seat anchor',async()=>{
 globalThis.matchMedia=()=>({matches:true});
 globalThis.document={readyState:'loading',addEventListener(){}};
 const THREE=await import('../static/vendor/three/three.module.min.js');
 const {OrbitControls}=await import('../static/vendor/three/OrbitControls.js');
 const {Venue3DViewer}=await import('../static/js/venue3d.js');
 class Canvas extends EventTarget {
  style={}; clientHeight=500; clientWidth=800;
  setPointerCapture(){} releasePointerCapture(){}
 }
 const element=new Canvas(), camera=new THREE.PerspectiveCamera(60,1,0.5,130);
 camera.position.set(9,12,20);
 const controls=new OrbitControls(camera,element);
 controls.enableDamping=true; controls.dampingFactor=.08;
 const pointer=(type,x)=>element.dispatchEvent(Object.assign(new Event(type),{pointerId:1,pointerType:'mouse',button:0,clientX:x,clientY:0,pageX:x,pageY:0,ctrlKey:false,metaKey:false,shiftKey:false}));
 pointer('pointerdown',0); pointer('pointermove',40); pointer('pointerup',40);
 const viewer=Object.assign(Object.create(Venue3DViewer.prototype),{camera,controls,renderOnce(){}});
 const pose=seatPreviewPose(event,tier,seat);
 viewer.setSeatPose(pose);
 assert.ok(camera.position.distanceTo(new THREE.Vector3(...pose.position))<1e-9);
 assert.equal(camera.fov,60); assert.equal(camera.near,.05);
 controls.dispose();
});
