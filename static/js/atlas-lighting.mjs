/** Atlas atmosphere owns the final light/fog writes: theme, invasion, then parchment. */
export function createAtlasLighting(THREE,{scene,hemi,sun,rim,fixtures,windows=[],dark=false}) {
 const color=hex=>new THREE.Color(hex), mix=(a,b,t)=>a+(b-a)*t;
 const day={sky:color(0x16293d),fog:color(0x1b3044),hemi:color(0xeef2f7),ground:color(0x2a3b2a),sun:color(0xffe9be),rim:color(0x8bb2d9)};
 const night={sky:color(0x080f25),fog:color(0x14223b),hemi:color(0x9fbce6),ground:color(0x24352f),sun:color(0xb0caff),rim:color(0x809fd7)};
 const parchment=color(0xf2e5c5), dread=color(0x171426), boss=color(0x2b1012);
 let value=dark?1:0,from=value,target=value,start=0;
 let curse=0,curseFrom=0,curseTarget=0,curseStart=0,bossBlend=0,bossFrom=0,bossTarget=0,bossStart=0;
 const ease=p=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p);};
 function update(now,{strategicBlend=0,invasion=null,reduced=false}={}) {
  value=reduced?target:mix(from,target,ease((now-start)/900));
  const nextCurse=['warning','active','reign'].includes(invasion?.phase)?1:0;
  const nextBoss=invasion?.phase==='active'&&invasion.wave>=3?1:0;
  // Start from the last displayed atmosphere, including changes mid-transition.
  if(nextCurse!==curseTarget){curseFrom=curse;curseTarget=nextCurse;curseStart=now;}
  if(nextBoss!==bossTarget){bossFrom=bossBlend;bossTarget=nextBoss;bossStart=now;}
  curse=reduced?curseTarget:mix(curseFrom,curseTarget,ease((now-curseStart)/900));
  bossBlend=reduced?bossTarget:mix(bossFrom,bossTarget,ease((now-bossStart)/900));
  hemi.color.copy(day.hemi).lerp(night.hemi,value);hemi.groundColor.copy(day.ground).lerp(night.ground,value);
  hemi.intensity=mix(1.05,0.72,value);
  sun.color.copy(day.sun).lerp(night.sun,value);
  sun.intensity=mix(1.85,0.85,value)*(1-0.20*curse-0.08*bossBlend);
  rim.color.copy(day.rim).lerp(night.rim,value);rim.intensity=mix(0.55,0.65,value);
  const paper=ease((strategicBlend-0.12)/0.70);
  scene.background.copy(day.sky).lerp(night.sky,value).lerp(dread,curse*0.50).lerp(boss,bossBlend*0.65).lerp(parchment,paper);
  scene.fog.color.copy(day.fog).lerp(night.fog,value).lerp(dread,curse).lerp(boss,bossBlend).lerp(parchment,paper);
  scene.fog.density=0.0068*(1-ease((strategicBlend-0.1)/0.75)*0.78);
  fixtures.setNight(value);
  for(const material of windows)material.emissiveIntensity=mix(0.25,1.8,value);
 }
 function setNight(dark,now,reduced=false){from=value;target=dark?1:0;start=now;if(reduced)value=target;}
 update(0);
 return {setNight,update};
}

/** Shared low-poly fixtures, with four actual lights maximum and no extra shadow passes. */
export function buildAtlasFixtures(THREE,definitions) {
 const group=new THREE.Group();group.name='atlas-night-fixtures';
 const iron=new THREE.MeshStandardMaterial({color:0x443829,roughness:0.8});
 const glow=new THREE.MeshStandardMaterial({color:0xffd592,emissive:0xffa23b,emissiveIntensity:0});
 const poleGeo=new THREE.CylinderGeometry(0.045,0.065,0.85,5);
 const capGeo=new THREE.ConeGeometry(0.19,0.15,4),glassGeo=new THREE.BoxGeometry(0.18,0.23,0.18);
 const lights=[];
 // Three instanced draws for all lanterns, instead of three draws per lantern.
 const pole=new THREE.InstancedMesh(poleGeo,iron,definitions.length);
 const glass=new THREE.InstancedMesh(glassGeo,glow,definitions.length);
 const cap=new THREE.InstancedMesh(capGeo,iron,definitions.length);
 group.add(pole,glass,cap);
 const dummy=new THREE.Object3D();
 definitions.forEach(({position,light=false},i)=>{
  for(const [mesh,lift] of [[pole,0.425],[glass,0.94],[cap,1.13]]){
   dummy.position.fromArray(position);dummy.position.y+=lift;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  }
  if(light&&lights.length<4){const lamp=new THREE.PointLight(0xffbb66,0,8,1.6);lamp.position.fromArray(position);lamp.position.y+=1.02;group.add(lamp);lights.push(lamp);}
 });
 return {group,lights,setNight(amount){glow.emissiveIntensity=amount*2.4;for(const light of lights){light.intensity=amount*6;light.visible=amount>0.001;}},
  dispose(){group.removeFromParent();pole.dispose();glass.dispose();cap.dispose();poleGeo.dispose();capGeo.dispose();glassGeo.dispose();iron.dispose();glow.dispose();}};
}
