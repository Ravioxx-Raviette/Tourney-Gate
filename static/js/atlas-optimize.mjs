import * as THREE from '../vendor/three/three.module.min.js';

/** Batch only immutable opaque geometry. Animated/visibility-controlled subtrees stay intact. */
export function batchStaticMeshes(root, excluded = []) {
  const blocked = new Set(excluded.filter(Boolean)), candidates = [], groups = new Map();
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  function walk(node, skip = false) {
    if (!node.visible) return;
    skip ||= blocked.has(node);
    const g = node.geometry, m = node.material;
    if (!skip && node.isMesh && !node.children.length && !node.isInstancedMesh && !node.isSkinnedMesh && m && !Array.isArray(m) &&
        !m.transparent && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile && !node.customDepthMaterial && !node.customDistanceMaterial &&
        node.onBeforeRender === THREE.Object3D.prototype.onBeforeRender && g && g.attributes.position && g.attributes.normal && !Object.keys(g.morphAttributes).length &&
        g.drawRange.start === 0 && (g.drawRange.count === Infinity || g.drawRange.count === (g.index?.count ?? g.attributes.position.count)) &&
        !Object.values(g.attributes).some(a => !a.array || a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute || a.isFloat16BufferAttribute) &&
        [g.attributes.position,g.attributes.normal].every(a=>a.array instanceof Float32Array || a.array instanceof Float64Array)) {
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld);
      // Reflections keep their original per-object front-face handling.
      if (matrix.determinant() > 0 && g.attributes.position && g.attributes.normal && Object.values(g.attributes).every(a=>a.count===g.attributes.position.count)) {
        const layout = Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([key,a])=>`${key}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}:${a.gpuType}`).join('|');
        const key = `${m.uuid}:${node.castShadow}:${node.receiveShadow}:${node.renderOrder}:${node.layers.mask}:${layout}`;
        const item={node,matrix};candidates.push(item);
        if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);
      }
    }
    for(const child of node.children)walk(child,skip);
  }
  walk(root);
  const replacements=[],created=new Set();let before=0,after=0;
  try {
    for(const group of groups.values()) {
      if(group.length<2)continue;
      // Non-indexed output retains every triangle, normal, UV and color without index limits.
      const attributes={},parts=[];let count=0;
      for(const {node,matrix} of group) {
        const part=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();
        created.add(part);part.applyMatrix4(matrix);parts.push(part);count+=part.attributes.position.count;
      }
      for(const [name,a] of Object.entries(parts[0].attributes)) {
        const array=new a.array.constructor(count*a.itemSize);let offset=0;
        for(const part of parts){array.set(part.attributes[name].array,offset);offset+=part.attributes[name].array.length;}
        attributes[name]=new THREE.BufferAttribute(array,a.itemSize,a.normalized);attributes[name].gpuType=a.gpuType;
      }
      const geometry=new THREE.BufferGeometry();created.add(geometry);
      for(const [name,a] of Object.entries(attributes))geometry.setAttribute(name,a);
      parts.forEach(p=>{p.dispose();created.delete(p);});geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const source=group[0].node,mesh=new THREE.Mesh(geometry,source.material);
      mesh.name='Atlas static batch';mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
      mesh.renderOrder=source.renderOrder;mesh.layers.mask=source.layers.mask;
      mesh.updateMatrix();mesh.matrixAutoUpdate=false;
      replacements.push({mesh,group});before+=group.length;after++;
    }
  } catch(error) {created.forEach(g=>g.dispose());throw error;}
  for(const {mesh,group} of replacements){root.add(mesh);group.forEach(({node})=>node.removeFromParent());}
  // Individual static pieces also avoid needless local matrix recomposition.
  for(const {node} of candidates){node.updateMatrix();node.matrixAutoUpdate=false;}
  // Source geometry has not reached the GPU yet; release only detached, unshared buffers.
  const retained=new Set();root.traverse(o=>{if(o.geometry)retained.add(o.geometry);});
  const detached=new Set(replacements.flatMap(r=>r.group.map(i=>i.node.geometry)));
  detached.forEach(g=>{if(!retained.has(g))g.dispose();});
  return {before,after,reduced:before-after};
}

/** Same insertion/neighbor order as Map buckets, with reusable arrays. */
export class ReusableSpatialGrid {
  constructor(capacity=1<<18){this.buckets=new Array(capacity).fill(undefined);this.overflow=new Map();this.active=[];}
  get(key){return key>=0&&key<this.buckets.length?this.buckets[key]:this.overflow.get(key);}
  add(key,value){
    const dense=key>=0&&key<this.buckets.length;
    let bucket=dense?this.buckets[key]:this.overflow.get(key);
    if(!bucket){bucket=[];if(dense)this.buckets[key]=bucket;else this.overflow.set(key,bucket);}
    if(!bucket.length)this.active.push(bucket);bucket.push(value);
  }
  clear(){for(const bucket of this.active)bucket.length=0;this.active.length=0;}
}

/** Same quaternion and compose arithmetic as Three.js Euler YXZ, rounded only at the GPU boundary. */
export function writeYXZMatrix(array,offset,position,rotation,scale) {
  const c1=Math.cos(rotation.x/2),c2=Math.cos(rotation.y/2),c3=Math.cos(rotation.z/2);
  const s1=Math.sin(rotation.x/2),s2=Math.sin(rotation.y/2),s3=Math.sin(rotation.z/2);
  const x=s1*c2*c3+c1*s2*s3,y=c1*s2*c3-s1*c2*s3,z=c1*c2*s3-s1*s2*c3,w=c1*c2*c3+s1*s2*s3;
  const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  array[offset]=(1-(yy+zz))*scale.x;array[offset+1]=(xy+wz)*scale.x;array[offset+2]=(xz-wy)*scale.x;array[offset+3]=0;
  array[offset+4]=(xy-wz)*scale.y;array[offset+5]=(1-(xx+zz))*scale.y;array[offset+6]=(yz+wx)*scale.y;array[offset+7]=0;
  array[offset+8]=(xz+wy)*scale.z;array[offset+9]=(yz-wx)*scale.z;array[offset+10]=(1-(xx+yy))*scale.z;array[offset+11]=0;
  array[offset+12]=position.x;array[offset+13]=position.y;array[offset+14]=position.z;array[offset+15]=1;
  return array;
}

/** Drop-in pose scratch for unit parts; avoids Euler callbacks and reuses repeated part transforms. */
export function createInstancePose() {
  const values=new Float32Array(16);let dirty=true;
  const pose={position:new THREE.Vector3(),rotation:new THREE.Vector3(),scale:new THREE.Vector3(1,1,1),
    updateMatrix(){dirty=true;},matrix:{toArray(array,offset=0){
      if(dirty){writeYXZMatrix(values,0,pose.position,pose.rotation,pose.scale);dirty=false;}
      array.set(values,offset);return array;
    }}};
  return pose;
}

/** Explicitly static roots only. Changing ancestors remain under normal Three.js updates. */
export function freezeStaticLocalMatrices(root,excluded=[]) {
  const blocked=new Set(excluded);
  function walk(node){if(blocked.has(node))return;node.updateMatrix();node.matrixAutoUpdate=false;for(const child of node.children)walk(child);}
  walk(root);
}

export function trackInstanceUploads(mesh) {
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let dirtyMin=0,dirtyMax=Infinity,previousCount=0;
  if(mesh.instanceColor)mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const original=mesh.setColorAt;
  mesh.setColorAt=function(index,color){
    const a=this.instanceColor?.array,offset=index*3;
    if(!a || a[offset]!==Math.fround(color.r)||a[offset+1]!==Math.fround(color.g)||a[offset+2]!==Math.fround(color.b)){
      original.call(this,index,color);this.instanceColor.setUsage(THREE.DynamicDrawUsage);
      dirtyMin=Math.min(dirtyMin,offset);dirtyMax=Math.max(dirtyMax,offset+3);
    }
  };
  return () => {
    const count=mesh.count;
    if(count>0){
      mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,count*16);mesh.instanceMatrix.needsUpdate=true;
      const colors=mesh.instanceColor;
      if(colors){
        if(count>previousCount){dirtyMin=Math.min(dirtyMin,previousCount*3);dirtyMax=Math.max(dirtyMax,count*3);}
        const end=Math.min(count*3,dirtyMax);
        if(end>dirtyMin){colors.clearUpdateRanges();colors.addUpdateRange(dirtyMin,end-dirtyMin);colors.needsUpdate=true;}
      }
    }
    previousCount=count;dirtyMin=Infinity;dirtyMax=-Infinity;
  };
}

export function createLabelUpdater(scene,camera,render) {
  const last=new Float64Array(32);last.fill(NaN);let dirty=true;
  return {invalidate(){dirty=true;},render(){
    const world=camera.matrixWorld.elements,projection=camera.projectionMatrix.elements;
    let changed=dirty;for(let i=0;i<16&&!changed;i++)changed=world[i]!==last[i]||projection[i]!==last[i+16];
    if(!changed)return false;
    render(scene,camera);last.set(world,0);last.set(projection,16);dirty=false;return true;
  }};
}
