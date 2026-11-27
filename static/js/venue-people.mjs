import {seatPreviewPose} from './seat-layout.mjs';

const profiles={
 'silver-lance':{venue:'The Royal Lists',category:'Joust',layout_type:'stands',seated:56,visitors:16,limit:80},
 'five-banners':{venue:'The Royal Lists',category:'Grand Melee',layout_type:'stands',seated:56,visitors:16,limit:80},
 'iron-colosseum':{venue:'The Iron Colosseum',category:'Gladiatorial Games',layout_type:'arena',seated:72,visitors:16,limit:96},
 'kings-mark':{venue:'The King’s Green',category:'Archery Contest',layout_type:'stands',seated:40,visitors:12,limit:64},
 'victors-feast':{venue:'The Great Hall',category:'Feast',layout_type:'tables',seated:32,visitors:8,limit:48},
};
export const peopleProfile=slug=>profiles[slug]?{...profiles[slug]}:null;
let fallbackVisibility=true;
export function readPeoplePreference(storage){
 try{const source=storage??globalThis.localStorage;return source?source.getItem('tg-venue-people')!=='off':fallbackVisibility;}catch{return fallbackVisibility;}
}
export function writePeoplePreference(visible,storage){
 fallbackVisibility=Boolean(visible);
 try{(storage??globalThis.localStorage)?.setItem('tg-venue-people',visible?'on':'off');}catch{}
}

function seatsFor(profile){
 const tiers=profile.layout_type==='tables'?[['Feast seat','Bench',8,8]]:
  profile.category==='Archery Contest'?[["Commoner’s Bench",'Bench',12,10]]:
  profile.layout_type==='arena'?[['Noble Stand','Noble',6,10],["Commoner’s Bench",'Bench',24,10]]:
  [['Royal Box','Royal',2,10],['Noble Stand','Noble',8,10],["Commoner’s Bench",'Bench',20,10]];
 const anchors=[];
 for(const [name,section,rows,width] of tiers)for(let r=0;r<rows;r++)for(let n=1;n<=width;n++){
  const pose=seatPreviewPose(profile,{id:1,name,kind:'seated'},
   {tier_id:1,section,row:profile.layout_type==='tables'?`Table ${r+1}`:String.fromCharCode(65+r),number:n,status:'available'});
  if(pose)anchors.push({anchor:[pose.position[0],pose.position[1]-.75,pose.position[2]],
   yaw:Math.atan2(pose.target[0]-pose.position[0],pose.target[2]-pose.position[2])});
 }
 return anchors;
}

/** Authored two-point loops stay within existing pedestrian strips, never in parking bays. */
function walkingPaths(layout,height){
 return layout.walkways.filter(r=>r.maxX-r.minX>height*.6&&r.maxZ-r.minZ>height*.6).map(r=>{
  const x=(r.minX+r.maxX)/2,z=(r.minZ+r.maxZ)/2,margin=height*.32;
  return r.maxX-r.minX>r.maxZ-r.minZ?
   [[r.minX+margin,.045,z],[r.maxX-margin,.045,z]]:[[x,.045,r.minZ+margin],[x,.045,r.maxZ-margin]];
 });
}

function performers(slug,height){
 const floor=slug==='iron-colosseum'?.155:slug==='kings-mark'?.04:slug==='victors-feast'?.14:.092;
 const p=(kind,x,z,yaw=0,path=null)=>({role:'performer',kind,anchor:[x,kind==='archer'?.13:floor,z],yaw,path,height});
 if(slug==='silver-lance')return [p('rider',-7,-.65,Math.PI/2,[[-7,floor,-.65],[7,floor,-.65]]),
  p('rider',7,.65,-Math.PI/2,[[7,floor,.65],[-7,floor,.65]]),p('squire',-8,2),p('squire',8,-2,Math.PI)];
 if(slug==='five-banners'||slug==='iron-colosseum')return Array.from({length:slug==='five-banners'?6:4},(_,i)=>
  p('duelist',-3+Math.floor(i/2)*3,(i%2?1:-1)*.75,i%2?Math.PI:0));
 if(slug==='kings-mark')return [p('archer',-6.6,1.35,Math.PI),p('archer',0,1.35,Math.PI),p('archer',6.6,1.35,Math.PI),p('attendant',-5,2.8,Math.PI),p('attendant',5,2.8,Math.PI)];
 return [-5.4,0,5.4].map(x=>p('server',x,0,0,[[x,floor,-3.5],[x,floor,4.3]])).concat(p('musician',5.4,-4.5,Math.PI/2));
}

/** Decorative only: no booking state or atlas armies enter this module. Nine shared human batches, plus one venue-specific equipment/horse batch. */
export function createVenuePeople(THREE,slug,{layout,mobile=false}={}){
 const profile=profiles[slug];if(!profile||!layout)return null;
 const height=layout.profile.chair*3.2,people=[],seats=seatsFor(profile),factor=mobile ? .5 : 1;
 for(let i=0;i<Math.floor(profile.seated*factor);i++){
  const seat=seats[Math.floor(i*seats.length/Math.floor(profile.seated*factor))];
  people.push({...seat,role:'spectator',kind:'seated',height});
 }
 const paths=walkingPaths(layout,height);
 for(let i=0;i<Math.floor(profile.visitors*factor)&&paths.length;i++){
  const path=paths[i%paths.length].map(point=>[...point]);
  // Separate lanes within the paved strip when a route is reused.
  const strip=layout.walkways.find(r=>path.every(v=>v[0]>=r.minX&&v[0]<=r.maxX&&v[2]>=r.minZ&&v[2]<=r.maxZ));
  const side=i<paths.length?-1:1,offset=height*.12*side,axis=path[0][0]===path[1][0]?0:2;
  for(const point of path)point[axis]+=offset;
  if(!strip||!path.every(v=>v[0]>=strip.minX&&v[0]<=strip.maxX&&v[2]>=strip.minZ&&v[2]<=strip.maxZ))continue;
  people.push({role:'visitor',kind:'walker',anchor:path[0],path,height,yaw:0});
 }
 people.push(...performers(slug,height));
 people.forEach((person,i)=>{person.phase=(i*.61803398875)%1;person.frame={};});
 const group=new THREE.Group();group.name='Decorative festival people';
 group.userData.decorative=true;
 const box=new THREE.BoxGeometry(1,1,1),sphere=new THREE.SphereGeometry(1,8,6);
 const torsoGeometry=new THREE.CylinderGeometry(.46,.53,1,6,1);
 const limbGeometry=new THREE.CapsuleGeometry(.5,1,2,4);limbGeometry.scale(1,.5,1);
 const cloth=new THREE.MeshStandardMaterial({roughness:.9}),skin=new THREE.MeshStandardMaterial({roughness:1});
 const metal=new THREE.MeshStandardMaterial({color:0x947345,roughness:.65});
 const names=['torso','head','left-arm','right-arm','left-leg','right-leg','equipment'];
 const meshes=names.map((name,i)=>{
  const geometry=i===0?torsoGeometry:i===1?sphere:i<6?limbGeometry:box;
  const mesh=new THREE.InstancedMesh(geometry,i===1?skin:i===6?metal:cloth,people.length*(i>=2&&i<6?2:1));
  mesh.userData.part=name;return mesh;
 });
 const details=new THREE.InstancedMesh(box,cloth,people.length*10);details.userData.part='face-clothing-details';
 const hairHands=new THREE.InstancedMesh(sphere,cloth,people.length*3);hairHands.userData.part='hair-hands';
 const horseCount=people.filter(p=>p.kind==='rider').length;
 const horses=horseCount?new THREE.InstancedMesh(sphere,cloth,horseCount*12):null;
 const archers=people.filter(p=>p.kind==='archer').length,musicians=people.filter(p=>p.kind==='musician').length;
 const bowGeometry=archers?new THREE.TorusGeometry(.25,.018,3,12,Math.PI):null;
 const bows=archers?new THREE.InstancedMesh(bowGeometry,metal,archers):null;
 const lutes=musicians?new THREE.InstancedMesh(sphere,metal,musicians):null;
 for(const mesh of [...meshes,details,hairHands,...(horses?[horses]:[]),...(bows?[bows]:[]),...(lutes?[lutes]:[])]){
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);
 }
 const palette=[0x7a2639,0x254f68,0x4b6543,0xc3aa70,0x73573f],skins=[0xd8ab80,0xb7805c,0x80513a,0xe6bd98],hairColors=[0x30241f,0x71442b,0xc6a16c,0x49433b];
 const color=new THREE.Color();
 const paint=(mesh,index,hex)=>mesh.setColorAt(index,color.setHex(hex));
 people.forEach((person,i)=>{
  person.armored=['rider','duelist','squire'].includes(person.kind);
  meshes.forEach((mesh,part)=>{
   const hex=part===1?skins[i%4]:part>=4&&part<6?0x49362b:person.armored&&part===0?0x68777b:palette[i%5];
   const segments=part>=2&&part<6?2:1;
   for(let j=0;j<segments;j++)paint(mesh,i*segments+j,hex);
  });
  const detailColors=[skins[i%4],0x49362b,0xc6a15e,0x35291e,0x35291e,0x201c1a,0x201c1a,skins[i%4],person.armored?0xc1a36c:0xe4cd9e,person.armored?0x68777b:palette[i%5]];
  detailColors.forEach((hex,j)=>paint(details,i*10+j,hex));
  paint(hairHands,i*3,person.armored?0x63737a:hairColors[i%4]);
  paint(hairHands,i*3+1,skins[i%4]);paint(hairHands,i*3+2,skins[i%4]);
  person.frame.leftHand=[];person.frame.rightHand=[];person.frame.knee=[];person.frame.foot=[];
 });
 if(horses)for(let i=0;i<horseCount*12;i++)paint(horses,i,i<12?0x66503c:0xbca582);
 const base=new THREE.Object3D(),part=new THREE.Object3D(),matrix=new THREE.Matrix4(),torsoFrame=new THREE.Matrix4(),headFrame=new THREE.Matrix4();
 const endpoint=new THREE.Vector3(),rotation=new THREE.Euler();
 let time=0,motion=true,disposed=false;
 const put=(mesh,index,x,y,z,w,h,d,rx=0,rz=0,parent=base.matrix,ry=0)=>{
  part.position.set(x,y,z);part.rotation.set(rx,ry,rz);part.scale.set(Math.max(.00001,w),Math.max(.00001,h),Math.max(.00001,d));part.updateMatrix();
  matrix.multiplyMatrices(parent,part.matrix);mesh.setMatrixAt(index,matrix);
 };
 // Upper/lower limb parts share a batch; endpoints also anchor hands, boots and props.
 const joint=(mesh,index,x,y,z,length,width,angle,spread,out,parent=base.matrix)=>{
  endpoint.set(0,-length,0).applyEuler(rotation.set(angle,0,spread));
  put(mesh,index,x+endpoint.x*.5,y+endpoint.y*.5,z+endpoint.z*.5,width,length,width,angle,spread,parent);
  out[0]=x+endpoint.x;out[1]=y+endpoint.y;out[2]=z+endpoint.z;
 };
 function draw(){
  let horseIndex=0,bowIndex=0,luteIndex=0;
  people.forEach((person,i)=>{
   const h=person.height,f=person.frame,phase=person.phase*Math.PI*2;
   f.x=person.anchor[0];f.y=person.anchor[1];f.z=person.anchor[2];f.yaw=person.yaw;f.walk=0;f.moving=false;
   if(person.path){
    const length=Math.hypot(person.path[1][0]-person.path[0][0],person.path[1][2]-person.path[0][2]);
    const u=(time/(length/(h*.65)+6)+person.phase)%1;
    const forward=u<.5,progress=forward?Math.max(0,Math.min(1,(u-.08)/.34)):1-Math.max(0,Math.min(1,(u-.58)/.34));
    const [a,b]=person.path;f.x=a[0]+(b[0]-a[0])*progress;f.z=a[2]+(b[2]-a[2])*progress;
    f.yaw=Math.atan2(b[0]-a[0],b[2]-a[2])+(forward?0:Math.PI);
    f.moving=(u>.08&&u<.42)||(u>.58&&u<.92);f.walk=f.moving?Math.sin(time*6+phase):0;
   }
   const seated=person.kind==='seated',rider=person.kind==='rider',duel=person.kind==='duelist',archer=person.kind==='archer',server=person.kind==='server',musician=person.kind==='musician';
   if(duel){f.x+=Math.sin(time*.8+phase)*h*.18;f.z+=Math.sin(time*.9+phase)*h*.14;}
   base.position.set(f.x,f.y+(rider?h*.87:0),f.z);base.rotation.set(0,f.yaw,0);base.scale.set(1,1,1);base.updateMatrix();
   const hip=seated||rider?h*.05:h*.44;
   const slow=Math.sin(time*.85+phase),gesture=Math.sin(time*1.8+phase);
   const cycle=(time+person.phase*14)%14,envelope=cycle<3?Math.sin(cycle/3*Math.PI)**2:0;
   const dinner=slug==='victors-feast'&&seated;
   const cheer=seated&&!dinner?envelope:0;
   // Torso lean and head turns remain active during path pauses, without moving feet off their paths.
   part.position.set(Math.sin(time*.7+phase)*h*.012,hip,0);
   part.rotation.set(slow*.025,Math.sin(time*.55+phase)*.045,Math.sin(time*.65+phase)*.025);part.scale.set(1,1,1);part.updateMatrix();
   torsoFrame.multiplyMatrices(base.matrix,part.matrix);
   put(meshes[0],i,0,h*.16,0,h*.23,h*(person.armored?.32:.35),h*.15,0,0,torsoFrame);
   part.position.set(0,h*.43+slow*h*.006,0);part.rotation.set(Math.sin(time*.9+phase)*.07,Math.sin(time*.6+phase)*.22,0);part.scale.set(1,1,1);part.updateMatrix();
   headFrame.multiplyMatrices(torsoFrame,part.matrix);
   put(meshes[1],i,0,0,0,h*.097,h*.113,h*.092,0,0,headFrame);
   put(hairHands,i*3,0,h*.054,-h*.008,h*.103,h*(person.armored?.09:.077),h*.10,0,0,headFrame);
   const k=i*10;
   put(details,k,0,h*.327,0,h*.065,h*.07,h*.065,0,0,torsoFrame);
   put(details,k+1,0,h*.025,0,h*.245,h*.035,h*.16,0,0,torsoFrame);
   put(details,k+2,0,h*.025,h*.086,h*.04,h*.035,h*.012,0,0,torsoFrame);
   put(details,k+5,-h*.034,h*.014,h*.085,h*.017,h*.018,h*.016,0,0,headFrame);
   put(details,k+6,h*.034,h*.014,h*.085,h*.017,h*.018,h*.016,0,0,headFrame);
   put(details,k+7,0,-h*.015,h*.095,h*.027,h*.035,h*.025,0,0,headFrame);
   put(details,k+8,0,h*.19,h*.078,h*.035,h*.19,h*.012,0,0,torsoFrame);
   put(details,k+9,0,h*.057,0,person.armored?.00001:h*.22,person.armored?.00001:h*.018,person.armored?.00001:h*.19,0,0,headFrame);
   for(let side=0;side<2;side++){
    const sign=side?-1:1,hand=side?f.rightHand:f.leftHand;
    let upper=sign*f.walk*.38,lower=-.15,spread=sign*.08;
    if(!f.moving){upper=-.12+Math.sin(time*1.15+phase+side)*.1;lower=-.22-((i%3===0&&side===1)?envelope*1.4:envelope*.25);spread=sign*(.08+envelope*.12);}
    if(seated){upper=-.25-cheer*.95;lower=-.8-cheer*.5;spread=sign*(.15-cheer*.12);}
    if(dinner){upper=-.35;lower=-.65-(side===1?envelope*.85:0);}
    if(archer){upper=-1.3;lower=side===0?-.05:-.8-gesture*.3;}
    if(duel){upper=-.7+gesture*.45;lower=-.5-gesture*.35;}
    if(server){upper=-.65;lower=-.85+Math.sin(time+phase)*.045;}
    if(musician){upper=-.55;lower=side===0?-1.1:-.85+gesture*.22;}
    if(rider){upper=-.8;lower=-.7;}
    joint(meshes[2+side],i*2,sign*h*.145,h*.285,0,h*.17,h*.07,upper,spread,hand,torsoFrame);
    joint(meshes[2+side],i*2+1,hand[0],hand[1],hand[2],h*.16,h*.058,upper+lower,spread,hand,torsoFrame);
    put(hairHands,i*3+side+1,hand[0],hand[1],hand[2],h*.038,h*.044,h*.035,0,0,torsoFrame);
    const thigh=seated||rider?-1.35:sign*f.walk*.35,kneeAngle=seated||rider?.12:Math.max(0,-sign*f.walk)*.45;
    joint(meshes[4+side],i*2,sign*h*.067,hip,0,h*.22,h*.08,thigh,0,f.knee);
    joint(meshes[4+side],i*2+1,...f.knee,h*.22,h*.065,kneeAngle,0,f.foot);
    put(details,k+3+side,f.foot[0],f.foot[1]+h*.025,f.foot[2]+h*.025,h*.087,h*.05,h*.13);
   }
   const right=f.rightHand,left=f.leftHand,armed=duel||archer||rider||musician||server;
   const grip=musician?left:right;
   put(meshes[6],i,grip[0],grip[1]+(server||rider?0:musician?h*.10:h*.21),grip[2]+(rider?h*.55:0),armed?h*(archer?.012:server?.34:.035):.00001,armed?h*(server?.025:rider?1.8:musician?.35:.48):.00001,armed?h*(server?.26:.035):.00001,rider?Math.PI/2:duel?gesture*.35:0,musician?-.4:0,torsoFrame);
   if(archer){
    // The midpoint of the curved wood meets the grip; both string halves follow the drawing hand.
    put(bows,bowIndex++,left[0]-h*.25,left[1],left[2],h,h,h,0,-Math.PI/2,torsoFrame);
    put(meshes[6],i,0,0,0,.00001,.00001,.00001);
    for(let end=0;end<2;end++){
     const x=left[0]-h*.25,y=left[1]+(end?1:-1)*h*.25,z=left[2];
     const dx=right[0]-x,dy=right[1]-y,dz=right[2]-z,length=Math.hypot(dx,dy,dz);
     put(details,k+8+end,(x+right[0])/2,(y+right[1])/2,(z+right[2])/2,h*.009,length,h*.009,Math.atan2(dz,dy),-Math.asin(dx/length),torsoFrame);
    }
   }
   if(musician)put(lutes,luteIndex++,-h*.07,h*.10,h*.23,h*.15,h*.18,h*.06,0,-.3,torsoFrame);
   if(dinner&&i%3===1)put(details,k+8,right[0],right[1]+h*.04,right[2],h*.065,h*.09,h*.065,0,0,torsoFrame);
   if(rider){
    base.position.y=person.anchor[1];base.updateMatrix();const j=horseIndex++*12;
    put(horses,j,0,h*.57,0,h*.30,h*.25,h*.67);
    put(horses,j+1,0,h*.88,h*.46,h*.16,h*.31,h*.19,-.35);
    put(horses,j+2,0,h*1.10,h*.65,h*.15,h*.16,h*.27);
    for(let leg=0;leg<4;leg++)put(horses,j+3+leg,(leg%2?1:-1)*h*.19,h*.25,(leg<2?1:-1)*h*.42,h*.06,h*.25,h*.06,f.moving?Math.sin(time*8+leg*Math.PI/2)*.22:0);
    put(horses,j+7,0,h*.50,-h*.70,h*.055,h*.24,h*.06,.35);
    put(horses,j+8,-h*.085,h*1.29,h*.59,h*.035,h*.11,h*.045,-.2);
    put(horses,j+9,h*.085,h*1.29,h*.59,h*.035,h*.11,h*.045,-.2);
    put(horses,j+10,0,h*1.04,h*.86,h*.14,h*.10,h*.15);
    put(horses,j+11,0,h*.80,-h*.04,h*.23,h*.10,h*.30);
   }
  });
  for(const mesh of group.children)mesh.instanceMatrix.needsUpdate=true;
 }
 draw();
 return {group,people,
  update(delta){if(disposed||!motion||!group.visible||!Number.isFinite(delta)||delta<=0)return;time+=Math.min(delta,.05);draw();},
  setMotionEnabled(enabled){motion=Boolean(enabled);},
  setVisible(visible){group.visible=Boolean(visible);},
  dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const mesh of group.children)mesh.dispose();box.dispose();sphere.dispose();torsoGeometry.dispose();limbGeometry.dispose();bowGeometry?.dispose();cloth.dispose();skin.dispose();metal.dispose();group.clear();},
 };
}
