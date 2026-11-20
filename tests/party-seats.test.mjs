import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findPartySeats} from '../static/js/party-seats.mjs';
const tier={id:1,name:'Noble Stand',kind:'seated',price:80000,max_per_order:8};
const event={venue:'The Royal Lists',layout_type:'stands',category:'Joust',status:'upcoming',start_at:200,server_time:100,tiers:[tier],seats:Array.from({length:10},(_,i)=>({id:i+1,tier_id:1,section:'Noble',row:'A',number:i+1,status:'available'}))};
test('suggests consecutive same-row seats without crossing the central aisle',()=>{
 const result=findPartySeats(event,1,4,320000);
 assert.equal(result.total,320000); assert.equal(result.ids.length,4);
 assert.ok(result.ids.every(id=>id<=5)||result.ids.every(id=>id>=6));
 assert.equal(findPartySeats(event,1,6,null),null);
 assert.equal(event.seats[0].status,'available');
});
test('respects total budget, tier order limits and unavailable gaps',()=>{
 assert.equal(findPartySeats(event,1,2,159999),null);
 assert.equal(findPartySeats({...event,tiers:[{...tier,max_per_order:1}]},1,2,null),null);
 const broken={...event,seats:event.seats.map(s=>({...s,status:[2,4,7,9].includes(s.id)?'booked':'available'}))};
 assert.equal(findPartySeats(broken,1,3,null),null);
});
test('does not join rows or accept unsupported custom and other venues',()=>{
 assert.equal(findPartySeats({...event,venue:'Other venue'},1,2,null),null);
 assert.equal(findPartySeats({...event,tiers:[{...tier,name:'Custom'}]},1,2,null),null);
 assert.equal(findPartySeats({...event,status:'cancelled'},1,2,null),null);
 for(const n of [0,9,2.5,NaN])assert.equal(findPartySeats(event,1,n,null),null);
 assert.equal(findPartySeats(event,1,2,-1),null);
});
test('only own unexpired held seats can join a group',()=>{
 const held={...event,seats:event.seats.slice(0,2).map(s=>({...s,status:'held'}))};
 const booking={status:'pending',expires_at:110,items:[{seat_id:1},{seat_id:2}]};
 assert.equal(findPartySeats(held,1,2,null),null);
 assert.deepEqual(findPartySeats(held,1,2,null,booking).ids,[1,2]);
 assert.equal(findPartySeats({...held,server_time:111},1,2,null,booking),null);
});
test('Royal Box can accommodate eight together',()=>{
 const royal={...event,category:'Grand Melee',tiers:[{...tier,name:'Royal Box'}],seats:event.seats.map(s=>({...s,section:'Royal'}))};
 assert.equal(findPartySeats(royal,1,8,null).ids.length,8);
});

test('fresh quotes reflect price changes even when both fit the budget',()=>{
 assert.equal(findPartySeats(event,1,2,200000).total,160000);
 assert.equal(findPartySeats({...event,tiers:[{...tier,price:90000}]},1,2,200000).total,180000);
});
