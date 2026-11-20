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
  function seatButton(seat,index){const selected=selectedSeats.has(seat.id);const label=`${tierById(seat.tier_id).name} · ${seat.section} · Row ${seat.row} · Seat ${seat.number}${isUnavailable(seat)?' (Unavailable)':''}`;return `<button class="seat ${selected?'selected':''} ${ownSeats.has(seat.id)?'own-hold':''}" data-seat="${seat.id}" style="--seat-index:${Math.min(index,25)}" title="${escape(label)}" aria-pressed="${selected}" aria-label="${escape(tierById(seat.tier_id).name)}, ${escape(seat.section)}, ${escape(seat.row)}, seat ${seat.number}${isUnavailable(seat)?', unavailable':''}" ${isUnavailable(seat)?'disabled':''}>${seat.number}</button>`;}
  function buildMap(){
    const tier=tierById(activeTier);if(!tier){$('#venue-map').innerHTML='<p class="muted small">No spectator tickets are offered for this event.</p>';return;}
    window.TG.party = {
    state:()=>({event,activeTier,expired,inFlight,booking}),
    apply:ids=>{
      const tier=tierById(activeTier);
      if(expired||inFlight||event.status!=='upcoming'||event.start_at<=event.server_time||!tier||!ids.length||ids.length>Math.min(8,tier.max_per_order)||new Set(ids).size!==ids.length)return false;
      const validOwn=booking?.status==='pending'&&booking.expires_at>event.server_time;
      if(ids.some(id=>{const s=seatById(id);return !s||s.tier_id!==activeTier||!(s.status==='available'||(s.status==='held'&&validOwn&&ownSeats.has(id)));}))return false;
      selectedSeats.clear();quantities.clear();ids.forEach(id=>selectedSeats.add(id));syncSeats();renderSummary();return true;
    }
  };
  $$('.tier-tab').forEach(button=>{const active=Number(button.dataset.tier)===activeTier;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    const seated=tier.kind==='seated';$('#map-viewport').hidden=!seated||listView;$('.map-toolbar').hidden=!seated;$('.map-foot').hidden=!seated;$('#seat-list').hidden=!seated||!listView;$('#counted-selection').hidden=seated;
    if(!seated){
      $('#counted-name').textContent=tier.name;
      const plazaNote=event.layout_type==='arena'&&/groundling/i.test(tier.name)?'4 Exterior Big-Screen Plazas (North, South, West & East) · ':'';
      $('#counted-stock').textContent=`${plazaNote}${tier.available} tickets available`;
      $('#ticket-quantity').value=quantities.get(tier.id)||0;
      return;
    }
    const seats=event.seats.filter(s=>s.tier_id===activeTier), rows=[...new Set(seats.map(s=>s.row))];
    const isArchery=event.category==='Archery Contest';
    const isArena=event.layout_type==='arena';
    if(isArena){
      // True 1:1 Elliptical Iron Colosseum map matching the 3D model:
      // 4 Grand Cardinal Noble Pavilions, 60 Noble seats, 240 Commoner bench seats,
      // 12 equal-arc radial stairways, and 4 Exterior Groundling Big-Screen Plazas!
      const W=1440, H=1060, CX=720, CY=530;
      const isNobleTier=/noble/i.test(tier.name);

      // Equal-arc-length ellipse sampler so seats on East/West curves never crowd
      const buildArcTable=(rx,ry,N=720)=>{
        const cum=[0];let px=rx,py=0;
        for(let i=1;i<=N;i++){
          const th=(i/N)*Math.PI*2, nx=rx*Math.cos(th), ny=ry*Math.sin(th);
          cum.push(cum[i-1]+Math.hypot(nx-px,ny-py)); px=nx; py=ny;
        }
        const total=cum[N];
        return frac=>{
          const target=((frac%1)+1)%1*total;
          let lo=0,hi=N;
          while(lo<hi){const m=(lo+hi)>>1; if(cum[m]<target)lo=m+1; else hi=m;}
          const th=(lo/N)*Math.PI*2;
          return [CX+rx*Math.cos(th), CY+ry*Math.sin(th), th];
        };
      };

      const outerSample=buildArcTable(486,336);
      const innerSample=buildArcTable(224,114);
      const northFrac=0.75; // 12 o'clock (North) so sections read cleanly clockwise from the top
      const spokes=[];
      for(let w=0;w<12;w++){
        const f=northFrac+w/12;
        const [x1,y1]=outerSample(f), [x2,y2]=innerSample(f);
        spokes.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
      }

      // Place every seat grouped 1:1 by its unique DB row letter (A–F for Noble, A–X for Commoner)
      // while preserving exact DB seat order so live availability polling updates in place cleanly!
      const seatNodes=[];
      const sectionLabels=[];
      const pushSeat=(seat,sx,sy,animIdx)=>{
        const angleRad=Math.atan2(CY-sy,CX-sx);
        const deg=(angleRad*180/Math.PI+90).toFixed(1);
        seatNodes.push(`<span class="colosseum-seat-pos ${isNobleTier?'is-noble':'is-commoner'}" style="left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px;transform:translate(-50%,-50%) rotate(${deg}deg)">${seatButton(seat,animIdx)}</span>`);
      };
      const addBadge=(x,y,text,cls)=>`<g class="col-row-badge ${cls}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12"/><text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${escape(text)}</text></g>`;

      if(isNobleTier){
        // 60 Noble seats = Rows A–F (10 seats each) across 6 equal 60° sectors (2 wedges per row letter, A centered North)
        const innerNoble=buildArcTable(284,166);
        const outerNoble=buildArcTable(318,196);
        const badgeArc=buildArcTable(246,135);
        const sectorCount=Math.max(rows.length,6);
        rows.forEach((row,rIdx)=>{
          const rowSeats=seats.filter(s=>s.row===row);
          const fStart=northFrac-(1/12)+rIdx/sectorCount;
          const fMid=fStart+0.5/sectorCount;
          const [bx,by]=badgeArc(fMid);
          sectionLabels.push(addBadge(bx,by,row,'is-noble'));
          // Inner ring: Seats 1–4 (2 in first wedge, 2 in second wedge); Outer ring: Seats 5–10 (3 + 3)
          const innerSeats=rowSeats.slice(0,4), outerSeats=rowSeats.slice(4);
          innerSeats.forEach((seat,i)=>{
            const wOff=i<2?0:1, localI=i%2;
            const w0=fStart+wOff/12+0.011, w1=fStart+(wOff+1)/12-0.011;
            const [sx,sy]=innerNoble(w0+(w1-w0)*((localI+0.5)/2));
            pushSeat(seat,sx,sy,(rIdx*4+i)%24);
          });
          outerSeats.forEach((seat,i)=>{
            const wOff=i<3?0:1, localI=i%3;
            const w0=fStart+wOff/12+0.009, w1=fStart+(wOff+1)/12-0.009;
            const [sx,sy]=outerNoble(w0+(w1-w0)*((localI+0.5)/3));
            pushSeat(seat,sx,sy,(rIdx*4+i)%24);
          });
        });
      }else{
        // 240 Commoner seats = Rows A–L (Lower Bench, 12 wedges × 10 seats) + Rows M–X (Upper Bench, 12 wedges × 10 seats)
        const rings=[
          buildArcTable(358,230),
          buildArcTable(393,258),
          buildArcTable(431,289),
          buildArcTable(467,319),
        ];
        const innerBadgeArc=buildArcTable(316,195);
        const outerBadgeArc=buildArcTable(513,361);
        rows.forEach((row,rIdx)=>{
          const rowSeats=seats.filter(s=>s.row===row);
          const isUpper=rIdx>=12;
          const w=rIdx%12;
          const f0=northFrac+w/12+0.007, f1=northFrac+(w+1)/12-0.007;
          const fMid=northFrac+(w+0.5)/12;
          const [bx,by]=(isUpper?outerBadgeArc:innerBadgeArc)(fMid);
          sectionLabels.push(addBadge(bx,by,row,isUpper?'is-upper':'is-lower'));
          const ringA=rings[isUpper?2:0], ringB=rings[isUpper?3:1];
          const firstHalf=rowSeats.slice(0,5), secondHalf=rowSeats.slice(5);
          firstHalf.forEach((seat,i)=>{
            const [sx,sy]=ringA(f0+(f1-f0)*((i+0.5)/Math.max(firstHalf.length,1)));
            pushSeat(seat,sx,sy,(w*3+i)%24);
          });
          secondHalf.forEach((seat,i)=>{
            const [sx,sy]=ringB(f0+(f1-f0)*((i+0.5)/Math.max(secondHalf.length,1)));
            pushSeat(seat,sx,sy,(w*3+i+5)%24);
          });
        });
      }

      // 4 Grand Cardinal Noble Pavilion footprints (North, South, West, East)
      const noblePavilions=`
        <g class="col-pavilion">
          <rect x="615" y="318" width="210" height="58" rx="6"/><text x="720" y="343" text-anchor="middle">NORTH NOBLE PAVILION</text>
          <rect x="615" y="684" width="210" height="58" rx="6"/><text x="720" y="725" text-anchor="middle">SOUTH NOBLE PAVILION</text>
          <rect x="386" y="458" width="66" height="144" rx="6"/><text x="419" y="530" text-anchor="middle" transform="rotate(-90 419 530)">WEST NOBLE</text>
          <rect x="988" y="458" width="66" height="144" rx="6"/><text x="1021" y="530" text-anchor="middle" transform="rotate(90 1021 530)">EAST NOBLE</text>
        </g>`;

      // 4 Exterior Cardinal Groundling Big-Screen Viewing Plazas (North, South, West, East)
      const groundlingPlazas=`
        <g class="col-plaza">
          <rect x="540" y="32" width="360" height="136" rx="8"/>
          <rect x="612" y="142" width="216" height="18" rx="3" class="col-screen-bar"/>
          <line x1="590" y1="112" x2="850" y2="112" class="col-rail"/><line x1="590" y1="86" x2="850" y2="86" class="col-rail"/>
          <text x="720" y="64" text-anchor="middle" class="col-plaza-title">NORTH GROUNDLING PLAZA · LIVE BIG SCREEN</text>

          <rect x="540" y="892" width="360" height="136" rx="8"/>
          <rect x="612" y="900" width="216" height="18" rx="3" class="col-screen-bar"/>
          <line x1="590" y1="948" x2="850" y2="948" class="col-rail"/><line x1="590" y1="974" x2="850" y2="974" class="col-rail"/>
          <text x="720" y="1008" text-anchor="middle" class="col-plaza-title">SOUTH GROUNDLING PLAZA · LIVE BIG SCREEN</text>

          <rect x="32" y="380" width="176" height="300" rx="8"/>
          <rect x="182" y="446" width="18" height="168" rx="3" class="col-screen-bar"/>
          <line x1="148" y1="430" x2="148" y2="630" class="col-rail"/><line x1="120" y1="430" x2="120" y2="630" class="col-rail"/>
          <text x="78" y="530" text-anchor="middle" transform="rotate(-90 78 530)" class="col-plaza-title">WEST PLAZA · BIG SCREEN</text>

          <rect x="1232" y="380" width="176" height="300" rx="8"/>
          <rect x="1240" y="446" width="18" height="168" rx="3" class="col-screen-bar"/>
          <line x1="1292" y1="430" x2="1292" y2="630" class="col-rail"/><line x1="1320" y1="430" x2="1320" y2="630" class="col-rail"/>
          <text x="1362" y="530" text-anchor="middle" transform="rotate(90 1362 530)" class="col-plaza-title">EAST PLAZA · BIG SCREEN</text>
        </g>`;

      const stageMarkup=`<div class="colosseum-venue-stage ${isNobleTier?'tier-noble':'tier-commoner'}" style="width:${W}px;height:${H}px">
        <svg class="colosseum-venue-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
          ${groundlingPlazas}
          <ellipse cx="${CX}" cy="${CY}" rx="494" ry="344" fill="#d9dfd8" stroke="#475c69" stroke-width="4"/>
          <ellipse cx="${CX}" cy="${CY}" rx="486" ry="336" class="col-ring-commoner ${isNobleTier?'is-dim':'is-active'}"/>
          <ellipse cx="${CX}" cy="${CY}" rx="412" ry="273" fill="none" stroke="#9aa89f" stroke-width="1.5" stroke-dasharray="6 5"/>
          <ellipse cx="${CX}" cy="${CY}" rx="336" ry="212" class="col-ring-noble ${isNobleTier?'is-active':'is-dim'}"/>
          <ellipse cx="${CX}" cy="${CY}" rx="266" ry="152" fill="#e8ece3" stroke="#85968a" stroke-width="1.5"/>
          <g class="col-spokes">${spokes.join('')}</g>
          ${noblePavilions}
          <g class="col-row-badges">${sectionLabels.join('')}</g>
          <ellipse cx="${CX}" cy="${CY}" rx="224" ry="114" fill="#e7dec8" stroke="#6d7c72" stroke-width="2.5"/>
          <ellipse cx="${CX}" cy="${CY}" rx="164" ry="76" fill="#dfd4ba" stroke="#b6a683" stroke-width="1"/>
          <rect x="486" y="505" width="22" height="50" rx="2" fill="#44545e"/>
          <rect x="932" y="505" width="22" height="50" rx="2" fill="#44545e"/>
          <path d="M694 514 L746 546 M746 514 L694 546" stroke="#9d7b3a" stroke-width="3.5" stroke-linecap="round"/>
          <line x1="590" y1="530" x2="626" y2="530" stroke="#9d7b3a" stroke-width="3.5" stroke-linecap="round"/>
          <line x1="814" y1="530" x2="850" y2="530" stroke="#9d7b3a" stroke-width="3.5" stroke-linecap="round"/>
          <text x="${CX}" y="490" text-anchor="middle" class="col-arena-title">THE IRON COLOSSEUM</text>
          <text x="${CX}" y="576" text-anchor="middle" class="col-arena-sub">${isNobleTier?'NOBLE STAND · SECTIONS A–F (SEATS 1–10 EACH)':'COMMONER’S BENCH · INNER ROWS A–L · OUTER ROWS M–X'}</text>
          <text x="${CX}" y="593" text-anchor="middle" class="col-arena-legend">${isNobleTier?'60 UNIQUE NUMBERED SEATS · 4 CARDINAL PAVILIONS':'240 UNIQUE NUMBERED SEATS (1–10 PER LETTERED SECTION)'}</text>
        </svg>
        <div class="colosseum-seat-layer" role="group" aria-label="${escape(tier.name)} seats around the Iron Colosseum">${seatNodes.join('')}</div>
      </div>`;
      $('#venue-map').innerHTML=stageMarkup;
      if(!zoomInitialized){
        const vpW=$('#map-viewport')?.clientWidth||820;
        zoom=Math.max(0.46,Math.min(1,Number(((vpW-28)/W).toFixed(2))));
        $('#venue-map').style.setProperty('--map-zoom',zoom);
        zoomInitialized=true;
      }
    }else if(isArchery){
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
    }else if(event.layout_type==='stands'){
      // 3-Tier Royal Lists Stadium map shared by Silver Lance (Joust) & Five Banners (Grand Melee):
      // Shows Commoner's Bench (outer bleachers), Noble Stand (mid covered galleries), and Royal Box
      // (front-center pavilions) symmetrically North & South of The Royal Lists!
      const isMelee=event.category==='Grand Melee';
      const activeKind=/royal/i.test(tier.name)?'royal':(/noble/i.test(tier.name)?'noble':'commoner');
      const split=Math.max(1,Math.ceil(rows.length/2));
      const mkRows=subset=>subset.map((row,index)=>`<div class="seat-row" role="group" aria-label="Row ${escape(row)}"><span class="row-label" aria-hidden="true">${escape(row)}</span>${seats.filter(s=>s.row===row).map((s,i)=>seatButton(s,index*4+i)).join('')}<span class="row-label" aria-hidden="true">${escape(row)}</span></div>`).join('');
      const northRows=mkRows(rows.slice(0,split));
      const southRows=mkRows(rows.slice(split));
      const band=(kind,side,title,sub,rowsHtml)=>{
        const active=kind===activeKind;
        return `<div class="lists-tier-band band-${kind} ${active?'is-active':'is-context'}"><div class="lists-band-head"><span>${side} · ${title}</span>${active?`<span>${sub}</span>`:''}</div>${active?rowsHtml:''}</div>`;
      };
      const fieldMarkup=`<div class="lists-field-stage ${isMelee?'is-melee':''}" aria-hidden="true">
        <div class="lists-field-rail">
          <span class="lists-gate-tag">${isMelee?'WEST WAR-GATE':'WEST GATE'}</span>
          <span class="lists-field-title">${isMelee?'THE ROYAL LISTS · FIVE BANNERS MELEE':'THE ROYAL LISTS · JOUSTING TILT'}</span>
          <span class="lists-gate-tag">${isMelee?'EAST WAR-GATE':'EAST GATE'}</span>
        </div>
        <span class="lists-field-sub">${isMelee?'FIVE HOUSES · CENTRAL BATTLE LINE · OPPOSING CLASH':'CENTRAL TILT BARRIER · OPPOSING LANCES'}</span>
      </div>`;
      $('#venue-map').innerHTML=`<div class="lists-stadium-map">
        ${band('commoner','NORTH','COMMONER’S BENCH (OPEN BLEACHERS)','100 SEATS · ROWS A–J',northRows)}
        ${band('noble','NORTH','NOBLE STAND (COVERED GALLERY)','40 SEATS · ROWS A–D',northRows)}
        ${band('royal','NORTH','ROYAL BOX PAVILION','10 SEATS · ROW A',northRows)}
        ${fieldMarkup}
        ${band('royal','SOUTH','ROYAL BOX PAVILION','10 SEATS · ROW B',southRows)}
        ${band('noble','SOUTH','NOBLE STAND (COVERED GALLERY)','40 SEATS · ROWS E–H',southRows)}
        ${band('commoner','SOUTH','COMMONER’S BENCH (OPEN BLEACHERS)','100 SEATS · ROWS K–T',southRows)}
      </div>`;
    }else{
      const rowMarkup=rows.map((row,index)=>`<div class="${event.layout_type==='tables'?'table-group':''}">${event.layout_type==='tables'?`<h3>${escape(row)}</h3>`:''}<div class="seat-row" role="group" aria-label="${escape(row)}"><span class="row-label" aria-hidden="true">${event.layout_type==='tables'?'':escape(row)}</span>${seats.filter(s=>s.row===row).map((s,i)=>seatButton(s,index*4+i)).join('')}<span class="row-label" aria-hidden="true">${event.layout_type==='tables'?'':escape(row)}</span></div></div>`);
      const field=event.layout_type==='tables'?'THE GREAT TABLES':'THE TOURNAMENT FIELD';
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
    selectedSeats.forEach(id=>{const seat=seatById(id),tier=tierById(seat.tier_id);const snapshot=booking?.items.find(i=>i.seat_id===id);const price=snapshot?.unit_price??tier.price;total+=price;entries.push(`<div class="selection-item"><div><h3>${escape(tier.name)}</h3><p>${escape(seat.section)} · ${escape(seat.row)} · Seat ${seat.number}</p>${event.venue==='The Royal Lists'&&['Joust','Grand Melee'].includes(event.category)?`<button type="button" class="seat-preview-action" data-seat-preview="${seat.id}" aria-label="See My View: ${escape(tier.name)}, row ${escape(seat.row)}, seat ${seat.number}">See My View</button>`:''}</div><strong>${money(price)}</strong><button class="remove-item" data-remove="${id}" aria-label="Remove ${escape(seat.row)} seat ${seat.number}">×</button></div>`);});
    quantities.forEach((quantity,id)=>{if(!quantity)return;const tier=tierById(id);total+=quantity*tier.price;entries.push(`<div class="selection-item"><div><h3>${escape(tier.name)}</h3><p>${quantity} ticket${quantity===1?'':'s'}</p></div><strong>${money(quantity*tier.price)}</strong><button class="remove-item" data-remove-tier="${id}" aria-label="Remove ${escape(tier.name)}">×</button></div>`);});
    $('#selection-items').innerHTML=entries.join('')||'<p class="empty-selection">Your story starts with a seat.<br>Choose a place on the map.</p>';$('#selection-total').textContent=money(total);
    $('#reserve-button').disabled=totalCount()===0||expired||inFlight||event.status!=='upcoming'||event.start_at<=event.server_time;
    $('#dock-count').textContent=`${totalCount()} ticket${totalCount()===1?'':'s'} selected`;
    $('#dock-total').textContent=money(total);$('#dock-reserve').disabled=$('#reserve-button').disabled;
    dock.hidden=!totalCount()||expired||summaryVisible;
    $$('[data-remove]').forEach(button=>button.addEventListener('click',()=>toggleSeat(Number(button.dataset.remove))));
    document.dispatchEvent(new CustomEvent('tg:seat-state',{detail:{event,expired}}));
    $$('[data-remove-tier]').forEach(button=>button.addEventListener('click',()=>{if(inFlight)return;quantities.delete(Number(button.dataset.removeTier));if(tierById(activeTier).kind==='counted')$('#ticket-quantity').value=quantities.get(activeTier)||0;renderSummary();}));
  }
  $$('.tier-tab').forEach(button=>button.addEventListener('click',()=>{activeTier=Number(button.dataset.tier);buildMap();renderSummary();}));
  $('#zoom-in').addEventListener('click',()=>{zoom=Math.min(1.8,zoom+.15);$('#venue-map').style.setProperty('--map-zoom',zoom);});
  $('#zoom-out').addEventListener('click',()=>{zoom=Math.max(.42,zoom-.15);$('#venue-map').style.setProperty('--map-zoom',zoom);});
  $('#list-view').addEventListener('click',()=>{listView=!listView;$('#list-view').setAttribute('aria-pressed',String(listView));$('#list-view').textContent=listView?'Use venue map':'Use seat list';buildMap();renderSummary();});
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
    if(tierById(activeTier)?.kind==='counted'){const ct=tierById(activeTier),pn=event.layout_type==='arena'&&/groundling/i.test(ct.name)?'4 Exterior Big-Screen Plazas (North, South, West & East) · ':'';$('#counted-stock').textContent=`${pn}${ct.available} tickets available`;$('#ticket-quantity').value=quantities.get(activeTier)||0;}
    if(event.status!=='upcoming')errorAt('selection-error',`This event is ${event.status.replace('_',' ')}.`);renderSummary();
  }
  if(booking)timer(booking,()=>{expired=true;errorAt('selection-error','Your reservation has expired. Return to the event to start a new selection.');renderSummary();});
  poll(refresh);buildMap();renderSummary();
})();
