const profiles = {
 day:{sky:0x173c49,hemi:1.15,sun:2,rim:.6,sunColor:0xfff1ce,torches:false},
 torch:{sky:0x050c17,hemi:.48,sun:.32,rim:.85,sunColor:0x8da9df,torches:true},
};
export function atmosphereProfile(mode){return profiles[mode] ? {...profiles[mode]} : null;}
const stories={
 'silver-lance':[
  ['stations','The knights’ preparations','Beyond the lists, grooms tend the warhorses while squires lay out lances and armor. Imagine the hush before the herald calls the next rider.','view-station'],
  ['royalBox','Under the royal banner','The ringside thrones face the tilt barrier. Here the welcome toast gives way to the thunder of hooves and the bright colors of rival houses.','view-royal'],
  ['lists','The charge down the lists','Two riders approach from opposite gates, separated by the central tilt. This imagined festival celebrates pageantry and choreographed performance.','lists']],
 'five-banners':[
  ['stations','The warbands assemble','Shields, weapon racks, and armor mark the gathering places of the five houses. Their performers prepare a carefully staged display of teamwork.','view-station'],
  ['lists','Where five banners meet','The field becomes a tapestry of house colors. Follow the center line where rival formations will meet in the story of the grand melee.','lists'],
  ['royalBox','The herald’s salute','From the royal terrace, the opening salute welcomes every house. The spectacle belongs as much to its cheering spectators as its performers.','view-royal']],
 'iron-colosseum':[
  ['arena','Beneath the arena walls','Step toward the sand where the staged duels unfold. The enclosing walls turn each entrance into a moment of theatre and anticipation.','lists'],
  ['noble','The four pavilions','The noble pavilions look toward the arena from four sides. Their raised seats form a colorful ring around the heart of the performance.','view-noble'],
  ['groundling','The gathering outside','Four exterior viewing plazas carry the imagined spectacle beyond the walls. They offer standing-room gathering places around modeled big screens.','view-groundling']],
 'kings-mark':[
  ['targets','The golden center','Three targets stand downrange beyond the shooting line. The painted rings turn a distant point into the focus of the whole gathering.','lists'],
  ['shootingLine','Before the arrows fly','At the shooting line the rhythm slows: a breath, a steady draw, a moment of concentration. Spectators remain safely behind the archers.','royal'],
  ['stand','The gallery on the green','The curved rear gallery gathers the audience behind the range. From here, the eye follows the archers toward the distant target butts.','isometric']],
 'victors-feast':[
  ['tables','A place at the feast','Eight long tables welcome the houses to a shared celebration. Goblets and place settings promise an evening of stories after the day’s spectacle.','lists'],
  ['dais','At the high dais','The high dais and hearth anchor the northern end of the Great Hall. Imagine a herald raising a final toast to the day’s performers and guests.','royal'],
  ['candelabras','By candle and brass','The brass candelabras bring a warm rhythm to the banquet floor. Torchlight mode changes the atmosphere of this model, not the event’s actual schedule.','lists']],
};
export function venueStories(slug){return (stories[slug]||[]).map(([zone,title,text,preset])=>({zone,title,text,preset}));}

export function ambientGain(percent){
 const value=Number.isFinite(percent)?Math.max(0,Math.min(100,percent)):35;
 return .75*Math.pow(value/100,1.5);
}

export function ambientSamples(length,random=Math.random){
 const samples=new Float32Array(length);let smooth=0,total=0;
 for(let i=0;i<length;i++){smooth=(smooth+(random()*2-1)*.05)/1.02;samples[i]=smooth;total+=smooth;}
 const mean=total/Math.max(1,length),fade=Math.max(1,Math.floor(length*.01));let energy=0;
 for(let i=0;i<length;i++){samples[i]=(samples[i]-mean)*Math.min(1,i/fade,(length-1-i)/fade);energy+=samples[i]*samples[i];}
 const rms=Math.sqrt(energy/Math.max(1,length)),scale=rms>.000001?.18/rms:0;
 for(let i=0;i<length;i++)samples[i]=Math.max(-.8,Math.min(.8,samples[i]*scale));
 return samples;
}

let activeSound=null;
/** Single, opt-in synthesized ambience. No recordings, autoplay, or network requests. */
export function createVenueAmbience(slug,onChange){
 let context=null,volume=null,generation=0,desiredVolume=35;
 const stop=()=>{generation++;const old=context;context=null;volume=null;if(activeSound===stop)activeSound=null;if(old)old.close().catch(()=>{});onChange(false);};
 return {
  async start(){
   activeSound?.(); const token=++generation;
   const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!Audio)throw new Error('Audio unavailable');
   context=new Audio(); const current=context;activeSound=stop;
   try{
    await current.resume();if(token!==generation||current!==context)return false;
    activeSound=stop;volume=current.createGain();volume.gain.value=ambientGain(desiredVolume);volume.connect(current.destination);
    const buffer=current.createBuffer(1,current.sampleRate*2,current.sampleRate);
    buffer.getChannelData(0).set(ambientSamples(buffer.length||current.sampleRate*2));
    const source=current.createBufferSource();source.buffer=buffer;source.loop=true;
    const filter=current.createBiquadFilter();filter.type='lowpass';filter.frequency.value=slug==='victors-feast'?450:850;
    source.connect(filter);filter.connect(volume);source.start();
    if(slug==='victors-feast')for(const frequency of [110,165]){const tone=current.createOscillator();tone.type='sine';tone.frequency.value=frequency;const gain=current.createGain();gain.gain.value=.08;tone.connect(gain);gain.connect(volume);tone.start();}
    if(current.state && current.state!=='running')throw new Error('Audio playback is suspended');
    current.onstatechange=()=>{if(context===current && current.state==='suspended')stop();};
    onChange(true);return true;
   }catch(error){stop();throw error;}
  },stop,
  setVolume(value){desiredVolume=Number.isFinite(value)?Math.max(0,Math.min(100,value)):35;if(volume&&context)volume.gain.setTargetAtTime(ambientGain(desiredVolume),context.currentTime,.04);}
 };
}

export function mountLivingVenue(root,viewer,THREE){
 activeSound?.();
 root.querySelector('.living-venue')?.remove();
 const entries=venueStories(viewer.slug).filter(s=>viewer.venue.zoneGroups[s.zone]);
 if(!entries.length)return;
 const box=document.createElement('section');box.className='living-venue';box.setAttribute('aria-label','Living festival venue');
 box.innerHTML='<div class="living-toolbar"><div role="group" aria-label="Venue atmosphere"><button type="button" class="venue-3d-btn" data-atmosphere="day" aria-pressed="true">Daylight</button><button type="button" class="venue-3d-btn" data-atmosphere="torch" aria-pressed="false">Torchlight</button></div><button type="button" class="venue-3d-btn" data-ambience aria-pressed="false">Ambient sound: off</button><label>Volume <input type="range" min="0" max="100" step="1" value="35" aria-label="Ambient sound volume" aria-valuetext="35%"><output data-volume-value>35%</output></label></div><p class="living-note">Explore a landmark below, or click it in the 3D model. Atmosphere is illustrative. Sound is synthesized and optional.</p><div class="living-landmarks" role="group" aria-label="Discover venue stories"></div><article class="living-story" aria-live="polite"><h3>Stories of the venue</h3><p>Choose a landmark to discover its story.</p></article><p class="living-audio-status" role="status"></p>';
 const legend=root.querySelector('[data-3d-legend]');if(legend)legend.before(box);else root.append(box);
 const button=box.querySelector('[data-ambience]'),status=box.querySelector('.living-audio-status');let enabled=false,pending=false,disposed=false;
 const audio=createVenueAmbience(viewer.slug,value=>{enabled=value;button.textContent=`Ambient sound: ${value?'on':'off'}`;button.setAttribute('aria-pressed',String(value));status.textContent=value?'Ambient sound on.':'Ambient sound off.';});
 button.addEventListener('click',async()=>{
  if(pending)return;if(enabled){audio.stop();status.textContent='Ambient sound off.';return;}
  pending=true;button.disabled=true;
  try{audio.setVolume(Number(box.querySelector('input').value));const started=await audio.start();if(started&&!disposed)audio.setVolume(Number(box.querySelector('input').value));}
  catch{if(!disposed)status.textContent='Sound is unavailable in this browser. You can still explore the venue.';}
  finally{pending=false;button.disabled=false;}
 });
 box.querySelector('input').addEventListener('input',action=>{const value=Number(action.target.value);audio.setVolume(value);box.querySelector('[data-volume-value]').textContent=`${value}%`;action.target.setAttribute('aria-valuetext',`${value}%`);});
 box.querySelectorAll('[data-atmosphere]').forEach(b=>b.addEventListener('click',()=>{
  viewer.setAtmosphere(b.dataset.atmosphere);
  box.querySelectorAll('[data-atmosphere]').forEach(other=>other.setAttribute('aria-pressed',String(other===b)));
 }));
 const buttons=new Map();
 function show(entry,moveCamera){
  box.querySelector('.living-story h3').textContent=entry.title;box.querySelector('.living-story p').textContent=entry.text;
  buttons.forEach((b,key)=>b.setAttribute('aria-pressed',String(key===entry.zone)));
  viewer.highlightZone(entry.zone);if(moveCamera)viewer.setPreset(entry.preset);
 }
 for(const entry of entries){const b=document.createElement('button');b.type='button';b.className='venue-3d-btn';b.textContent=entry.title;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>show(entry,true));buttons.set(entry.zone,b);box.querySelector('.living-landmarks').append(b);}
 const raycaster=new THREE.Raycaster();
 const pick=action=>{
  const rect=viewer.renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return;
  raycaster.setFromCamera(new THREE.Vector2((action.clientX-rect.left)/rect.width*2-1,-(action.clientY-rect.top)/rect.height*2+1),viewer.camera);
  const hit=raycaster.intersectObject(viewer.venue.root,true).find(hit=>hit.object.isMesh);
  if(!hit)return;
  for(let object=hit.object;object;object=object.parent){
    const entry=entries.find(entry=>viewer.venue.zoneGroups[entry.zone]===object);
    if(entry){show(entry,false);break;}
  }
 };
 viewer.renderer.domElement.addEventListener('click',pick);
 const hush=()=>audio.stop();
 const visibility=()=>{if(document.hidden)hush();};
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',hush);
 viewer.livingCleanup=()=>{disposed=true;audio.stop();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',hush);viewer.renderer.domElement.removeEventListener('click',pick);box.remove();};
 viewer.setAtmosphere('day');
}
