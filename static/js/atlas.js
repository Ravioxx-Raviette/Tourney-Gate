'use strict';
(() => {
 const {$,$$,escape:esc,money,read}=window.TG;
 const feature=$('#atlas'); if(!feature)return;
 const boot=read('atlas-data'),plane=$('#atlas-map-plane'),content=$('#atlas-preview-content');
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 let events=boot.events,selected=boot.selected_venue,zoom=1,animation,is3DActive=false;
 const listeners=new Set();
 const venues=boot.venues;
 const notify=reason=>listeners.forEach(fn=>fn({events,venues,selected,reason}));
 const day=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',day:'2-digit'});
 const month=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short'});
 const open=event=>event.status==='upcoming'&&event.start_at>event.server_time;
 const stock=event=>event.status==='cancelled'?'Cancelled':event.status==='past'?'Event ended':event.status==='sold_out'||event.spectator_remaining===0?'Sold out':!event.available?'Temporarily unavailable':!open(event)?'Booking closed':`${event.available} seats available`;
 function rows(list){
  if(!list.length)return '<p class="muted">New gatherings will appear here when the box office opens.</p>';
  return `<ol class="atlas-event-rows">${list.map(event=>`<li><a class="atlas-event-row" href="/events/${encodeURIComponent(event.slug)}" data-focus="event-${event.id}"><time><strong>${day.format(event.start_at*1000)}</strong><span>${month.format(event.start_at*1000)}</span></time><span class="atlas-row-copy"><strong>${esc(event.title)}</strong><span>${esc(event.venue)}</span><span class="availability ${open(event)&&event.available?'':'unavailable'}">${esc(stock(event))}</span></span><span class="atlas-row-price"><small>from</small>${money(event.starting_price)}<span aria-hidden="true">+</span></span></a></li>`).join('')}</ol>`;
 }
 function setZoom(value){if(is3DActive)return;zoom=Math.max(.92,Math.min(1.24,value));plane.style.setProperty('--atlas-zoom',zoom);const zOut=$('#atlas-zoom-out'),zIn=$('#atlas-zoom-in');if(zOut)zOut.disabled=zoom<=.92;if(zIn)zIn.disabled=zoom>=1.24;}
 function focusPreview(){
  const heading=$('#atlas-preview-title');
  heading.focus({preventScroll:true});
  const bounds=heading.getBoundingClientRect(),headerBottom=$('.site-header').getBoundingClientRect().bottom;
  if(bounds.top<headerBottom+12||bounds.bottom>innerHeight-12)heading.scrollIntoView({block:'center',behavior:reduced.matches?'instant':'smooth'});
 }
 function selectVenue(venueId,{push=true,focus=true,animate=true,source='ui'}={}){
  const valid=venues.some(venue=>venue.id===Number(venueId))?Number(venueId):null;
  selected=valid;
  if(push)history.pushState(history.state,'',selected?`/?venue=${selected}#atlas`:'/#atlas');
  render({focus,animate});
  notify(source);
 }
 function render({focus=false,animate=false}={}){
  const venue=venues.find(venue=>venue.id===selected);
  const focused=document.activeElement.id==='atlas-preview-title'?'heading':content.contains(document.activeElement)?document.activeElement.closest('[data-focus]')?.dataset.focus:null;
  animation?.cancel();
  const next=events.find(event=>open(event)&&event.available>0);
  content.innerHTML=venue?`<p class="eyebrow">AT THIS VENUE</p><h2 id="atlas-preview-title" tabindex="-1">${esc(venue.name)}</h2>${rows(events.filter(event=>event.venue_id===venue.id))}<a class="underlined-link" href="/events?venue=${venue.id}">View venue events <span aria-hidden="true">+</span></a>`:`<p class="eyebrow">LET THE STORY BEGIN</p><h2 id="atlas-preview-title" tabindex="-1">Your next great day.</h2><p class="atlas-welcome">Pick a landmark and discover the gatherings within. Your place in the story is waiting.</p>${next?'<p class="atlas-next-label">NEXT IN THE REALM</p>'+rows([next]):rows([])}<a href="/events" class="underlined-link">Browse all events <span aria-hidden="true">+</span></a>`;
  $('#atlas-all-venues').hidden=!venue;
  $$('[data-venue]',plane).forEach(marker=>{
   const id=Number(marker.dataset.venue),list=events.filter(event=>event.venue_id===id),active=id===selected;
   marker.classList.toggle('is-selected',active);
   if(active)marker.setAttribute('aria-current','location');else marker.removeAttribute('aria-current');
   marker.setAttribute('aria-label',`${venues.find(venue=>venue.id===id)?.name} · ${list.length} gathering${list.length===1?'':'s'} · ${list.filter(open).reduce((sum,event)=>sum+event.available,0)} spectator tickets available`);
   $('[data-landmark-count]',marker).textContent=`${list.length} gathering${list.length===1?'':'s'}`;
  });
  $$('[data-route]',plane).forEach(route=>route.classList.toggle('is-selected',Number(route.dataset.route)===selected));
  if(animate&&!reduced.matches)animation=content.animate([{opacity:.55,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.19,1,.22,1)'});
  if(focus){focusPreview();$('#atlas-announcement').textContent=`${venue?.name||'All venues'} shown.`;}
  else if(focused==='heading')$('#atlas-preview-title').focus({preventScroll:true});
  else if(focused)$(`[data-focus="${CSS.escape(focused)}"]`,content)?.focus({preventScroll:true});
 }
 feature.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const anchor=event.target.closest('a[data-venue],#atlas-all-venues');if(!anchor)return;
  event.preventDefault();
  const clicked=anchor.hasAttribute('data-venue')?Number(anchor.dataset.venue):null;
  selectVenue(clicked!==null&&clicked===selected?null:clicked,{push:true,focus:true,animate:true,source:'ui'});
 });
 addEventListener('popstate',()=>{const id=Number(new URLSearchParams(location.search).get('venue'));selectVenue(id,{push:false,focus:true,animate:true,source:'popstate'});});
 $('#atlas-zoom-in')?.addEventListener('click',()=>{if(!is3DActive)setZoom(zoom+.08);});
 $('#atlas-zoom-out')?.addEventListener('click',()=>{if(!is3DActive)setZoom(zoom-.08);});
 $('#atlas-reset')?.addEventListener('click',()=>{if(!is3DActive){plane.style.setProperty('--focus-x','50%');plane.style.setProperty('--focus-y','50%');setZoom(1);}});
 reduced.addEventListener('change',()=>{if(reduced.matches){animation?.cancel();setZoom(1);}});
 // The shared Home poll updates both the cards and this feature.
 document.addEventListener('tg:events',event=>{
  const next=event.detail.events;
  const fingerprint=list=>JSON.stringify(list.map(({server_time,...event})=>({...event,sales_open:open({...event,server_time})})));
  const changed=fingerprint(next)!==fingerprint(events);events=next;
  $('#atlas-connection').textContent='Live availability';$('#atlas-connection').classList.remove('is-offline');
  if(changed){render();notify('poll');}
 });
 document.addEventListener('tg:events-error',()=>{$('#atlas-connection').textContent='Reconnecting…';$('#atlas-connection').classList.add('is-offline');});
 window.TG.atlas={
  selectVenue:(id,opts)=>selectVenue(id,{push:true,focus:false,animate:true,source:'3d',...(opts||{})}),
  getState:()=>({events,venues,selected}),
  onChange:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},
  set3DActive:active=>{is3DActive=Boolean(active);const zIn=$('#atlas-zoom-in'),zOut=$('#atlas-zoom-out');if(is3DActive){if(zIn)zIn.disabled=false;if(zOut)zOut.disabled=false;}else{setZoom(zoom);}},
 };
 render();setZoom(1);
})();
