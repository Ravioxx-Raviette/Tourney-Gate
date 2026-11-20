(() => {
 const form=document.getElementById('house-form');if(!form)return;
 const badge=document.querySelector('.house-preview [data-house-badge]');
 const feedback=document.getElementById('house-save-feedback'),save=document.getElementById('house-save-button');
 if(feedback){feedback.focus({preventScroll:true});feedback.scrollIntoView({block:'center',behavior:'instant'});}
 function update(){
  if(feedback)feedback.hidden=true;save.textContent=save.dataset.label||'Save my house';
  badge.querySelector('[data-house-name]').textContent=form.elements.name.value.trim()||'Your House';
  badge.querySelector('[data-house-motto]').textContent=form.elements.motto.value.trim();
  const palette=form.elements.palette.value;
  badge.className=`house-badge house-theme-${['crimson','emerald','sapphire','plum'].includes(palette)?palette:'none'}`;
  const crest=form.elements.crest.value;
  badge.querySelectorAll('[data-house-symbol]').forEach(group=>group.toggleAttribute('hidden',group.dataset.houseSymbol!==crest));
  badge.querySelector('svg').setAttribute('aria-label',crest?`${form.elements.crest.selectedOptions[0].textContent} house crest`:'Blank house crest');
  document.getElementById('house-live-note').textContent='Preview updated. Save your house to use it on the site.';
 }
 form.addEventListener('submit',()=>{save.disabled=true;save.textContent='Saving…';save.setAttribute('aria-busy','true');});
 window.addEventListener('pageshow',e=>{if(e.persisted){save.disabled=false;save.removeAttribute('aria-busy');save.textContent=save.dataset.label||'Save my house';}});
 form.addEventListener('input',update);form.addEventListener('change',update);
})();
