const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../static/js/motion.js'),'utf8');

// Exercise the real controller with controllable animation completion and time.
// No browser or additional packages are required for these interruption checks.
function fixture({reduced=false,arrival=null,throwOn=null,storageBlocked=false}={}) {
  let now=10000, timerId=0;
  const timers=new Map(), navigations=[], animations=[], storage=new Map();
  if(arrival!==null)storage.set('tg-transition',typeof arrival==='string'?arrival:JSON.stringify(arrival));
  function emitter(base={}) {
    const listeners=new Map();
    return Object.assign(base,{
      addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
      fire(name,event={}){for(const fn of listeners.get(name)||[])fn(event);}
    });
  }
  function node(name){
    const classes=new Set();
    return {name,style:{},classList:{add(...names){names.forEach(x=>classes.add(x));},remove(...names){names.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);},toggle(x,on){if(on)classes.add(x);else classes.delete(x);}},
      removeAttribute(name){if(name==='style')this.style={};},
      animate(frames,options){
        if(name===throwOn)throw new Error('Animation API failed');
        let resolve,reject,settled=false;
        const animation={name,frames,options,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish(){if(!settled){settled=true;resolve();}},cancel(){if(!settled){settled=true;reject(new Error('Animation cancelled'));}}};
        animations.push(animation);return animation;
      }
    };
  }
  const nodes=Object.fromEntries(['.page-transition','.leaf-left','.leaf-right','.transition-mark','#main','.scroll-progress>span','.site-header'].map(x=>[x,node(x)]));
  const document=emitter({hidden:false,documentElement:{scrollHeight:4000,classList:node('root').classList},querySelector:selector=>nodes[selector]||null,querySelectorAll:()=>[]});
  const window=emitter({TG:{}}), preference=emitter({matches:reduced});
  const location={origin:'http://localhost',href:'http://localhost/',pathname:'/',search:'',assign:url=>navigations.push(url)};
  const context={window,document,location,URL,Promise,Date:{now:()=>now},innerHeight:1000,scrollY:0,
    matchMedia:query=>query.includes('reduced-motion')?preference:{matches:false},
    sessionStorage:{getItem:key=>{if(storageBlocked)throw Error('Storage blocked');return storage.get(key)||null;},setItem:(key,value)=>{if(storageBlocked)throw Error('Storage blocked');storage.set(key,value);},removeItem:key=>{if(storageBlocked)throw Error('Storage blocked');storage.delete(key);}},
    setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
    addEventListener:window.addEventListener,requestAnimationFrame:()=>1};
  vm.runInNewContext(source,context);
  return {window,document,preference,storage,navigations,animations,overlay:nodes['.page-transition'],
    finish(){[...animations].forEach(animation=>animation.finish());},
    advance(ms){const end=now+ms;while(true){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;}
  };
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const fresh={kind:'faire-gate',path:'/',time:10000};

test('direct loading and invalid arrival records never cover the document',()=>{
  for(const arrival of [null,'invalid json',{...fresh,time:1},{...fresh,time:11000},{...fresh,path:'/other'},{...fresh,kind:'old-gate'}]){
    const f=fixture({arrival});assert.equal(f.overlay.classList.contains('is-active'),false);assert.equal(f.animations.length,0);assert.equal(f.storage.size,0);
  }
});

test('rapid navigation commits only the first destination',async()=>{
  const f=fixture();const first=f.window.TG.navigate('/events');const second=f.window.TG.navigate('/bookings');
  f.finish();await Promise.all([first,second]);
  assert.deepEqual(f.navigations,['http://localhost/events']);assert.equal(JSON.parse(f.storage.get('tg-transition')).path,'/events');
});

test('a stalled animation uses the fallback exactly once',async()=>{
  const f=fixture();const pending=f.window.TG.navigate('/events');f.advance(500);
  assert.deepEqual(f.navigations,['http://localhost/events']);f.finish();await pending;assert.equal(f.navigations.length,1);
});

test('cancelled arrivals uncover the document',async()=>{
  const f=fixture({arrival:fresh});assert.equal(f.overlay.classList.contains('is-active'),true);
  f.animations.forEach(animation=>animation.cancel());await flush();assert.equal(f.overlay.classList.contains('is-active'),false);
});

test('new navigation during arrival survives cleanup of the old reveal',async()=>{
  const f=fixture({arrival:fresh});const pending=f.window.TG.navigate('/events');await flush();
  assert.equal(f.overlay.classList.contains('is-leaving'),true);f.finish();await pending;assert.equal(f.navigations.length,1);
});

test('reduced motion navigates immediately without covering content',async()=>{
  const f=fixture({reduced:true,arrival:fresh});await f.window.TG.navigate('/events');
  assert.equal(f.animations.length,0);assert.equal(f.overlay.classList.contains('is-active'),false);assert.equal(f.storage.size,0);assert.equal(f.navigations.length,1);
});

test('enabling reduced motion during departure commits once and clears the gate',async()=>{
  const f=fixture();const pending=f.window.TG.navigate('/events');f.preference.matches=true;f.preference.fire('change');await pending;f.advance(3000);
  assert.equal(f.overlay.classList.contains('is-active'),false);assert.equal(f.storage.size,0);assert.equal(f.navigations.length,1);
});

test('Escape cancels an uncommitted departure and permits another link',async()=>{
  const f=fixture();const first=f.window.TG.navigate('/events');f.document.fire('keydown',{key:'Escape'});await first;f.advance(3000);
  assert.equal(f.navigations.length,0);assert.equal(f.overlay.classList.contains('is-active'),false);
  const next=f.window.TG.navigate('/bookings');f.finish();await next;assert.deepEqual(f.navigations,['http://localhost/bookings']);
});

test('pagehide and restored history clear pending gate work',async()=>{
  const f=fixture();const pending=f.window.TG.navigate('/events');f.window.fire('pagehide');await pending;f.advance(3000);f.window.fire('pageshow',{persisted:true});
  assert.equal(f.overlay.classList.contains('is-active'),false);assert.equal(f.navigations.length,0);assert.equal(f.storage.size,0);
});

test('a stopped page load uncovers the old document and accepts another destination',async()=>{
  const f=fixture();const first=f.window.TG.navigate('/events');f.finish();await first;f.advance(1500);
  assert.equal(f.overlay.classList.contains('is-active'),false);assert.equal(f.storage.size,0);
  const next=f.window.TG.navigate('/bookings');f.finish();await next;assert.equal(f.navigations.length,2);
});

test('blocked storage still allows native navigation',async()=>{
  const f=fixture({storageBlocked:true});const pending=f.window.TG.navigate('/events');f.finish();await pending;assert.equal(f.navigations.length,1);
});

test('an animation API failure still navigates and cleans partially started effects',async()=>{
  const f=fixture({throwOn:'.transition-mark'});await f.window.TG.navigate('/events');assert.equal(f.navigations.length,1);
  f.advance(1500);await flush();assert.equal(f.overlay.classList.contains('is-active'),false);
});

test('arrival watchdog clears an effect that never finishes',async()=>{
  const f=fixture({arrival:fresh});f.advance(800);await flush();assert.equal(f.overlay.classList.contains('is-active'),false);
});


test('native links, modified clicks, anchors, and atlas-handled clicks bypass gates',()=>{
  const cases=[
    {href:'https://example.test/events'}, {href:'http://localhost/#atlas'},
    {href:'http://localhost/events',ctrlKey:true}, {href:'http://localhost/events',metaKey:true},
    {href:'http://localhost/events',shiftKey:true}, {href:'http://localhost/events',altKey:true},
    {href:'http://localhost/events',button:1}, {href:'http://localhost/events',download:true},
    {href:'http://localhost/events',newTab:true}, {href:'http://localhost/?venue=1#atlas',defaultPrevented:true}
  ];
  for(const sample of cases){
    const f=fixture();let prevented=false;
    const anchor={href:sample.href,target:sample.newTab?'_blank':'',hasAttribute:name=>name==='download'&&sample.download};
    f.document.fire('click',{button:0,...sample,target:{closest:()=>anchor},preventDefault(){prevented=true;}});
    assert.equal(prevented,false);assert.equal(f.animations.length,0);assert.equal(f.navigations.length,0);
  }
});

test('an ordinary internal link uses the shared navigation hook',async()=>{
  const f=fixture();let prevented=false;
  const anchor={href:'http://localhost/events',target:'',hasAttribute:()=>false};
  f.document.fire('click',{button:0,target:{closest:()=>anchor},preventDefault(){prevented=true;}});
  assert.equal(prevented,true);f.finish();await flush();assert.deepEqual(f.navigations,['http://localhost/events']);
});
