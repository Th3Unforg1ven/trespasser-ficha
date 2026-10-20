import test from 'node:test';
import assert from 'node:assert/strict';
import {initialView,isAuthReturn,setupLanding} from '../dist/landing.js';

const url=path=>new URL(path,'https://example.test/trespasser-ficha/');

function fixture({location=url('./'),savedView=null,storedArt=null}={}){
  const session=new Map(savedView?[['trespasser.view.v1',savedView]]:[]);
  const local=new Map(storedArt?[['trespasser.landing.art.v1',storedArt]]:[]);
  const storage=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
  const delegatedActions=[];
  const navigations=[];
  const node=(data={})=>({dataset:data,listeners:new Map(),attributes:new Map(),hidden:false,focused:false,clicks:0,disabled:false,
    addEventListener(type,fn){this.listeners.set(type,fn);},setAttribute(key,value){this.attributes.set(key,value);},
    focus(){this.focused=true;},click(){if(this.disabled)return;this.clicks++;this.listeners.get('click')?.();if(this.dataset.action)delegatedActions.push(this.dataset.action);}});
  const selectors=['#landing','#record-workspace','#skip-link','#landing-title','#main','#landing-open','#landing-guest','#landing-havens','#account-button','#home-button','.landing-description'];
  const nodes=new Map(selectors.map(selector=>[selector,node()]));
  const choices=[node({landingArt:'castle'}),node({landingArt:'cover'})];
  const windowEvents=new Map();
  const document={readyState:'complete',body:{dataset:{}},querySelector:selector=>nodes.get(selector),querySelectorAll:()=>choices};
  const window={scrollTo(){},addEventListener:(type,fn)=>windowEvents.set(type,fn)};
  const api=setupLanding({document,window,location,sessionStorage:storage(session),localStorage:storage(local)},{
    mountIcons(){},navigate:destination=>navigations.push(destination)
  });
  return{api,nodes,document,choices,session,local,windowEvents,delegatedActions,navigations};
}

test('fresh visits open the title page; an existing tab can resume its workspace',()=>{
  assert.equal(initialView(url('./'),null),'home');
  assert.equal(initialView(url('./'),'workspace'),'workspace');
  assert.equal(initialView(url('./'),'home'),'home');
  assert.equal(initialView(url('./'),'unexpected'),'home');
  assert.equal(initialView(url('./#inicio'),'workspace'),'home');
  assert.equal(initialView(url('./#personagens'),'home'),'workspace');
});

test('OAuth returns bypass the title page without persisting any callback credential',()=>{
  assert.equal(isAuthReturn(url('./#access_token=TEST&refresh_token=SECOND')),true);
  assert.equal(isAuthReturn(url('./?code=TEST')),true);
  assert.equal(isAuthReturn(url('./#error_description=cancelled')),true);
  assert.equal(isAuthReturn(url('./#character')),false);
  const f=fixture({location:url('./#access_token=TEST&refresh_token=SECOND'),savedView:'home'});
  assert.equal(f.document.body.dataset.view,'workspace');
  assert.equal(f.nodes.get('#record-workspace').hidden,false);
  assert.deepEqual([...f.session.values()],['workspace']);
  assert.equal([...f.local.values(),...f.session.values()].some(value=>value.includes('TEST')||value.includes('SECOND')),false);
});

test('opening sheets, guest access and returning home preserve separate screen focus and navigation state',()=>{
  const f=fixture();
  assert.equal(f.nodes.get('#landing').hidden,false);
  assert.equal(f.nodes.get('#record-workspace').hidden,true);
  f.nodes.get('#landing-open').click();
  assert.equal(f.nodes.get('#record-workspace').hidden,false);
  assert.equal(f.nodes.get('#main').focused,true);
  assert.equal(f.session.get('trespasser.view.v1'),'workspace');
  f.nodes.get('#home-button').click();
  assert.equal(f.nodes.get('#landing').hidden,false);
  assert.equal(f.nodes.get('#landing-title').focused,true);
  assert.equal(f.nodes.get('#skip-link').href,'#landing-title');
  f.nodes.get('#landing-guest').click();
  assert.equal(f.nodes.get('#skip-link').href,'#main');
  assert.equal(f.nodes.get('#account-button').clicks,0);
});

test('the haven register stays accessible before and after account readiness without opening settings',()=>{
  const f=fixture();
  f.nodes.get('#landing-havens').click();
  assert.deepEqual(f.navigations,['./havens.html']);
  assert.equal(f.document.body.dataset.view,'home');
  assert.deepEqual(f.delegatedActions,[]);
  f.windowEvents.get('trespasser:account')({detail:{signedIn:false,ready:true}});
  f.windowEvents.get('trespasser:account')({detail:{signedIn:true,ready:true}});
  assert.equal(f.nodes.get('#landing-guest').hidden,true);
  f.nodes.get('#landing-havens').click();
  assert.deepEqual(f.navigations,['./havens.html','./havens.html']);
  assert.deepEqual(f.delegatedActions,[]);
  f.windowEvents.get('trespasser:account')({detail:{signedIn:false,ready:true}});
  assert.equal(f.nodes.get('#landing-guest').hidden,false);
  f.windowEvents.get('trespasser:account')({detail:{signedIn:false,ready:false}});
  assert.equal(f.nodes.get('#landing-havens').disabled,false);
  assert.equal(f.nodes.get('#account-button').clicks,0);
});

test('a completed haven login returns to that register only for a fresh, fixed intent',()=>{
  const f=fixture({location:url('./#access_token=TEST'),savedView:'home'});
  f.session.set('trespasser.auth.destination.v1',JSON.stringify({destination:'havens',createdAt:Date.now()}));
  f.windowEvents.get('trespasser:account')({detail:{signedIn:false,ready:true}});
  assert.deepEqual(f.navigations,[]);
  f.windowEvents.get('trespasser:account')({detail:{signedIn:true,ready:true}});
  assert.deepEqual(f.navigations,['./havens.html']);
  f.windowEvents.get('trespasser:account')({detail:{signedIn:true,ready:true}});
  assert.equal(f.navigations.length,1);
  const normal=fixture();
  normal.session.set('trespasser.auth.destination.v1',JSON.stringify({destination:'havens',createdAt:Date.now()}));
  normal.windowEvents.get('trespasser:account')({detail:{signedIn:true,ready:true}});
  assert.deepEqual(normal.navigations,[]);
});

test('an old cover preference cannot replace the responsive scene or affect opening sheets',()=>{
  const f=fixture({storedArt:'cover'});
  assert.equal(f.nodes.get('#landing').dataset.art,undefined);
  assert.deepEqual([...f.local.entries()],[['trespasser.landing.art.v1','cover']]);
  f.nodes.get('#landing-open').click();
  assert.equal(f.document.body.dataset.view,'workspace');
});
