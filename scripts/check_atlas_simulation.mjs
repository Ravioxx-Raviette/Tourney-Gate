// Read-only CPU parity check; no WebGL, server, database, or production exports.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import * as THREE from '../static/vendor/three/three.module.min.js';

const repo=fileURLToPath(new URL('../',import.meta.url));
const sourceURL=new URL('../static/js/atlas3d.js',import.meta.url);
const baseline=process.argv[2]||'0f5da1a';
const gradient={addColorStop(){}};
const context=new Proxy({measureText:()=>({width:100}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(t,k)=>k in t?t[k]:()=>{},set:(t,k,v)=>(t[k]=v,true)});
globalThis.document={readyState:'loading',documentElement:{classList:{contains:()=>false}},addEventListener(){},createElement:()=>({width:256,height:256,getContext:()=>context})};
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.Path2D=class {};

async function run(source){
  source=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,quote,path)=>`from ${quote}${new URL(path,sourceURL).href}${quote}`);
  source+='\nexport {buildLivingArmies as parityArmies,buildTerritorySystem as parityTerritory};';
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const root=new THREE.Group(),territory=module.parityTerritory(root),armies=module.parityArmies(root,territory);
  let t=0;
  const advance=()=>{for(let i=0;i<30;i++){t+=1/60;armies.update(1/60,t);territory.update(1/60,t,armies.units,armies.isPeaceTreaty(),armies.getInvasionState());}};
  const snapshot=()=>armies.units.map(u=>[u.type,u.team,u.alive,u.x,u.z,u.hp,u.heading]);
  advance();const idle=snapshot();
  armies.triggerInvasion();for(let i=0;i<3;i++)armies.skipWave();
  advance();const invasion=snapshot();
  return {idle,invasion,phase:armies.getInvasionState().phase};
}
const before=await run(execFileSync('git',['show',`${baseline}:static/js/atlas3d.js`],{cwd:repo,encoding:'utf8'}));
const after=await run(fs.readFileSync(sourceURL,'utf8'));
assert.deepEqual(after,before,'Simulation state changed at a fixed timestep');
console.log(JSON.stringify({same:true,baseline,baselineIdleUnits:before.idle.length,optimizedIdleUnits:after.idle.length,baselineInvasionUnits:before.invasion.length,optimizedInvasionUnits:after.invasion.length,phase:after.phase},null,2));
