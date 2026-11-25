/** Practical fixtures use model coordinates and never depend on the viewing camera. */
const field=(kind)=>{
 const arena=kind==='arena',archery=kind==='archery';
 const x=archery?12.8:arena?13:13.4,z=archery?4:arena?7:3.4;
 return [
  ...[-1,1].flatMap(side=>[-1,1].map(end=>({kind:'flood',position:[side*x,archery?6.8:8.8,end*z],target:[side*3,.2,end*(archery?1.5:2)],power:archery?210:340,range:40,angle:.8}))),
  ...[-1,1].flatMap(side=>[-1,1].map(end=>({kind:'post',position:[side*(archery?10.8:arena?15:12.6),2.8,end*(archery?6.8:arena?9:7.5)],power:48,range:10})))
 ];
};
const hall=[...[-8.1,-2.7,2.7,8.1].map(x=>({kind:'hanging',position:[x,3.25,.2],target:[x,.3,.2],power:135,range:10,angle:1.05})),
 ...[-1,1].flatMap(side=>[-1,1].map(end=>({kind:'wall',position:[side*11.35,2.3,end*3.6],power:45,range:7})))];
export function fixtureDefinitions(slug){
 const list=slug==='victors-feast'?hall:['silver-lance','five-banners'].includes(slug)?field('lists'):slug==='iron-colosseum'?field('arena'):slug==='kings-mark'?field('archery'):[];
 return list.map(f=>({...f,position:[...f.position],...(f.target?{target:[...f.target]}:{})}));
}
export function buildVenueLighting(THREE,slug,{mobile=false}={}){
 const group=new THREE.Group();group.name='Practical venue fixtures';const lights=[],bulbs=[];
 const metal=new THREE.MeshStandardMaterial({color:0x263139,roughness:.72,metalness:.5});
 const glass=new THREE.MeshStandardMaterial({color:0xffe3ad,emissive:0xffce7d,emissiveIntensity:0,roughness:.35});
 const box=new THREE.BoxGeometry(1,.32,.55),bulb=new THREE.SphereGeometry(.14,8,6),pole=new THREE.CylinderGeometry(.065,.1,1,8);
 function mesh(geometry,material,parent){const m=new THREE.Mesh(geometry,material);parent.add(m);return m;}
 for(const [index,f] of fixtureDefinitions(slug).entries()){
  const fixture=new THREE.Group();fixture.name=f.kind+' fixture '+index;fixture.position.set(...f.position);group.add(fixture);
  if(f.kind==='flood'||f.kind==='post'){
   const support=mesh(pole,metal,fixture);support.scale.y=f.position[1];support.position.y=-f.position[1]/2;
  }else if(f.kind==='hanging'){
   const stem=mesh(pole,metal,fixture);stem.scale.y=.65;stem.position.y=.3;
  }else{const bracket=mesh(box,metal,fixture);bracket.scale.set(.45,.35,.7);}
  let light;
  if(f.target){
   const head=new THREE.Group();fixture.add(head);head.lookAt(new THREE.Vector3(...f.target));
   const housing=mesh(box,metal,head);housing.position.z=.07;
   const lens=mesh(box,glass,head);lens.scale.set(.83,.65,.1);lens.position.z=.36;bulbs.push(lens);
   light=new THREE.SpotLight(0xffdfaa,f.power,f.range,f.angle,.65,2);light.position.set(...f.position);
   light.target.position.set(...f.target);group.add(light.target);
   light.castShadow=!mobile&&index<2;light.shadow.mapSize.set(512,512);light.shadow.bias=-.0004;light.shadow.normalBias=.035;light.shadow.camera.near=.3;
  }else{
   mesh(bulb,glass,fixture);light=new THREE.PointLight(0xffd195,f.power,f.range,2);light.position.set(...f.position);
  }
  light.name='Practical '+f.kind+' '+index;light.visible=false;group.add(light);lights.push(light);
 }
 return {group,lights,setNight(on){lights.forEach(light=>{light.visible=on;});glass.emissiveIntensity=on?1.7:0;},dispose(){lights.forEach(light=>{light.shadow?.map?.dispose();light.dispose?.();});group.removeFromParent();}};
}
