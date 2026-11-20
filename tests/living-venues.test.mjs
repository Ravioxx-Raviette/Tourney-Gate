import {test} from 'node:test';
import assert from 'node:assert/strict';
import {atmosphereProfile, venueStories} from '../static/js/living-venues.mjs';
test('daylight and torchlight are distinct and unknown modes are rejected',()=>{
 assert.ok(atmosphereProfile('day').sun>atmosphereProfile('torch').sun);
 assert.equal(atmosphereProfile('day').torches,false);
 assert.equal(atmosphereProfile('torch').torches,true);
 assert.equal(atmosphereProfile('unknown'),null);
});
test('all five venues have original stories tied to model zones',()=>{
 for(const slug of ['silver-lance','five-banners','iron-colosseum','kings-mark','victors-feast']){
  const stories=venueStories(slug);assert.ok(stories.length>=3);
  assert.equal(new Set(stories.map(s=>s.zone)).size,stories.length);
  for(const s of stories){assert.ok(s.title.length>3);assert.ok(s.text.length>50);assert.ok(s.preset);}
 }
 assert.deepEqual(venueStories('unknown'),[]);
});

test('changing atmosphere updates real scene lights and torch visibility',async()=>{
 globalThis.matchMedia=()=>({matches:true});globalThis.document={readyState:'loading',addEventListener(){}};
 const THREE=await import('../static/vendor/three/three.module.min.js');
 const {Venue3DViewer}=await import('../static/js/venue3d.js');
 const lights={hemi:new THREE.HemisphereLight(),sun:new THREE.DirectionalLight(),rim:new THREE.DirectionalLight()};
 const viewer=Object.assign(Object.create(Venue3DViewer.prototype),{scene:new THREE.Scene(),atmosphereLights:lights,torchLights:[new THREE.PointLight()],renderOnce(){}});
 viewer.setAtmosphere('torch');assert.equal(viewer.torchLights[0].visible,true);assert.equal(lights.sun.intensity,.32);
 viewer.setAtmosphere('day');assert.equal(viewer.torchLights[0].visible,false);assert.equal(lights.sun.intensity,2);
 viewer.setAtmosphere('invalid');assert.equal(lights.sun.intensity,2);
});
test('ambience is opt-in, exclusive, and cannot restart after a cancelled resume',async()=>{
 const {createVenueAmbience}=await import('../static/js/living-venues.mjs');
 const previous=globalThis.AudioContext,instances=[];
 class Audio {
  sampleRate=100;destination={};closed=false;
  constructor(){instances.push(this);}
  resume(){return Promise.resolve();}close(){this.closed=true;return Promise.resolve();}
  createGain(){return {connect(){},gain:{value:0,setTargetAtTime(){}}};}
  createBuffer(){return {getChannelData(){return new Float32Array(200);}};}
  createBufferSource(){return {connect(){},start(){}};}
  createBiquadFilter(){return {connect(){},frequency:{value:0}};}
 }
 globalThis.AudioContext=Audio;
 try{
  const a=createVenueAmbience('silver-lance',()=>{}),b=createVenueAmbience('iron-colosseum',()=>{});
  assert.equal(instances.length,0);assert.equal(await a.start(),true);
  assert.equal(await b.start(),true);assert.equal(instances[0].closed,true);b.stop();assert.equal(instances[1].closed,true);
  let resume;Audio.prototype.resume=()=>new Promise(resolve=>{resume=resolve;});
  const c=createVenueAmbience('silver-lance',()=>{}),pending=c.start();c.stop();resume();
  assert.equal(await pending,false);assert.equal(instances[2].closed,true);
 }finally{globalThis.AudioContext=previous;}
});

test('ambient signal is normalized and the volume curve reaches an audible maximum',async()=>{
 const {ambientSamples,ambientGain}=await import('../static/js/living-venues.mjs');
 let state=12345;const random=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
 const samples=ambientSamples(96000,random);
 const rms=Math.sqrt(samples.reduce((n,v)=>n+v*v,0)/samples.length);
 assert.ok(rms>.16 && rms<.20);assert.ok(Math.max(...samples)<1);
 assert.equal(ambientGain(0),0);assert.equal(ambientGain(100),.75);
 assert.ok(ambientGain(35)>.1);assert.ok(ambientGain(70)<ambientGain(100));
 assert.equal(ambientGain(150),.75);assert.equal(ambientGain(-1),0);
});
