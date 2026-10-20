import test from 'node:test';
import assert from 'node:assert/strict';
import { initialView,isAuthReturn,setupLanding } from '../dist/landing.js';
import { setLanguagePreference } from '../dist/i18n.js';

const url=path=>new URL(path,'https://example.test/trespasser-ficha/');
const available={signedIn:true,ready:true,recordsReady:true,loading:false,blocked:false};
const flush=async()=>{for(let count=0;count<12;count++)await Promise.resolve();};

function fixture({location=url('./'),savedView=null,storedArt=null,deferredTransition=false,navigationError=false,device='pt-BR'}={}) {
  const session=new Map(savedView?[['trespasser.view.v1',savedView]]:[]);
  const local=new Map(storedArt?[['trespasser.landing.art.v1',storedArt]]:[]);
  const storage=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
  const delegatedActions=[],navigations=[],transitionCalls=[],windowEvents=new Map();
  const node=(dataset={})=>({dataset,listeners:new Map(),attributes:new Map(),hidden:false,focused:false,clicks:0,disabled:false,textContent:'',
    addEventListener(type,callback){this.listeners.set(type,callback);},setAttribute(key,value){this.attributes.set(key,value);},
    focus(){this.focused=true;},click(){if(this.disabled||this.hidden)return;this.clicks++;this.listeners.get('click')?.();if(this.dataset.action)delegatedActions.push(this.dataset.action);}});
  const selectors=['#landing','#record-workspace','#skip-link','#landing-title','#main','#landing-heading','#landing-start-actions','#landing-start','#landing-register-actions','#landing-open','#landing-havens','#haven-register-button','#landing-settings','#landing-auth-status','#account-button','#home-button','.landing-description'];
  const nodes=new Map(selectors.map(selector=>[selector,node()]));
  nodes.get('#landing-start').dataset.action='onboarding';nodes.get('#landing-settings').dataset.action='settings';
  const document={body:{dataset:{}},querySelector:selector=>nodes.get(selector)};
  const window={navigator:{language:device},scrollTo(){},addEventListener:(type,callback)=>windowEvents.set(type,callback),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},dispatchEvent:event=>windowEvents.get(event.type)?.(event)};
  let completeTransition,transitionActive=false;
  const transition={
    async run(task,options){
      transitionCalls.push({type:'run',...options});transitionActive=true;
      if(deferredTransition)return new Promise(resolve=>{completeTransition=async()=>{const result=await task();transitionActive=false;resolve(result);};});
      try{return await task();}finally{transitionActive=false;}
    },
    start(options){transitionCalls.push({type:'start',...options});transitionActive=true;return ()=>{transitionActive=false;};},
    finish(){transitionCalls.push({type:'finish'});transitionActive=false;},
  };
  const api=setupLanding({document,window,location,sessionStorage:storage(session)},{mountIcons(){},transition,navigate:destination=>{if(navigationError)throw Error('Navigation failed');navigations.push(destination);}});
  const emit=detail=>windowEvents.get('trespasser:account')({detail});
  return {api,nodes,document,session,local,windowEvents,delegatedActions,navigations,transitionCalls,emit,
    get transitionActive(){return transitionActive;},finishTransition:()=>completeTransition?.()};
}

test('unknown accounts always start at home; explicit workspace intent requires authenticated records',()=>{
  for(const path of ['./','./#personagens','./#inicio','./?code=TEST','./#access_token=TEST']){
    assert.equal(initialView(url(path),'workspace'),'home');
    const f=fixture({location:url(path),savedView:'workspace'});
    assert.equal(f.document.body.dataset.view,'home');assert.equal(f.nodes.get('#record-workspace').hidden,true);
  }
  assert.equal(initialView(url('./#personagens'),'home',available),'workspace');
  assert.equal(initialView(url('./'),'workspace',available),'workspace');
  assert.equal(initialView(url('./#inicio'),'workspace',available),'home');
  assert.equal(initialView(url('./#access_token=TEST'),'workspace',available),'home');
  assert.equal(initialView(url('./'),'workspace',{...available,recordsReady:false}),'home');
  assert.equal(initialView(url('./'),'workspace',{...available,blocked:'Lock held'}),'home');
});

test('guests see only Começar and its explicit delegated onboarding action',()=>{
  const f=fixture();
  assert.equal(f.nodes.get('#landing-start-actions').hidden,false);
  assert.equal(f.nodes.get('#landing-register-actions').hidden,true);
  assert.equal(f.nodes.get('#landing-settings').hidden,true);
  assert.equal(f.nodes.get('#landing-start').disabled,true);
  f.nodes.get('#landing-open').click();f.nodes.get('#landing-havens').click();f.nodes.get('#landing-start').click();
  assert.deepEqual(f.navigations,[]);assert.deepEqual(f.delegatedActions,[]);
  f.emit({signedIn:false,ready:true,recordsReady:false});
  assert.equal(f.nodes.get('#landing-start').disabled,false);
  assert.match(f.nodes.get('.landing-description').textContent,/personagens e refúgios/);
  assert.deepEqual(f.delegatedActions,[]);
  f.nodes.get('#landing-start').click();
  assert.deepEqual(f.delegatedActions,['onboarding']);
  assert.equal(f.nodes.get('#account-button').clicks,0);assert.equal(f.document.body.dataset.view,'home');
});

test('language follows the device and changes home labels without changing account or navigation state',()=>{
  const f=fixture({device:'fr-FR'});
  assert.equal(f.nodes.get('#landing-heading').textContent,'Your adventure starts here');
  assert.match(f.nodes.get('.landing-description').textContent,/characters and havens/);
  f.emit(available);assert.equal(f.nodes.get('#landing-heading').textContent,'Your records');
  setLanguagePreference('pt');assert.equal(f.nodes.get('#landing-heading').textContent,'Seus registros');
  assert.equal(f.nodes.get('#landing-register-actions').hidden,false);assert.equal(f.nodes.get('#landing-start-actions').hidden,true);
  assert.equal(f.document.body.dataset.view,'home');assert.deepEqual(f.navigations,[]);assert.deepEqual(f.delegatedActions,[]);
});

test('character toolbar can open Havens through the same gated loading transition',()=>{
  const f=fixture();const button=f.nodes.get('#haven-register-button');assert.equal(button.disabled,true);
  f.emit(available);assert.equal(button.disabled,false);
  let prevented=false;button.listeners.get('click')({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.deepEqual(f.navigations,['./havens.html']);assert.equal(f.transitionActive,true);
});

test('authenticated home exposes two registers and settings without opening any dialog',()=>{
  const f=fixture();f.emit(available);
  assert.equal(f.nodes.get('#landing-start-actions').hidden,true);
  assert.equal(f.nodes.get('#landing-register-actions').hidden,false);
  assert.equal(f.nodes.get('#landing-settings').hidden,false);
  assert.equal(f.nodes.get('#landing-open').disabled,false);
  assert.equal(f.nodes.get('#landing-havens').disabled,false);
  assert.equal(f.nodes.get('#landing-heading').textContent,'Seus registros');
  assert.equal(f.document.body.dataset.view,'home');assert.deepEqual(f.delegatedActions,[]);
  assert.equal(f.nodes.get('#account-button').clicks,0);
});

test('character readiness gates the workspace while Havens remain independent of its lock',async()=>{
  const f=fixture();f.emit({...available,recordsReady:false,loading:true});
  assert.equal(f.nodes.get('#landing-open').disabled,true);assert.equal(f.nodes.get('#landing-havens').disabled,false);
  assert.match(f.nodes.get('#landing-auth-status').textContent,/Carregando/);
  f.nodes.get('#landing-open').click();assert.equal(f.document.body.dataset.view,'home');
  f.emit({...available,recordsReady:false,loading:false,blocked:'Personagens abertos em outra aba.'});
  assert.equal(f.nodes.get('#landing-open').disabled,true);assert.equal(f.nodes.get('#landing-havens').disabled,false);
  f.nodes.get('#landing-havens').click();
  assert.deepEqual(f.navigations,['./havens.html']);
  assert.equal(f.transitionCalls.some(call=>call.type==='start'&&call.label==='Abrindo refúgios…'),true);
  assert.equal(f.transitionActive,true);
});

test('opening characters uses the transition and restores workspace focus; Home does not open settings',async()=>{
  const f=fixture();f.emit(available);f.nodes.get('#landing-open').click();await flush();
  assert.equal(f.document.body.dataset.view,'workspace');assert.equal(f.nodes.get('#record-workspace').hidden,false);
  assert.equal(f.nodes.get('#main').focused,true);assert.equal(f.nodes.get('#skip-link').href,'#main');
  assert.equal(f.transitionCalls.some(call=>call.type==='run'&&call.label==='Abrindo personagens…'),true);
  assert.equal(f.session.get('trespasser.view.v1'),'workspace');
  f.nodes.get('#home-button').click();
  assert.equal(f.document.body.dataset.view,'home');assert.equal(f.nodes.get('#landing-title').focused,true);
  assert.equal(f.nodes.get('#skip-link').href,'#landing-title');assert.deepEqual(f.delegatedActions,[]);
});

test('saved or explicit character intent waits for both login and real records',async()=>{
  for(const options of [{savedView:'workspace'},{location:url('./#personagens')}]){
    const f=fixture(options);
    f.emit({signedIn:false,ready:true,recordsReady:false});assert.equal(f.document.body.dataset.view,'home');
    f.emit({...available,recordsReady:false,loading:true});assert.equal(f.document.body.dataset.view,'home');
    f.emit(available);await flush();assert.equal(f.document.body.dataset.view,'workspace');
    f.nodes.get('#home-button').click();f.emit(available);await flush();
    assert.equal(f.document.body.dataset.view,'home');
  }
});

test('OAuth success always shows the two registers at home and clears an old Haven intent',async()=>{
  assert.equal(isAuthReturn(url('./#access_token=TEST&refresh_token=SECOND')),true);
  assert.equal(isAuthReturn(url('./?code=TEST')),true);assert.equal(isAuthReturn(url('./#error_description=cancelled')),true);
  const f=fixture({location:url('./#access_token=TEST&refresh_token=SECOND'),savedView:'workspace'});
  f.session.set('trespasser.auth.destination.v1',JSON.stringify({destination:'havens',createdAt:Date.now()}));
  f.emit({signedIn:false,ready:true,recordsReady:false});
  f.emit(available);await flush();f.emit(available);await flush();
  assert.equal(f.document.body.dataset.view,'home');assert.deepEqual(f.navigations,[]);
  assert.equal(f.session.has('trespasser.auth.destination.v1'),false);
  assert.equal(f.nodes.get('#landing-register-actions').hidden,false);assert.deepEqual(f.delegatedActions,[]);
  assert.equal([...f.session.values()].some(value=>value.includes('TEST')||value.includes('SECOND')),false);
});

test('signout during a pending opening cannot reveal records or leave a loading veil',async()=>{
  const f=fixture({deferredTransition:true});f.emit(available);f.nodes.get('#landing-open').click();
  assert.equal(f.transitionActive,true);
  f.emit({signedIn:false,ready:true,recordsReady:false});
  assert.equal(f.transitionActive,false);await f.finishTransition();await flush();
  assert.equal(f.document.body.dataset.view,'home');assert.equal(f.nodes.get('#record-workspace').hidden,true);
  assert.equal(f.nodes.get('#landing-start-actions').hidden,false);assert.equal(f.nodes.get('#landing-settings').hidden,true);
  assert.deepEqual(f.delegatedActions,[]);
});

test('a lost record lock or signout closes an already visible workspace',async()=>{
  const f=fixture();f.emit(available);await f.api.openCharacters();
  f.emit({...available,recordsReady:false,blocked:'Outra aba'});
  assert.equal(f.document.body.dataset.view,'home');assert.equal(f.nodes.get('#record-workspace').hidden,true);
  f.emit(available);await flush();assert.equal(f.document.body.dataset.view,'home');
});

test('failed cross-page navigation and BFCache return restore usable home controls',()=>{
  const failed=fixture({navigationError:true});failed.emit(available);failed.nodes.get('#landing-havens').click();
  assert.equal(failed.transitionActive,false);assert.equal(failed.nodes.get('#landing-havens').disabled,false);
  const f=fixture();f.emit(available);f.nodes.get('#landing-havens').click();
  f.windowEvents.get('pageshow')({persisted:true});
  assert.equal(f.transitionActive,false);assert.equal(f.nodes.get('#landing-open').disabled,false);
  assert.equal(f.nodes.get('#landing-havens').disabled,false);
});

test('an old artwork preference cannot alter the responsive artwork or authenticated access',async()=>{
  const f=fixture({storedArt:'cover'});f.emit(available);await f.api.openCharacters();
  assert.equal(f.nodes.get('#landing').dataset.art,undefined);
  assert.deepEqual([...f.local.entries()],[['trespasser.landing.art.v1','cover']]);
  assert.equal(f.document.body.dataset.view,'workspace');
});
