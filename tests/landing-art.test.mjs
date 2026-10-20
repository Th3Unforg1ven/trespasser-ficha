import test from 'node:test';
import assert from 'node:assert/strict';
import { setupLandingArt } from '../dist/landing-art.js';

const BASE='https://example.test/trespassercs/';
const url=value=>new URL(value,BASE).href;
const flush=async()=>{for(let index=0;index<10;index++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
function eventTarget() {
  const listeners=new Map();
  return {listeners,
    addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(callback);},
    removeEventListener(type,callback){listeners.get(type)?.delete(callback);},
    emit(type,event={}){for(const callback of [...(listeners.get(type)||[])])callback(event);},
  };
}
function fixture({desktop=true,count=1,cached=true,threeSources=false,width=desktop?1440:390}={}) {
  const frames=[];
  const queries=new Map();
  const matches=query=>width>=Number(query.match(/min-width:\s*(\d+)px/)[1]);
  const matchMedia=query=>{
    if(!queries.has(query))queries.set(query,Object.assign(eventTarget(),{matches:matches(query)}));
    return queries.get(query);
  };
  const media=matchMedia('(min-width: 621px)');
  const selectedSource=()=>width<621?'mobile':threeSources&&width<1101?'compact':'desktop';
  const window=Object.assign(eventTarget(),{location:{href:BASE},matchMedia,requestAnimationFrame:callback=>frames.push(callback)});
  const pictures=[],images=[];
  for(let index=0;index<count;index++) {
    const sources=threeSources
      ?[{media:'(min-width: 1101px)',srcset:`./desktop-${index}.webp`},{media:'(min-width: 621px)',srcset:`./compact-${index}.webp`}]
      :[{media:'(min-width: 621px)',srcset:`./desktop-${index}.webp`}];
    const picture={hidden:false,dataset:{},querySelectorAll:()=>sources};
    const decodes=[];
    const image=Object.assign(eventTarget(),{
      src:url(`./mobile-${index}.webp`),currentSrc:cached?url(`./${selectedSource()}-${index}.webp`):'',
      complete:cached,naturalWidth:cached?1600:0,
      getAttribute:key=>key==='src'?`./mobile-${index}.webp`:null,
      closest:()=>picture,
      decode(){const job=deferred();decodes.push(job);return job.promise;},
      decodes,
    });
    pictures.push(picture);images.push(image);
  }
  const scene={dataset:{artState:'loading'},querySelectorAll:()=>images};
  const document=Object.assign(eventTarget(),{baseURI:BASE,visibilityState:'visible',querySelector:selector=>selector==='.landing-scene'?scene:null});
  const api=setupLandingArt({document,window});
  const frame=async()=>{while(frames.length)frames.shift()();await flush();};
  const resizeWidth=value=>{
    width=value;const changed=[];
    for(const [query,mediaQuery] of queries){const next=matches(query);if(next!==mediaQuery.matches){mediaQuery.matches=next;changed.push(mediaQuery);}}
    for(const mediaQuery of changed)mediaQuery.emit('change',{matches:mediaQuery.matches});
  };
  const resize=value=>resizeWidth(value?1440:390);
  const load=(index,{mobile=!media.matches,source=mobile?'mobile':selectedSource(),width:imageWidth=1600}={})=>{
    const image=images[index];image.currentSrc=url(`./${source}-${index}.webp`);
    image.complete=true;image.naturalWidth=imageWidth;image.emit(imageWidth?'load':'error');
  };
  return {api,scene,document,window,media,pictures,images,frame,resize,resizeWidth,load};
}

test('legacy documents without a scene do not require browser media or image APIs',()=>{
  assert.equal(setupLandingArt({document:{querySelector:()=>null},window:{}}),null);
});

test('the composition waits for every image to load and finish decoding before one reveal',async()=>{
  const f=fixture({count:2,cached:false});await f.frame();
  assert.equal(f.scene.dataset.artState,'loading');assert.equal(f.images[0].decodes.length,0);
  f.load(0);await flush();f.images[0].decodes[0].resolve();await flush();
  assert.equal(f.scene.dataset.artState,'loading');
  f.load(1);await flush();assert.equal(f.scene.dataset.artState,'loading');
  f.images[1].decodes[0].resolve();assert.equal(await f.api.ready,true);
  assert.equal(f.scene.dataset.artState,'ready');
});

test('cached images still wait for their decoded pixels and setup is idempotent',async()=>{
  const f=fixture({count:2});
  assert.equal(setupLandingArt({document:f.document,window:f.window}),f.api);
  await f.frame();assert.deepEqual(f.images.map(image=>image.decodes.length),[1,1]);
  f.images[1].decodes[0].resolve();await flush();assert.equal(f.scene.dataset.artState,'loading');
  f.images[0].decodes[0].resolve();await f.api.ready;assert.equal(f.scene.dataset.artState,'ready');
  await f.api.refresh();assert.equal(f.scene.dataset.artState,'ready');
  assert.deepEqual(f.images.map(image=>image.decodes.length),[1,1]);
});

test('a failed image is hidden while the remaining composition still waits for decoding',async()=>{
  const f=fixture({count:2,cached:false});await f.frame();
  f.load(0,{width:0});await flush();
  assert.equal(f.pictures[0].hidden,true);assert.equal(f.pictures[0].dataset.artError,'true');
  assert.equal(f.pictures[1].hidden,false);assert.equal(f.scene.dataset.artState,'loading');
  f.load(1);await flush();f.images[1].decodes[0].resolve();await f.api.ready;
  assert.equal(f.scene.dataset.artState,'ready');assert.equal(f.pictures[0].hidden,true);
});

test('a decode failure cannot leave the art barrier waiting forever',async()=>{
  const f=fixture();await f.frame();f.images[0].decodes[0].reject(Error('Invalid bitmap'));
  assert.equal(await f.api.ready,true);assert.equal(f.scene.dataset.artState,'ready');
  assert.equal(f.pictures[0].hidden,true);
});

test('crossing the breakpoint hides the scene until the new responsive source is decoded',async()=>{
  const f=fixture();await f.frame();f.images[0].decodes[0].resolve();await f.api.ready;
  assert.equal(f.scene.dataset.artState,'ready');f.resize(false);
  assert.equal(f.scene.dataset.artState,'loading');await f.frame();
  assert.equal(f.images[0].decodes.length,1,'the old currentSrc cannot satisfy the new source');
  f.load(0,{mobile:true});await flush();assert.equal(f.images[0].decodes.length,2);
  f.images[0].decodes[1].resolve();await f.api.ready;assert.equal(f.scene.dataset.artState,'ready');
  f.resize(false);await flush();assert.equal(f.scene.dataset.artState,'ready','the same source set must not flash');
});

test('a stale desktop decode cannot reveal a mobile generation or hide it after it is ready',async()=>{
  const f=fixture();await f.frame();const oldReady=f.api.ready;
  f.resize(false);await f.frame();f.images[0].decodes[0].resolve();await flush();
  assert.equal(await oldReady,false);assert.equal(f.scene.dataset.artState,'loading');
  f.load(0,{mobile:true});await flush();f.images[0].decodes[1].resolve();await f.api.ready;
  assert.equal(f.scene.dataset.artState,'ready');

  f.resize(true);await f.frame();f.load(0,{mobile:false});await flush();
  f.resize(false);await f.frame();f.load(0,{mobile:true});await flush();
  f.images[0].decodes[3].resolve();await f.api.ready;
  f.images[0].decodes[2].reject(Error('Obsolete source'));await flush();
  assert.equal(f.scene.dataset.artState,'ready');assert.equal(f.pictures[0].hidden,false);
});

test('all picture media queries invalidate decoding across desktop, compact, and mobile sources',async()=>{
  const f=fixture({threeSources:true,width:1440});await f.frame();const firstDesktop=f.api.ready;
  assert.equal(f.images[0].decodes.length,1);
  f.resizeWidth(900);assert.equal(f.scene.dataset.artState,'loading');await f.frame();
  assert.equal(f.images[0].decodes.length,1,'an unchanged 621px query must not hide the 1101px source switch');
  f.load(0,{source:'compact'});await flush();const compact=f.api.ready;
  f.resizeWidth(1440);await f.frame();f.load(0,{source:'desktop'});await flush();
  f.images[0].decodes[2].resolve();await f.api.ready;assert.equal(f.scene.dataset.artState,'ready');
  f.images[0].decodes[0].resolve();f.images[0].decodes[1].reject(Error('Superseded compact source'));await flush();
  assert.equal(await firstDesktop,false);assert.equal(await compact,false);
  assert.equal(f.scene.dataset.artState,'ready');assert.equal(f.pictures[0].hidden,false);
  f.resizeWidth(390);await f.frame();assert.equal(f.scene.dataset.artState,'loading');
  f.load(0,{source:'mobile'});await flush();f.images[0].decodes[3].resolve();await f.api.ready;
  assert.equal(f.scene.dataset.artState,'ready');
});

test('a previously failed picture can recover with a different responsive source',async()=>{
  const f=fixture({cached:false});await f.frame();f.load(0,{width:0});await f.api.ready;
  assert.equal(f.pictures[0].hidden,true);f.resize(false);await f.frame();
  assert.equal(f.pictures[0].hidden,false);assert.equal(f.pictures[0].dataset.artError,undefined);
  f.load(0,{mobile:true});await flush();f.images[0].decodes[0].resolve();await f.api.ready;
  assert.equal(f.pictures[0].hidden,false);assert.equal(f.scene.dataset.artState,'ready');
});

test('BFCache/visibility restore rechecks cached pixels without depending on a missed load event',async()=>{
  const f=fixture({cached:false});await f.frame();
  f.images[0].currentSrc=url('./desktop-0.webp');f.images[0].complete=true;f.images[0].naturalWidth=1600;
  f.window.emit('pageshow',{persisted:true});await flush();
  f.images[0].decodes[0].resolve();await f.api.ready;assert.equal(f.scene.dataset.artState,'ready');
  f.document.emit('visibilitychange');await flush();assert.equal(f.scene.dataset.artState,'ready');
  assert.equal(f.images[0].decodes.length,1);
});

test('dispose cancels obsolete listeners and cannot reveal a pending composition',async()=>{
  const f=fixture();await f.frame();const pending=f.api.ready;f.api.dispose();
  f.images[0].decodes[0].resolve();assert.equal(await pending,false);
  assert.equal(f.scene.dataset.artState,'loading');assert.equal(f.images[0].listeners.get('load').size,0);
  assert.equal(f.media.listeners.get('change').size,0);assert.equal(f.document.listeners.get('visibilitychange').size,0);
});
