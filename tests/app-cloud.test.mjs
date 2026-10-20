import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as model from '../dist/model.js';
import * as uiState from '../dist/cloud-ui-state.js';
import { CloudSync } from '../dist/cloud-sync.js';
import { acquireAccountLock } from '../dist/account-lock.js';
import { icon, setButtonLabel, mountButtonIcons } from '../dist/icons.js';
import { setupTheme } from '../dist/preferences.js';

const KEY='trespasser.record.v1';
const appSource=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
const session=id=>id?{user:{id,email:`${id}@example.test`}}:null;

class Element {
  constructor(){this.dataset={};this.listeners=new Map();this.children=[];this.innerHTML='';this.textContent='';this.open=false;this.disabled=false;this.type='';this.tagName='DIV';}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  setAttribute(name,value){this[name]=value;}
  removeAttribute(name){delete this[name];}
  hasAttribute(name){return name in this;}
  querySelector(){return null;}
  querySelectorAll(){return [];}
  replaceChildren(...nodes){this.children=nodes;this.textContent=nodes.map(n=>n.textContent||'').join('');}
  append(...nodes){this.textContent+=nodes.map(n=>n.textContent||'').join('');}
  showModal(){this.open=true;}
  close(){this.open=false;}
  focus(){}
}

function browserLocks() {
  const held=new Set();
  return {held,async request(name,_options,callback){if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};
}

function fixture({guest=model.createCharacter('Ficha local'),initialUser=null,deferredSession=false,remote=new Map(),locks=browserLocks()}={}) {
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>[`#${match[1]}`,new Element()]));
  const documentListeners=new Map(),windowListeners=new Map();
  const storage=new Map([[KEY,JSON.stringify({version:1,activeId:guest.id,characters:[guest]})]]);
  const writes=[];
  let quotaFailure=false;
  const localStorage={getItem:key=>storage.get(key)??null,setItem(key,value){if(quotaFailure)throw new Error('Quota exceeded');writes.push([key,value]);storage.set(key,value);}};
  const document={hidden:false,activeElement:null,documentElement:{dataset:{},style:{}},
    querySelector:selector=>elements.get(selector)||null,
    querySelectorAll:selector=>selector.startsWith('#export-button')?[elements.get('#export-button')]:[],
    createElement:()=>{const element=new Element();element.ownerDocument=document;return element;},createTextNode:text=>({textContent:text}),
    addEventListener:(event,listener)=>documentListeners.set(event,listener)};
  for(const element of elements.values())element.ownerDocument=document;
  let nextTimer=0,authListener,resolveSession,authUser=initialUser,inCallback=false;
  const timers=new Map(),intervals=new Map(),calls=[];
  const auth={
    onAuthStateChange(callback){authListener=callback;return{data:{subscription:{unsubscribe(){authListener=null;}}}};},
    getSession(){return deferredSession?new Promise(resolve=>{resolveSession=resolve;}):Promise.resolve({data:{session:session(initialUser)},error:null});},
    async signOut(){assert.equal(inCallback,false,'SDK auth calls must happen outside its callback lock');emit(null);return{error:null};},
    async signInWithOAuth(options){assert.equal(inCallback,false);calls.push({type:'login',options});return{error:null};}
  };
  function emit(id){authUser=id;inCallback=true;try{authListener('SIGNED_IN',session(id));}finally{inCallback=false;}}
  const adapter={
    forUser(expectedUser){return{
      list(){assert.equal(authUser,expectedUser);return adapter.list();},
      save(sent){assert.equal(authUser,expectedUser);return adapter.save(sent);}
    };},
    async list(){assert.equal(inCallback,false,'loading the account inside the SDK callback can deadlock');calls.push({type:'list',user:authUser});return structuredClone(remote.get(authUser)||[]);},
    async save(sent){assert.equal(inCallback,false);calls.push({type:'save',user:authUser});const rows=remote.get(authUser)||[];const old=rows.find(r=>r.id===sent.id);if((old?.revision||0)!==sent.revision)return null;const row={id:sent.id,data:structuredClone(sent.data),revision:sent.revision+1,deleted_at:sent.deleted?'2026-10-19T12:00:00Z':null};remote.set(authUser,[...rows.filter(r=>r.id!==row.id),row]);return row;}
  };
  const window={localStorage,addEventListener(event,listener){const prior=windowListeners.get(event);windowListeners.set(event,prior?value=>{prior(value);listener(value);}:listener);},dispatchEvent:event=>windowListeners.get(event.type)?.(event)};
  const dependencies={...model,...uiState,CloudSync,acquireAccountLock,icon,setButtonLabel,mountButtonIcons,setupTheme,createCloudClient:()=>({auth,adapter}),cloudConfig:{},navigator:{locks},
    preparePrint(){},prepareExport(){throw new Error('Export is outside this auth test');},
    document,window,localStorage,location:{href:'https://example.test/trespasser-ficha/?ignored=1#ignored',reload(){calls.push({type:'reload'});}},
    setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    setInterval:(fn,delay)=>{const id=++nextTimer;intervals.set(id,{fn,delay});return id;},clearInterval:id=>intervals.delete(id)};
  const run=new Function(...Object.keys(dependencies),appSource+'\nreturn {getState:()=>({records,activeId,cloudUser,cloudReady,cloudStatus}),attachSession,save,syncCloud,logoutCloud,loginCloud,migrateLocalCharacters};');
  const app=run(...Object.values(dependencies));
  const runTimers=async(delay=0)=>{for(const[id,timer]of[...timers])if(timer.delay===delay){timers.delete(id);timer.fn();}await flush();};
  function edit(path,value){const target={dataset:{field:path},value,type:'text',matches:selector=>selector==='[data-field]'};documentListeners.get('input')({target});}
  return{app,storage,localStorage,writes,elements,auth,adapter,calls,emit,runTimers,edit,remote,locks,windowListeners,document,clickAction:(action,extra={})=>documentListeners.get('click')({target:{closest:()=>({dataset:{action,...extra}})}}),setQuotaFailure:value=>{quotaFailure=value;},
    resolveSession:id=>resolveSession({data:{session:session(id)},error:null})};
}

test('a stale initial auth session cannot replace a newer sign-in, and SDK callbacks defer work',async()=>{
  const f=fixture({deferredSession:true});
  f.emit('new-account');
  f.resolveSession('stale-account');
  await flush();
  assert.equal(f.app.getState().cloudUser,null);
  await f.runTimers();
  assert.equal(f.app.getState().cloudUser.id,'new-account');
  assert.equal(f.app.getState().cloudReady,true);
  assert.equal(f.calls.some(call=>call.user==='stale-account'),false);
  assert.equal(f.storage.has(`${KEY}.cloud.stale-account`),false);
});

test('editing private account data never writes it to the guest archive; logout restores guest sheets',async()=>{
  const privateCharacter=model.createCharacter('Personagem privado');
  const f=fixture({initialUser:'account-a',remote:new Map([['account-a',[{id:privateCharacter.id,data:privateCharacter,revision:1,deleted_at:null}]]])});
  await flush();
  const guestArchive=f.storage.get(KEY);
  f.edit('name','Nome privado alterado');
  assert.equal(f.app.getState().cloudStatus.state,'pending');
  assert.equal(f.storage.get(KEY),guestArchive);
  assert.match(f.storage.get(`${KEY}.cloud.account-a`),/Nome privado alterado/);
  assert.equal(f.writes.filter(([key])=>key===KEY).some(([,value])=>value.includes('privado')),false);
  await f.app.logoutCloud();
  await f.runTimers();
  assert.equal(f.app.getState().cloudUser,null);
  assert.equal(f.app.getState().records[0].name,'Ficha local');
  assert.equal(f.storage.get(KEY),guestArchive);
  assert.equal(f.elements.get('#main').inert,false);
});

test('switching accounts keeps caches separate and an empty account does not upload its placeholder',async()=>{
  const f=fixture({initialUser:'account-a'});
  await flush();
  assert.equal(f.app.getState().records.length,1);
  assert.equal(JSON.parse(f.storage.get(`${KEY}.cloud.account-a`)).records.length,0);
  assert.equal(f.calls.filter(call=>call.type==='save').length,0);
  f.edit('name','Pertence à conta A');
  f.emit('account-b');await f.runTimers();
  assert.equal(f.app.getState().cloudUser.id,'account-b');
  assert.equal(f.app.getState().records[0].name,'');
  assert.equal(JSON.parse(f.storage.get(`${KEY}.cloud.account-b`)).records.length,0);
  assert.match(f.storage.get(`${KEY}.cloud.account-a`),/Pertence à conta A/);
  assert.equal(f.storage.get(KEY).includes('Pertence'),false);
});

test('login returns to a clean project-root URL and export becomes available after account loading',async()=>{
  const f=fixture();await flush();await f.app.loginCloud();
  assert.equal(f.calls.find(call=>call.type==='login').options.options.redirectTo,'https://example.test/trespasser-ficha/');
  f.emit('account-a');await f.runTimers();
  assert.equal(f.elements.get('#export-button').disabled,false);
});

test('settings remain available with their engraved gear through sign-in and sign-out',async()=>{
  const f=fixture();await flush();
  const button=f.elements.get('#account-button');
  assert.equal(button.textContent,'Ajustes');
  assert.match(button.children[0].innerHTML,/aria-hidden="true"/);
  f.emit('account-a');await f.runTimers();
  assert.equal(button.children[1].textContent,'Ajustes');
  assert.match(button.children[0].innerHTML,/icon--settings/);
  await f.app.logoutCloud();
  assert.equal(button.children[1].textContent,'Ajustes');
  assert.equal(button.dataset.icon,'settings');
});

test('settings change appearance independently from characters and expose automatic saving without a manual sync action',async()=>{
  const f=fixture({initialUser:'account-a'});await flush();
  f.elements.get('#account-button').listeners.get('click')();
  assert.equal(f.elements.get('#dialog-title').textContent,'Configurações');
  const content=f.elements.get('#dialog-content').innerHTML;
  assert.match(content,/data-theme-value="dark"/);
  assert.match(content,/data-action="cloud-logout"/);
  assert.doesNotMatch(content,/data-action="cloud-sync"|Sincronizar agora/);
  const archive=f.storage.get(KEY),accountArchive=f.storage.get(`${KEY}.cloud.account-a`),requests=f.calls.length;
  f.clickAction('theme',{themeValue:'dark'});
  assert.equal(f.document.documentElement.dataset.theme,'dark');
  assert.equal(f.storage.get('trespasser.theme.v1'),'dark');
  assert.equal(f.storage.get(KEY),archive);
  assert.equal(f.storage.get(`${KEY}.cloud.account-a`),accountArchive);
  assert.equal(f.calls.length,requests);
  f.windowListeners.get('storage')({key:'trespasser.theme.v1',newValue:'light',storageArea:f.localStorage});
  assert.equal(f.document.documentElement.dataset.theme,'light');
  assert.equal(f.storage.get(KEY),archive);
  assert.equal(f.calls.length,requests);
});

test('a stalled session check releases the account dialog and a later valid auth event still works',async()=>{
  const f=fixture({deferredSession:true});
  f.elements.get('#account-button').listeners.get('click')();
  assert.match(f.elements.get('#dialog-content').innerHTML,/Verificando sua conta/);
  await f.runTimers(20000);
  assert.match(f.elements.get('#dialog-content').innerHTML,/Entrar com Google/);
  assert.match(f.elements.get('#dialog-content').innerHTML,/verificação da sessão está demorando/);
  await f.app.loginCloud();
  assert.equal(f.calls.some(call=>call.type==='login'),true);
  assert.equal(f.elements.get('#main').inert,undefined);
  f.emit('eventual-account');await f.runTimers();
  assert.equal(f.app.getState().cloudUser.id,'eventual-account');
  assert.equal(f.app.getState().cloudReady,true);
  assert.equal(f.elements.get('#main').inert,false);
});

test('a rejected edit cannot become falsely saved or get overwritten by a background sync',async()=>{
  const c=model.createCharacter('Ficha grande');
  const f=fixture({initialUser:'account-a',remote:new Map([['account-a',[{id:c.id,data:c,revision:1,deleted_at:null}]]])});
  await flush();
  const current=f.app.getState().records[0];
  current.inventory=Array.from({length:1001},(_,i)=>({id:`item-${i}`,name:`Item ${i}`,slots:1,notes:''}));
  f.app.save();
  assert.equal(f.app.getState().cloudStatus.state,'error');
  const requestCount=f.calls.length;
  await f.app.syncCloud();
  assert.equal(f.calls.length,requestCount);
  assert.equal(f.app.getState().records[0].inventory.length,1001);
  assert.equal(f.app.getState().cloudStatus.state,'error');
  f.elements.get('#account-button').listeners.get('click')();
  assert.match(f.elements.get('#dialog-content').innerHTML,/edições ainda não foram guardadas/);
  await f.app.logoutCloud();
  assert.equal(f.app.getState().cloudUser.id,'account-a');
  current.inventory=[];f.app.save();await f.app.syncCloud();
  assert.equal(f.app.getState().cloudStatus.state,'synced');
});

test('quota plus offline keeps the only in-memory copy visible and blocks logout, migration and closing',async()=>{
  const c=model.createCharacter('Ficha privada');
  const f=fixture({initialUser:'account-a',remote:new Map([['account-a',[{id:c.id,data:c,revision:1,deleted_at:null}]]])});
  await flush();
  const normalList=f.adapter.list;
  f.setQuotaFailure(true);
  f.edit('notes','Única cópia em memória');
  f.adapter.list=async()=>{throw new Error('Network disconnected');};
  await f.app.syncCloud();
  assert.equal(f.app.getState().cloudStatus.pending,1);
  assert.equal(f.app.getState().cloudStatus.localSaved,false);
  f.elements.get('#account-button').listeners.get('click')();
  const dialog=f.elements.get('#dialog-content').innerHTML;
  assert.match(dialog,/somente na memória/);
  assert.match(dialog,/Exportar uma cópia/);
  assert.match(dialog,/data-action="cloud-logout" disabled/);
  assert.doesNotMatch(dialog,/ficam guardadas neste navegador/);
  const before=f.app.getState().records.length;
  await f.app.migrateLocalCharacters();
  assert.equal(f.app.getState().records.length,before);
  await f.app.logoutCloud();
  assert.equal(f.app.getState().cloudUser.id,'account-a');
  let prevented=false;
  const event={preventDefault(){prevented=true;}};
  f.windowListeners.get('beforeunload')(event);
  assert.equal(prevented,true);
  assert.equal(event.returnValue,'');

  // Once the cloud confirms the write, lack of a browser cache is no longer
  // a reason to block logout or warn about closing the page.
  f.adapter.list=normalList;
  await f.app.syncCloud();
  assert.equal(f.app.getState().cloudStatus.pending,0);
  assert.equal(f.remote.get('account-a')[0].data.notes,'Única cópia em memória');
  prevented=false;
  f.windowListeners.get('beforeunload')({preventDefault(){prevented=true;}});
  assert.equal(prevented,false);
  await f.app.logoutCloud();
  assert.equal(f.app.getState().cloudUser,null);
});

test('only one tab may initialize an account cache; blocked tab can log out but cannot export its placeholder',async()=>{
  const locks=browserLocks();
  const first=fixture({initialUser:'account-a',locks});
  await flush();
  assert.equal(first.app.getState().cloudReady,true);
  const second=fixture({initialUser:'account-a',locks});
  await flush();
  assert.equal(second.app.getState().cloudReady,false);
  assert.equal(second.elements.get('#main').inert,true);
  assert.equal(second.elements.get('#export-button').disabled,true);
  assert.equal(second.calls.some(call=>call.type==='list'||call.type==='save'),false);
  assert.equal(second.storage.has(`${KEY}.cloud.account-a`),false);
  assert.match(second.elements.get('#dialog-content').innerHTML,/Esta conta está aberta em outra aba\. Feche-a e recarregue esta página\./);
  await second.app.logoutCloud();
  assert.equal(second.app.getState().cloudUser,null);
  assert.equal(second.elements.get('#export-button').disabled,false);
  assert.equal(locks.held.has('trespasser.account.account-a'),true);
  await first.app.logoutCloud();await flush();
  assert.equal(locks.held.size,0);
  const next=fixture({initialUser:'account-a',locks});await flush();
  assert.equal(next.app.getState().cloudReady,true);
});

test('unsupported Web Locks blocks online edits explicitly and leaves guest sheets available after logout',async()=>{
  const f=fixture({initialUser:'account-a',locks:null});await flush();
  assert.equal(f.app.getState().cloudReady,false);
  assert.equal(f.elements.get('#main').inert,true);
  assert.equal(f.elements.get('#export-button').disabled,true);
  assert.equal(f.calls.some(call=>call.type==='list'||call.type==='save'),false);
  assert.equal(f.storage.has(`${KEY}.cloud.account-a`),false);
  assert.match(f.elements.get('#dialog-content').innerHTML,/Use um navegador atualizado/);
  await f.app.logoutCloud();
  assert.equal(f.app.getState().records[0].name,'Ficha local');
  assert.equal(f.elements.get('#main').inert,false);
});

test('a late lock acquisition after logout releases itself without touching the private cache',async()=>{
  let acquire;
  const held=new Set();
  const locks={request(name,_options,callback){return new Promise((resolve,reject)=>{
    acquire=()=>{held.add(name);Promise.resolve(callback({name})).then(value=>{held.delete(name);resolve(value);},reject);};
  });}};
  const f=fixture({initialUser:'account-a',locks});await flush();
  assert.equal(f.app.getState().cloudReady,false);
  await f.app.logoutCloud();
  acquire();await flush();
  assert.equal(f.app.getState().cloudUser,null);
  assert.equal(held.size,0);
  assert.equal(f.calls.some(call=>call.type==='list'||call.type==='save'),false);
  assert.equal(f.storage.has(`${KEY}.cloud.account-a`),false);
});

test('pagehide stops synchronization and releases the tab lock; bfcache return reloads before editing',async()=>{
  const locks=browserLocks(),f=fixture({initialUser:'account-a',locks});await flush();
  assert.equal(locks.held.size,1);
  f.windowListeners.get('pagehide')();await flush();
  assert.equal(locks.held.size,0);
  const calls=f.calls.length;
  await f.app.syncCloud();
  assert.equal(f.calls.length,calls);
  f.windowListeners.get('pageshow')({persisted:true});
  assert.equal(f.calls.at(-1).type,'reload');
});
