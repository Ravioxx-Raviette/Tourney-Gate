import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../static/vendor/three/three.module.min.js';
import {batchStaticMeshes,trackInstanceUploads,ReusableSpatialGrid,createLabelUpdater} from '../static/js/atlas-optimize.mjs';
import {summarize,createAtlasDiagnostics} from '../static/js/atlas-perf.mjs';

const approx=(a,b,eps=1e-5)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
function vertices(root) {
  root.updateMatrixWorld(true);const out=[];
  root.traverseVisible(o=>{if(!o.isMesh)return;const g=o.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for(let i=0;i<(g.index?.count??p.count);i++){
      const k=g.index?g.index.getX(i):i;
      const v=new THREE.Vector3().fromBufferAttribute(p,k).applyMatrix4(o.matrixWorld),normal=new THREE.Vector3().fromBufferAttribute(n,k).applyNormalMatrix(normalMatrix);
      out.push([v.x,v.y,v.z,normal.x,normal.y,normal.z,uv?.getX(k)||0,uv?.getY(k)||0].map(x=>+x.toFixed(4)).join(','));
    }});return out.sort();
}

test('batching retains transformed triangles, normals, UVs, material and shadow settings',()=>{
  const root=new THREE.Group();root.position.set(5,2,-8);root.rotation.y=.6;
  const material=new THREE.MeshStandardMaterial();
  for(let i=0;i<5;i++){const group=new THREE.Group();group.position.set(i,1,i*.2);group.rotation.z=i*.1;root.add(group);const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),material);mesh.scale.set(1,2,.5);mesh.position.y=i*.3;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
  const before=vertices(root),bounds=new THREE.Box3().setFromObject(root,true),result=batchStaticMeshes(root);
  assert.equal(result.before,5);assert.equal(result.after,1);const after=vertices(root);assert.equal(after.length,before.length);
  // Float32 baking can differ in the last printed digit; compare sorted geometry numerically.
  for(let i=0;i<before.length;i++){const a=before[i].split(',').map(Number),b=after[i].split(',').map(Number);for(let j=0;j<a.length;j++)approx(a[j],b[j],.0003);}
  const next=new THREE.Box3().setFromObject(root,true);approx(bounds.min.distanceTo(next.min),0);approx(bounds.max.distanceTo(next.max),0);
  const mesh=root.children.find(o=>o.name==='Atlas static batch');assert.equal(mesh.material,material);assert.equal(mesh.castShadow,true);assert.equal(mesh.receiveShadow,true);assert.equal(mesh.matrixAutoUpdate,false);
});

test('animated, transparent, reflected, visibility-controlled and incompatible meshes remain separate',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  const add=(mat=material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(),mat);root.add(m);return m;};
  add();add();const moving=add(),transparent=add(new THREE.MeshBasicMaterial({transparent:true,opacity:.5})),reflected=add();reflected.scale.x=-1;
  const controlled=new THREE.Group();root.add(controlled);const child=new THREE.Mesh(new THREE.BoxGeometry(),material);controlled.add(child);
  const colors=add();colors.geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(24*3).fill(.5),3));
  const before=vertices(root);batchStaticMeshes(root,[moving,controlled]);
  for(const mesh of [moving,transparent,reflected,child,colors])assert.ok(mesh.parent);
  assert.equal(moving.matrixAutoUpdate,true);assert.equal(before.length,vertices(root).length);
  moving.rotation.y=.8;root.updateMatrixWorld(true);assert.notEqual(moving.matrixWorld.elements[0],1);
});

test('a mesh parenting animation is never detached from its descendants',()=>{
  const root=new THREE.Group(),mat=new THREE.MeshBasicMaterial();const parent=new THREE.Mesh(new THREE.BoxGeometry(),mat),flag=new THREE.Mesh(new THREE.BoxGeometry(),mat);parent.add(flag);root.add(parent);
  for(let i=0;i<3;i++)root.add(new THREE.Mesh(new THREE.BoxGeometry(),mat));batchStaticMeshes(root,[flag]);
  assert.equal(parent.parent,root);assert.equal(flag.parent,parent);
});

test('uploads cover only active matrices and changed colors, including growth, reorder and empty pools',()=>{
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),100);
  mesh.setColorAt(0,new THREE.Color(1,0,0));const flush=trackInstanceUploads(mesh);
  mesh.count=2;flush();assert.deepEqual(mesh.instanceMatrix.updateRanges,[{start:0,count:32}]);assert.deepEqual(mesh.instanceColor.updateRanges,[{start:0,count:6}]);
  assert.equal(mesh.instanceMatrix.usage,THREE.DynamicDrawUsage);let version=mesh.instanceColor.version;
  mesh.setColorAt(0,new THREE.Color(1,0,0));flush();assert.equal(mesh.instanceColor.version,version);
  mesh.setColorAt(1,new THREE.Color(0,1,0));flush();assert.equal(mesh.instanceColor.version,version+1);assert.deepEqual(mesh.instanceColor.updateRanges,[{start:3,count:3}]);
  mesh.setColorAt(0,new THREE.Color(0,1,0));mesh.setColorAt(1,new THREE.Color(1,0,0));flush();assert.deepEqual(mesh.instanceColor.updateRanges,[{start:0,count:6}]);
  mesh.count=1;flush();assert.deepEqual(mesh.instanceMatrix.updateRanges,[{start:0,count:16}]);
  const matrixVersion=mesh.instanceMatrix.version;mesh.count=0;flush();assert.equal(mesh.instanceMatrix.version,matrixVersion);
  mesh.count=4;flush();assert.deepEqual(mesh.instanceMatrix.updateRanges,[{start:0,count:64}]);assert.deepEqual(mesh.instanceColor.updateRanges,[{start:0,count:12}]);
});

test('uncolored instance pools do not allocate color buffers or upload empty matrices',()=>{
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),20),flush=trackInstanceUploads(mesh);mesh.count=0;flush();assert.equal(mesh.instanceColor,null);assert.equal(mesh.instanceMatrix.version,0);
});

test('pooled spatial buckets preserve insertion order and are reused across frames',()=>{
  const grid=new ReusableSpatialGrid();grid.add(10,'a');grid.add(10,'b');grid.add(20,'c');const first=grid.get(10);
  grid.clear();assert.equal(first.length,0);grid.add(20,'d');grid.add(10,'e');grid.add(10,'f');assert.equal(grid.get(10),first);assert.deepEqual(first,['e','f']);assert.deepEqual(grid.get(20),['d']);assert.equal(grid.get(30),undefined);
});

test('label scene redraws only on camera, projection or explicit content changes',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();let renders=0;const labels=createLabelUpdater(scene,camera,(s,c)=>{assert.equal(s,scene);assert.equal(c,camera);renders++;});
  camera.updateMatrixWorld();labels.render();labels.render();assert.equal(renders,1);
  camera.position.x=1;camera.updateMatrixWorld();labels.render();assert.equal(renders,2);
  camera.aspect=2;camera.updateProjectionMatrix();labels.render();assert.equal(renders,3);
  labels.invalidate();labels.render();assert.equal(renders,4);
});

test('performance percentiles report milliseconds without confusing CPU and GPU time',()=>{
  assert.deepEqual(summarize([]),{median:0,p95:0,mean:0});const s=summarize([8,10,12,14,100]);assert.equal(s.median,12);assert.equal(s.p95,100);approx(s.mean,28.8);
});

test('all four actual campaign venue models retain every visible triangle and animated object',async()=>{
  const previous={document:globalThis.document,matchMedia:globalThis.matchMedia};
  const gradient={addColorStop(){}};
  const context=new Proxy({measureText:()=>({width:100}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(t,k)=>k in t?t[k]:()=>{},set:(t,k,v)=>(t[k]=v,true)});
  globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  globalThis.document={readyState:'loading',documentElement:{classList:{contains:()=>false}},addEventListener(){},createElement:()=>({width:256,height:256,getContext:()=>context})};
  try {
    const {VENUE_BUILDERS}=await import('../static/js/venue3d.js');
    for(const key of ['five-banners','iron-colosseum','kings-mark','victors-feast']){
      const built=VENUE_BUILDERS[key]();built.guidesGroup&&(built.guidesGroup.visible=false);built.root.children.forEach(c=>{if(c.isMesh)c.visible=false;});
      const count=()=>{let meshes=0,triangles=0;built.root.traverseVisible(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {meshes,triangles};};
      const animated=[...(built.animatedPennants||[]),...(built.animatedEmbers||[])].map(p=>p.mesh),before=count();
      batchStaticMeshes(built.root,[built.guidesGroup,built.roofGroup,...animated]);const after=count();
      assert.equal(after.triangles,before.triangles,key);assert.ok(after.meshes<before.meshes*.3,key);
      for(const node of animated)assert.equal(built.root.getObjectById(node.id),node);
      if(built.roofGroup)assert.equal(built.roofGroup.parent,built.root);
    }
  } finally {Object.assign(globalThis,previous);}
});

test('batching does not dispose geometry still used by an animated mesh or shared materials',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
  let geometryDisposals=0,materialDisposals=0;
  geometry.addEventListener('dispose',()=>geometryDisposals++);material.addEventListener('dispose',()=>materialDisposals++);
  const animated=new THREE.Mesh(geometry,material);root.add(animated);
  root.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));
  batchStaticMeshes(root,[animated]);assert.equal(geometryDisposals,0);assert.equal(materialDisposals,0);
  const batch=root.children.find(o=>o.name==='Atlas static batch');let batchDisposals=0;batch.geometry.addEventListener('dispose',()=>batchDisposals++);
  batch.geometry.dispose();assert.equal(batchDisposals,1);assert.equal(animated.geometry,geometry);
});

test('custom vertex shaders and unsupported geometry stay unbatched',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();material.onBeforeCompile=()=>{};
  const a=new THREE.Mesh(new THREE.BoxGeometry(),material),b=a.clone();root.add(a,b);
  assert.equal(batchStaticMeshes(root).reduced,0);assert.equal(a.parent,root);assert.equal(b.parent,root);
  const unsupported=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());root.add(unsupported);
  assert.equal(batchStaticMeshes(root).reduced,0);assert.equal(unsupported.parent,root);
});

test('diagnostics allocate no panel or WebGL hooks during ordinary browsing',()=>{
  const previous=globalThis.location;
  try{globalThis.location={search:''};assert.equal(createAtlasDiagnostics(null,null),null);globalThis.location={search:'?atlasPerf=0'};assert.equal(createAtlasDiagnostics(null,null),null);}finally{globalThis.location=previous;}
});

test('batching preserves colored triangle winding and raycast venue hits',()=>{
  const root=new THREE.Group(),material=new THREE.MeshBasicMaterial({vertexColors:true});
  for(let i=0;i<2;i++){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,0,1,0],3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));
    geometry.setAttribute('color',new THREE.Uint8BufferAttribute([255,0,0,0,255,0,0,0,255],3,true));
    const mesh=new THREE.Mesh(geometry,material);mesh.position.x=i*3;root.add(mesh);
  }
  root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,5),new THREE.Vector3(0,0,-1));
  const before=ray.intersectObject(root,true).map(hit=>hit.point.toArray());
  batchStaticMeshes(root);root.updateMatrixWorld(true);
  const mesh=root.children.find(o=>o.name==='Atlas static batch'),positions=mesh.geometry.attributes.position;
  assert.deepEqual(ray.intersectObject(root,true).map(hit=>hit.point.toArray()),before);
  assert.deepEqual([...mesh.geometry.attributes.color.array],[255,0,0,0,255,0,0,0,255,255,0,0,0,255,0,0,0,255]);
  assert.equal(mesh.geometry.attributes.color.normalized,true);
  for(let i=0;i<positions.count;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(positions,i),b=new THREE.Vector3().fromBufferAttribute(positions,i+1),c=new THREE.Vector3().fromBufferAttribute(positions,i+2);
    assert.ok(b.sub(a).cross(c.sub(a)).z>0);
  }
});

test('diagnostics distinguish partial instance uploads and release their WebGL hook',async()=>{
  const previous=Object.fromEntries(['location','document','performance','innerWidth','innerHeight'].map(k=>[k,globalThis[k]]));
  const clickHandlers=new Map(),elements=new Map();let now=0,removed=false,appended=false;
  for(const key of ['live','progress','results','scenario','start'])elements.set(`[data-perf-${key}]`,{textContent:'',value:'overview',addEventListener:(type,fn)=>clickHandlers.set(type,fn)});
  const panel={style:{},setAttribute(){},querySelector:key=>elements.get(key),remove(){removed=true;}};
  const original=function(){},gl={bufferSubData:original};
  const renderer={getContext:()=>gl,getPixelRatio:()=>1};
  Object.assign(globalThis,{location:{search:'?atlasPerf=1'},document:{createElement:()=>panel},performance:{now:()=>now},innerWidth:1440,innerHeight:1000});
  try{
    const diagnostic=createAtlasDiagnostics(renderer,{append(node){assert.equal(node,panel);appended=true;}});
    const scene=new THREE.Scene(),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),100);scene.add(mesh);
    diagnostic.registerInstances(scene);await clickHandlers.get('click')();
    for(let i=0;i<80;i++){
      now+=1000;diagnostic.begin();
      gl.bufferSubData(0,0,mesh.instanceMatrix.array,3,16);
      gl.bufferSubData(0,0,new Float32Array(12).subarray(4));
      diagnostic.end({calls:1,triangles:12});
    }
    const trials=JSON.parse(elements.get('[data-perf-results]').textContent);
    assert.equal(trials.length,3);for(const trial of trials){assert.equal(trial.meanInstanceUploadBytes,64);assert.equal(trial.meanUploadBytes,96);}
    assert.equal(appended,true);diagnostic.dispose();assert.equal(gl.bufferSubData,original);assert.equal(removed,true);
  }finally{Object.assign(globalThis,previous);}
});
