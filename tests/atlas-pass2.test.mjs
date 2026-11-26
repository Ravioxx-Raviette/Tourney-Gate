import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../static/vendor/three/three.module.min.js';
import {ReusableSpatialGrid,writeYXZMatrix,createInstancePose,freezeStaticLocalMatrices,batchStaticMeshes} from '../static/js/atlas-optimize.mjs';
import {getAtlasBenchmarkRun,restartAtlasBenchmark,finishAtlasBenchmark,createAtlasDiagnostics} from '../static/js/atlas-perf.mjs';

test('dense and overflow buckets preserve packed-key identity, order and reuse',()=>{
  const grid=new ReusableSpatialGrid(32),reference=new Map();
  const keys=[0,31,32,300000,-1,-2147483648];
  for(let frame=0;frame<5;frame++){
    grid.clear();for(const bucket of reference.values())bucket.length=0;
    for(let i=0;i<80;i++){
      const key=keys[(i*7+frame)%keys.length],value={frame,i};
      grid.add(key,value);if(!reference.has(key))reference.set(key,[]);reference.get(key).push(value);
    }
    for(const key of keys)assert.deepEqual(grid.get(key),reference.get(key));
  }
  const dense=grid.get(31),overflow=grid.get(-1);grid.clear();grid.add(31,7);grid.add(-1,8);
  assert.equal(grid.get(31),dense);assert.equal(grid.get(-1),overflow);assert.equal(grid.get(10),undefined);
});

test('direct YXZ matrices match the original Three.js GPU Float32 values',()=>{
  let seed=54321;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const original=new THREE.Object3D();original.rotation.order='YXZ';
  const expected=new Float32Array(16),actual=new Float32Array(48).fill(77);
  for(let i=0;i<1000;i++){
    original.position.set((random()-.5)*68,(random()-.5)*20,(random()-.5)*52);
    original.rotation.set((random()-.5)*Math.PI*2,(random()-.5)*Math.PI*2,(random()-.5)*Math.PI*2);
    original.scale.set(i%9?random()*3:0,random()*3,i%3?random()*3:-random()*3);original.updateMatrix();
    original.matrix.toArray(expected);writeYXZMatrix(actual,16,original.position,original.rotation,original.scale);
    assert.deepEqual(actual.slice(16,32),expected,`transform ${i}`);
    assert.equal(actual[0],77);assert.equal(actual[47],77);
  }
});

test('pose scratch preserves shared transforms, changed poses and reordered instance writes',()=>{
  const pose=createInstancePose(),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),4);
  const original=new THREE.Object3D();original.rotation.order='YXZ';
  for(const index of [3,0,2,1]){
    pose.position.set(index,2,-index);pose.rotation.set(.4,index*.3,-.2);pose.scale.set(1,2,-.7);pose.updateMatrix();
    original.position.copy(pose.position);original.rotation.set(pose.rotation.x,pose.rotation.y,pose.rotation.z);original.scale.copy(pose.scale);original.updateMatrix();
    mesh.setMatrixAt(index,pose.matrix);const got=new Float32Array(16);original.matrix.toArray(got);
    assert.deepEqual(mesh.instanceMatrix.array.slice(index*16,index*16+16),got);
    const other=new Float32Array(16);pose.matrix.toArray(other);assert.deepEqual(other,got);
  }
});

test('static local matrices follow changing ancestors while excluded animation stays active',()=>{
  const parent=new THREE.Group(),root=new THREE.Group(),moving=new THREE.Group(),child=new THREE.Object3D(),fixed=new THREE.Object3D();
  parent.add(root);root.add(moving,fixed);moving.add(child);fixed.position.x=3;
  freezeStaticLocalMatrices(root,[moving]);assert.equal(root.matrixAutoUpdate,false);assert.equal(fixed.matrixAutoUpdate,false);
  assert.equal(moving.matrixAutoUpdate,true);assert.equal(child.matrixAutoUpdate,true);
  parent.position.x=10;moving.position.y=4;parent.updateMatrixWorld(true);
  assert.equal(fixed.matrixWorld.elements[12],13);assert.equal(child.matrixWorld.elements[13],4);
});

test('benchmark continuation validates state, preserves the seed, and clears on completion',()=>{
  const previous={location:globalThis.location,sessionStorage:globalThis.sessionStorage};
  const values=new Map();let reloads=0;
  Object.assign(globalThis,{location:{search:'?atlasPerf=1',reload(){reloads++;}},sessionStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});
  try{
    assert.equal(getAtlasBenchmarkRun(),null);
    const run={version:2,scenario:'invasion',trial:2,completed:[{trial:1}],seed:20261125};
    restartAtlasBenchmark(run);assert.equal(reloads,1);assert.deepEqual(getAtlasBenchmarkRun(),run);
    globalThis.location.search='';assert.equal(getAtlasBenchmarkRun(),null);globalThis.location.search='?atlasPerf=1';
    finishAtlasBenchmark();assert.equal(getAtlasBenchmarkRun(),null);
    restartAtlasBenchmark({...run,trial:4});assert.equal(getAtlasBenchmarkRun(),null);
  }finally{Object.assign(globalThis,previous);}
});

async function diagnosticHarness(check){
  const names=['location','sessionStorage','document','performance','innerWidth','innerHeight'];
  const previous=Object.fromEntries(names.map(k=>[k,globalThis[k]]));let now=0;
  const element=()=>({style:{},dataset:{},textContent:'',listeners:new Map(),setAttribute(){},addEventListener(type,fn){this.listeners.set(type,fn);},remove(){}});
  const elements=new Map(['live','progress','results','scenario','start'].map(k=>[`[data-perf-${k}]`,element()])),panel=element(),stop=element();
  panel.querySelector=k=>elements.get(k);panel.append=()=>{};
  const pending={version:2,scenario:'overview',trial:1,completed:[],seed:20261125};
  const original=function(){},gl={bufferSubData:original};
  Object.assign(globalThis,{location:{search:'?atlasPerf=1'},sessionStorage:{getItem:()=>JSON.stringify(pending)},document:{createElement:tag=>tag==='section'?panel:stop},performance:{now:()=>now},innerWidth:1440,innerHeight:1000});
  const diagnostics=createAtlasDiagnostics({getContext:()=>gl,getPixelRatio:()=>1},{append(){}});
  try{await check({diagnostics,stop,elements,gl,original,frame(context){now+=1000;diagnostics.begin();diagnostics.end({calls:4,triangles:20},context);}});}finally{diagnostics.dispose();Object.assign(globalThis,previous);}
}

test('each diagnostic trial requests a fresh campaign and preserves completed results and seed',async()=>{
  await diagnosticHarness(async({diagnostics,elements,frame})=>{
    let next;diagnostics.configure({prepare(){},restart:run=>{next=structuredClone(run);}});
    await Promise.resolve();await Promise.resolve();
    for(let i=0;i<30;i++)frame({phase:'idle',living:100-i});
    assert.equal(next.trial,2);assert.equal(next.seed,20261125);assert.equal(next.completed.length,1);
    const trial=next.completed[0];assert.equal(trial.frames,20);assert.equal(trial.start.living,94);assert.equal(trial.end.living,75);
    assert.equal(trial.start.sceneObjects,0);assert.equal(trial.cpuMs.collision,0);
    assert.equal(elements.get('[data-perf-start]').disabled,true);
  });
});

test('stopping during asynchronous benchmark setup cannot restart a cancelled trial',async()=>{
  await diagnosticHarness(async({diagnostics,stop,elements,frame,gl,original})=>{
    let resolvePrepare,finishes=0;diagnostics.configure({prepare:()=>new Promise(resolve=>{resolvePrepare=resolve;}),finish(){finishes++;}});
    await Promise.resolve();stop.listeners.get('click')();resolvePrepare();await Promise.resolve();await Promise.resolve();
    for(let i=0;i<30;i++)frame({phase:'idle',living:100});
    assert.equal(elements.get('[data-perf-results]').textContent,'');assert.equal(elements.get('[data-perf-progress]').textContent,'Measurement stopped.');
    assert.equal(elements.get('[data-perf-start]').disabled,false);assert.equal(finishes,1);
    diagnostics.dispose();assert.equal(gl.bufferSubData,original);
  });
});

test('real bridge, dock and lair batches preserve bounds, triangles, material/shadow groups and animation',async t=>{
  const previous=Object.fromEntries(['document','matchMedia','Path2D'].map(k=>[k,globalThis[k]]));
  const gradient={addColorStop(){}};
  const context=new Proxy({measureText:()=>({width:100}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>(target[key]=value,true)});
  globalThis.document={readyState:'loading',documentElement:{classList:{contains:()=>false}},addEventListener(){},createElement:()=>({width:256,height:256,getContext:()=>context})};
  globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});globalThis.Path2D=class {};
  try{
    const sourceURL=new URL('../static/js/atlas3d.js',import.meta.url);
    let source=fs.readFileSync(sourceURL,'utf8').replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,quote,path)=>`from ${quote}${new URL(path,sourceURL).href}${quote}`);
    source+='\nexport {buildCentralBridge,buildLivingCountryside,buildRoamingDragon};\n//# sourceURL=atlas-architecture-check.mjs';
    const builders=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    const parent=new THREE.Group(),bridges=builders.buildCentralBridge(parent),country=builders.buildLivingCountryside(parent,new THREE.Texture()),dragon=builders.buildRoamingDragon(parent,{units:[],applyDragonBlast(){}});
    function census(root){let meshes=0,triangles=0;const groups=new Map();root.traverseVisible(o=>{if(o.isMesh){meshes++;const count=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);triangles+=count;const key=[o.material.uuid,o.castShadow,o.receiveShadow,o.renderOrder,o.layers.mask].join(':');groups.set(key,(groups.get(key)||0)+count);}});return {meshes,triangles,groups,bounds:new THREE.Box3().setFromObject(root,true)};}
    const totals={before:0,after:0,triangles:0};
    for(const root of [...bridges.staticRoots,...country.staticArchitecture,...dragon.staticArchitecture]){
      const excluded=dragon.staticArchitecture.includes(root)?dragon.animatedArchitecture:[],before=census(root);
      batchStaticMeshes(root,excluded);freezeStaticLocalMatrices(root,excluded);const after=census(root);
      assert.equal(after.triangles,before.triangles);assert.deepEqual(after.groups,before.groups);
      assert.ok(before.bounds.min.distanceTo(after.bounds.min)<1e-4);assert.ok(before.bounds.max.distanceTo(after.bounds.max)<1e-4);
      assert.ok(after.meshes<before.meshes);totals.before+=before.meshes;totals.after+=after.meshes;totals.triangles+=after.triangles;
      for(const node of excluded){assert.equal(root.getObjectById(node.id),node);assert.equal(node.matrixAutoUpdate,true);}
    }
    dragon.update(.1,1);parent.updateMatrixWorld(true);
    t.diagnostic(JSON.stringify(totals));
    const resources=new Set();parent.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});resources.forEach(resource=>resource.dispose());parent.clear();
  }finally{Object.assign(globalThis,previous);}
});
