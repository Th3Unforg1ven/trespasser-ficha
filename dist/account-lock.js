/** Hold an exclusive browser-tab lock until release(). Never queue a second tab. */
export function acquireAccountLock(locks, name) {
  if (!locks || typeof locks.request !== 'function') {
    const error = new Error('Este navegador não permite editar fichas online com segurança entre abas. Use um navegador atualizado.');
    error.code = 'ACCOUNT_LOCK_UNSUPPORTED';
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    let releaseHold;
    const hold = new Promise(release => { releaseHold = release; });
    Promise.resolve().then(() => locks.request(name, { mode: 'exclusive', ifAvailable: true }, lock => {
      if (!lock) { resolve(null); return; }
      let released = false;
      resolve({ release() { if (!released) { released = true; releaseHold(); } } });
      return hold;
    })).catch(reject);
  });
}
