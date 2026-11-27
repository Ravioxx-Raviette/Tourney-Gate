/* Real WebGL/fullscreen regressions. Playwright is required; PYTHON and
   CHROMIUM_EXECUTABLE_PATH can select installed runtimes. Instance data is never used. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results/atlas-interactions');
let server,browser,baseURL;
const errors=[],timings=[];
before(async()=>{
  await fs.mkdir(output,{recursive:true});
  const script=`
import tempfile, shutil, sys, threading, json
from pathlib import Path
from app import create_app
from werkzeug.serving import make_server
with tempfile.TemporaryDirectory(prefix='atlas-interactions-') as directory:
    database=str(Path(directory)/'test.sqlite')
    shutil.copyfile('database/tourney-gate.sqlite',database)
    app=create_app({'TESTING':True,'SECRET_KEY':'atlas-browser-tests','DATABASE':database})
    server=make_server('127.0.0.1',0,app,threaded=True)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    print(json.dumps({'port':server.server_port}),flush=True)
    sys.stdin.read()
    server.shutdown()
`;
  server=spawn(process.env.PYTHON||'python',['-u','-c',script],{cwd:root,stdio:['pipe','pipe','pipe']});
  let stderr='';server.stderr.on('data',data=>stderr+=data);
  const ready=await new Promise((resolve,reject)=>{
    let stdout='';const timeout=setTimeout(()=>reject(Error('Preview startup timeout: '+stderr)),30000);
    server.on('error',error=>{clearTimeout(timeout);reject(error);});
    server.on('exit',code=>{clearTimeout(timeout);reject(Error(`Preview exited ${code}: ${stderr}`));});
    server.stdout.on('data',data=>{stdout+=data;if(stdout.includes('\n')){clearTimeout(timeout);resolve(JSON.parse(stdout.split('\n')[0]));}});
  });
  baseURL=`http://127.0.0.1:${ready.port}`;
  browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
});
after(async()=>{
  await browser?.close();
  if(server&&server.exitCode===null){const ended=once(server,'exit');server.stdin.end();await ended;}
  await fs.writeFile(path.join(output,'timings.json'),JSON.stringify(timings,null,2));
  assert.deepEqual(errors,[],'No uncaught browser exceptions');
});
async function openAtlas({cssFullscreen=false,prefs={cursor:'sword'},motion='no-preference'}={}) {
  const context=await browser.newContext({viewport:{width:1100,height:800},reducedMotion:motion});
  await context.addInitScript(({prefs,cssFullscreen})=>{
    localStorage.setItem('tg-a11y',JSON.stringify(prefs));
    if(cssFullscreen)Element.prototype.requestFullscreen=()=>Promise.reject(Error('Fullscreen blocked for fallback test'));
    window.__atlasQA={renders:0,failNextRender:false,longTasks:[],started:Infinity};
    for(const proto of [globalThis.WebGLRenderingContext?.prototype,globalThis.WebGL2RenderingContext?.prototype].filter(Boolean)) {
      const clear=proto.clear;
      proto.clear=function(...args){
        if(this.canvas.closest('#atlas-3d-stage')) {
          if(window.__atlasQA.failNextRender){window.__atlasQA.failNextRender=false;throw Error('Injected campaign render failure');}
          window.__atlasQA.renders++;
        }
        return clear.apply(this,args);
      };
    }
    new PerformanceObserver(list=>{
      for(const entry of list.getEntries())if(entry.startTime>=window.__atlasQA.started)window.__atlasQA.longTasks.push({start:entry.startTime,duration:entry.duration});
    }).observe({type:'longtask',buffered:true});
  },{prefs,cssFullscreen});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const consoleErrors=[];page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.goto(baseURL+'/');await page.bringToFront();
  await page.locator('#atlas-3d-mode-pill').click();
  await page.waitForFunction(()=>['3d','error'].includes(document.getElementById('atlas-map-stage').dataset.campaignState),null,{timeout:60000});
  assert.equal(await page.locator('#atlas-map-stage').getAttribute('data-campaign-state'),'3d');
  await page.locator('#atlas-map-stage').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{
    const stage=document.getElementById('atlas-map-stage');
    return stage.dataset.invasionPhase==='idle'||stage.dataset.campaignState==='error';
  });
  assert.equal(await page.locator('#atlas-map-stage').getAttribute('data-campaign-state'),'3d',consoleErrors.join('\n'));
  return page;
}
async function fullscreen(page,css=false) {
  await page.locator('#atlas-fullscreen-hud').click();
  await page.waitForFunction(()=>document.getElementById('atlas-map-stage').classList.contains('is-fullscreen'));
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),!css);
}
async function assertCursor(page,selector,expectShield=true) {
  const button=page.locator(selector);await button.hover();
  const state=await button.evaluate(node=>{
    const glint=document.querySelector('.cursor-glint'),svg=glint.querySelector('svg'),rect=svg?.getBoundingClientRect();
    const css=document.querySelector('.atlas-map-stage.is-css-fullscreen');
    const current=document.fullscreenElement||(css?.contains(node)?css:document.body);
    return {cursor:getComputedStyle(node).cursor,shield:document.documentElement.classList.contains('shield-shine'),
      hosted:current.contains(glint),visible:getComputedStyle(glint).visibility==='visible'&&rect?.width>0&&rect?.height>0,
      interactive:getComputedStyle(glint).pointerEvents};
  });
  assert.equal(state.hosted,true);assert.equal(state.interactive,'none');
  assert.ok(state.cursor!=='none'||(state.shield&&state.visible),JSON.stringify(state));
  if(expectShield){assert.equal(state.shield,true);assert.equal(state.visible,true);}
}

for(const css of [false,true])test(`cursor remains visible in ${css?'CSS fallback':'native'} fullscreen`,async()=>{
  const page=await openAtlas({cssFullscreen:css});
  try {
    await fullscreen(page,css);
    const weapons=await page.evaluate(()=>Object.keys(TG_A11Y.weapons));
    for(const cursor of ['system',...weapons]) {
      await page.evaluate(cursor=>document.querySelector(`input[name="armory"][value="${cursor}"]`).click(),cursor);
      for(const selector of ['#atlas-territory-hud','#atlas-invasion-hud','#atlas-fullscreen-hud','#atlas-3d-mode-pill']) await assertCursor(page,selector,cursor!=='system');
    }
    await page.evaluate(()=>document.querySelector('[data-a11y-flag="bigcursor"]').click());
    await assertCursor(page,'#atlas-territory-hud');
    await page.screenshot({path:path.join(output,`cursor-${css?'css':'native'}-fullscreen.png`)});
    if(css) await assertCursor(page,'.menu-toggle');
    // A modal above fullscreen must host its own visible cursor replacement.
    await page.evaluate(()=>{
      const dialog=document.createElement('dialog');dialog.id='cursor-test-dialog';dialog.innerHTML='<button>Modal control</button>';
      document.getElementById('atlas-map-stage').append(dialog);dialog.showModal();
    });
    await assertCursor(page,'#cursor-test-dialog button');
    assert.equal(await page.locator('.cursor-glint').evaluate(node=>node.parentElement.id),'cursor-test-dialog');
    await page.evaluate(()=>document.getElementById('cursor-test-dialog').remove());
    await assertCursor(page,'#atlas-territory-hud');
    await page.evaluate(()=>document.querySelector('[data-a11y-flag="notrail"]').click());
    await assertCursor(page,'#atlas-territory-hud',false);
    assert.equal(await page.locator('html.shield-shine').count(),0);
    await page.evaluate(()=>document.querySelector('[data-a11y-flag="motion"]').click());
    await assertCursor(page,'#atlas-territory-hud',false);
    await page.locator('#atlas-fullscreen-hud').click();
    await page.waitForFunction(()=>!document.getElementById('atlas-map-stage').classList.contains('is-fullscreen'));
    assert.equal(await page.locator('.cursor-glint').evaluate(node=>node.parentElement===document.body),true);
  } finally {await page.context().close();}
});

test('rapid clicks complete three invasion cycles, keep rendering, and discard 2D pending input',async()=>{
  const page=await openAtlas({prefs:{notrail:true}});
  try {
    await fullscreen(page);
    await page.evaluate(()=>{__atlasQA.started=performance.now();__atlasQA.longTasks=[];});
    const phases=[['warning',0],['active',1],['active',2],['active',3],['reign',0],['heroes',0],['rebuild',0],['peace_era',0],['aftermath',0]];
    for(let cycle=0;cycle<3;cycle++)for(const [index,[phase,wave]] of phases.entries()) {
      const start=performance.now();
      const accepted=await page.evaluate(({index,cycle})=>{
        let first;
        if(cycle===0) first=index===0?TG_TRIGGER_UNDEAD():TG_SKIP_WAVE();
        else if(cycle===1) {
          document.getElementById(index===0?'atlas-invasion-hud':'atlas-invasion-skip').click();
          first=document.getElementById('atlas-invasion-hud').disabled;
          for(let i=0;i<20;i++)document.getElementById(i%2?'atlas-invasion-hud':'atlas-invasion-skip').click();
        } else {
          document.getElementById('atlas-map-stage').focus();
          const keydown=key=>window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
          keydown(index===0?'u':'n');first=document.getElementById('atlas-invasion-hud').disabled;
          for(let i=0;i<20;i++)keydown(i%2?'u':'n');
        }
        const rejected=Array.from({length:20},(_,i)=>i%2?TG_TRIGGER_UNDEAD():TG_SKIP_WAVE());
        return {first,rejected};
      },{index,cycle});
      assert.equal(accepted.first,true);assert.ok(accepted.rejected.every(value=>value===false));
      await page.waitForFunction(({phase,wave})=>{
        const stage=document.getElementById('atlas-map-stage');
        return stage.dataset.campaignState==='error'||(stage.dataset.invasionPhase===phase&&stage.dataset.invasionWave===String(wave)&&!document.getElementById('atlas-invasion-hud').disabled);
      },{phase,wave},{timeout:30000});
      assert.equal(await page.locator('#atlas-map-stage').getAttribute('data-campaign-state'),'3d');
      assert.equal(await page.locator('#atlas-invasion-banner').evaluate(node=>node.classList.contains('is-boss-wave')),phase==='active'&&wave>=3);
      timings.push({cycle,phase,wave,elapsedMs:Math.round(performance.now()-start)});
      const before=await page.evaluate(()=>__atlasQA.renders);
      await page.waitForFunction(before=>__atlasQA.renders>before,before);
    }
    const phase=await page.locator('#atlas-map-stage').getAttribute('data-invasion-phase');
    await page.evaluate(()=>{TG_TRIGGER_UNDEAD();document.getElementById('atlas-3d-mode-pill').click();});
    await page.waitForFunction(()=>document.getElementById('atlas-map-stage').dataset.campaignState==='2d');
    assert.equal(await page.locator('#atlas-invasion-hud').getAttribute('aria-busy'),null);
    await page.locator('#atlas-3d-mode-pill').click();
    await page.waitForFunction(()=>document.getElementById('atlas-map-stage').dataset.campaignState==='3d');
    assert.equal(await page.locator('#atlas-map-stage').getAttribute('data-invasion-phase'),phase);
    const tasks=await page.evaluate(()=>__atlasQA.longTasks);
    timings.push({longTaskCount:tasks.length,maxLongTaskMs:Math.round(Math.max(0,...tasks.map(task=>task.duration)))});
    await page.screenshot({path:path.join(output,'completed-invasion.png')});
  } finally {await page.context().close();}
});

test('reduced motion permits explicit invasion steps and context loss clears pending commands',async()=>{
  const page=await openAtlas({prefs:{motion:true},motion:'reduce'});
  try {
    assert.equal(await page.evaluate(()=>TG_TRIGGER_UNDEAD()),true);
    await page.waitForFunction(()=>document.getElementById('atlas-map-stage').dataset.invasionPhase==='warning'&&!document.getElementById('atlas-invasion-hud').disabled);
    assert.equal(await page.evaluate(()=>TG_SKIP_WAVE()),true);
    await page.waitForFunction(()=>document.getElementById('atlas-map-stage').dataset.invasionWave==='1'&&!document.getElementById('atlas-invasion-hud').disabled);
    await page.evaluate(()=>{TG_SKIP_WAVE();document.querySelector('#atlas-3d-stage canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();});
    await page.waitForFunction(()=>document.getElementById('atlas-map-stage').dataset.campaignState==='error');
    assert.equal(await page.locator('#atlas-invasion-hud').getAttribute('aria-busy'),null);
    await page.locator('#atlas-3d-mode-pill').click();
    await page.waitForFunction(()=>document.getElementById('atlas-map-stage').dataset.campaignState==='3d',null,{timeout:60000});
  } finally {await page.context().close();}
});

test('render failure recovers through existing Retry without a page reload',async()=>{
  const page=await openAtlas();
  try {
    await page.evaluate(()=>{window.__documentIdentity=Math.random();TG_TRIGGER_UNDEAD();__atlasQA.failNextRender=true;});
    const identity=await page.evaluate(()=>__documentIdentity);
    await page.waitForFunction(()=>document.getElementById('atlas-map-stage').dataset.campaignState==='error');
    assert.equal(await page.locator('#atlas-invasion-hud').getAttribute('aria-busy'),null);
    assert.equal(await page.locator('#atlas-3d-stage canvas').count(),0);
    await assertCursor(page,'#atlas-3d-mode-pill',false);
    await page.locator('#atlas-3d-mode-pill').click();
    await page.waitForFunction(()=>document.getElementById('atlas-map-stage').dataset.campaignState==='3d',null,{timeout:60000});
    assert.equal(await page.evaluate(()=>__documentIdentity),identity);
    const before=await page.evaluate(()=>__atlasQA.renders);await page.waitForFunction(before=>__atlasQA.renders>before,before);
  } finally {await page.context().close();}
});
