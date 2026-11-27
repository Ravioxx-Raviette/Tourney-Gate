import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountScrollCue} from '../static/js/scroll-cue.mjs';

function fixture({height=200,total=600,observers=true}={}) {
  const classes=new Set(),observed=[];
  class Observer {
    constructor(callback){this.callback=callback;this.nodes=[];observed.push(this);}
    observe(node){this.nodes.push(node);}
    disconnect(){this.nodes=[];}
  }
  const wrapper={classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}}};
  const viewport=Object.assign(new EventTarget(),{scrollHeight:total,clientHeight:height,scrollTop:0,parentElement:wrapper,children:[{}]});
  const window=new EventTarget(),fonts=new EventTarget();
  const dispose=mountScrollCue(viewport,{window,document:{fonts},...(observers?{ResizeObserver:Observer,MutationObserver:Observer}:{})});
  return {viewport,window,fonts,observed,dispose,more:()=>classes.has('has-more-below')};
}

test('cue shows more content below and clears at the bottom, returning when scrolled upward',()=>{
  const f=fixture();assert.equal(f.more(),true);
  f.viewport.scrollTop=400;f.viewport.dispatchEvent(new Event('scroll'));assert.equal(f.more(),false);
  f.viewport.scrollTop=180;f.viewport.dispatchEvent(new Event('scroll'));assert.equal(f.more(),true);
});

test('short lists do not advertise scrolling; larger content and resized views update the cue',()=>{
  const f=fixture({total:180});assert.equal(f.more(),false);
  f.viewport.scrollHeight=800;f.observed.forEach(observer=>observer.callback());assert.equal(f.more(),true);
  f.viewport.clientHeight=900;f.window.dispatchEvent(new Event('resize'));assert.equal(f.more(),false);
});

test('font and accessibility changes refresh the cue without resetting the scroll position',()=>{
  const f=fixture({total:190});f.viewport.scrollTop=50;f.viewport.scrollHeight=500;
  f.window.dispatchEvent(new Event('tg-a11y-change'));assert.equal(f.more(),true);
  assert.equal(f.viewport.scrollTop,50);
  f.viewport.scrollHeight=100;f.fonts.dispatchEvent(new Event('loadingdone'));assert.equal(f.more(),false);
});

test('scrolling still works without observers and cleanup removes listeners and observers',()=>{
  const f=fixture({observers:false});assert.equal(f.more(),true);
  f.dispose();f.viewport.scrollTop=400;f.viewport.dispatchEvent(new Event('scroll'));
  assert.equal(f.more(),true,'disposed cue no longer responds');
  const watched=fixture();watched.dispose();assert.ok(watched.observed.every(observer=>observer.nodes.length===0));
});

test('restoring a cached page recalculates the cue at its retained scroll position',()=>{
  const f=fixture();f.viewport.scrollTop=400;
  f.window.dispatchEvent(new Event('pageshow'));assert.equal(f.more(),false);
});
