/** Miniature scenery belongs only to detailed viewers; arena builders remain untouched. */
const profiles={
 'silver-lance':{halfX:22.3,halfZ:15.5,accent:0x315c43,trim:0xd3b66c,theme:'lists',scale:.45,chair:.225,cols:15,motos:20,parkingSide:'west',foodSide:'east',offset:0,foodOffset:5,pattern:'row'},
 'five-banners':{halfX:22.3,halfZ:15.5,accent:0x315c43,trim:0xd3b66c,theme:'lists',scale:.45,chair:.225,cols:15,motos:20,parkingSide:'west',foodSide:'east',offset:0,foodOffset:5,pattern:'row'},
 'iron-colosseum':{halfX:20,halfZ:14.4,accent:0x345978,trim:0xc3a875,theme:'colosseum',scale:.55,chair:.30,cols:20,motos:24,parkingSide:'north',foodSide:'west',offset:1.5,foodOffset:-2,pattern:'court'},
 'kings-mark':{halfX:17.3,halfZ:8.9,accent:0x61743d,trim:0xd8bd7d,theme:'green',scale:.32,chair:.152,cols:12,motos:16,parkingSide:'east',foodSide:'south',offset:2,foodOffset:-3,pattern:'garden'},
 'victors-feast':{halfX:17.3,halfZ:8.9,accent:0x843e32,trim:0xe0bc70,theme:'hall',scale:.75,chair:.40,cols:12,motos:16,parkingSide:'south',foodSide:'north',offset:6,foodOffset:-3,pattern:'courtyard'},
};
const rect=(x,z,w,d)=>({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2});
const rotate=(x,z,angle)=>({x:x*Math.cos(angle)+z*Math.sin(angle),z:-x*Math.sin(angle)+z*Math.cos(angle)});
function worldRect(area,x,z,w,d){
 const point=rotate(x*area.scale,z*area.scale,area.angle);
 const width=(Math.abs(Math.cos(area.angle))*w+Math.abs(Math.sin(area.angle))*d)*area.scale;
 const depth=(Math.abs(Math.sin(area.angle))*w+Math.abs(Math.cos(area.angle))*d)*area.scale;
 return rect(area.x+point.x,area.z+point.z,width,depth);
}
function areaAt(arena,side,width,depth,scale,offset,food=false){
 const angle=({west:Math.PI/2,north:0,east:-Math.PI/2,south:Math.PI})[side]+(food?Math.PI:0);
 const w=(Math.abs(Math.cos(angle))*width+Math.abs(Math.sin(angle))*depth)*scale;
 const d=(Math.abs(Math.sin(angle))*width+Math.abs(Math.cos(angle))*depth)*scale;
 let x=(arena.minX+arena.maxX)/2,z=(arena.minZ+arena.maxZ)/2;const gap=6*scale;
 if(side==='west'){x=arena.minX-gap-w/2;z+=offset;}
 if(side==='east'){x=arena.maxX+gap+w/2;z+=offset;}
 if(side==='north'){z=arena.minZ-gap-d/2;x+=offset;}
 if(side==='south'){z=arena.maxZ+gap+d/2;x+=offset;}
 return {...rect(x,z,w,d),x,z,width,depth,scale,angle,side};
}
export function surroundingsLayout(slug,arenaBounds){
 const profile=profiles[slug];if(!profile)return null;const scale=profile.scale;
 const arena=arenaBounds?{minX:arenaBounds.min.x,maxX:arenaBounds.max.x,minZ:arenaBounds.min.z,maxZ:arenaBounds.max.z}:rect(0,0,profile.halfX*2,profile.halfZ*2);
 const parking=areaAt(arena,profile.parkingSide,profile.cols*2.7+5,37,scale,profile.offset);
 const food=areaAt(arena,profile.foodSide,18,16,scale,profile.foodOffset,true);
 const bays=[],rowCenters=[-14.1,-2.7,2.7,14.1],accessibleCount=profile.cols>=15?4:2;
 for(let row=0;row<4;row++)for(let col=0;col<profile.cols;col++){
  const localX=(col-(profile.cols-1)/2)*2.7+1,localZ=rowCenters[row];
  const accessible=row===3&&col>=Math.floor((profile.cols-accessibleCount)/2)&&col<Math.floor((profile.cols-accessibleCount)/2)+accessibleCount;
  const area=worldRect(parking,localX,localZ,2.7,5.4);
  bays.push({...area,localX,localZ,accessible,occupied:!accessible&&(row*profile.cols+col)%3!==0});
 }
 const patterns={row:[[-6.7,0,0],[-2.6,0,0],[2.6,0,0],[6.7,0,0]],
  court:[[-5,-2,-Math.PI/2],[-5,2,-Math.PI/2],[5,-2,Math.PI/2],[5,2,Math.PI/2]],
  garden:[[-6.7,0,0],[-2.6,1,0],[2.6,0,0],[6.7,1,0]],
  courtyard:[[-5,-2,-Math.PI/2],[-5,2,-Math.PI/2],[-1,5,0],[3,5,0]]};
 const stalls=patterns[profile.pattern].map(([localX,localZ,angle],i)=>({
  ...worldRect(food,localX,localZ,Math.abs(Math.cos(angle))*3.2+Math.abs(Math.sin(angle))*2.8,Math.abs(Math.sin(angle))*3.2+Math.abs(Math.cos(angle))*2.8),
  localX,localZ,angle,kind:i===3?'drinks':'food',
 }));
 const motorcycles=Array.from({length:profile.motos},(_,i)=>({localX:-profile.cols*1.35-1.15,localZ:-14.5+i*29/(profile.motos-1)}));
 const offset=2.8*scale,width=2.4*scale,x0=arena.minX-offset,x1=arena.maxX+offset,z0=arena.minZ-offset,z1=arena.maxZ+offset;
 const walkways=[rect((x0+x1)/2,z0,x1-x0+width,width),rect((x0+x1)/2,z1,x1-x0+width,width),rect(x0,(z0+z1)/2,width,z1-z0),rect(x1,(z0+z1)/2,width,z1-z0)];
 walkways.push(rect((arena.minX+arena.maxX)/2,arena.maxZ+offset/2,width,offset));
 for(const area of [parking,food]){
  if(area.side==='west')walkways.push(rect((area.maxX+x0)/2,area.z,x0-area.maxX,width));
  if(area.side==='east')walkways.push(rect((area.minX+x1)/2,area.z,area.minX-x1,width));
  if(area.side==='north')walkways.push(rect(area.x,(area.maxZ+z0)/2,width,z0-area.maxZ));
  if(area.side==='south')walkways.push(rect(area.x,(area.minZ+z1)/2,width,area.minZ-z1));
 }
 const site={minX:Math.min(x0-width,parking.minX,food.minX)-2*scale,maxX:Math.max(x1+width,parking.maxX,food.maxX)+2*scale,
  minZ:Math.min(z0-width,parking.minZ,food.minZ)-2*scale,maxZ:Math.max(z1+width,parking.maxZ,food.maxZ)+2*scale};
 return {profile,scale,arena,parking,food,bays,stalls,motorcycles,walkways,site,
  dimensions:{chairWidth:profile.chair,carWidth:1.85*scale,stallWidth:3.2*scale,stallHeight:3.1*scale,picnicSeatHeight:.46*scale}};
}

export function festivalLabelMaterial(THREE,text,canvas) {
 canvas.width=1024;canvas.height=180;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#293d32';ctx.fillRect(0,0,1024,180);ctx.strokeStyle='#d8bc78';ctx.lineWidth=8;ctx.strokeRect(8,8,1008,164);
 ctx.font='bold 72px Georgia, serif';const size=Math.min(72,72*930/Math.max(1,ctx.measureText(text).width));
 ctx.font=`bold ${size}px Georgia, serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff1c7';ctx.fillText(text,512,92);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 return new THREE.MeshStandardMaterial({map,roughness:.8});
}

/** Fit projected corners, avoiding the empty space a bounding-sphere fit adds to wide stages. */
export function fitSurroundingsPreset(THREE,bounds,{aspect=1,fov=37,top=false,direction:viewDirection,parts=[bounds]}={}) {
 const center=bounds.getCenter(new THREE.Vector3()),radius=bounds.getSize(new THREE.Vector3()).length()/2;
 if(!top)center.y=Math.min(center.y,2.0);
 const vertical=fov*Math.PI/360,horizontal=Math.atan(Math.tan(vertical)*Math.max(0.2,aspect));
 const direction=new THREE.Vector3(...(top?[0,1,0.0001]:(viewDirection||[0.65,0.95,1.35]))).normalize();
 const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
 const up=new THREE.Vector3().crossVectors(direction,right).normalize();let distance=1;
 for(const part of parts)for(const x of [part.min.x,part.max.x])for(const y of [part.min.y,part.max.y])for(const z of [part.min.z,part.max.z]){
  const point=new THREE.Vector3(x,y,z).sub(center);
  distance=Math.max(distance,point.dot(direction)+Math.max(Math.abs(point.dot(right))/(Math.tan(horizontal)*.9),Math.abs(point.dot(up))/(Math.tan(vertical)*.9)));
 }
 return {pos:center.clone().addScaledVector(direction,distance).toArray(),target:center.toArray(),far:Math.max(180,distance+radius*3),distance};
}





export function buildVenueSurroundings(THREE,slug,{arenaBounds,labelMaterialFactory}={}){
 const layout=surroundingsLayout(slug,arenaBounds);if(!layout)return null;const {profile,scale,parking,food,site,arena}=layout;
 const group=new THREE.Group();group.name='Detailed festival surroundings';
 const zones={parking:new THREE.Group(),food:new THREE.Group(),decoration:new THREE.Group()};
 for(const [name,zone] of Object.entries(zones)){zone.name='Festival '+name;group.add(zone);}
 for(const key of ['parking','food']){const area=layout[key];zones[key].position.set(area.x,0,area.z);zones[key].rotation.y=area.angle;zones[key].scale.setScalar(scale);}
 const geometries=new Set(),materials=new Set(),instances=[],lights=[],batches=new Map(),labels=new Map();let disposed=false;
 const material=(color,options={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.8,...options});materials.add(m);return m;};
 const mat={grass:material(0x66784c),paving:material(0xc4b695),asphalt:material(0x505657),line:material(0xebe4d2),blue:material(0x366b9c),
  wood:material(0x715035),timber:material(0xa27a4d),iron:material(0x30393b,{metalness:.4}),cloth:material(profile.accent),cream:material(0xf0dfb7),
  gold:material(profile.trim,{metalness:.3}),glass:material(0x2d4854,{roughness:.25}),rubber:material(0x26282a),leaf:material(0x3d6341),flower:material(0xd5af58),
  bread:material(0xb97e42),red:material(0x974437),glow:material(0xffd795,{emissive:0xffb65b,emissiveIntensity:0})};
 const box=new THREE.BoxGeometry(1,1,1);geometries.add(box);
 const wheel=new THREE.CylinderGeometry(.5,.5,1,10);wheel.rotateZ(Math.PI/2);geometries.add(wheel);
 const dummy=new THREE.Object3D();
 function draw(parent,geometry,m,matrix){const key=parent.uuid+geometry.uuid+m.uuid;let b=batches.get(key);if(!b){b={parent,geometry,material:m,matrices:[]};batches.set(key,b);}b.matrices.push(matrix.clone());}
 function placer(parent,x=0,z=0,angle=0){
  const frame=new THREE.Matrix4().makeRotationY(angle);frame.setPosition(x,0,z);
  return (m,w,h,d,px,py,pz,rx=0,geometry=box)=>{dummy.position.set(px,py,pz);dummy.rotation.set(rx,0,0);dummy.scale.set(w,h,d);dummy.updateMatrix();draw(parent,geometry,m,new THREE.Matrix4().multiplyMatrices(frame,dummy.matrix));};
 }
 const deco=placer(zones.decoration),lot=placer(zones.parking),court=placer(zones.food);
 deco(mat.grass,site.maxX-site.minX,.12,site.maxZ-site.minZ,(site.minX+site.maxX)/2,-.16,(site.minZ+site.maxZ)/2);
 for(const r of layout.walkways)deco(mat.paving,r.maxX-r.minX,.06,r.maxZ-r.minZ,(r.minX+r.maxX)/2,.015,(r.minZ+r.maxZ)/2);
 lot(mat.asphalt,parking.width,.16,parking.depth,0,-.08,0);
 court(mat.paving,food.width,.12,food.depth,0,-.04,0);
 // Two double-loaded parking aisles and a separate entrance-side pedestrian strip.
 lot(mat.paving,parking.width,.08,2,0,.01,17.5);
 for(const z of [-8.4,8.4]){
  for(let x=-profile.cols*1.35+3;x<profile.cols*1.35;x+=5)lot(mat.line,1.3,.025,.09,x,.025,z);
 }
 for(const bay of layout.bays){
  const {localX:x,localZ:z}=bay;
  if(bay.accessible)lot(mat.blue,2.6,.025,5.25,x,.025,z);
  for(const side of [-1,1])lot(mat.line,.065,.025,5.3,x+side*1.33,.04,z);
  lot(mat.line,2.7,.025,.065,x,.04,z+(z<0?-2.65:2.65));
  if(bay.accessible){
   const ring=new THREE.TorusGeometry(.32,.045,5,14);ring.rotateX(-Math.PI/2);geometries.add(ring);
   const mesh=new THREE.Mesh(ring,mat.line);mesh.position.set(x,.07,z);zones.parking.add(mesh);
   lot(mat.line,.09,.025,.62,x-.09,.08,z-.43);lot(mat.line,.55,.025,.09,x+.12,.08,z-.18);lot(mat.line,.09,.025,.35,x+.34,.08,z-.03);
  }
 }
 const paints=[0x883e3b,0xd5d1c4,0x43677d,0xc5a257,0x687268,0x373f49].map(c=>material(c,{roughness:.4,metalness:.2}));let car=0;
 for(const bay of layout.bays.filter(b=>b.occupied)){
  const put=placer(zones.parking,bay.localX,bay.localZ),body=paints[car++%paints.length];
  put(body,1.85,.6,4.15,0,.56,0);put(mat.glass,1.6,.48,2.1,0,1.12,-.12);put(body,1.63,.12,1.6,0,1.4,-.12);
  for(const sx of [-1,1])for(const sz of [-1,1]){put(mat.rubber,.22,.55,.55,sx*.92,.31,sz*1.3,0,wheel);put(mat.iron,.24,.24,.24,sx*.93,.31,sz*1.3,0,wheel);}
  for(const sx of [-1,1]){put(mat.line,.36,.16,.035,sx*.58,.65,2.09);put(mat.red,.36,.16,.035,sx*.58,.65,-2.09);}
 }
 for(const bike of layout.motorcycles){
  const put=placer(zones.parking,bike.localX,bike.localZ,Math.PI/2);
  for(const z of [-.6,.6])put(mat.rubber,.14,.5,.5,0,.28,z,0,wheel);
  put(mat.iron,.2,.35,1.2,0,.6,0);put(mat.cloth,.42,.28,.45,0,.85,.16);put(mat.rubber,.38,.1,.55,0,1,-.15);put(mat.iron,.7,.055,.08,0,1.1,.55);
 }
 function sign(parent,text,x,y,z,width=3.2,angle=0){
  const put=placer(parent,x,z,angle);put(mat.wood,width+.1,.62,.1,0,y,0);
  if(!labelMaterialFactory)return;
  let m=labels.get(text);if(!m){m=labelMaterialFactory(text);labels.set(text,m);materials.add(m);}
  const geo=new THREE.PlaneGeometry(width,.53);geometries.add(geo);
  for(const side of [-1,1]){
   const point=rotate(0,side*.06,angle),mesh=new THREE.Mesh(geo,m);mesh.position.set(x+point.x,y,z+point.z);mesh.rotation.y=angle+(side<0?Math.PI:0);parent.add(mesh);
  }
 }
 sign(zones.parking,'PARKING · '+layout.bays.length+' SPACES',0,2.25,16.4,5);
 for(const x of [-2.5,2.5])lot(mat.iron,.12,2.3,.12,x,1.1,16.4);
 // Vehicle entrance at the near end of the lot's clear aisle.
 lot(mat.iron,.16,1.1,.16,-parking.width/2+.5,.55,8.4);
 lot(mat.cream,3.2,.12,.12,-parking.width/2+2,1.1,8.4);
 const names=profile.theme==='hall'?['HEARTH BREAD','ROYAL PIES','HONEY CAKES','COLD DRINKS']:
  profile.theme==='colosseum'?['ARENA GRILL','STONE-OVEN PIES','SWEET VICTORY','COLD DRINKS']:
  profile.theme==='green'?['GARDEN GRILL','RUSTIC BREAD','ORCHARD TREATS','COLD DRINKS']:['SQUIRE’S GRILL','TOURNEY PIES','HONEY CAKES','COLD DRINKS'];
 layout.stalls.forEach((stall,index)=>{
  const put=placer(zones.food,stall.localX,stall.localZ,stall.angle);
  put(profile.theme==='colosseum'?mat.paving:mat.wood,3,1,2.2,0,.5,0);put(mat.timber,3.3,.12,.7,0,1.08,-1.1);
  for(const x of [-1.5,1.5])for(const z of [-1.2,1.2])put(mat.timber,.09,2.7,.09,x,1.35,z);
  for(const side of [-1,1])for(let stripe=0;stripe<6;stripe++)put(stripe%2?mat.cream:mat.cloth,.55,.1,1.55,(stripe-2.5)*.55,2.85,side*.65,side*.24);
  const signPoint=rotate(0,-1.3,stall.angle);sign(zones.food,names[index],stall.localX+signPoint.x,2.22,stall.localZ+signPoint.z,3,stall.angle);
  for(let i=0;i<5;i++)put(index===3?mat.glass:mat.bread,.22,index===3?.32:.14,.22,(i-2)*.5,1.23,-1.1);
 });
 function table(parent,x,z){const put=placer(parent,x,z);put(mat.timber,2.4,.12,.9,0,.76,0);for(const side of [-1,1]){put(mat.wood,.12,.72,.7,side*.88,.36,0);put(mat.timber,2.4,.12,.32,0,.46,side*.85);}}
 const tables=profile.pattern==='courtyard'?[[3,-3],[6,-3],[3,1],[6,1]]:[[-6,5.7],[-2,5.7],[2,5.7],[6,5.7]];
 for(const [x,z] of tables)table(zones.food,x,z);
 for(const x of [-8,8]){court(mat.iron,.48,.8,.48,x,.4,-5.7);court(mat.gold,.52,.08,.52,x,.84,-5.7);}
 // Small planted borders and bunting are scaled with the venue furniture, not the stadium envelope.
 const crown=new THREE.IcosahedronGeometry(1,0);geometries.add(crown);
 for(const x of [-8,8]){
  court(mat.paving,1.3,.35,1.3,x,.12,6.7);court(mat.wood,.18,1.8,.18,x,.9,6.7);
  const tree=new THREE.Mesh(crown,mat.leaf);tree.position.set(x,2.2,6.7);zones.food.add(tree);
  court(mat.wood,.09,3,.09,x,1.5,7.2);
 }
 court(mat.gold,16,.025,.025,0,2.85,7.2);
 const triangle=new THREE.BufferGeometry();triangle.setAttribute('position',new THREE.Float32BufferAttribute([-.18,0,0,.18,0,0,0,-.35,0],3));triangle.computeVertexNormals();geometries.add(triangle);
 const flagMaterial=material(profile.accent,{side:THREE.DoubleSide}),flags=new THREE.InstancedMesh(triangle,flagMaterial,19);instances.push(flags);
 for(let i=0;i<19;i++){dummy.position.set(-7.2+i*.8,2.84,7.2);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();flags.setMatrixAt(i,dummy.matrix);}zones.food.add(flags);
 // Entrance decorations stay beside the venue's original front gate.
 const midX=(arena.minX+arena.maxX)/2,front=arena.maxZ;
 for(const side of [-1,1]){
  const x=midX+side*2.2*scale,z=front+.5*scale;
  deco(mat.iron,.09*scale,3.3*scale,.09*scale,x,1.65*scale,z);
  deco(mat.cloth,.7*scale,1.4*scale,.035*scale,x+side*.35*scale,2.4*scale,z);
 }
 for(const [x,z] of [[arena.minX-4.8*scale,arena.minZ-4.8*scale],[arena.maxX+4.8*scale,arena.maxZ+4.8*scale]]){
  deco(mat.paving,1.2*scale,.35*scale,1.2*scale,x,.12*scale,z);deco(mat.leaf,scale,.5*scale,scale,x,.5*scale,z);deco(mat.flower,.6*scale,.2*scale,.6*scale,x,.8*scale,z);
 }
 // Each food court carries a small venue-specific display.
 if(profile.theme==='lists')for(let i=0;i<3;i++)court(mat.bread,.85,.5,.65,-7+i*.9,.25,-6.8);
 if(profile.theme==='green')for(const x of [-4,0,4]){court(mat.wood,.08,1.6,.08,x,.8,-7);court(mat.cream,.6,.6,.08,x,1.35,-7);court(mat.red,.18,.18,.09,x,1.35,-7.01);}
 if(profile.theme==='colosseum')for(const x of [-3,3]){court(mat.paving,.8,.5,.8,x,.25,-6.7);court(mat.gold,.5,.8,.5,x,.9,-6.7);}
 if(profile.theme==='hall')for(const x of [-7,7]){court(mat.paving,.9,.4,.9,x,.2,4.8);court(mat.flower,.7,.7,.7,x,.7,4.8);}
 function lamp(parent,x,z,actual=false){
  const put=placer(parent);put(mat.iron,.08,3,.08,x,1.5,z);put(mat.glow,.28,.45,.28,x,3,z);put(mat.gold,.4,.08,.4,x,3.28,z);
  if(actual){const light=new THREE.PointLight(0xffd09a,40*scale*scale,Math.max(parking.width,parking.depth)*scale,2);light.position.set(x,3.1,z);light.visible=false;parent.add(light);lights.push(light);}
 }
 lamp(zones.parking,parking.width/2-.7,17,true);lamp(zones.parking,-parking.width/2+.7,-16);lamp(zones.parking,parking.width/2-.7,-16);
 lamp(zones.food,8,-5.8,true);lamp(zones.food,-8,7);lamp(zones.food,8,7);
 for(const b of batches.values()){
  const mesh=new THREE.InstancedMesh(b.geometry,b.material,b.matrices.length);b.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.receiveShadow=true;mesh.castShadow=false;b.parent.add(mesh);instances.push(mesh);
 }
 const highlights={};
 for(const key of ['parking','food']){
  const area=layout[key],geo=new THREE.PlaneGeometry(area.width,area.depth);geometries.add(geo);
  const m=new THREE.MeshBasicMaterial({color:profile.trim,transparent:true,opacity:.14,depthWrite:false,side:THREE.DoubleSide});materials.add(m);
  const mesh=new THREE.Mesh(geo,m);mesh.rotation.x=-Math.PI/2;mesh.position.y=.12;mesh.visible=false;zones[key].add(mesh);highlights[key]=mesh;
 }
 group.updateMatrixWorld(true);
 const sceneryBounds=new THREE.Box3().setFromObject(group),bounds=sceneryBounds.clone();if(arenaBounds)bounds.union(arenaBounds);
 const framingParts=[sceneryBounds];if(arenaBounds)framingParts.push(arenaBounds.clone());
 return {group,zones,layout,bounds,framingParts,lights,highlights,
  setNight(on){mat.glow.emissiveIntensity=on?2.2:0;for(const light of lights)light.visible=Boolean(on);},
  dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const mesh of instances)mesh.dispose();for(const geo of geometries)geo.dispose();for(const m of materials){m.map?.dispose();m.dispose();}for(const light of lights)light.dispose();},
 };
}
