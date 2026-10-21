import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as model from '../dist/haven-model.js';

const source=await readFile(new URL('../dist/havens.js',import.meta.url),'utf8');
const html=await readFile(new URL('../dist/havens.html',import.meta.url),'utf8');
const pageStart=source.indexOf('export function setupHavenPage');
const definitions=source.slice(source.indexOf('const TABS ='),pageStart);
const pageSource=source.slice(pageStart,source.indexOf('\nif(typeof document',pageStart)).replace('export function','return function');
const text=(value,params={})=>String(value).replace(/\{(\w+)\}/g,(match,key)=>Object.hasOwn(params,key)?params[key]:match);

function fixture() {
  const documentListeners=new Map(),windowListeners=new Map(),mounts=[],writes=[];
  let document;
  class Element {
    constructor(tagName='DIV',attributes={}) {
      this.tagName=tagName;this.dataset={};this.attributes=new Map();this.children=[];this.style={};this.disabled=false;this.isConnected=true;this.htmlWrites=0;
      this.classList={toggle:(name,on)=>{const names=new Set((this.className||'').split(/\s+/).filter(Boolean));on?names.add(name):names.delete(name);this.className=[...names].join(' ');}};
      for(const [key,value]of Object.entries(attributes))this.setAttribute(key,value);
    }
    setAttribute(key,value){this.attributes.set(key,String(value));if(key==='class')this.className=value;if(key==='value')this.value=value;if(key==='id')this.id=value;if(key==='type')this.type=value;if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;}
    getAttribute(key){return this.attributes.get(key)??null;}
    removeAttribute(key){this.attributes.delete(key);}
    hasAttribute(key){return this.attributes.has(key);}
    addEventListener(name,listener){this.listeners??=new Map();this.listeners.set(name,listener);}
    focus(){document.activeElement=this;}
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
    matches(selector){return selector.split(',').some(part=>{const match=part.trim().match(/^\[([\w-]+)(?:="([^"]+)")?\]$/);return match&&this.hasAttribute(match[1])&&(match[2]===undefined||this.getAttribute(match[1])===match[2]);});}
    closest(selector){return this.matches(selector)?this:null;}
    querySelectorAll(selector){return this.children.filter(child=>child.matches(selector));}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    set innerHTML(value){
      for(const old of this.children){old.isConnected=false;if(document.activeElement===old)document.activeElement=document.body;}
      this.html=value;this.htmlWrites++;this.children=[];
      for(const match of value.matchAll(/<(input|select|textarea|button|strong)\b([^>]*)>/g)){
        const attributes=Object.fromEntries([...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(item=>[item[1],item[2]??'']));
        const child=new Element(match[1].toUpperCase(),attributes);child.disabled='disabled'in attributes;child.ownerDocument=document;this.children.push(child);
      }
    }
    get innerHTML(){return this.html||'';}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>[`#${match[1]}`,new Element('DIV',{id:match[1]})]));
  document={body:new Element('BODY'),activeElement:null,
    querySelector(selector){return elements.get(selector)||[...elements.values()].flatMap(element=>element.children).find(child=>child.matches(selector))||null;},
    querySelectorAll(selector){return [...elements.values()].flatMap(element=>element.children).filter(child=>child.matches(selector));},
    addEventListener(name,listener){const list=documentListeners.get(name)||[];list.push(listener);documentListeners.set(name,list);}};
  document.activeElement=document.body;
  for(const element of elements.values())element.ownerDocument=document;
  const record=model.createHaven('Refúgio preservado');record.leadership='Conselho';record.location='Vale';record.notes='Anotações que continuam salvas.';
  let state={records:[record],activeId:record.id,user:{id:'test-account',email:'test@example.test'},ready:true,sessionChecked:true,loading:false,cloudReady:true,canEdit:true,canLogout:true,migrationCount:0,status:{state:'synced',pending:0},statusLabel:'Salvo online'};
  let notify;
  const controller={getState:()=>structuredClone(state),initialize:async()=>{},
    replaceRecord(next){state={...state,records:[next],activeId:next.id};notify(structuredClone(state),'records');},
    update(path,value){let target=state.records[0];const keys=path.split('.');for(const key of keys.slice(0,-1))target=target[key];target[keys.at(-1)]=value;notify(structuredClone(state),'edit');}};
  let timer=0;
  const window={addEventListener(name,listener){const list=windowListeners.get(name)||[];list.push(listener);windowListeners.set(name,list);},setTimeout:()=>++timer,clearTimeout(){}};
  const dependencies={...model,createHavenController:options=>{notify=options.onChange;return controller;},
    setupLanguage(){},setupTheme:()=>({getPreference:()=> 'system',getTheme:()=> 'light',setPreference(){}}),setupThemeToggle:()=>({dispose(){}}),
    createPageTransition:()=>({start:()=>()=>{},dispose(){}}),icon:()=>'<svg></svg>',mountButtonIcons:root=>mounts.push(root),preparePrint(){},
    t:text,getLanguage:()=> 'pt',languageSettingsMarkup:()=>'',translateStatic(){},translateHavenMessage:text,HAVEN_KEY:'trespasser.havens.v1',CSS:{escape:value=>value},
    esc:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))};
  const setup=new Function(...Object.keys(dependencies),definitions+pageSource)(...Object.values(dependencies));
  const page=setup({document,window,localStorage:{getItem:()=>null,setItem:(...value)=>writes.push(value)},sessionStorage:{},navigator:{language:'pt-BR'},location:{href:'https://example.test/havens.html'}});
  const click=button=>{for(const listener of documentListeners.get('click')||[])listener({target:button});};
  return{page,controller,document,elements,mounts,writes,click,tab:key=>elements.get('#navigation').querySelector(`[data-tab="${key}"]`)};
}

test('Haven tab navigation preserves controls, keyboard focus, and record data',()=>{
  const f=fixture(),identity=f.elements.get('#haven-identity'),metrics=f.elements.get('#haven-metrics'),navigation=f.elements.get('#navigation'),content=f.elements.get('#haven-content');
  const name=identity.querySelector('[data-field="name"]'),metric=metrics.children[0],buttons=[...navigation.children];
  const before=JSON.stringify(f.controller.getState()),identityWrites=identity.htmlWrites,metricWrites=metrics.htmlWrites,navWrites=navigation.htmlWrites,contentWrites=content.htmlWrites;
  const construction=f.tab('construction');construction.focus();f.click(construction);
  assert.equal(f.document.activeElement,construction);
  assert.equal(f.tab('construction'),construction,'the focused navigation node remains connected');
  assert.equal(construction.getAttribute('aria-current'),'page');
  assert.equal(construction.className,'nav-item active');
  assert.equal(f.tab('refuge').getAttribute('aria-current'),null);
  assert.equal(f.tab('refuge').className,'nav-item');
  assert.equal(identity.querySelector('[data-field="name"]'),name);
  assert.equal(metrics.children[0],metric);
  assert.deepEqual(navigation.children,buttons);
  assert.deepEqual([identity.htmlWrites,metrics.htmlWrites,navigation.htmlWrites],[identityWrites,metricWrites,navWrites]);
  assert.equal(content.htmlWrites,contentWrites+1);
  assert.match(content.innerHTML,/Construções em andamento/);
  assert.equal(JSON.stringify(f.controller.getState()),before);
  assert.equal(f.writes.length,0,'navigation does not save or migrate a record');
  const mountCount=f.mounts.length;
  f.click(construction);
  assert.equal(content.htmlWrites,contentWrites+1,'selecting the active tab does not render again');
  assert.equal(f.mounts.length,mountCount);
});

test('Haven record refreshes still render new data and scope icon enhancement',()=>{
  const f=fixture(),original=f.tab('notes');original.focus();f.click(original);
  const changed=model.createHaven('Outra ficha');changed.leadership='Nova liderança';changed.notes='Conteúdo atualizado';
  f.controller.replaceRecord(changed);
  assert.notEqual(f.tab('notes'),original,'a full record refresh can rebuild translated navigation');
  assert.equal(f.document.activeElement,f.tab('notes'),'full refresh restores the corresponding navigation focus');
  assert.match(f.elements.get('#haven-identity').innerHTML,/value="Outra ficha"/);
  assert.match(f.elements.get('#haven-content').innerHTML,/Conteúdo atualizado/);
  assert.equal(f.tab('notes').getAttribute('aria-current'),'page');
  assert.equal(f.mounts.filter(root=>root===f.document).length,1,'static controls receive only their initial global enhancement');
  assert.ok(f.mounts.slice(1).every(root=>root===f.elements.get('#haven-content')));
  f.page.openSettings();
  assert.equal(f.mounts.at(-1),f.elements.get('#dialog-content'),'dialogs retain their own icon enhancement');
  assert.equal(f.mounts.filter(root=>root===f.document).length,1);
});
