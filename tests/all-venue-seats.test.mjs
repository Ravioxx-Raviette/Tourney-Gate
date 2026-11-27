import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seatPreviewPose} from '../static/js/seat-layout.mjs';
import {findPartySeats} from '../static/js/party-seats.mjs';
const layouts=[['The Royal Lists','Joust','stands','Royal Box','Royal','A',10,'silver-lance'],['The Iron Colosseum','Gladiatorial Games','arena','Noble Stand','Noble','A',10,'iron-colosseum'],['The Iron Colosseum','Gladiatorial Games','arena','Commoner’s Bench','Bench','X',10,'iron-colosseum'],['The King’s Green','Archery Contest','stands','Commoner’s Bench','Bench','L',10,'kings-mark'],['The Great Hall','Feast','tables','Feast seat','Bench','Table 8',8,'victors-feast']];
for(const [venue,category,layout_type,name,section,row,width,slug] of layouts)test(`${venue} ${name}: seat view and contiguous party`,()=>{
 const tier={id:1,name,kind:'seated',price:100,max_per_order:8};
 const seats=Array.from({length:width},(_,i)=>({id:i+1,tier_id:1,section,row,number:i+1,status:'available'}));
 const event={venue,category,layout_type,tiers:[tier],seats,status:'upcoming',start_at:200,server_time:100};
 const points=seats.map(s=>seatPreviewPose(event,tier,s));assert.ok(points.every(p=>p?.slug===slug));
 assert.equal(new Set(points.map(p=>JSON.stringify(p.position))).size,width);
 const party=findPartySeats(event,1,2,null);assert.ok(party);assert.equal(party.ids.length,2);
 assert.equal(seatPreviewPose(event,tier,{...seats[0],number:99}),null);
 assert.equal(findPartySeats({...event,seats:seats.map(s=>({...s,status:'booked'}))},1,2,null),null);
});
test('parties cannot cross curved gallery or colosseum physical rows; eight can share one table',()=>{
 for(const [venue,category,layout_type,name,section,row] of layouts.slice(1)){
  const tier={id:1,name,kind:'seated',price:100,max_per_order:8};
  const e={venue,category,layout_type,tiers:[tier],status:'upcoming',start_at:200,server_time:100,seats:Array.from({length:10},(_,i)=>({id:i+1,tier_id:1,section,row,number:i+1,status:'available'}))};
  if(layout_type==='tables')assert.equal(findPartySeats(e,1,8,null).ids.length,8);
  else assert.equal(findPartySeats(e,1,6,null),null);
 }
});
