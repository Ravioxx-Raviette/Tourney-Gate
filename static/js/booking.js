'use strict';
(() => {
  const {$,$$,api,money,escape,read,toast,errorAt,busy,timer,poll}=window.TG;
  let event=read('event-data'), booking=read('booking-data'), activeTier=event.tiers.find(t=>t.kind!=='participant')?.id;
  const selectedSeats=new Set(), quantities=new Map();let listView=false, zoom=1, zoomInitialized=false, expired=false, inFlight=false;
  let summaryVisible=false;
  const dock=document.createElement('div');dock.className='mobile-booking-dock';dock.hidden=true;
  dock.innerHTML='<div><span id="dock-count"></span><strong id="dock-total"></strong></div><button id="dock-reserve" class="button button-small">Continue</button>';
  $('.selection-layout').append(dock);
  const ownSeats=new Set(booking?.items.filter(i=>i.seat_id).map(i=>i.seat_id)||[]);
  if(booking){booking.items.forEach(item=>{if(item.seat_id)selectedSeats.add(item.seat_id);else quantities.set(item.tier_id,item.quantity);});activeTier=booking.items[0]?.tier_id||activeTier;}
  const tierById=id=>event.tiers.find(t=>t.id===Number(id));
  const seatById=id=>event.seats.find(s=>s.id===Number(id));
  const totalCount=()=>selectedSeats.size+[...quantities.values()].reduce((a,b)=>a+b,0);
  const isUnavailable=seat=>seat.status!=='available'&&!ownSeats.has(seat.id);
  function seatButton(seat,index){const selected=selectedSeats.has(seat.id);return `<button class="seat ${selected?'selected':''} ${ownSeats.has(seat.id)?'own-hold':''}" data-seat="${seat.id}" style="--seat-index:${Math.min(index,25)}" aria-pressed="${selected}" aria-label="${escape(tierById(seat.tier_id).name)}, ${escape(seat.section)}, ${escape(seat.row)}, seat ${seat.number}${isUnavailable(seat)?', unavailable':''}" ${isUnavailable(seat)?'disabled':''}>${seat.number}</button>`;}
  function buildMap(){
    const tier=tierById(activeTier);if(!tier){$('#venue-map').innerHTML='<p class="muted small">No spectator tickets are offered for this event.</p>';return;}
    $$('.tier-tab').forEach(button=>{const active=Number(button.dataset.tier)===activeTier;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    const seated=tier.kind==='seated';$('#map-viewport').hidden=!seated||listView;$('.map-toolbar').hidden=!seated;$('.map-foot').hidden=!seated;$('#seat-list').hidden=!seated||!listView;$('#counted-selection').hidden=seated;
    if(!seated){$('#counted-name').textContent=tier.name;$('#counted-stock').textContent=`${tier.available} tickets available`;$('#ticket-quantity').value=quantities.get(tier.id)||0;return;}
    const seats=event.seats.filter(s=>s.tier_id===activeTier), rows=[...new Set(seats.map(s=>s.row))];
    const isArchery=event.category==='Archery Contest';
    if(isArchery){
      // True 12-Bay × 3-Tier Curved Amphitheatre behind the Shooting Line — 1:1 with the 3D model & blueprint.
      const W=1300, H=630, CX=650, arcCY=-440, phiMax=35*Math.PI/180;
      const rIn=855, rOut=1015, bayCount=Math.max(rows.length,1);
      const baySpan=(phiMax*2)/bayCount;
      const pt=(r,phi)=>[CX+r*Math.sin(phi), arcCY+r*Math.cos(phi)];
      const arcD=(r,a0,a1)=>{const [x0,y0]=pt(r,a0),[x1,y1]=pt(r,a1);return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}`;};
      const [oL,oLy]=pt(rOut,-phiMax),[oR,oRy]=pt(rOut,phiMax),[iL,iLy]=pt(rIn,-phiMax),[iR,iRy]=pt(rIn,phiMax);
      const standPath=`M${oL.toFixed(1)} ${oLy.toFixed(1)}A${rOut} ${rOut} 0 0 0 ${oR.toFixed(1)} ${oRy.toFixed(1)}L${iR.toFixed(1)} ${iRy.toFixed(1)}A${rIn} ${rIn} 0 0 1 ${iL.toFixed(1)} ${iLy.toFixed(1)}Z`;
      const dividers=[];
      const bayLabels=[];
      for(let b=0;b<=bayCount;b++){
        const phi=-phiMax+b*baySpan;
        const [x1,y1]=pt(rIn,phi),[x2,y2]=pt(rOut,phi);
        dividers.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
      }
      const seatNodes=[];
      const tierSpecs=[
        {r:886, start:0, count:3},
        {r:934, start:3, count:3},
        {r:982, start:6, count:4},
      ];
      rows.forEach((row,b)=>{
        const rowSeats=seats.filter(s=>s.row===row);
        const phiStart=-phiMax+b*baySpan;
        const phiEnd=phiStart+baySpan;
        const phiMid=(phiStart+phiEnd)/2;
        const [lx,ly]=pt(rOut+22,phiMid);
        bayLabels.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${escape(row)}</text>`);
        tierSpecs.forEach(spec=>{
          const tierSeats=rowSeats.slice(spec.start,spec.start+spec.count);
          const pad=baySpan*0.11;
          tierSeats.forEach((s,idx)=>{
            const t=tierSeats.length===1?0.5:(idx+0.5)/tierSeats.length;
            const phi=phiStart+pad+(baySpan-pad*2)*t;
            const [sx,sy]=pt(spec.r,phi);
            const deg=(-phi*180/Math.PI).toFixed(1);
            seatNodes.push(`<span class="archery-seat-pos" style="left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px;transform:translate(-50%,-50%) rotate(${deg}deg)">${seatButton(s,b*2+idx)}</span>`);
          });
        });
      });
      const targetXs=[400,650,900];
      const targetsSvg=targetXs.map((tx,i)=>`<g class="archery-svg-target"><circle cx="${tx}" cy="76" r="${i===1?36:32}" fill="#eee5cf" stroke="#5c6d42" stroke-width="2"/><circle cx="${tx}" cy="76" r="${i===1?24:21}" fill="#3f5d38"/><circle cx="${tx}" cy="76" r="${i===1?13:11}" fill="#8f2e36"/><circle cx="${tx}" cy="76" r="5" fill="#d9b252"/><line x1="${tx}" y1="204" x2="${tx}" y2="128" stroke="#6c7d51" stroke-width="2" stroke-dasharray="5 5"/><path d="M${tx-7} 138 L${tx} 126 L${tx+7} 138" fill="none" stroke="#6c7d51" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`).join('');
      const stageMarkup=`<div class="archery-venue-stage" style="width:${W}px;height:${H}px">
        <svg class="archery-venue-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
          <rect x="230" y="20" width="840" height="214" rx="6" fill="#e2ead8" stroke="#9eb08a" stroke-width="1.5"/>
          <line x1="185" y1="18" x2="185" y2="238" stroke="#7d8f68" stroke-width="4" stroke-linecap="round"/>
          <line x1="1115" y1="18" x2="1115" y2="238" stroke="#7d8f68" stroke-width="4" stroke-linecap="round"/>
          <text x="170" y="130" transform="rotate(-90 170 130)" text-anchor="middle" class="archery-svg-meta">SAFETY SCREEN</text>
          <text x="1130" y="130" transform="rotate(90 1130 130)" text-anchor="middle" class="archery-svg-meta">SAFETY SCREEN</text>
          ${targetsSvg}
          <text x="650" y="37" text-anchor="middle" class="archery-svg-meta">TARGETS DOWNRANGE · LINE OF FIRE ↑</text>
          <line x1="245" y1="224" x2="1055" y2="224" stroke="#627848" stroke-width="2.5" stroke-dasharray="10 7"/>
          <rect x="465" y="210" width="370" height="28" rx="4" fill="#edf2e4" stroke="#9eb08a" stroke-width="1.2"/>
          <text x="650" y="228" text-anchor="middle" class="archery-svg-line-label">THE SHOOTING LINE · ARCHERS FACE TARGETS</text>
          <path d="${standPath}" fill="#f1f3e7" stroke="#8ea07a" stroke-width="2"/>
          <path d="${arcD(910,-phiMax,phiMax)}" fill="none" stroke="#c7d1ba" stroke-width="1.2"/>
          <path d="${arcD(958,-phiMax,phiMax)}" fill="none" stroke="#c7d1ba" stroke-width="1.2"/>
          <g stroke="#b7c3a8" stroke-width="1.2">${dividers.join('')}</g>
          <g class="archery-svg-bays">${bayLabels.join('')}</g>
          <text x="650" y="618" text-anchor="middle" class="archery-svg-meta">CURVED SPECTATOR GALLERY · 12 BAYS (A–L) · 120 SEATS SAFELY BEHIND ARCHERS</text>
        </svg>
        <div class="archery-seat-layer" role="group" aria-label="Curved spectator gallery seats A through L">${seatNodes.join('')}</div>
      </div>`;
      $('#venue-map').innerHTML=stageMarkup;
      if(!zoomInitialized){
        const vpW=$('#map-viewport')?.clientWidth||820;
        zoom=Math.max(0.58,Math.min(1,Number(((vpW-36)/W).toFixed(2))));
        $('#venue-map').style.setProperty('--map-zoom',zoom);
        zoomInitialized=true;
      }
    }else{
      const rowMarkup=rows.map((row,index)=>`<div class="${event.layout_type==='tables'?'table-group':''}">${event.layout_type==='tables'?`<h3>${escape(row)}</h3>`:''}<div class="seat-row" role="group" aria-label="${escape(row)}"><span class="row-label" aria-hidden="true">${event.layout_type==='tables'?'':escape(row)}</span>${seats.filter(s=>s.row===row).map((s,i)=>seatButton(s,index*4+i)).join('')}<span class="row-label" aria-hidden="true">${event.layout_type==='tables'?'':escape(row)}</span></div></div>`);
      const field=event.layout_type==='tables'?'THE GREAT TABLES':event.layout_type==='arena'?'THE ARENA':'THE TOURNAMENT FIELD';
      const fieldMarkup=`<div class="field-label" aria-hidden="true"><span>${field}</span><small>${event.layout_type==='stands'?'BEST VIEWS, GREAT STORIES':'THE HEART OF THE SPECTACLE'}</small></div>`;
      const split=Math.max(1,Math.ceil(rows.length/2));
      $('#venue-map').innerHTML=event.layout_type==='tables'?fieldMarkup+rowMarkup.join(''):rowMarkup.slice(0,split).join('')+fieldMarkup+rowMarkup.slice(split).join('');
    }
    $('#seat-list').innerHTML=seats.map(seat=>`<button data-seat="${seat.id}" class="${selectedSeats.has(seat.id)?'selected':''}" aria-pressed="${selectedSeats.has(seat.id)}" ${isUnavailable(seat)?'disabled':''}>${escape(seat.section)} · ${escape(seat.row)} · Seat ${seat.number}${isUnavailable(seat)?' · Unavailable':''}</button>`).join('');
    $$('#venue-map [data-seat], #seat-list [data-seat]').forEach(button=>button.addEventListener('click',()=>toggleSeat(Number(button.dataset.seat))));
  }
  function syncSeats(){
    $$('#venue-map [data-seat],#seat-list [data-seat]').forEach(button=>{const seat=seatById(button.dataset.seat);if(!seat)return;button.disabled=isUnavailable(seat);button.classList.toggle('selected',selectedSeats.has(seat.id));button.setAttribute('aria-pressed',String(selectedSeats.has(seat.id)));});
  }
  function toggleSeat(id){
    if(expired||inFlight)return;
    const seat=seatById(id), tier=tierById(seat.tier_id);
    if(isUnavailable(seat))return;
    if(selectedSeats.has(id))selectedSeats.delete(id);
    else{if(totalCount()>=8){toast('You can select up to 8 tickets per booking.');return;}const inTier=[...selectedSeats].filter(s=>seatById(s).tier_id===tier.id).length;if(inTier>=tier.max_per_order){toast(`The limit for ${tier.name} is ${tier.max_per_order}.`);return;}selectedSeats.add(id);}
    errorAt('selection-error','');syncSeats();renderSummary();
  }
  function changeQuantity(value){if(expired||inFlight)return;const tier=tierById(activeTier),others=totalCount()-(quantities.get(tier.id)||0),ownHeld=booking?.items.filter(i=>i.tier_id===tier.id&&!i.seat_id).reduce((n,i)=>n+i.quantity,0)||0;const next=Math.max(0,Math.min(Math.trunc(value)||0,8-others,tier.max_per_order,tier.available+ownHeld));quantities.set(tier.id,next);$('#ticket-quantity').value=next;renderSummary();}
  function renderSummary(){
    let total=0;const entries=[];
    selectedSeats.forEach(id=>{const seat=seatById(id),tier=tierById(seat.tier_id);const snapshot=booking?.items.find(i=>i.seat_id===id);const price=snapshot?.unit_price??tier.price;total+=price;entries.push(`<div class="selection-item"><div><h3>${escape(tier.name)}</h3><p>${escape(seat.section)} · ${escape(seat.row)} · Seat ${seat.number}</p></div><strong>${money(price)}</strong><button class="remove-item" data-remove="${id}" aria-label="Remove ${escape(seat.row)} seat ${seat.number}">×</button></div>`);});
    quantities.forEach((quantity,id)=>{if(!quantity)return;const tier=tierById(id);total+=quantity*tier.price;entries.push(`<div class="selection-item"><div><h3>${escape(tier.name)}</h3><p>${quantity} ticket${quantity===1?'':'s'}</p></div><strong>${money(quantity*tier.price)}</strong><button class="remove-item" data-remove-tier="${id}" aria-label="Remove ${escape(tier.name)}">×</button></div>`);});
    $('#selection-items').innerHTML=entries.join('')||'<p class="empty-selection">Your story starts with a seat.<br>Choose a place on the map.</p>';$('#selection-total').textContent=money(total);
    $('#reserve-button').disabled=totalCount()===0||expired||inFlight||event.status!=='upcoming'||event.start_at<=event.server_time;
    $('#dock-count').textContent=`${totalCount()} ticket${totalCount()===1?'':'s'} selected`;
    $('#dock-total').textContent=money(total);$('#dock-reserve').disabled=$('#reserve-button').disabled;
    dock.hidden=!totalCount()||expired||summaryVisible;
    $$('[data-remove]').forEach(button=>button.addEventListener('click',()=>toggleSeat(Number(button.dataset.remove))));
    $$('[data-remove-tier]').forEach(button=>button.addEventListener('click',()=>{if(inFlight)return;quantities.delete(Number(button.dataset.removeTier));if(tierById(activeTier).kind==='counted')$('#ticket-quantity').value=quantities.get(activeTier)||0;renderSummary();}));
  }
  $$('.tier-tab').forEach(button=>button.addEventListener('click',()=>{activeTier=Number(button.dataset.tier);buildMap();}));
  $('#zoom-in').addEventListener('click',()=>{zoom=Math.min(1.8,zoom+.15);$('#venue-map').style.setProperty('--map-zoom',zoom);});
  $('#zoom-out').addEventListener('click',()=>{zoom=Math.max(.55,zoom-.15);$('#venue-map').style.setProperty('--map-zoom',zoom);});
  $('#list-view').addEventListener('click',()=>{listView=!listView;$('#list-view').setAttribute('aria-pressed',String(listView));$('#list-view').textContent=listView?'Use venue map':'Use seat list';buildMap();});
  $('#quantity-plus').addEventListener('click',()=>changeQuantity(Number($('#ticket-quantity').value)+1));$('#quantity-minus').addEventListener('click',()=>changeQuantity(Number($('#ticket-quantity').value)-1));$('#ticket-quantity').addEventListener('input',()=>changeQuantity(Number($('#ticket-quantity').value)));
  $('#reserve-button').addEventListener('click',async()=>{
    const button=$('#reserve-button');if(!totalCount()||inFlight)return;errorAt('selection-error','');inFlight=true;busy(button,true,'Reserving your place…');
    const grouped=new Map();selectedSeats.forEach(id=>{const seat=seatById(id);if(!grouped.has(seat.tier_id))grouped.set(seat.tier_id,{tier_id:seat.tier_id,seat_ids:[]});grouped.get(seat.tier_id).seat_ids.push(id);});quantities.forEach((quantity,tier_id)=>{if(quantity)grouped.set(tier_id,{tier_id,quantity});});
    try{const result=await api(booking?`/api/reservations/${booking.id}`:`/api/events/${event.id}/reservations`,{method:booking?'PUT':'POST',body:JSON.stringify({kind:'spectator',items:[...grouped.values()]})});TG.go(`/checkout/${result.id}`);}catch(error){errorAt('selection-error',error.message);inFlight=false;busy(button,false);await refresh();renderSummary();}
  });
  $('#dock-reserve').addEventListener('click',()=>$('#reserve-button').click());
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{summaryVisible=entries[0].isIntersecting;dock.hidden=!totalCount()||expired||summaryVisible;},{threshold:0}).observe($('.selection-summary'));
  async function refresh(){
    const fresh=await api(`/api/events/${event.id}/availability`);let lost=false;selectedSeats.forEach(id=>{const seat=fresh.seats.find(s=>s.id===id);if(!seat||(seat.status!=='available'&&!ownSeats.has(id))){selectedSeats.delete(id);lost=true;}});
    event=fresh;quantities.forEach((quantity,id)=>{const tier=tierById(id),own=booking?.items.filter(i=>i.tier_id===id).reduce((n,i)=>n+i.quantity,0)||0;if(!tier){quantities.delete(id);lost=true;}else if(quantity>tier.available+own){quantities.set(id,Math.max(0,tier.available+own));lost=true;}});
    if(lost)toast('Availability changed. Your selection has been updated.');
    // Update buttons in place, preserving focus and avoiding repeated entrance animations.
    const currentIds=$$('#venue-map .seat').map(node=>Number(node.dataset.seat));const expectedIds=event.seats.filter(s=>s.tier_id===activeTier).map(s=>s.id);
    if(currentIds.length!==expectedIds.length||currentIds.some((id,index)=>id!==expectedIds[index]))buildMap();else syncSeats();
    if(tierById(activeTier)?.kind==='counted'){$('#counted-stock').textContent=`${tierById(activeTier).available} tickets available`;$('#ticket-quantity').value=quantities.get(activeTier)||0;}
    if(event.status!=='upcoming')errorAt('selection-error',`This event is ${event.status.replace('_',' ')}.`);renderSummary();
  }
  if(booking)timer(booking,()=>{expired=true;errorAt('selection-error','Your reservation has expired. Return to the event to start a new selection.');renderSummary();});
  poll(refresh);buildMap();renderSummary();
})();
