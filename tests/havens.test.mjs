import test from 'node:test';
import assert from 'node:assert/strict';
import { createHavenController, HAVEN_KEY } from '../dist/havens.js';
import { createHaven } from '../dist/haven-model.js';

const flush=async()=>{for(let count=0;count<60;count++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const session=id=>id?{user:{id,email:`${id}@example.test`}}:null;
function fixture({guest,initial=null,deferredSession=false,deferredLogout=false,readFailure=false,lockResult=true}={}) {
  const saved=new Map(),sessionSaved=new Map(),calls=[],pending=new Map(),rows=new Map(),releases=[];
  if(guest)saved.set(HAVEN_KEY,JSON.stringify({version:1,activeId:guest.id,havens:[guest]}));
  let authHandler,sequence=0,timerId=0,failCache=false;
  const initialRequest=deferred();
  const logoutRequest=deferred();
  const storage={getItem(key){if(readFailure&&key===HAVEN_KEY)throw new Error('Denied');return saved.get(key)??null;},setItem(key,value){if(failCache&&key.includes('.cloud.'))throw new Error('Quota');saved.set(key,value);}};
  const tabStorage={getItem:key=>sessionSaved.get(key)??null,setItem:(key,value)=>sessionSaved.set(key,value),removeItem:key=>sessionSaved.delete(key)};
  const timers={setTimeout(callback,delay){const id=++timerId;pending.set(id,{callback,delay});return id;},clearTimeout:id=>pending.delete(id),setInterval(callback,delay){const id=++timerId;pending.set(id,{callback,delay,interval:true});return id;},clearInterval:id=>pending.delete(id)};
  const adapters=new Map();
  const adapter=id=>{
    if(!adapters.has(id))adapters.set(id,{
      async list(){calls.push({type:'list',id});return structuredClone([...(rows.get(id)||new Map()).values()]);},
      async save({id:recordId,data,revision,deleted}){
        calls.push({type:'save',account:id,recordId,data:structuredClone(data),deleted});
        if(!rows.has(id))rows.set(id,new Map());
        const account=rows.get(id),existing=account.get(recordId);
        if((existing?.revision||0)!==revision)return null;
        const row={id:recordId,data:structuredClone(data),revision:revision+1,deleted_at:deleted?'2026-10-20':null};
        account.set(recordId,row);return structuredClone(row);
      }
    });
    return adapters.get(id);
  };
  const controller=createHavenController({storage,sessionStorage:tabStorage,locks:{},location:{href:'https://example.test/trespasser-ficha/havens.html?ignored=1#ignored'},timers,
    makeId:()=>`fresh-${++sequence}`,onToast:message=>calls.push({type:'toast',message}),
    lock:async(_locks,name)=>{calls.push({type:'lock',name});return lockResult?{release(){releases.push(name);}}:null;},
    makeConnection(config){calls.push({type:'config',config});return {
      auth:{
        onAuthStateChange(callback){authHandler=callback;return {data:{subscription:{unsubscribe(){calls.push({type:'unsubscribe'});}}}};},
        async getSession(){return deferredSession?initialRequest.promise:{data:{session:session(initial)}};},
        async signInWithOAuth(options){calls.push({type:'login',options});return {error:null};},
        async signOut(options){calls.push({type:'logout',options});return deferredLogout?logoutRequest.promise:{error:null};},
      },adapter:{forUser:adapter},
    };}
  });
  const runTimers=async(delay=0)=>{for(const [id,timer] of [...pending])if(!timer.interval&&timer.delay<=delay){pending.delete(id);timer.callback();}await flush();};
  const seed=(id,haven)=>{rows.set(id,new Map([[haven.id,{id:haven.id,data:structuredClone(haven),revision:1,deleted_at:null}]]));};
  return {controller,saved,calls,rows,adapter,seed,releases,sessionSaved,initialRequest,logoutRequest,
    initialize:()=>controller.initialize(),emit(id){authHandler('SIGNED_IN',session(id));},runTimers,
    failCache(){failCache=true;},
  };
}

test('account edits never enter the guest archive and logout restores local havens',async()=>{
  const guest=createHaven('Local'),cloud=createHaven('Privado'),f=fixture({guest});
  f.seed('a',cloud);await f.initialize();const original=f.saved.get(HAVEN_KEY);
  f.emit('a');await f.runTimers();
  assert.equal(f.controller.getState().records[0].name,'Privado');
  f.controller.update('name','Privado editado');await f.controller.sync();
  assert.equal(f.saved.get(HAVEN_KEY),original);
  assert.match(f.saved.get(`${HAVEN_KEY}.cloud.a`),/Privado editado/);
  await f.controller.logout();
  assert.equal(f.controller.getState().records[0].name,'Local');
  assert.deepEqual(f.calls.find(call=>call.type==='logout').options,{scope:'local'});
  f.controller.dispose();
});

test('an empty account does not upload a default placeholder; an explicit new haven persists',async()=>{
  const f=fixture({initial:'a'});await f.initialize();
  assert.equal(f.calls.filter(call=>call.type==='save').length,0);
  assert.equal(f.controller.getState().records.length,1);
  f.controller.add();await f.controller.sync();
  assert.equal(f.calls.filter(call=>call.type==='save').length,1);
  assert.equal(f.rows.get('a').size,1);
  f.controller.dispose();
});

test('auth callbacks defer SDK work and an old getSession cannot replace a newer account',async()=>{
  const f=fixture({deferredSession:true});const initialization=f.initialize();
  f.emit('new');
  assert.equal(f.calls.some(call=>call.type==='list'),false);
  await f.runTimers();
  assert.equal(f.controller.getState().user.id,'new');
  f.initialRequest.resolve({data:{session:session('old')}});await initialization;
  assert.equal(f.controller.getState().user.id,'new');
  assert.equal(f.calls.some(call=>call.type==='list'&&call.id==='old'),false);
  f.controller.dispose();
});

test('late pulls from an old account cannot replace the current scope',async()=>{
  const f=fixture();await f.initialize();const pull=deferred(),old=createHaven('Antigo'),newer=createHaven('Atual');
  f.adapter('old').list=()=>pull.promise;f.seed('new',newer);
  f.emit('old');await f.runTimers();assert.equal(f.controller.getState().loading,true);
  f.emit('new');await f.runTimers();assert.equal(f.controller.getState().records[0].name,'Atual');
  pull.resolve([{id:old.id,data:old,revision:1,deleted_at:null}]);await flush();
  assert.equal(f.controller.getState().user.id,'new');
  assert.equal(f.controller.getState().records[0].name,'Atual');
  assert.equal(f.releases.includes('trespasser.havens.account.old'),true);
  f.controller.dispose();
});

test('cache failure exposes memory-only edits and prevents unsafe signout',async()=>{
  const f=fixture({initial:'a'});await f.initialize();f.failCache();
  f.controller.update('name','Ainda na memória');
  assert.equal(f.controller.getState().unsafe,true);
  assert.equal(f.controller.getState().canLogout,false);
  await f.controller.logout();
  assert.equal(f.calls.some(call=>call.type==='logout'),false);
  assert.equal(f.saved.has(HAVEN_KEY),false);
  f.controller.dispose();
});

test('local migration is explicit, preserves the guest copy and never overwrites a collision',async()=>{
  const guest=createHaven('Local'),privateCopy={...structuredClone(guest),name:'Conta'},f=fixture({guest,initial:'a'});
  f.seed('a',privateCopy);await f.initialize();const archive=f.saved.get(HAVEN_KEY);
  assert.equal(f.controller.getState().migrationCount,1);
  assert.equal(f.controller.getState().records.length,1);
  await f.controller.migrate();
  const data=f.controller.getState().records;
  assert.deepEqual(data.map(item=>item.name).sort(),['Conta','Local']);
  assert.equal(new Set(data.map(item=>item.id)).size,2);
  assert.equal(f.saved.get(HAVEN_KEY),archive);
  assert.equal(f.controller.getState().migrationCount,0);
  await f.controller.migrate();assert.equal(f.controller.getState().records.length,2);
  f.controller.dispose();
});

test('Havens use a separate table, cache and tab-lock namespace from characters',async()=>{
  const f=fixture({initial:'a'});await f.initialize();
  const config=f.calls.find(call=>call.type==='config').config;
  assert.equal(config.table,'trespasser_havens');assert.equal(config.rpc,'trespasser_save_haven');
  assert.equal(f.calls.find(call=>call.type==='lock').name,'trespasser.havens.account.a');
  assert.equal(f.saved.has('trespasser.record.v1'),false);
  assert.equal(f.saved.has(`${HAVEN_KEY}.cloud.a`),true);
  f.controller.dispose();
});

test('imports reject character JSON, preserve clocks and create a separate haven identity',async()=>{
  const f=fixture();const before=f.controller.getState().records.length;
  assert.throws(()=>f.controller.importRecord({format:'trespasser-character',version:1,character:{name:'Wrong'}}),/JSON de Refúgio/);
  assert.equal(f.controller.getState().records.length,before);
  const haven=createHaven('Importado');haven.builds=[{id:'clock',name:'Torre',clock:8,segments:6,notes:'Sem conclusão automática'}];
  f.controller.importRecord({format:'trespasser-haven',version:1,rules:'2.1.3',haven});
  const result=f.controller.getState().records.at(-1);
  assert.notEqual(result.id,haven.id);assert.equal(result.builds[0].clock,8);assert.equal(result.finishedBuildings.length,0);
  f.controller.dispose();
});

test('invalid edits roll back the active record and corrupt guest storage is preserved',async()=>{
  const f=fixture({readFailure:true});const before=f.controller.getState().activeId;
  assert.equal(f.controller.change(records=>{records.push({kind:'bad'});}),false);
  assert.equal(f.controller.getState().activeId,before);
  f.controller.update('name','Em memória');assert.equal(f.saved.has(HAVEN_KEY),false);
  assert.equal(f.controller.getState().unsafe,true);
  f.controller.externalGuestChange();assert.equal(f.controller.getState().canEdit,false);
  f.controller.dispose();
});

test('OAuth returns through the authorized root with a fixed Haven destination only',async()=>{
  const f=fixture();await f.initialize();await f.controller.login();
  const call=f.calls.find(call=>call.type==='login');
  assert.deepEqual(call.options,{provider:'google',options:{redirectTo:'https://example.test/trespasser-ficha/'}});
  const intent=JSON.parse(f.sessionSaved.get('trespasser.auth.destination.v1'));
  assert.equal(intent.destination,'havens');assert.equal(typeof intent.createdAt,'number');
  assert.equal(JSON.stringify(intent).includes('token'),false);
  f.controller.dispose();
});

test('a busy account lock blocks editing without replacing local data',async()=>{
  const guest=createHaven('Backup local'),f=fixture({guest,initial:'a',lockResult:false});const original=f.saved.get(HAVEN_KEY);
  await f.initialize();assert.equal(f.controller.getState().canEdit,false);
  assert.match(f.controller.getState().blocked,/outra aba/);
  f.controller.update('name','Bloqueado');assert.equal(f.saved.get(HAVEN_KEY),original);
  assert.notEqual(f.controller.getState().records[0].name,'Bloqueado');
  f.controller.dispose();
});

test('cached offline edits survive signout and the next login without touching the guest backup',async()=>{
  const guest=createHaven('Visitante'),privateHaven=createHaven('Nuvem'),f=fixture({guest,initial:'a'});
  f.seed('a',privateHaven);await f.initialize();const archive=f.saved.get(HAVEN_KEY);
  f.adapter('a').list=async()=>{throw new Error('Sem conexão');};
  f.controller.update('name','Edição offline');await f.controller.sync();
  assert.equal(f.controller.getState().status.pending,1);
  assert.equal(f.controller.getState().canLogout,true);
  await f.controller.logout();assert.equal(f.controller.getState().records[0].name,'Visitante');
  f.emit('a');await f.runTimers();
  assert.equal(f.controller.getState().records[0].name,'Edição offline');
  assert.equal(f.controller.getState().status.pending,1);
  assert.equal(f.saved.get(HAVEN_KEY),archive);
  f.controller.dispose();
});

test('deleting the last online haven records a tombstone without uploading its UI replacement',async()=>{
  const haven=createHaven('Excluir'),f=fixture({initial:'a'});f.seed('a',haven);await f.initialize();
  f.controller.remove(haven.id);await f.controller.sync();
  const writes=f.calls.filter(call=>call.type==='save');
  assert.equal(writes.length,1);assert.equal(writes[0].deleted,true);
  assert.equal(f.controller.getState().records.length,1);
  assert.equal(f.rows.get('a').size,1);
  f.controller.dispose();
});

test('a stalled initial session check releases the settings login and accepts a later auth event',async()=>{
  const f=fixture({deferredSession:true});const initializing=f.initialize();
  assert.equal(f.controller.getState().ready,false);await f.runTimers(20000);
  assert.equal(f.controller.getState().ready,true);
  await f.controller.login();assert.equal(f.calls.some(call=>call.type==='login'),true);
  f.emit('later');await f.runTimers();assert.equal(f.controller.getState().user.id,'later');
  f.initialRequest.resolve({data:{session:null}});await initializing;
  assert.equal(f.controller.getState().user.id,'later');
  f.controller.dispose();
});

test('a late signout result cannot detach a newer account received in another tab',async()=>{
  const f=fixture({initial:'a',deferredLogout:true});await f.initialize();
  const leaving=f.controller.logout();f.emit('b');await f.runTimers();
  f.logoutRequest.resolve({error:null});await leaving;
  assert.equal(f.controller.getState().user.id,'b');
  assert.equal(f.controller.getState().cloudReady,true);
  f.controller.dispose();
});
