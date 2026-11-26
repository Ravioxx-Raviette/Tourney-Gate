'use strict';
(()=>{
 const {api,escape,errorAt,busy}=window.TG,root=document.querySelector('[data-management]');if(!root)return;
 const mode=root.dataset.management,owner=root.dataset.owner==='1',me=Number(root.dataset.userId),form=document.getElementById('management-filters');
 const rows=document.getElementById('management-rows'),status=document.getElementById('management-status'),previous=document.getElementById('management-previous'),next=document.getElementById('management-next');
 let page=1,serial=0,users=[],pending=null;
 const names={user:'User',staff:'Gate staff',admin:'Admin',owner:'Owner'};
 const date=stamp=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(stamp*1000);
 async function refresh(){
  const request=++serial,params=new URLSearchParams(new FormData(form));params.set('page',String(page));status.textContent='Loading…';
  try{
   const data=await api('/api/admin/'+mode+'?'+params);if(request!==serial)return;errorAt('management-error','');
   if(mode==='users'){
    users=data.users;rows.innerHTML=users.map(u=>{
     const protectedAccount=u.id===me||u.role==='owner';
     const buttons=protectedAccount?'Protected account':`<button type="button" class="button button-small button-outline" data-status-user="${u.id}">${u.is_active?'Suspend':'Restore'}</button>${owner?` <button type="button" class="button button-small button-outline" data-role-user="${u.id}">Change role</button>`:''}`;
     return `<tr><td><strong>${escape(u.name)}</strong><small>${escape(u.email)}</small></td><td>${escape(names[u.role])}</td><td>${u.is_active?'Active':'Suspended'}${u.suspension_reason?`<small>${escape(u.suspension_reason)}</small>`:''}</td><td>${buttons}</td></tr>`;
    }).join('')||'<tr><td colspan="4">No matching accounts.</td></tr>';
   }else{
    rows.innerHTML=data.entries.map(e=>`<tr><td>${escape(date(e.created_at))}</td><td>${escape(e.actor_name)}<small>${escape(e.actor_email||e.actor_role)}</small></td><td>${escape(e.action)}</td><td>${escape(e.target_type)}:${escape(e.target_id)}</td><td>${e.reason?`<p>${escape(e.reason)}</p>`:''}<details><summary>View changes</summary><pre>${escape(JSON.stringify({before:e.before,after:e.after},null,2))}</pre></details></td></tr>`).join('')||'<tr><td colspan="5">No matching activity.</td></tr>';
   }
   status.textContent=`${data.total} matching ${mode==='users'?'accounts':'entries'}`;
   document.getElementById('management-page').textContent=`Page ${page} of ${Math.max(1,Math.ceil(data.total/50))}`;
   previous.disabled=page===1;next.disabled=page*50>=data.total;
  }catch(e){if(request!==serial)return;errorAt('management-error',e.message);status.textContent='Unable to load results.';rows.innerHTML='';previous.disabled=next.disabled=true;}
 }
 form.addEventListener('submit',e=>{e.preventDefault();page=1;refresh();});previous.addEventListener('click',()=>{if(page>1){page--;refresh();}});next.addEventListener('click',()=>{page++;refresh();});
 if(mode==='users'){
  const dialog=document.getElementById('management-dialog'),action=document.getElementById('management-action'),save=document.getElementById('management-save');
  rows.addEventListener('click',e=>{
   const button=e.target.closest('[data-status-user],[data-role-user]');if(!button)return;
   const user=users.find(u=>u.id===Number(button.dataset.statusUser||button.dataset.roleUser));if(!user)return;
   pending={user,kind:button.hasAttribute('data-role-user')?'role':'status'};action.reset();errorAt('management-action-error','');
   document.getElementById('management-role-label').hidden=pending.kind!=='role';action.elements.role.value=user.role;
   document.getElementById('management-action-title').textContent=pending.kind==='role'?'Change account role':user.is_active?'Suspend account':'Restore account';
   document.getElementById('management-action-description').textContent=`${user.name} · ${user.email}. `+(pending.kind==='role'?'The user must sign in again after this change.':user.is_active?'Login will be blocked and pending reservations released. Confirmed tickets remain valid.':'Account access will be restored. Expired holds will stay expired.');
   dialog.showModal();
  });
  dialog.addEventListener('cancel',e=>{if(save.disabled)e.preventDefault();});
  document.getElementById('management-dismiss').addEventListener('click',()=>dialog.close());
  action.addEventListener('submit',async e=>{
   e.preventDefault();if(!pending)return;const target=pending;busy(save,true,'Saving…');errorAt('management-action-error','');
   try{
    const data={reason:action.elements.reason.value,...(target.kind==='role'?{role:action.elements.role.value}:{active:!target.user.is_active})};
    await api(`/api/admin/users/${target.user.id}/${target.kind}`,{method:'PUT',body:JSON.stringify(data)});dialog.close();pending=null;await refresh();const success=document.getElementById('management-success');success.textContent=target.kind==='role'?'Role saved. The user must sign in again.':target.user.is_active?'Account suspended. Pending reservations released; confirmed tickets remain valid.':'Account restored. The user can sign in again.';success.hidden=false;
   }catch(e){errorAt('management-action-error',e.message);}finally{busy(save,false);document.getElementById('management-dismiss').disabled=false;}
  });
 }
 refresh();
})();
