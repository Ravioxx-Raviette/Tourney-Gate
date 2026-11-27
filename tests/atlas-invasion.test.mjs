import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../static/vendor/three/three.module.min.js';
import {createCampaignCommands} from '../static/js/atlas-runtime.mjs';

// Exercise real armies/territory without WebGL. Fresh module instances and a
// fixed random source avoid the old parity harness's cache/identity digests.
let paints=0, instance=0;
const gradient={addColorStop(){}};
const context=new Proxy({measureText:()=>({width:100}),clearRect(){paints++;},createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},
  {get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>(target[key]=value,true)});
globalThis.document={readyState:'loading',documentElement:{classList:{contains:()=>false}},addEventListener(){},createElement:()=>({width:256,height:256,getContext:()=>context})};
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.Path2D=class {};
const url=new URL('../static/js/atlas3d.js',import.meta.url);
async function fixture(withArmies=true) {
  let source=await fs.readFile(url,'utf8');
  source=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,quote,path)=>`from ${quote}${new URL(path,url).href}${quote}`);
  source+='\nexport {buildLivingArmies,buildTerritorySystem};\n//# sourceURL=invasion-fixture-'+(++instance)+'.mjs';
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const root=new THREE.Group(),territory=module.buildTerritorySystem(root);
  const armies=withArmies?module.buildLivingArmies(root,territory,null,()=>.3141592653589793):null;
  return {territory,armies,dispose(){
    const resources=new Set();
    root.traverse(node=>{
      if(node.geometry)resources.add(node.geometry);
      for(const material of (Array.isArray(node.material)?node.material:node.material?[node.material]:[])) {
        resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);
      }
    });
    resources.forEach(resource=>resource.dispose());root.clear();
  }};
}

for(const reduced of [false,true])test(`three rapid-click invasion cycles retain valid state (${reduced?'reduced':'normal'} motion)`,async t=>{
  const f=await fixture(),{armies,territory}=f;
  const unitCount=armies.units.length,timings=[];
  let time=0;
  const commands=createCampaignCommands({execute(command){
    const start=performance.now();
    if(command==='trigger')armies.triggerInvasion();else armies.skipWave();
    timings.push(performance.now()-start);
  }});
  const frame=()=>{
    commands.beginFrame();
    const dt=reduced?0:1/60;time+=dt;
    armies.update(dt,time);territory.update(dt,time,armies.units,armies.isPeaceTreaty(),armies.getInvasionState());
    territory.flushTexture(time);commands.finishFrame();
  };
  try {
    for(let cycle=0;cycle<3;cycle++) {
      for(const [index,[phase,wave]] of [['warning',0],['active',1],['active',2],['active',3],['reign',0],['heroes',0],['rebuild',0],['peace_era',0],['aftermath',0]].entries()) {
        assert.equal(commands.request(index===0?'trigger':'skip'),true);
        for(let i=0;i<20;i++)assert.equal(commands.request('skip'),false);
        frame();assert.equal(commands.busy,true);frame();assert.equal(commands.busy,false);
        const state=armies.getInvasionState();
        assert.equal(state.phase,phase);assert.equal(state.wave,wave);
        assert.ok(Number.isFinite(state.timer)&&state.timer>=0);
        assert.equal(armies.units.length,unitCount);
        assert.ok(armies.units.every(unit=>[unit.x,unit.z,unit.hp].every(Number.isFinite)));
        assert.ok(territory.getShares().every(Number.isFinite));
        if(phase==='reign')assert.equal(armies.units.filter(unit=>unit.alive&&unit.team<4&&unit.type!=='hero').length,0);
        if(phase==='heroes')assert.equal(armies.units.filter(unit=>unit.alive&&unit.type==='hero').length,4);
        if(phase==='peace_era')assert.ok(armies.units.some(unit=>unit.alive&&unit.team<4&&unit.type!=='hero'));
      }
    }
    // The normal aftermath timer still returns to idle without another request.
    armies.getInvasionState().timer=0;armies.update(0,time);
    assert.equal(armies.getInvasionState().phase,'idle');
    t.diagnostic(JSON.stringify({accepted:timings.length,rejected:timings.length*20,maxTransitionMs:+Math.max(...timings).toFixed(2)}));
  } finally {commands.dispose();f.dispose();}
});

test('bulk conquest and reclamation coalesce into one territory texture paint',async()=>{
  const f=await fixture(false);
  try {
    f.territory.setEnabled(true);
    const before=paints;
    f.territory.forceUndeadConquest95();f.territory.convertUndeadToNeutral();f.territory.restoreUndeadToHomelands();
    assert.equal(paints,before);
    f.territory.flushTexture(0);assert.equal(paints,before+1);
    f.territory.flushTexture(0);assert.equal(paints,before+1);
  } finally {f.dispose();}
});

test('live unit size presets scale living and undead armies while keeping unique units intact',async()=>{
  const f=await fixture(),{armies}=f;
  const countLiving=()=>armies.units.filter(u=>u.alive&&u.team<4&&u.type!=='hero').length;
  const countUndead=()=>armies.units.filter(u=>u.alive&&u.team===4&&u.type!=='skarbrand').length;
  try {
    assert.equal(armies.getUnitSize(),'medium');
    const initialMedium=countLiving();
    const livingCounts={};
    for(const preset of ['ultra','high','medium','low']) {
      armies.setUnitSize(preset);armies.update(1/60,0.016);
      assert.equal(armies.getUnitSize(),preset);
      livingCounts[preset]=countLiving();
      assert.equal(armies.units.filter(u=>u.alive&&u.type==='king').length,4);
      assert.equal(armies.units.filter(u=>u.alive&&u.type==='mage').length,4);
      assert.equal(armies.units.filter(u=>u.alive&&u.type==='siege').length,4);
    }
    assert.ok(livingCounts.low<livingCounts.medium&&livingCounts.medium<livingCounts.high&&livingCounts.high<livingCounts.ultra);
    assert.equal(livingCounts.medium,initialMedium);

    // Undead waves scale cleanly too, and switching from Low -> Ultra during Wave 2 deploys full horde.
    armies.setUnitSize('low');
    armies.triggerInvasion();armies.skipWave();armies.skipWave();armies.update(1/60,0.05);
    const lowW2=countUndead();
    armies.setUnitSize('ultra');armies.update(1/60,0.07);
    const ultraW2=countUndead();
    assert.ok(lowW2>0&&lowW2<ultraW2&&ultraW2<=840);
    assert.equal(armies.getInvasionState().wave2UndeadTotal,840);
  } finally {f.dispose();}
});
