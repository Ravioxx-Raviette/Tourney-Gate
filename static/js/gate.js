(() => {
 const {$,api}=window.TG,form=$('#gate-form');if(!form)return;
 const event=$('#gate-event'),code=$('#gate-code'),result=$('#gate-result'),admit=$('#gate-admit'),video=$('#gate-video'),start=$('#gate-camera-start'),stop=$('#gate-camera-stop'),note=$('#gate-camera-note');
 let reviewed=null,busy=false,stream=null,cameraGeneration=0,scanTimer=null,requestVersion=0;
 function text(tag,value){const node=document.createElement(tag);node.textContent=value;return node;}
 function reset(){requestVersion++;reviewed=null;admit.hidden=true;result.className='';result.replaceChildren(text('p','Selection changed. Review the pass before admission.'));}
 function show(data){
  result.className='gate-status gate-'+data.status;result.replaceChildren(text('strong',data.message));
  if(data.guest)result.append(text('p',data.guest+' · '+data.reference),text('p',data.event),text('p',data.count+' guest(s) · Entire booking'));
  if(data.items){const list=document.createElement('ul');data.items.forEach(item=>list.append(text('li',item)));result.append(list);}
  if(data.checked_at)result.append(text('p','Checked in: '+window.TG.date(data.checked_at)));
 }
 function lock(value){event.disabled=value;code.disabled=value;$('#gate-inspect').disabled=value;start.disabled=value;admit.disabled=value;}
 async function inspect(action){
  if(action)action.preventDefault();if(busy||!form.reportValidity())return;
  stopCamera();busy=true;reviewed=null;admit.hidden=true;const version=++requestVersion;
  const payload={event_id:Number(event.value),code:code.value.trim()};lock(true);result.className='';result.replaceChildren(text('p','Reviewing pass…'));
  try{const data=await api('/api/admin/gate/inspect',{method:'POST',body:JSON.stringify(payload)});if(version!==requestVersion)return;show(data);if(data.status==='valid'){reviewed=payload;admit.hidden=false;}}
  catch(error){if(version===requestVersion)show({status:'error',message:error.message});}
  finally{busy=false;lock(false);}
 }
 form.addEventListener('submit',inspect);event.addEventListener('change',()=>{stopCamera();reset();});code.addEventListener('input',reset);
 admit.addEventListener('click',async()=>{
  if(busy||!reviewed)return;busy=true;lock(true);const payload=reviewed,version=++requestVersion;reviewed=null;result.className='';result.replaceChildren(text('p','Recording check-in…'));
  try{const data=await api('/api/admin/gate/check-in',{method:'POST',body:JSON.stringify(payload)});if(version===requestVersion){show(data);admit.hidden=true;}}
  catch(error){if(version===requestVersion){show({status:'error',message:error.message+' Review the pass again to check its latest state.'});admit.hidden=true;}}
  finally{busy=false;lock(false);}
 });
 function stopCamera(){cameraGeneration++;clearTimeout(scanTimer);stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;video.hidden=true;stop.hidden=true;start.disabled=false;}
 start.addEventListener('click',async()=>{
  if(!event.value){note.textContent='Choose the event first.';event.focus();return;}
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!('BarcodeDetector' in window)){note.textContent='Camera QR scanning is unavailable here. Enter the printed reference or use a USB scanner.';return;}
  stopCamera();const generation=cameraGeneration;start.disabled=true;
  try{
   const formats=await BarcodeDetector.getSupportedFormats();if(generation!==cameraGeneration)return;
   if(!formats.includes('qr_code'))throw new Error('QR format is unavailable');
   const detector=new BarcodeDetector({formats:['qr_code']}),received=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
   if(generation!==cameraGeneration){received.getTracks().forEach(track=>track.stop());return;}
   stream=received;video.srcObject=stream;video.hidden=false;stop.hidden=false;await video.play();note.textContent='Point the camera at the ticket QR. Scanning reviews a pass; it does not admit anyone.';
   async function scan(){
    if(generation!==cameraGeneration)return;
    try{const values=await detector.detect(video);if(generation!==cameraGeneration)return;if(values.length){code.value=values[0].rawValue;stopCamera();reset();await inspect();return;}}
    catch{if(generation!==cameraGeneration)return;}
    scanTimer=setTimeout(scan,250);
   }
   scan();
  }catch{if(generation===cameraGeneration){stopCamera();note.textContent='Camera could not start. Check permissions, or type the printed reference.';}}
 });
 stop.addEventListener('click',()=>{stopCamera();note.textContent='Camera stopped.';});
 window.addEventListener('pagehide',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
})();
