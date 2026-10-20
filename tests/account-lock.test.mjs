import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireAccountLock } from '../dist/account-lock.js';

const flush=async()=>{for(let index=0;index<12;index++)await Promise.resolve();};
function browserLocks() {
  const held=new Set(),calls=[];
  return {held,calls,async request(name,options,callback){
    calls.push({name,options});
    if(held.has(name))return callback(null);
    held.add(name);
    try{return await callback({name,mode:'exclusive'});}finally{held.delete(name);}
  }};
}

test('one account lock holds across async work, refuses a second tab and releases idempotently',async()=>{
  const locks=browserLocks();
  const a=await acquireAccountLock(locks,'trespasser.account.a');
  assert.deepEqual(locks.calls[0].options,{mode:'exclusive',ifAvailable:true});
  assert.equal(locks.held.has('trespasser.account.a'),true);
  assert.equal(await acquireAccountLock(locks,'trespasser.account.a'),null);
  const differentAccount=await acquireAccountLock(locks,'trespasser.account.b');
  assert.ok(differentAccount);
  a.release();a.release();await flush();
  const next=await acquireAccountLock(locks,'trespasser.account.a');
  assert.ok(next);
  next.release();differentAccount.release();await flush();
  assert.equal(locks.held.size,0);
});

test('unsupported or rejected Web Locks fail explicitly instead of an unsafe fallback',async()=>{
  await assert.rejects(acquireAccountLock(undefined,'account'),error=>error.code==='ACCOUNT_LOCK_UNSUPPORTED');
  const denied=new Error('Lock denied');
  await assert.rejects(acquireAccountLock({request(){throw denied;}},'account'),error=>error===denied);
});
