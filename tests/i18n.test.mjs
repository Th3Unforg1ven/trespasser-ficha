import test from 'node:test';
import assert from 'node:assert/strict';
import { setupLanguage,detectLanguage,getLanguage,getLanguagePreference,setLanguagePreference,t,registerMessages,translateStatic,languageSettingsMarkup,LANGUAGE_KEY } from '../dist/i18n.js';

function fixture({device='pt-BR',saved,unavailable=false}={}) {
  const callbacks=new Map(),documentCallbacks=new Map(),values=new Map(saved?[[LANGUAGE_KEY,saved]]:[]),writes=[];
  const storage={getItem:key=>{if(unavailable)throw Error('denied');return values.get(key)??null;},setItem(key,value){if(unavailable)throw Error('denied');writes.push([key,value]);values.set(key,value);}};
  const node=(attrs={},text='')=>({attributes:new Map(Object.entries(attrs)),dataset:{},tagName:'SPAN',textContent:text,
    getAttribute(key){return this.attributes.get(key)??null;},setAttribute(key,value){this.attributes.set(key,value);},hasAttribute(key){return this.attributes.has(key);},
    focus(){document.activeElement=this;},matches(selector){return selector.includes('[data-i18n')&&[...this.attributes.keys()].some(key=>key.startsWith('data-i18n'));},
    closest(selector){return selector==='[data-language-preference]'&&this.hasAttribute('data-language-preference')?this:null;}});
  const heading=node({'data-i18n':'Configurações'},'Configurações'),attribute=node({'data-i18n-aria-label':'Fechar'},'×');
  const playerText=node({},'Anotações · Início · Configurações');playerText.value='A Name <b>kept intact</b>';
  const select=node({'data-language-preference':''});select.tagName='SELECT';
  const nodes=[heading,attribute,playerText,select];
  const document={documentElement:node(),activeElement:playerText,
    querySelectorAll(selector){if(selector==='[data-language-preference]')return [select];return nodes.filter(item=>item.matches(selector));},
    addEventListener(type,callback){const list=documentCallbacks.get(type)||[];list.push(callback);documentCallbacks.set(type,list);},
    removeEventListener(type,callback){documentCallbacks.set(type,(documentCallbacks.get(type)||[]).filter(item=>item!==callback));}};
  const navigator={language:device};
  const window={navigator,localStorage:storage,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    addEventListener(type,callback){const list=callbacks.get(type)||[];list.push(callback);callbacks.set(type,list);},
    removeEventListener(type,callback){callbacks.set(type,(callbacks.get(type)||[]).filter(item=>item!==callback));},
    dispatchEvent(event){for(const callback of callbacks.get(event.type)||[])callback(event);}};
  const api=setupLanguage({document,window,navigator,localStorage:storage});
  return {api,document,window,navigator,storage,writes,callbacks,documentCallbacks,heading,attribute,playerText,select,
    emit:(type,event={})=>{for(const callback of callbacks.get(type)||[])callback(event);},
    change:()=>{for(const callback of documentCallbacks.get('change')||[])callback({target:select});}};
}

test('system language uses Portuguese only for Portuguese device locales',()=>{
  for(const language of ['pt','pt-BR','pt-PT','PT-br'])assert.equal(detectLanguage({language}),'pt');
  for(const language of ['en','en-US','es-BR','ja','de','fr','ptx',''])assert.equal(detectLanguage({language}),'en');
  assert.equal(detectLanguage({languages:['pt-PT','en-US']}),'pt');
  assert.equal(detectLanguage(undefined),'en');
});
test('defaults to system and honors the saved manual preference',()=>{
  for(const [device,saved,expected] of [['pt-BR',undefined,'pt'],['es','system','en'],['de','pt','pt'],['pt-PT','en','en'],['ja','invalid','en']]){
    const f=fixture({device,saved});assert.equal(getLanguage(),expected);assert.equal(f.document.documentElement.getAttribute('lang'),expected==='pt'?'pt-BR':'en');
    assert.equal(getLanguagePreference(),['pt','en','system'].includes(saved)?saved:'system');assert.equal(f.writes.length,0);f.api.dispose();
  }
});
test('an unavailable local store does not block language switching',()=>{
  const f=fixture({device:'fr',unavailable:true});assert.equal(getLanguage(),'en');
  setLanguagePreference('pt');assert.equal(getLanguage(),'pt');assert.equal(f.heading.textContent,'Configurações');
  setLanguagePreference('bogus');assert.equal(getLanguage(),'pt');f.api.dispose();
});
test('device language changes affect only automatic mode, and storage events sync preferences',()=>{
  const f=fixture();let changes=0;f.window.addEventListener('trespasser:language',()=>changes++);
  f.navigator.language='es';f.emit('languagechange');assert.equal(getLanguage(),'en');
  setLanguagePreference('pt');f.navigator.language='ja';f.emit('languagechange');assert.equal(getLanguage(),'pt');
  f.emit('storage',{key:LANGUAGE_KEY,newValue:'en'});assert.equal(getLanguage(),'en');assert.equal(f.writes.length,1);
  f.navigator.language='pt-PT';f.emit('storage',{key:null,newValue:null});assert.equal(getLanguage(),'pt');assert.equal(getLanguagePreference(),'system');
  f.emit('storage',{key:'unrelated',newValue:'en'});assert.equal(getLanguage(),'pt');assert.equal(changes,4);f.api.dispose();
});
test('switching translates only explicit interface nodes and leaves player data and focus untouched',()=>{
  const f=fixture();const value=f.playerText.value,text=f.playerText.textContent,focused=f.document.activeElement;
  f.select.value='en';f.change();
  assert.equal(f.heading.textContent,'Settings');assert.equal(f.attribute.getAttribute('aria-label'),'Close');
  assert.equal(f.playerText.value,value);assert.equal(f.playerText.textContent,text);assert.equal(f.document.activeElement,focused);
  assert.equal(f.select.value,'en');assert.deepEqual(f.writes,[[LANGUAGE_KEY,'en']]);
  f.select.value='pt';f.change();assert.equal(f.heading.textContent,'Configurações');assert.equal(f.playerText.value,value);f.api.dispose();
});
test('setup is idempotent for a document and explicit roots can be localized',()=>{
  const f=fixture({device:'en'});assert.equal(setupLanguage({document:f.document,window:f.window}),f.api);
  assert.equal(f.documentCallbacks.get('change').length,1);assert.equal(f.callbacks.get('languagechange').length,1);
  const root={matches:()=>true,getAttribute:key=>key==='data-i18n'?'Configurações':null,hasAttribute:key=>key==='data-i18n',querySelectorAll:()=>[],textContent:'',setAttribute(){}};
  translateStatic(root);assert.equal(root.textContent,'Settings');f.api.dispose();assert.equal(f.callbacks.get('languagechange').length,0);
});
test('registered messages interpolate named values without evaluating markup or expressions',()=>{
  const f=fixture({device:'en'});registerMessages({'Bem-vindo, {name}.':'Welcome, {name}.','Teste {danger} ${notCode}':'Test {danger} ${notCode}'});
  assert.equal(t('Bem-vindo, {name}.',{name:'<img onerror="bad()">'}),'Welcome, <img onerror="bad()">.');
  assert.equal(t('Teste {danger} ${notCode}',{danger:'{name}'}),'Test {name} ${notCode}');
  assert.match(languageSettingsMarkup(),/Interface language/);assert.match(languageSettingsMarkup(),/data-language-preference/);f.api.dispose();
});
