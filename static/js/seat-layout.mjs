/** Shared coordinates for the Royal Lists model and numbered-seat previews. */
export function royalSeatPosition(kind, row, number) {
  const perSide = {royal: 1, noble: 4, commoner: 10}[kind];
  if (!perSide || !/^[A-Z]$/.test(row) || !Number.isInteger(number) || number < 1 || number > 10) return null;
  const index = row.charCodeAt(0) - 65;
  if (index >= perSide * 2) return null;
  const side = index < perSide ? -1 : 1, r = index % perSide, s = number - 1;
  const rotY = side < 0 ? 0 : Math.PI;
  if (kind === 'royal') return {x: -6.3 + s * 1.4, y: 0.92, z: side * 4.3, rotY};
  if (kind === 'noble') return {
    x: s < 5 ? -7.65 + s * 1.62 : 1.17 + (s - 5) * 1.62,
    y: 1.88 + (r + 1) * 0.38 + 0.11,
    z: side * (5.1 + 0.18 + ((7.45 - 5.1 - 0.18) / 4) * (r + 0.5)), rotY,
  };
  return {
    x: s < 5 ? -9.3 + s * 1.85 : 1.9 + (s - 5) * 1.85,
    y: 3.68 + (r + 1) * 0.37 + 0.175,
    z: side * (7.7 + 0.16 + ((12.3 - 7.7 - 0.16) / 10) * (r + 0.5)), rotY,
  };
}

/** Match numbered database seats to the actual chairs/bench markers in each venue. */
export function seatPreviewPose(event, tier, seat) {
  if (!event || !tier || !seat || tier.kind !== 'seated' || seat.tier_id !== tier.id || seat.status === 'retired'
      || !Number.isInteger(seat.number) || seat.number < 1) return null;
  const name=tier.name.toLowerCase().replaceAll('’', "'"), n=seat.number-1;
  const row=/^[A-Z]$/.test(seat.row)?seat.row.charCodeAt(0)-65:-1;
  let p,slug,target=[0,1,0],segment,label;
  if(event.venue==='The Royal Lists' && event.layout_type==='stands' && ['Joust','Grand Melee'].includes(event.category)){
    const kind={'royal box':'royal','noble stand':'noble',"commoner's bench":'commoner'}[name];
    if(seat.section!=={royal:'Royal',noble:'Noble',commoner:'Bench'}[kind])return null;
    p=royalSeatPosition(kind,seat.row,seat.number);if(!p)return null;
    slug=event.category==='Joust'?'silver-lance':'five-banners';
    segment=kind==='royal'?0:Math.floor(n/5);label=row<({royal:1,noble:4,commoner:10}[kind])?'North':'South';
  }else if(event.venue==='The Iron Colosseum' && event.layout_type==='arena' && event.category==='Gladiatorial Games'){
    const noble=name==='noble stand', common=name==="commoner's bench";
    if((!noble&&!common)||seat.section!==(noble?'Noble':'Bench')||row<0||row>=(noble?6:24)||n>=10)return null;
    let ring,wedge,index,count;
    if(noble){ring=n<4?0:1;count=ring===0?2:3;const local=ring===0?n:n-4;wedge=(8+row*2+Math.floor(local/count))%12;index=local%count;}
    else{ring=(row>=12?2:0)+Math.floor(n/5);wedge=(9+row%12)%12;index=n%5;count=5;}
    const [rx,rz,y]=noble?[[9.42,4.54,1.62],[9.98,4.96,1.85]][ring]:[[10.58,5.42,2.34],[11.16,5.85,2.56],[11.72,6.27,3.01],[12.04,6.53,3.13]][ring];
    const a=wedge*Math.PI/6+.11+(Math.PI/6-.22)*(index+.5)/count;
    p={x:Math.cos(a)*rx,y,z:.05+Math.sin(a)*rz};slug='iron-colosseum';target=[0,1,.05];segment=`${ring}:${wedge}`;label='Arena';
  }else if(event.venue.replaceAll('’',"'")==="The King's Green" && event.layout_type==='stands' && event.category==='Archery Contest'){
    if(name!=="commoner's bench"||seat.section!=='Bench'||row<0||row>=12||n>=10)return null;
    const ring=n<3?0:n<6?1:2,count=ring===2?4:3,index=n-[0,3,6][ring],span=50*Math.PI/180/12;
    const a=-25*Math.PI/180+row*span+.012+(span-.024)*(index+.5)/count;
    const r=25.8+[.62,1.54,2.48][ring];p={x:r*Math.sin(a),y:[.72,1.10,1.50][ring],z:-21.85+r*Math.cos(a)};
    slug='kings-mark';target=[0,1,-10];segment=ring;label='Gallery';
  }else if(event.venue==='The Great Hall' && event.layout_type==='tables' && event.category==='Feast'){
    const match=/^Table ([1-8])$/.exec(seat.row);
    if(name!=='feast seat'||seat.section!=='Bench'||!match||n>=8)return null;
    const table=Number(match[1])-1,x=[-8.1,-2.7,2.7,8.1][table%4],z=table<4?-2:2.4,side=n<4?-1:1;
    p={x:x+side*1.46,y:.58,z:z+[-1.17,-.39,.39,1.17][n%4]};
    slug='victors-feast';target=[x,.9,p.z];segment=0;label='Banquet';
  }else return null;
  return {slug,position:[p.x,p.y+.75,p.z],target,fov:60,segment,label};
}

export function previewCandidates(event, ownSeats = new Set()) {
  return (event.seats || []).filter(seat => (seat.status === 'available' || (seat.status === 'held' && ownSeats.has(seat.id)))
    && seatPreviewPose(event, event.tiers.find(tier => tier.id === seat.tier_id), seat));
}

export function ownPreviewSeats(event, booking) {
  if (!booking || booking.status !== 'pending' || booking.expires_at <= event.server_time
      || event.status !== 'upcoming') return new Set();
  const ids = new Set(booking.items.filter(item => item.seat_id).map(item => item.seat_id));
  return new Set((event.seats || []).filter(seat => seat.status === 'held' && ids.has(seat.id)).map(seat => seat.id));
}
