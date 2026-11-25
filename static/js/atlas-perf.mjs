/** Opt-in local diagnostics. CPU submission timings are not GPU timings. */
export function summarize(values) {
  if (!values.length) return {median:0,p95:0,mean:0};
  const sorted = [...values].sort((a,b)=>a-b);
  return {median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)],mean:values.reduce((a,b)=>a+b,0)/values.length};
}

const BENCHMARK_KEY='tg-atlas-benchmark-v2';
export function getAtlasBenchmarkRun() {
  if(new URLSearchParams(location.search).get('atlasPerf')!=='1')return null;
  try{
    const run=JSON.parse(sessionStorage.getItem(BENCHMARK_KEY));
    return run?.version===2&&['overview','orbit','fullscreen','invasion'].includes(run.scenario)&&Number.isInteger(run.trial)&&run.trial>=1&&run.trial<=3&&Number.isInteger(run.seed)&&Array.isArray(run.completed)&&run.completed.length===run.trial-1?run:null;
  }catch{return null;}
}
export function restartAtlasBenchmark(run){sessionStorage.setItem(BENCHMARK_KEY,JSON.stringify(run));location.reload();}
export function finishAtlasBenchmark(){sessionStorage.removeItem(BENCHMARK_KEY);}

const COST_NAMES=['simulation','targetMovement','collision','projectiles','transforms','territory','countryside','dragon','render','labels'];

export function createAtlasDiagnostics(renderer, host) {
  if (new URLSearchParams(location.search).get('atlasPerf') !== '1') return null;
  const panel=document.createElement('section');panel.id='atlas-perf';panel.setAttribute('aria-label','Atlas performance diagnostics');
  panel.style.cssText='position:fixed;right:8px;top:90px;z-index:100;width:min(360px,95vw);max-height:45vh;overflow:auto;padding:12px;background:#10283d;color:#fff4da;font:14px/1.6 system-ui;border:1px solid #b8923a';
  panel.innerHTML='<strong>Atlas diagnostics · CPU timings, not GPU timings</strong><p data-perf-live>Warming up…</p><label>Scenario <select data-perf-scenario><option value="overview">Overview</option><option value="orbit">Orbit / zoom</option><option value="fullscreen">Fullscreen orbit</option><option value="invasion">Crowded invasion</option></select></label> <button type="button" data-perf-start>Measure 3 × 20 seconds</button><p data-perf-progress>Each sample starts with a 5-second warm-up. Keep the atlas visible.</p><pre data-perf-results style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';
  host.append(panel);
  const stop=document.createElement('button');stop.type='button';stop.dataset&&(stop.dataset.perfStop='');stop.textContent='Stop measurement';
  panel.append?.(stop);
  const live=panel.querySelector('[data-perf-live]'),progress=panel.querySelector('[data-perf-progress]'),results=panel.querySelector('[data-perf-results]');
  const scenario=panel.querySelector('[data-perf-scenario]'),start=panel.querySelector('[data-perf-start]');
  const pending=getAtlasBenchmarkRun();
  let previous=null,frameStart=0,bytes=0,instanceBytes=0,lastPaint=0,run=null,completed=pending?.completed||[],clock=0,handlers={},section=null,sectionStart=0,trialToken=0;
  let randomState=pending?.seed??20261125;
  let registeredScene;
  const instanceBuffers=new Set();
  const samples=[],costs=Object.fromEntries(COST_NAMES.map(name=>[name,0]));
  const gl=renderer.getContext(),original=gl.bufferSubData;
  gl.bufferSubData=function(target,offset,data,sourceOffset,length) {
    const uploaded=length === undefined ? data.byteLength-(sourceOffset||0)*(data.BYTES_PER_ELEMENT||1) : length*(data.BYTES_PER_ELEMENT||1);
    bytes+=uploaded;if(instanceBuffers.has(data.buffer))instanceBytes+=uploaded;
    return original.apply(this,arguments);
  };
  const reset=()=>{samples.length=0;};
  stop.addEventListener?.('click',()=>{trialToken++;run=null;start.disabled=false;handlers.finish?.();progress.textContent='Measurement stopped.';});
  async function beginTrial(next){
    const token=++trialToken;
    start.disabled=true;scenario.value=next.scenario;completed=next.completed;
    results.textContent=completed.length?JSON.stringify(completed,null,2):'';
    try {await handlers.prepare?.(next.scenario);} catch(error){progress.textContent=error.message;start.disabled=false;handlers.finish?.();return;}
    if(token!==trialToken)return;
    clock=0;run={...next,warmup:5,elapsed:0,startContext:null};reset();previous=null;
  }
  start.addEventListener('click',async()=>{
    const next={version:2,scenario:scenario.value,trial:1,completed:[],seed:20261125};
    if(handlers.restart){try{handlers.restart(next);}catch(error){progress.textContent=error.message;}}else await beginTrial(next);
  });
  function sceneCounts(){
    let sceneObjects=0,renderableMeshes=0;
    registeredScene?.traverse(()=>sceneObjects++);
    registeredScene?.traverseVisible(o=>{if(o.isMesh&&(!o.isInstancedMesh||o.count>0))renderableMeshes++;});
    return {sceneObjects,renderableMeshes};
  }
  function report(context) {
    const frame=summarize(samples.map(s=>s.interval));
    return {scenario:run.scenario,trial:run.trial,frames:samples.length,fps:+(1000/frame.mean).toFixed(2),medianMs:+frame.median.toFixed(2),p95Ms:+frame.p95.toFixed(2),
      simulationCpuMs:+summarize(samples.map(s=>s.simulation)).mean.toFixed(2),renderSubmitCpuMs:+summarize(samples.map(s=>s.render)).mean.toFixed(2),labelsCpuMs:+summarize(samples.map(s=>s.labels)).mean.toFixed(2),
      meanDrawCalls:Math.round(summarize(samples.map(s=>s.calls)).mean),meanTriangles:Math.round(summarize(samples.map(s=>s.triangles)).mean),meanUploadBytes:Math.round(summarize(samples.map(s=>s.bytes)).mean),meanInstanceUploadBytes:Math.round(summarize(samples.map(s=>s.instanceBytes)).mean),
      cpuMs:Object.fromEntries(COST_NAMES.map(name=>[name,+summarize(samples.map(s=>s[name])).mean.toFixed(3)])),
      viewport:[innerWidth,innerHeight],pixelRatio:renderer.getPixelRatio(),seed:run.seed,start:run.startContext,end:{...context,...sceneCounts()},...context};
  }
  return {
    panel,
    configure(callbacks){handlers=callbacks;if(pending)queueMicrotask(()=>beginTrial(pending));},
    random(){randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;return randomState/4294967296;},
    registerInstances(scene){registeredScene=scene;scene.traverse(o=>{if(o.isInstancedMesh){instanceBuffers.add(o.instanceMatrix.array.buffer);if(o.instanceColor)instanceBuffers.add(o.instanceColor.array.buffer);}});},
    get scenario(){return run?.scenario;},
    get elapsed(){return clock;},
    begin() {frameStart=performance.now();bytes=instanceBytes=0;for(const name of COST_NAMES)costs[name]=0;section=null;},
    section(name){const now=performance.now();if(section)costs[section]+=now-sectionStart;section=name;sectionStart=now;},
    endSection(){if(section)costs[section]+=performance.now()-sectionStart;section=null;},
    addCost(name,ms){costs[name]+=ms;},
    time(name,fn){const before=performance.now();const value=fn();costs[name]+=performance.now()-before;return value;},
    recordSimulation(ms){costs.simulation=ms;},
    resetClock(){previous=null;},
    end(info,context={}) {
      const now=performance.now(),interval=previous===null?0:frameStart-previous;previous=frameStart;
      if(run&&interval>0){
        clock+=interval/1000;
        if(run.warmup>0){run.warmup-=interval/1000;}
        else {run.startContext||={...context,...sceneCounts()};run.elapsed+=interval/1000;samples.push({interval,...costs,calls:info.calls,triangles:info.triangles,bytes,instanceBytes});}
        if(run.elapsed>=20){
          completed.push(report(context));results.textContent=JSON.stringify(completed,null,2);
          if(run.trial===3){run=null;start.disabled=false;progress.textContent='Completed 3 samples.';handlers.finish?.();}
          else if(handlers.restart){const next={version:2,scenario:run.scenario,trial:run.trial+1,completed,seed:run.seed};run=null;progress.textContent='Restarting a fresh campaign…';handlers.restart(next);}
          else{run.trial++;run.warmup=5;run.elapsed=0;run.startContext=null;reset();}
        }
        if(run)progress.textContent=`${run.scenario} · sample ${run.trial}/3 · ${run.warmup>0?'warming up '+Math.ceil(run.warmup)+'s':'measuring '+Math.floor(run.elapsed)+'/20s'}`;
      }
      if(now-lastPaint>1000){lastPaint=now;live.textContent=`${interval?Math.round(1000/interval):0} FPS · ${info.calls} draw calls · ${info.triangles} triangles · ${Math.round(instanceBytes/1024)} KiB instances / ${Math.round(bytes/1024)} KiB total uploaded/frame`;}
    },
    dispose(){trialToken++;run=null;gl.bufferSubData=original;panel.remove();instanceBuffers.clear();registeredScene=null;},
  };
}
