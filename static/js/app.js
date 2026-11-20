'use strict';
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const money = cents => new Intl.NumberFormat('en-PH', {style: 'currency', currency: $('meta[name="currency"]').content, maximumFractionDigits: cents % 100 ? 2 : 0}).format(cents / 100);
  const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const read = id => { const node = document.getElementById(id); return node ? JSON.parse(node.textContent) : null; };
  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {...options, headers: {'Content-Type': 'application/json', 'X-CSRF-Token': $('meta[name="csrf-token"]').content, ...options.headers}});
    } catch (_error) { throw new Error('The box office could not be reached. Check your connection and try again.'); }
    let data;
    try { data = await response.json(); } catch (_error) { throw new Error('The box office returned an unexpected response. Refresh and try again.'); }
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  let toastTimeout;
  function toast(message) {
    const node = $('#toast'); node.textContent = message; node.classList.add('visible');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => node.classList.remove('visible'), 4500);
  }
  function errorAt(id, message) { const node = document.getElementById(id); if (node) { node.textContent = message; node.hidden = !message; } }
  function busy(button, active, message = 'Please wait…') {
    if (active) { button.dataset.originalText = button.textContent; button.textContent = message; }
    else if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    button.disabled = active; button.setAttribute('aria-busy', String(active));
  }
  function go(url) { return window.TG.navigate ? window.TG.navigate(url) : location.assign(url); }
  function timer(booking, onExpire) {
    const node = $('#timer'), wrap = $('#hold-timer');
    if (!node || !wrap) return;
    const offset = booking.server_time * 1000 - Date.now();
    let expired = false;
    const update = () => {
      const seconds = Math.max(0, Math.ceil(booking.expires_at - (Date.now() + offset) / 1000));
      node.textContent = `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
      wrap.classList.toggle('expiring', seconds <= 120); wrap.classList.toggle('expired', seconds === 0);
      if ((!seconds || booking.status !== 'pending') && !expired) {
        expired = true; node.textContent = 'Expired'; onExpire?.(); clearInterval(interval);
      }
    };
    const interval = setInterval(update, 1000); update(); return () => clearInterval(interval);
  }
  const date = value => new Intl.DateTimeFormat('en-PH', {timeZone:'Asia/Manila', dateStyle:'long', timeStyle:'short'}).format(value*1000);
  const itemMarkup = booking => `<ul class="order-items">${booking.items.map(item=>`<li><div><strong>${escape(item.tier_name)}</strong><span>${item.seat_id ? `${escape(item.section)} · ${escape(item.row)} · Seat ${item.number}` : item.participant_persona ? `${escape(item.participant_persona)} · ${escape(item.participant_class)}` : `${item.quantity} ticket${item.quantity === 1 ? '' : 's'}`}</span></div><strong>${money(item.quantity*item.unit_price)}</strong></li>`).join('')}</ul>`;
  function poll(callback, interval = 5000) {
    let running = false;
    const update = async () => { if (document.hidden || running) return; running = true; try { await callback(); } catch (_error) { /* Keep the last known state; mutations still revalidate on the server. */ } finally { running = false; } };
    setInterval(update, interval); document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
    return update;
  }
  window.TG = {$, $$, reduced, money, escape, read, api, toast, errorAt, busy, timer, date, itemMarkup, poll, go};

  const menu = $('.menu-toggle');
  menu?.addEventListener('click', () => { const expanded = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(expanded)); $('#navigation').classList.toggle('open', expanded); });
  $$('#navigation a').forEach(link => link.addEventListener('click', () => { menu?.setAttribute('aria-expanded','false'); $('#navigation').classList.remove('open'); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { menu?.setAttribute('aria-expanded','false'); $('#navigation')?.classList.remove('open'); } });
  if (!reduced && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-motion');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), {threshold:.08});
    $$('.reveal').forEach((node,index) => { if (node.classList.contains('event-card')) node.style.setProperty('--reveal-delay',`${index%3*70}ms`); observer.observe(node); });
  }
  if (!reduced) {
    const hero = $('.hero');
    if (hero) {
      let scheduled = false;
      const move = () => { hero.style.setProperty('--hero-offset',`${Math.min(window.scrollY*.075,28)}px`); scheduled=false; };
      addEventListener('scroll', () => { if (!scheduled) { requestAnimationFrame(move); scheduled=true; } }, {passive:true});
    }
    $$('.event-card').forEach(card => card.addEventListener('pointermove', event => { const box=card.getBoundingClientRect(); card.style.setProperty('--pointer-x',`${event.clientX-box.left}px`); card.style.setProperty('--pointer-y',`${event.clientY-box.top}px`); }));
  }
  $$('[data-countdown]').forEach(node => {
    const update = () => { const seconds = Math.max(0, Number(node.dataset.countdown)-Date.now()/1000); $('[data-days]',node).textContent=String(Math.floor(seconds/86400)).padStart(2,'0'); $('[data-hours]',node).textContent=String(Math.floor(seconds/3600)%24).padStart(2,'0'); $('[data-minutes]',node).textContent=String(Math.floor(seconds/60)%60).padStart(2,'0'); };
    update(); setInterval(update,30000);
  });
  const upcomingPanel=$('#upcoming-realm-panel');
  if (upcomingPanel) {
    const toggles=$$('[data-upcoming-toggle]');
    const setOpen=open=>{
      upcomingPanel.hidden=!open;
      toggles.forEach(btn=>{
        btn.setAttribute('aria-expanded',String(open));
        btn.classList.toggle('is-open',open);
        const textSpan=btn.querySelector('span:first-child');
        if (textSpan && btn.dataset.labelClosed) textSpan.textContent=open?btn.dataset.labelOpen:btn.dataset.labelClosed;
      });
      if (open) upcomingPanel.scrollIntoView({behavior:reduced?'auto':'smooth',block:'nearest'});
    };
    toggles.forEach(btn=>btn.addEventListener('click',()=>setOpen(upcomingPanel.hidden)));
  }
  let gridAnimation;
  function animateCards(cards,previousHeight) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const grid=cards[0]?.parentElement;
    gridAnimation?.cancel();
    if(grid&&previousHeight){const nextHeight=grid.getBoundingClientRect().height;if(Math.abs(nextHeight-previousHeight)>2)gridAnimation=grid.animate([{height:`${previousHeight}px`},{height:`${nextHeight}px`}],{duration:420,easing:'cubic-bezier(.19,1,.22,1)'});}
    cards.filter(card=>!card.hidden&&getComputedStyle(card).display!=='none').forEach((card,index)=>{
      // Cancel an earlier filter animation so rapid changes never leave stale cards.
      card.getAnimations().filter(animation=>animation.id==='filter-card').forEach(animation=>animation.cancel());
      card.animate([{opacity:0,transform:'translateY(20px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{id:'filter-card',duration:480,delay:index*55,easing:'cubic-bezier(.19,1,.22,1)',fill:'backwards'});
    });
  }
  $$('[data-home-filter]').forEach(button => button.addEventListener('click', () => {
    const category=button.dataset.homeFilter;
    const previousHeight=$('.home-events').getBoundingClientRect().height;
    $$('[data-home-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
    $('.home-events').classList.toggle('has-filter',category!=='all');
    const cards=$$('.home-events .event-card'); cards.forEach(card=>{card.hidden=category!=='all'&&card.dataset.category!==category;}); animateCards(cards,previousHeight);
  }));
  const filters=$('#event-filters');
  if (filters) {
    const filterToggle=$('#filter-toggle'), compactFilters=matchMedia('(max-width:900px)');
    function expandFilters(expanded) {
      filters.classList.toggle('filters-collapsed',!expanded);
      filterToggle?.setAttribute('aria-expanded',String(expanded));
      const symbol=$('.filter-toggle-symbol');if(symbol)symbol.textContent=expanded?'−':'+';
    }
    if(filterToggle){expandFilters(!compactFilters.matches);filterToggle.addEventListener('click',()=>expandFilters(filterToggle.getAttribute('aria-expanded')!=='true'));compactFilters.addEventListener('change',()=>expandFilters(!compactFilters.matches));}
    function filterEvents({updateURL=true,animate=true}={}) {
      const previousHeight=$('#events-grid').getBoundingClientRect().height;
      const values=new FormData(filters), search=String(values.get('search')||'').trim().toLowerCase(), category=values.get('category'), price=values.get('price'), day=values.get('date'),venue=values.get('venue');
      const activeFilters=Number(category!=='all')+Number(price!=='all')+Number(Boolean(day))+Number(Boolean(venue));
      if($('#filter-count'))$('#filter-count').textContent=activeFilters?` (${activeFilters})`:'';
      const cards=$$('#events-grid .event-card');
      cards.forEach(card=>{card.hidden=!(card.dataset.title.includes(search)&&(category==='all'||card.dataset.category===category)&&(!venue||card.dataset.venue===venue)&&(price==='all'||Number(card.dataset.price)<=Number(price))&&(!day||card.dataset.date>=day));});
      const count=cards.filter(card=>!card.hidden).length; $('#results-count').textContent=`${count} experience${count===1?' awaits':'s await'}`; $('#no-results').hidden=count!==0;
      if(animate)animateCards(cards,previousHeight);
      if(updateURL){const params=new URLSearchParams();for(const [key,value] of values)if(value&&value!=='all')params.set(key,String(value).trim());history.replaceState(history.state,'','/events'+(params.size?'?'+params:'')+location.hash);}
    }
    function resetFilters(){for(const key of ['search','date','venue'])filters.elements[key].value='';for(const key of ['category','price'])filters.elements[key].value='all';filterEvents();}
    filters.addEventListener('submit',event=>{event.preventDefault();filterEvents();});
    filters.addEventListener('input',()=>filterEvents());filters.addEventListener('change',()=>filterEvents());
    filters.addEventListener('reset',event=>{event.preventDefault();resetFilters();});
    $('#clear-event-filters')?.addEventListener('click',event=>{event.preventDefault();resetFilters();filters.elements.search.focus();});
    addEventListener('popstate',()=>{const values=new URLSearchParams(location.search);for(const key of ['search','date','venue','category','price'])filters.elements[key].value=values.get(key)||(['category','price'].includes(key)?'all':'');filterEvents({updateURL:false});});
    filterEvents({updateURL:false,animate:false});
  }

  function updateBadge(node, event) {
    const low=event.available<=event.capacity*.1;
    node.classList.toggle('unavailable',!event.available||event.status!=='upcoming');node.classList.toggle('few',low&&event.available>0);
    node.textContent=event.status==='cancelled'?'Cancelled':event.status==='past'?'Event ended':event.status==='sold_out'||event.spectator_remaining===0?'Sold out':!event.available?'Temporarily unavailable':low?`Few left · ${event.available} seats`:`${event.available} seats available`;
  }
  if (['home','events'].includes(document.body.dataset.page)) poll(async()=>{
    try{const data=await api('/api/events');data.events.forEach(event=>$$(`[data-event-count="${event.id}"]`).forEach(node=>updateBadge(node,event)));document.dispatchEvent(new CustomEvent('tg:events',{detail:data}));}
    catch(error){document.dispatchEvent(new Event('tg:events-error'));throw error;}
  });
  if (document.body.dataset.page==='event') {
    const event=read('event-data');
    poll(async()=>{
      const data=await api(`/api/events/${event.id}/availability`);
      data.tiers.forEach(tier=>{const node=$(`[data-tier-stock="${tier.id}"]`);if(node)node.textContent=tier.remaining===0?'Sold out':tier.available===0?'Temporarily unavailable':`${tier.available<=tier.capacity*.1?'Few left · ':''}${tier.available} of ${tier.capacity} available`;});
      $$('[data-event-count]').forEach(node=>updateBadge(node,data));
      const panel=$('.booking-panel'),current=[...panel.children].find(node=>node.classList.contains('button'));
      const canBook=data.status==='upcoming'&&data.start_at>data.server_time&&data.available>0;
      const label=canBook?'Claim your seat':data.status==='cancelled'?'Cancelled':data.status==='past'?'Event ended':data.start_at<=data.server_time?'Booking closed':data.spectator_remaining===0?'Sold out':'Temporarily unavailable';
      if(current.tagName!==(canBook?'A':'BUTTON')){const replacement=document.createElement(canBook?'a':'button');replacement.className='button full';if(canBook)replacement.href=`/events/${data.slug}/seats`;else replacement.disabled=true;replacement.textContent=label;current.replaceWith(replacement);}else if(current.textContent!==label)current.textContent=label;
    });
  }
  const participantForm=$('#participant-form');
  participantForm?.addEventListener('submit',async event=>{
    event.preventDefault();const values=new FormData(participantForm),button=$('button[type="submit"]',participantForm);errorAt('participant-error','');busy(button,true,'Reserving your place…');
    try{const data=await api(`/api/events/${read('event-data').id}/reservations`,{method:'POST',body:JSON.stringify({kind:'participant',items:[{tier_id:Number(values.get('tier_id')),quantity:1}],participant:{legal_name:values.get('legal_name'),persona:values.get('persona'),faction:values.get('faction'),class:values.get('class'),waiver:values.has('waiver')}})});TG.go(`/checkout/${data.id}`);}catch(error){errorAt('participant-error',error.message);busy(button,false);}
  });
  const checkout=$('#checkout-form');
  if (checkout) {
    const booking=read('booking-data'),button=$('#confirm-button'); let expired=false;
    function onExpire(){expired=true;button.disabled=true;errorAt('checkout-error','Your reservation has expired. Return to the event to select tickets again.');const link=document.createElement('a');link.href=`/events/${booking.event.slug}`;link.className='underlined-link';link.textContent='Return to event';if(!$('.expired-return',checkout)){link.classList.add('expired-return');checkout.append(link);}}
    timer(booking,onExpire);
    checkout.addEventListener('submit',async event=>{event.preventDefault();if(expired)return;errorAt('checkout-error','');busy(button,true,'Sealing your booking…');const values=new FormData(checkout);try{const result=await api(`/api/reservations/${booking.id}/confirm`,{method:'POST',body:JSON.stringify({name:values.get('name'),email:values.get('email'),phone:values.get('phone'),simulated_payment:values.has('simulated_payment')})});TG.go(`/ticket/${result.reference_code}`);}catch(error){errorAt('checkout-error',error.message);busy(button,false);if(expired)button.disabled=true;}});
    poll(async()=>{const result=await api(`/api/reservations/${booking.id}`);if(result.status==='confirmed')TG.go(`/ticket/${result.reference_code}`);else if(result.status!=='pending')onExpire();});
  }
  $('#release-reservation')?.addEventListener('click',async event=>{const booking=read('booking-data');if(!booking)return;const button=event.currentTarget;busy(button,true,'Releasing…');try{await api(`/api/reservations/${booking.id}`,{method:'DELETE'});TG.go(`/events/${booking.event.slug}`);}catch(error){toast(error.message);busy(button,false);}});
  $('#print-ticket')?.addEventListener('click',()=>window.print());
  const lookup=$('#lookup-form');let foundBooking;
  function renderBooking(booking){foundBooking=booking;$('#booking-result').innerHTML=`<article class="result-panel"><span class="status-pill ${booking.status==='cancelled'?'cancelled':''}">${escape(booking.status)}</span><h2>${escape(booking.event.title)}</h2><strong class="reference-code">${escape(booking.reference_code)}</strong><p>${escape(date(booking.event.start_at))} PHT</p><p class="muted">${escape(booking.event.venue)}</p>${itemMarkup(booking)}<div class="summary-total"><span>Total</span><strong>${money(booking.total)}</strong></div><div class="result-actions"><a class="button" href="/ticket/${escape(booking.reference_code)}">View ticket</a>${booking.can_cancel?'<button class="button button-outline" id="cancel-booking">Cancel booking</button>':''}</div>${booking.status==='confirmed'&&!booking.can_cancel?'<p class="muted small">The cancellation window has closed.</p>':''}</article>`;$('#cancel-booking')?.addEventListener('click',()=>$('#cancel-dialog').showModal());}
  lookup?.addEventListener('submit',async event=>{event.preventDefault();const button=$('button[type="submit"]',lookup),values=new FormData(lookup);errorAt('lookup-error','');busy(button,true,'Looking up your ticket…');try{renderBooking(await api('/api/bookings/lookup',{method:'POST',body:JSON.stringify({email:values.get('email'),reference:values.get('reference')})}));}catch(error){errorAt('lookup-error',error.message);$('#booking-result').innerHTML='';}finally{busy(button,false);}});
  $('#cancel-dialog')?.addEventListener('close',async()=>{if($('#cancel-dialog').returnValue!=='cancel'||!foundBooking)return;const button=$('#cancel-booking');busy(button,true,'Cancelling…');try{renderBooking(await api(`/api/bookings/${foundBooking.id}/cancel`,{method:'POST',body:'{}'}));toast('Booking cancelled. Your tickets are available again.');}catch(error){toast(error.message);busy(button,false);}});
})();
