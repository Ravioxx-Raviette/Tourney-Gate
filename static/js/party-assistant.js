(() => {
  const form=document.getElementById('party-form'); if(!form)return;
  const {$,$$,money}=window.TG;
  const result=$('#party-result'),use=$('#party-use'),preview=$('#party-preview'),find=$('#party-find');
  let matcher=null,suggestion=null,criteria=null,tierId=null;
  const api=()=>window.TG.party;
  function highlight(){
    const ids=new Set(suggestion?.ids||[]);
    $$('#venue-map [data-seat],#seat-list [data-seat]').forEach(button=>button.classList.toggle('party-suggested',ids.has(Number(button.dataset.seat))));
    const changed=JSON.stringify(window.TG.partySuggestion||[])!==JSON.stringify([...ids]);
    window.TG.partySuggestion=[...ids];
    if(changed)document.dispatchEvent(new Event('tg:party-highlight'));
  }
  function clear(message=''){
    suggestion=null; use.hidden=preview.hidden=true; result.textContent=message; highlight();
  }
  function validate(state){
    if(!suggestion || state.expired || state.inFlight || state.activeTier!==tierId)return false;
    const restricted={...state.event,seats:state.event.seats.filter(s=>suggestion.ids.includes(s.id))};
    const fresh=matcher(restricted,tierId,criteria.count,criteria.budget,state.booking);
    return Boolean(fresh && fresh.total===suggestion.total);
  }
  import('./party-seats.mjs').then(module=>{matcher=module.findPartySeats;find.disabled=false;const state=api()?.state();if(state)$('#party-tier').textContent=state.event.tiers.find(t=>t.id===state.activeTier)?.name||'Current tier';}).catch(()=>{
    result.textContent='The party assistant could not load. You can still select seats on the map.';
  });
  form.addEventListener('input',()=>clear());
  form.addEventListener('submit',action=>{
    action.preventDefault(); if(!matcher||!api())return;
    const state=api().state(),count=Number($('#party-count').value),value=$('#party-budget').value.trim();
    if(value && !/^\d+(\.\d{1,2})?$/.test(value)){clear('Enter a total budget with up to two decimal places.');return;}
    criteria={count,budget:value?Math.round(Number(value)*100):null};tierId=state.activeTier;
    if(state.expired||state.inFlight){clear('Finish the current action or start a new reservation before searching.');return;}
    suggestion=matcher(state.event,tierId,count,criteria.budget,state.booking);
    if(!suggestion){if(state.event.tiers.find(t=>t.id===tierId)?.kind==='counted'){clear('General admission has no assigned seats. Choose your party ticket quantity below; seating together cannot be guaranteed.');return;}clear('No seats together match this party size and budget in the current tier. Try a smaller party, another tier, or a higher budget.');return;}
    result.textContent=`${count} seats together · ${suggestion.side}, Row ${suggestion.row} · Seats ${suggestion.numbers.join(', ')} · ${money(suggestion.total)} total at current prices. Applying replaces your entire current selection; tickets are held only when you continue to checkout.`;
    use.hidden=preview.hidden=false; preview.dataset.seatPreview=String(suggestion.ids[0]); highlight();
  });
  use.addEventListener('click',()=>{
    const state=api().state();
    if(!validate(state)||!api().apply(suggestion.ids)){clear('Availability changed. Find seats again before applying.');return;}
    clear('Party seats selected. Review your order, then continue to checkout.');
  });
  document.addEventListener('tg:seat-state',()=>{
    if(!api())return;const state=api().state();
    const tier=state.event.tiers.find(t=>t.id===state.activeTier);
    $('#party-tier').textContent=tier?.name||'Current tier';
    if(suggestion&&!validate(state))clear('Your suggestion changed or is no longer available. Find seats again.');
    else highlight();
  });
})();
