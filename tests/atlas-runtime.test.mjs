import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignLoader, createFrameLoop, createCampaignCommands, effectiveMotion, campaignShortcut} from '../static/js/atlas-runtime.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
function viewer() { return {modes:[],pauses:0,resumes:0,disposals:0,setMode(mode){this.modes.push(mode);},pause(){this.pauses++;},resume(){this.resumes++;},dispose(){this.disposals++;}}; }

test('campaign loads on request, shares pending work, and mounts only once', async () => {
  const pending=deferred(), v=viewer(); let loads=0,mounts=0;
  const c=createCampaignLoader({load(){loads++;return pending.promise;}});
  assert.equal(loads,0);
  const a=c.set3D(true), b=c.set3D(true);
  assert.equal(loads,1);
  pending.resolve({mountAtlas3D(){mounts++;return v;}}); await Promise.all([a,b]);
  await c.set3D(false); await c.set3D(true);
  assert.equal(mounts,1); assert.equal(loads,1); assert.equal(v.modes.at(-1),'3d');
  c.dispose();c.dispose();assert.equal(v.disposals,1);
});

test('cancelling an import prevents mounting and a later request reuses the module', async () => {
  const pending=deferred();let mounts=0,loads=0;
  const c=createCampaignLoader({load(){loads++;return pending.promise;}});
  const request=c.set3D(true);await c.set3D(false);
  pending.resolve({mountAtlas3D(){mounts++;return viewer();}});await request;
  assert.equal(mounts,0);assert.equal(c.active,false);
  await c.set3D(true);assert.equal(mounts,1);assert.equal(loads,1);
});

test('late asynchronous mounts cannot activate after cancellation or disposal', async () => {
  for(const dispose of [false,true]) {
    const mounted=deferred(),v=viewer();
    const c=createCampaignLoader({load:async()=>({mountAtlas3D:()=>mounted.promise})});
    const request=c.set3D(true);await Promise.resolve();await Promise.resolve();
    if(dispose)c.dispose();else await c.set3D(false);
    mounted.resolve(v);await request;
    if(dispose)assert.equal(v.disposals,1);
    else {assert.equal(v.modes.at(-1),'2d');assert.equal(v.resumes,0);}
  }
});

test('failed import and failed mount are recoverable without a page reload', async () => {
  let loads=0,mounts=0;const states=[],errors=[];
  const c=createCampaignLoader({load:async()=>{if(++loads===1)throw Error('offline');return {mountAtlas3D(){if(++mounts===1)throw Error('WebGL');return viewer();}};},onState:s=>states.push(s),onError:e=>errors.push(e.message)});
  await c.set3D(true);assert.equal(c.active,false);
  await c.set3D(true);assert.equal(c.active,false);
  await c.set3D(true);assert.equal(c.active,true);
  assert.deepEqual(errors,['offline','WebGL']);assert.equal(states.at(-1),'3d');assert.equal(loads,2);
});

test('cached-history and hidden-page pause/resume preserve the same campaign', async () => {
  const v=viewer();let mounts=0;
  const c=createCampaignLoader({load:async()=>({mountAtlas3D(){mounts++;return v;}})});
  await c.set3D(true);const before=v.resumes;
  c.pause();assert.equal(c.active,true);c.resume();assert.equal(v.resumes,before+1);assert.equal(mounts,1);
  c.pause();await c.set3D(false);c.resume();assert.equal(v.modes.at(-1),'2d');assert.equal(v.resumes,before+1);
});

test('context loss disposes its instance and allows a clean remount', async () => {
  const instances=[];let lose;
  const c=createCampaignLoader({load:async()=>({mountAtlas3D({onError}){lose=onError;const v=viewer();instances.push(v);return v;}})});
  await c.set3D(true);lose(Error('context lost'));assert.equal(c.active,false);assert.equal(instances[0].disposals,1);
  await c.set3D(true);assert.equal(instances.length,2);assert.equal(instances[1].resumes,1);
});

test('frame loop stops off-screen, never duplicates frames, and excludes background time', () => {
  let seq=0,visible=true;const jobs=new Map(),deltas=[];
  const loop=createFrameLoop({active:()=>visible,frame:dt=>deltas.push(dt),request:fn=>{jobs.set(++seq,fn);return seq;},cancel:id=>jobs.delete(id)});
  const step=t=>{const [id,fn]=jobs.entries().next().value;jobs.delete(id);fn(t);};
  loop.resume();loop.resume();assert.equal(jobs.size,1);step(1000);step(1016);
  assert.deepEqual(deltas,[0,.016]);visible=false;step(5000);assert.equal(jobs.size,0);
  visible=true;loop.resume();step(200000);assert.equal(deltas.at(-1),0);
  loop.pause();assert.equal(jobs.size,0);loop.dispose();loop.resume();assert.equal(jobs.size,0);
});

test('invasion command bursts accept one step and paint feedback before executing', () => {
  const executed=[],busy=[];
  const commands=createCampaignCommands({execute:value=>executed.push(value),onBusy:value=>busy.push(value)});
  assert.equal(commands.request('skip'),true);
  for(let i=0;i<20;i++)assert.equal(commands.request(i%2?'trigger':'skip'),false);
  assert.equal(commands.beginFrame(),false);commands.finishFrame();
  assert.deepEqual(executed,[]);assert.equal(commands.busy,true);
  assert.equal(commands.beginFrame(),true);
  assert.deepEqual(executed,['skip']);assert.equal(commands.request('skip'),false);
  commands.finishFrame();assert.equal(commands.busy,false);
  assert.deepEqual(busy,[true,false]);assert.equal(commands.request('trigger'),true);
});

test('mode changes, pauses and disposal discard pending invasion input', () => {
  for(const stage of ['queued','ready','executing']) {
    let steps=0;
    const commands=createCampaignCommands({execute:()=>steps++});
    commands.request('skip');
    if(stage!=='queued')commands.beginFrame();
    if(stage==='executing')commands.beginFrame();
    commands.cancel();assert.equal(commands.busy,false);assert.equal(commands.beginFrame(),false);
    assert.equal(steps,stage==='executing'?1:0);
    commands.request('skip');commands.dispose();assert.equal(commands.request('skip'),false);
    assert.equal(commands.beginFrame(),false);assert.equal(commands.busy,false);
  }
});

test('failed invasion transitions clear busy state and reach recoverable frame errors', () => {
  let callback,errors=[];
  const commands=createCampaignCommands({execute:()=>{throw Error('transition failed');}});
  const loop=createFrameLoop({request:fn=>(callback=fn,1),cancel:()=>{},frame:()=>commands.beginFrame(),onError:error=>errors.push(error.message)});
  commands.request('skip');loop.resume();callback(1000);callback(1016);
  assert.deepEqual(errors,['transition failed']);assert.equal(commands.busy,false);
  assert.equal(commands.request('skip'),true);commands.dispose();loop.dispose();
});

test('frame failure stops scheduling and the loader disposes then retries a clean viewer', async () => {
  let tick,fail,mounts=0,frames=0,scheduled=0,disposed=0;
  const loader=createCampaignLoader({load:async()=>({mountAtlas3D({onError}) {
    mounts++;fail=mounts===1;
    const loop=createFrameLoop({request:fn=>(tick=fn,++scheduled),cancel:()=>{},frame:()=>{frames++;if(fail)throw Error('render failed');},onError});
    return {setMode(){},pause(){loop.pause();},resume(){loop.resume();},dispose(){disposed++;loop.dispose();}};
  }})});
  await loader.set3D(true);tick(0);
  assert.equal(loader.active,false);assert.equal(disposed,1);assert.equal(scheduled,1);
  await loader.set3D(true);tick(1000);
  assert.equal(loader.active,true);assert.equal(mounts,2);assert.equal(frames,2);assert.equal(scheduled,3);
  loader.dispose();
});

test('motion preference combines both switches, updates live, and releases subscriptions', () => {
  const media=new EventTarget(),events=new EventTarget();media.matches=false;let site=false,notifications=0;
  const m=effectiveMotion({root:{classList:{contains:()=>site}},media,events});
  const stop=m.subscribe(()=>notifications++);assert.equal(m.matches,false);
  site=true;events.dispatchEvent(new Event('tg-a11y-change'));assert.equal(m.matches,true);
  site=false;media.matches=true;media.dispatchEvent(new Event('change'));assert.equal(m.matches,true);
  stop();m.dispose();events.dispatchEvent(new Event('tg-a11y-change'));assert.equal(notifications,2);
});

test('shortcuts require map focus or fullscreen and leave typing and modifiers untouched', () => {
  const state={focused:true,fullscreen:false,strategic:false};
  const event=(key,extra={})=>({key,target:{closest:()=>null},...extra});
  assert.equal(campaignShortcut(event('u'),state),'u');
  assert.equal(campaignShortcut(event('u'),{...state,focused:false}),null);
  assert.equal(campaignShortcut(event('u',{ctrlKey:true}),state),null);
  assert.equal(campaignShortcut(event('u',{repeat:true}),state),null);
  assert.equal(campaignShortcut(event('u',{target:{closest:()=>({})}}),state),null);
  assert.equal(campaignShortcut(event('w'),state),null);
  assert.equal(campaignShortcut(event('w'),{...state,fullscreen:true}),'w');
  assert.equal(campaignShortcut(event('Escape'),{...state,fullscreen:true}),'escape');
  assert.equal(campaignShortcut(event('u'),{...state,strategic:true}),null);
});

test('venue startup is idempotent even if its entrypoint is invoked twice', async () => {
  const before={document:globalThis.document,window:globalThis.window,matchMedia:globalThis.matchMedia};
  let mounts=0,handlers=0;
  globalThis.document={readyState:'loading',documentElement:{dataset:{}},getElementById:()=>null,
    querySelectorAll(){mounts++;return [];},addEventListener(type){if(type==='click')handlers++;}};
  globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  try {
    const {bootVenueViewers}=await import('../static/js/venue3d.js');
    bootVenueViewers();bootVenueViewers();
    assert.equal(mounts,1);assert.equal(handlers,1);
  } finally { Object.assign(globalThis,before); }
});

test('real campaign initialization releases its mount flag when WebGL is unavailable', async () => {
  const previous={document:globalThis.document,window:globalThis.window};
  let cleared=0;
  const stage={dataset:{},replaceChildren(){cleared++;}};
  const wrapper={classList:{remove(){}},style:{}};
  const plane={inert:true};
  globalThis.window={TG:{atlas:{set3DActive(){}}}};
  globalThis.document={getElementById:id=>({'atlas-map-stage':wrapper,'atlas-3d-stage':stage,'atlas-map-plane':plane}[id]),
    createElementNS(){throw Error('No WebGL canvas');}};
  try {
    const {mountAtlas3D}=await import('../static/js/atlas3d.js');
    for(let attempt=0;attempt<2;attempt++)assert.throws(()=>mountAtlas3D(),/WebGL is unavailable/);
    assert.equal(stage.dataset.atlas3dMounted,undefined);assert.equal(cleared,2);assert.equal(plane.inert,false);
  } finally {Object.assign(globalThis,previous);}
});
