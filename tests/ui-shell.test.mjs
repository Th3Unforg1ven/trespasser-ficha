import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupTheme} from '../dist/preferences.js';
import {setupThemeToggle,createPageTransition} from '../dist/ui-shell.js';
import {setupLanguage} from '../dist/i18n.js';

// A small browser contract fixture: real DOM-style attributes, parent traversal,
// delegated events, inert focus guards and a controllable clock, without a new
// production/test dependency. Root's browser QA covers rendered geometry.
function fixture({dark=false,existingOverlay=false}={}){
  class Events{
    listeners=new Map();
    addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
    removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
    dispatchEvent(event){event.preventDefault??=function(){this.defaultPrevented=true;};for(const fn of this.listeners.get(event.type)||[])fn(event);return !event.defaultPrevented;}
  }
  const doc=new Events();doc.visibilityState='visible';
  class Element{
    constructor(tag){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.attributes=new Map();this.dataset={};this.children=[];this.parentElement=null;this.className='';this.disabled=false;this._text='';this._html='';}
    get id(){return this.getAttribute('id')||'';}set id(value){this.setAttribute('id',value);}
    get hidden(){return this.hasAttribute('hidden');}set hidden(value){if(value)this.setAttribute('hidden','');else this.removeAttribute('hidden');}
    get inert(){return this.hasAttribute('inert');}set inert(value){if(value)this.setAttribute('inert','');else this.removeAttribute('inert');}
    get isConnected(){return this===doc.documentElement||Boolean(this.parentElement?.isConnected);}
    get classList(){return {add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');}};}
    setAttribute(key,value){this.attributes.set(key,String(value));if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/gu,(_,c)=>c.toUpperCase())]=String(value);}
    getAttribute(key){return this.attributes.has(key)?this.attributes.get(key):null;}
    hasAttribute(key){return this.attributes.has(key);}removeAttribute(key){this.attributes.delete(key);}
    append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
    replaceChildren(...nodes){this.children.forEach(n=>n.parentElement=null);this.children=[];this._text='';this.append(...nodes);}
    get textContent(){return this.children.length?this.children.map(n=>n.textContent).join(''):this._text;}
    set textContent(value){this.replaceChildren();this._text=String(value);}
    set innerHTML(value){this.replaceChildren();this._html=String(value);}get innerHTML(){return this._html;}
    matches(selector){
      return selector.split(',').some(part=>{const s=part.trim();if(s.startsWith('#'))return this.id===s.slice(1);if(s.startsWith('.'))return this.className.split(/\s+/u).includes(s.slice(1));
        const m=s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/u);if(m)return this.hasAttribute(m[1])?(m[2]===undefined||this.getAttribute(m[1])===m[2]):m[1].startsWith('data-')&&this.dataset[m[1].slice(5).replace(/-([a-z])/gu,(_,c)=>c.toUpperCase())]!==undefined;
        return this.tagName===s.toUpperCase();});
    }
    closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
    querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    contains(node){return this===node||this.children.some(n=>n.contains(node));}
    focus(){if(this.isConnected&&!this.closest('[hidden],[inert]')&&!this.disabled)doc.activeElement=this;}
  }
  doc.createElement=tag=>new Element(tag);doc.documentElement=new Element('html');doc.documentElement.style={};doc.body=new Element('body');doc.documentElement.append(doc.body);doc.activeElement=doc.body;
  doc.querySelector=s=>doc.documentElement.querySelector(s);doc.querySelectorAll=s=>doc.documentElement.querySelectorAll(s);
  const win=new Events(),storage=new Map([['trespasser.record.v1','unchanged character data']]),writes=[];
  win.localStorage={getItem:key=>storage.get(key)??null,setItem(key,value){writes.push([key,value]);storage.set(key,value);}};
  win.CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail;}};
  const media=new Events();media.matches=dark;win.matchMedia=()=>media;
  let clock=0,sequence=0;const timers=new Map();win.performance={now:()=>clock};
  win.setTimeout=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,time:clock+ms});return id;};win.clearTimeout=id=>timers.delete(id);
  const advance=ms=>{const until=clock+ms;for(;;){const entry=[...timers].filter(([,t])=>t.time<=until).sort((a,b)=>a[1].time-b[1].time)[0];if(!entry)break;clock=entry[1].time;timers.delete(entry[0]);entry[1].fn();}clock=until;};
  const element=(tag,id,parent=doc.body)=>{const node=doc.createElement(tag);if(id)node.id=id;parent.append(node);return node;};
  const workspace=element('div','workspace'),main=element('main','main',workspace),button=element('button','open',workspace);button.focus();
  const guard=element('div','guard');guard.setAttribute('inert','account-guard');
  const toggles=Array.from({length:3},(_,i)=>{const n=element('button',`toggle-${i}`,workspace);n.setAttribute('data-action','toggle-theme');return n;});
  if(existingOverlay){const overlay=element('div','page-transition'),panel=element('div','',overlay);panel.className='page-transition-card';element('img','',panel);const mark=element('span','',panel);mark.className='page-transition-mark';element('p','page-transition-label',panel);overlay.hidden=true;}
  const click=target=>doc.dispatchEvent({type:'click',target});
  return {doc,win,element,workspace,main,button,guard,toggles,storage,writes,advance,click,media};
}

test('theme icons follow resolved OS appearance and explicit clicks persist without touching record data',()=>{
  const f=fixture({dark:true}),theme=setupTheme({document:f.doc,window:f.win}),shell=setupThemeToggle({document:f.doc,window:f.win,theme});
  assert.equal(theme.getPreference(),'system');
  for(const toggle of f.toggles){assert.equal(toggle.getAttribute('aria-label'),'Ativar modo claro');assert.equal(toggle.getAttribute('aria-pressed'),'true');assert.equal(toggle.dataset.icon,'torch');assert.equal(toggle.type,'button');}
  f.click(f.toggles[0].children[0]);
  assert.equal(theme.getPreference(),'light');assert.equal(f.doc.documentElement.dataset.theme,'light');
  assert.deepEqual(f.writes,[['trespasser.theme.v1','light']]);assert.equal(f.storage.get('trespasser.record.v1'),'unchanged character data');
  assert.ok(f.toggles.every(n=>n.getAttribute('aria-label')==='Ativar modo escuro'&&n.dataset.icon==='moon'));
  const reopened=setupTheme({document:{documentElement:{dataset:{},style:{}}},window:f.win});assert.equal(reopened.getTheme(),'light');shell.dispose();
});

test('settings/storage changes refresh every toggle, while disabled controls and disposal stop delegated actions',()=>{
  const f=fixture(),theme=setupTheme({document:f.doc,window:f.win}),shell=setupThemeToggle({document:f.doc,window:f.win,theme});
  theme.setPreference('dark');assert.ok(f.toggles.every(n=>n.getAttribute('title')==='Ativar modo claro'));
  f.win.dispatchEvent({type:'storage',key:'trespasser.theme.v1',newValue:'light',storageArea:f.win.localStorage});assert.ok(f.toggles.every(n=>n.getAttribute('aria-pressed')==='false'));
  f.toggles[0].disabled=true;f.click(f.toggles[0]);assert.equal(theme.getTheme(),'light');
  assert.equal(setupThemeToggle({document:f.doc,window:f.win,theme}),shell);
  shell.dispose();f.click(f.toggles[1]);assert.equal(theme.getTheme(),'light');
});

test('transition blocks only body siblings, preserves account guards, and restores keyboard focus',()=>{
  const f=fixture(),transition=createPageTransition({document:f.doc,window:f.win});f.doc.body.setAttribute('aria-busy','false');
  const done=transition.start({label:'Abrindo personagens…'}),overlay=f.doc.querySelector('#page-transition');
  assert.equal(overlay.hidden,false);assert.equal(overlay.getAttribute('role'),'status');assert.equal(f.doc.activeElement,overlay);assert.equal(f.workspace.inert,true);assert.equal(f.main.inert,false);
  f.main.inert=true;const event={type:'keydown',key:'Tab'};f.doc.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(f.doc.activeElement,overlay);
  done();done();assert.equal(overlay.hidden,true);assert.equal(f.workspace.inert,false);assert.equal(f.main.inert,true);assert.equal(f.guard.getAttribute('inert'),'account-guard');assert.equal(f.doc.body.getAttribute('aria-busy'),'false');assert.equal(f.doc.activeElement,f.button);
  transition.dispose();
});

test('run follows the real task, keeps a short minimum, propagates failure and ignores stale finishes',async()=>{
  const f=fixture(),transition=createPageTransition({document:f.doc,window:f.win}),overlay=f.doc.querySelector('#page-transition');
  let resolve;const actual=new Promise(r=>resolve=r),running=transition.run(()=>actual,{label:'Abrindo…'});f.advance(300);assert.equal(overlay.hidden,false);resolve('ready');assert.equal(await running,'ready');assert.equal(overlay.hidden,true);
  const quick=transition.run(()=>42);await Promise.resolve();f.advance(239);assert.equal(overlay.hidden,false);f.advance(1);assert.equal(await quick,42);assert.equal(overlay.hidden,true);
  await assert.rejects(transition.run(()=>{throw new Error('real failure');}),/real failure/u);assert.equal(overlay.hidden,true);assert.equal(f.workspace.inert,false);
  const old=transition.start(),latest=transition.start({label:'Mais recente'});old();assert.equal(overlay.hidden,false);latest();assert.equal(overlay.hidden,true);transition.dispose();
});

test('deadline and browser return release loading without treating a pending task as success',async()=>{
  const f=fixture(),transition=createPageTransition({document:f.doc,window:f.win}),overlay=f.doc.querySelector('#page-transition');
  let resolve,completed=false;const pending=new Promise(r=>resolve=r),run=transition.run(()=>pending).then(v=>{completed=true;return v;});
  f.win.dispatchEvent({type:'pageshow',persisted:false});assert.equal(overlay.hidden,false,'initial page show must not skip cold boot');
  f.advance(8000);assert.equal(overlay.hidden,true);assert.equal(f.workspace.inert,false);assert.equal(completed,false);
  resolve('real result');assert.equal(await run,'real result');
  transition.start();f.win.dispatchEvent({type:'pageshow',persisted:true});assert.equal(overlay.hidden,true);
  transition.start();f.doc.dispatchEvent({type:'keydown',key:'Escape'});assert.equal(overlay.hidden,true);
  transition.start();f.doc.visibilityState='hidden';f.doc.dispatchEvent({type:'visibilitychange'});f.doc.visibilityState='visible';f.doc.dispatchEvent({type:'visibilitychange'});assert.equal(overlay.hidden,true);
  transition.start();f.win.dispatchEvent({type:'beforeprint'});assert.equal(overlay.hidden,true);transition.dispose();
});

test('existing page markup is adapted safely and hidden source focus moves to the visible destination',()=>{
  const f=fixture({existingOverlay:true}),existing=f.doc.querySelector('#page-transition'),transition=createPageTransition({document:f.doc,window:f.win});
  assert.equal(createPageTransition({document:f.doc,window:f.win}),transition);assert.equal(f.doc.querySelectorAll('#page-transition').length,1);
  const done=transition.start({label:'<img src=x onerror=bad>'});assert.equal(f.doc.querySelector('#page-transition-label').textContent,'<img src=x onerror=bad>');assert.equal(existing.querySelector('.page-transition-card').className.includes('page-transition-panel'),true);
  f.button.hidden=true;done();assert.equal(f.doc.activeElement,f.main);transition.dispose();
});

test('changing interface language updates theme descriptions and an active transition without touching records',()=>{
  const f=fixture(),language=setupLanguage({document:f.doc,window:f.win,navigator:{language:'pt-BR'}});
  const theme=setupTheme({document:f.doc,window:f.win}),shell=setupThemeToggle({document:f.doc,window:f.win,theme});
  const transition=createPageTransition({document:f.doc,window:f.win});
  transition.start({label:'Abrindo personagens…'});
  language.setPreference('en');
  assert.ok(f.toggles.every(toggle=>toggle.getAttribute('aria-label')==='Switch to dark mode'));
  assert.equal(f.doc.querySelector('[data-transition-label]').textContent,'Opening characters…');
  assert.equal(f.storage.get('trespasser.record.v1'),'unchanged character data');
  assert.equal(theme.getPreference(),'system');
  language.setPreference('pt');
  assert.equal(f.doc.querySelector('[data-transition-label]').textContent,'Abrindo personagens…');
  assert.ok(f.toggles.every(toggle=>toggle.getAttribute('title')==='Ativar modo escuro'));
  transition.dispose();shell.dispose();language.dispose();
});

test('shared CSS hides transition in print, respects reduced motion and keeps the white logo visible on both themes',async()=>{
  const css=await readFile(new URL('../dist/ui-shell.css',import.meta.url),'utf8');
  assert.match(css,/@media print\{[^}]*\.page-transition[^}]*display:none!important/u);
  assert.match(css,/prefers-reduced-motion:reduce[^}]*animation:none/u);
  assert.match(css,/\.page-transition-brand\{[^}]*filter:grayscale\(1\) invert\(1\)/u);
  assert.match(css,/html\[data-theme="dark"\] \.page-transition-brand\{filter:none\}/u);
});
