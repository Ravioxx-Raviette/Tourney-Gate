// Read-only CPU parity check; no WebGL, server, database, or production exports.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../static/vendor/three/three.module.min.js';

const repo=fileURLToPath(new URL('../',import.meta.url));
const sourceURL=new URL('../static/js/atlas3d.js',import.meta.url);
const baseline=process.argv[2]||'9345fcc';
const gradient={addColorStop(){}};
const context=new Proxy({measureText:()=>({width:100}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(t,k)=>k in t?t[k]:()=>{},set:(t,k,v)=>(t[k]=v,true)});
globalThis.document={readyState:'loading',documentElement:{classList:{contains:()=>false}},addEventListener(){},createElement:()=>({width:256,height:256,getContext:()=>context})};
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.Path2D=class {};

async function run(source){
  source=source.replace(/\r\n/g,'\n');
  source=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,quote,path)=>`from ${quote}${new URL(path,sourceURL).href}${quote}`);
  source=source.replace('    armyGroup,','    __inspect:()=>({structures,projectiles,effects,event:UNDEAD_EVENT,tide:REALM_TIDE,random:aSeed,facBuildCd,aliveByTeam,totalByTeam,effTeamPower,gridBuckets:(grid.active||Array.from(grid.values())).map(bucket=>bucket.map(u=>u.uid)),separationBuckets:(sepGrid.active||Array.from(sepGrid.values())).map(bucket=>bucket.map(u=>u.uid))}),\n    __helpers:{keepOnPassableLand,steerAcrossRiver,venues:VENUE_SPECS,bridgeZ:BRIDGE_Z},\n    armyGroup,');
  source=source.replace('    overlayMesh,','    __inspect:()=>({owner,captureTeam,captureProg,contested,battleHeat,presence,heroClaim,ownerCounts,lostHomelandCounts,corruptionVersion}),\n    overlayMesh,');
  source+='\nexport {buildLivingArmies as parityArmies,buildTerritorySystem as parityTerritory};\n//# sourceURL=atlas-parity.mjs';
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const originalRandom=Math.random;Math.random=()=>.3141592653589793;
  try{
    const root=new THREE.Group(),territory=module.parityTerritory(root),armies=module.parityArmies(root,territory);
    let t=0;const snapshots=[];
    const advance=(count=30)=>{for(let i=0;i<count;i++){t+=1/60;armies.update(1/60,t);territory.update(1/60,t,armies.units,armies.isPeaceTreaty(),armies.getInvasionState());}};
    function snapshot(name){
      const state=armies.__inspect(),references=new Map();
      for(const [kind,objects] of [['unit',armies.units],['squad',armies.squads],['structure',state.structures]])objects.forEach((object,index)=>references.set(object,`${kind}:${object.uid??object.id??index}`));
      const active=new WeakSet();
      function encode(value,expand=false){
        if(value===undefined)return {$undefined:true};
        if(Object.is(value,-0))return {$number:'-0'};
        if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};
        if(value===null||typeof value!=='object')return typeof value==='function'?'[function]':value;
        if(!expand&&references.has(value))return {$ref:references.get(value)};
        if(value.isObject3D||value.isMaterial||value.isTexture)return {$render:value.type||value.constructor.name};
        if(ArrayBuffer.isView(value))return Array.from(value);
        if(active.has(value))return {$cycle:true};active.add(value);
        const result=Array.isArray(value)?value.map(v=>encode(v)):Object.fromEntries(Object.keys(value).sort().map(k=>[k,encode(value[k])]));
        active.delete(value);return result;
      }
      const data={units:armies.units.map(u=>encode(u,true)),squads:armies.squads.map(s=>encode(s,true)),structures:state.structures.map(s=>encode(s,true)),corpses:encode(armies.corpses),projectiles:encode(state.projectiles),effects:encode(state.effects),event:encode(state.event),tide:encode(state.tide),random:state.random,facBuildCd:encode(state.facBuildCd),aliveByTeam:encode(state.aliveByTeam),totalByTeam:encode(state.totalByTeam),effTeamPower:encode(state.effTeamPower),gridBuckets:state.gridBuckets,separationBuckets:state.separationBuckets,territory:encode(territory.__inspect())};
      const digest=createHash('sha256').update(JSON.stringify(data)).digest('hex');
      snapshots.push({name,phase:state.event.phase,alive:armies.units.filter(u=>u.alive).length,corpses:armies.corpses.length,structures:state.structures.length,projectiles:state.projectiles.length,digest});
    }
    const h=armies.__helpers,boundaries=[];
    for(const v of h.venues)for(const angle of [0,.4,Math.PI/2,Math.PI])for(const epsilon of [-1e-10,0,1e-10]){
      const radius=v.plateauR-.15+epsilon,x=v.x+Math.cos(angle)*radius,z=v.z+Math.sin(angle)*radius;
      boundaries.push(h.keepOnPassableLand(x,z,x,z));
    }
    for(const z of [-14.8,-6.5,h.bridgeZ,7.2,19.6])for(const x of [-29.2,-.001,0,.001,29.2]){
      boundaries.push(h.keepOnPassableLand(x,z,-2,z));
      const nav=h.steerAcrossRiver(x,z,-x,z);boundaries.push([nav.x,nav.z,nav.crossing,nav.onSpan]);
    }
    advance(60);snapshot('ordinary');
    const fighters=armies.units.filter(u=>u.alive&&u.type==='swordsman').slice(0,2);
    for(const u of fighters){u.x=0;u.z=h.bridgeZ;}advance(1);snapshot('coincident-collision');
    const victim=armies.units.find(u=>u.alive&&u.type==='swordsman');armies.applyDragonBlast(victim.x,victim.z,2,1e6);
    snapshot('deaths');for(const u of armies.units)if(!u.alive)u.respawnWait=0;advance();snapshot('respawns');
    armies.triggerInvasion();advance();snapshot('warning');
    for(let stage=0;stage<8;stage++){armies.skipWave();advance();snapshot(`transition-${stage+1}`);}
    armies.getInvasionState().timer=0;advance(1);assert.equal(armies.getInvasionState().phase,'idle');snapshot('return-to-idle');
    // Release actual geometries/materials as the browser lifecycle does.
    const resources=new Set();root.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const material of (Array.isArray(o.material)?o.material:o.material?[o.material]:[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});resources.forEach(r=>r.dispose());root.clear();
    return {units:armies.units.length,boundaries,snapshots};
  }finally{Math.random=originalRandom;}
}
const before=await run(execFileSync('git',['show',`${baseline}:static/js/atlas3d.js`],{cwd:repo,encoding:'utf8'}));
const after=await run(fs.readFileSync(sourceURL,'utf8'));
assert.deepEqual(after,before,'Simulation state changed at a fixed timestep (checkpoint digests include full unit/target/structure/projectile/effect/territory state and RNG)');
console.log(JSON.stringify({same:true,baseline,units:after.units,boundaryCases:after.boundaries.length,checkpoints:after.snapshots},null,2));
