import {createThemeCycle} from './theme-cycle.mjs';
const root=document.documentElement,toggles=[...document.querySelectorAll('[data-theme-toggle]')],preference=matchMedia('(prefers-reduced-motion: reduce)');
function apply(dark){
 if(dark)root.dataset.theme='dark';else delete root.dataset.theme;
 try{localStorage.setItem('tg-theme',dark?'dark':'light');}catch{}
 toggles.forEach(button=>{const label=dark?'Light mode':'Dark mode';button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',label);button.title=label;});
}
function animate(dark){
 const animations=[];root.classList.add('theme-changing');
 const play=(node,frames,options)=>{if(!node?.animate)return;let animation;try{animation=node.animate(frames,options);}catch(error){animations.forEach(item=>item.cancel());root.classList.remove('theme-changing');throw error;}animation.finished.catch(()=>{});animations.push(animation);};
 const outgoing=dark?'sun':'moon',incoming=dark?'moon':'sun';
 for(const button of toggles){
  play(button.querySelector('.theme-icon-'+outgoing),[{transform:'translate(0,0)',opacity:1},{transform:'translate(10px,4px)',opacity:.8,offset:.45},{transform:'translate(23px,23px)',opacity:0}],{duration:300,easing:'ease-in',fill:'both'});
  play(button.querySelector('.theme-icon-'+incoming),[{transform:'translate(-23px,23px)',opacity:0},{transform:'translate(-10px,-3px)',opacity:1,offset:.55},{transform:'translate(0,0)',opacity:1}],{delay:300,duration:600,easing:'cubic-bezier(.2,.7,.25,1)',fill:'both'});
 }
 const hero=document.querySelector('.proclamation-scene');
 if(hero){
  play(hero.querySelector('.hero-celestial-'+outgoing),[{transform:'translate(0px,0px)',opacity:1},{transform:'translate(70px,60px)',opacity:.8,offset:.45},{transform:'translate(120px,240px)',opacity:0}],{duration:300,easing:'ease-in',fill:'both'});
  play(hero.querySelector('.hero-celestial-'+incoming),[{transform:'translate(-240px,240px)',opacity:0},{transform:'translate(-125px,35px)',opacity:1,offset:.55},{transform:'translate(0px,0px)',opacity:1}],{delay:300,duration:600,easing:'cubic-bezier(.2,.7,.25,1)',fill:'both'});
 }
 return ()=>{animations.forEach(animation=>animation.cancel());root.classList.remove('theme-changing');};
}
const controller=createThemeCycle({initial:root.dataset.theme==='dark',apply,animate,reduced:()=>preference.matches||typeof Element.prototype.animate!=='function'});
apply(root.dataset.theme==='dark');
toggles.forEach(button=>button.addEventListener('click',()=>controller.toggle()));
document.addEventListener('visibilitychange',()=>{if(document.hidden)controller.settle();});
window.addEventListener('pagehide',()=>controller.settle());
preference.addEventListener('change',()=>{if(preference.matches)controller.settle();});
