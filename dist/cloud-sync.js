import { normalizeSyncCharacter, normalizeSyncRecord, recordFingerprint, mergeRecord, isSyncCharacterId, CHARACTER_PORTRAIT_RECORD } from './sync-state.js?v=records-2';

const CACHE_VERSION = 1;
const MAX_RECORDS = 10_000;
const clone = value => JSON.parse(JSON.stringify(value));
const validRevision = value => Number.isSafeInteger(value) && value >= 0;

function normalizeRecords(records, normalizeRecord) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) throw new Error('Lista de fichas inválida.');
  const normalized = records.map(value => normalizeRecord(value));
  if (new Set(normalized.map(record => record.id)).size !== normalized.length) throw new Error('Há identificadores de ficha repetidos.');
  return normalized;
}

function normalizeRow(input, normalizeRecord) {
  if (!input || typeof input !== 'object' || !isSyncCharacterId(input.id) || !validRevision(input.revision) || input.revision < 1) throw new Error('Resposta de sincronização inválida.');
  if (input.deleted_at !== null && input.deleted_at !== undefined && (typeof input.deleted_at !== 'string' || !input.deleted_at)) throw new Error('Exclusão de ficha inválida.');
  const deleted = Boolean(input.deleted_at);
  const data = deleted ? null : normalizeRecord(input.data);
  if (data && data.id !== input.id) throw new Error('A resposta da nuvem contém um identificador diferente.');
  return { id: input.id, revision: input.revision, deleted, data };
}

function normalizeRows(rows, normalizeRecord) {
  if (!Array.isArray(rows) || rows.length > MAX_RECORDS * 2) throw new Error('Resposta de sincronização inválida.');
  const normalized = rows.map(row => normalizeRow(row, normalizeRecord));
  if (new Set(normalized.map(row => row.id)).size !== normalized.length) throw new Error('A nuvem retornou fichas repetidas.');
  return normalized;
}

/**
 * Offline-first character synchronization. The adapter is scoped to one account:
 * list() returns all active rows and tombstones; save({id,data,revision,deleted})
 * returns a row or null on CAS failure. Revision 0 means insert-if-absent.
 * Scheduling, authentication, pagination and transport timeouts belong outside.
 */
export class CloudSync {
  constructor({ adapter, storage, cacheKey, onChange = () => {}, onStatus = () => {}, onConflict = () => {}, makeId, normalizeRecord = normalizeSyncCharacter } = {}) {
    if (!adapter || typeof adapter.list !== 'function' || typeof adapter.save !== 'function') throw new Error('Adaptador de sincronização inválido.');
    if (typeof cacheKey !== 'string' || !cacheKey) throw new Error('Cache da conta não informado.');
    if (typeof normalizeRecord !== 'function') throw new Error('Normalizador de ficha inválido.');
    this.normalizeRecord = input => normalizeSyncRecord(input, normalizeRecord);
    this.normalizeRecord[CHARACTER_PORTRAIT_RECORD] = normalizeRecord[CHARACTER_PORTRAIT_RECORD] === true;
    this.fingerprint = input => recordFingerprint(input, this.normalizeRecord);
    this.same = (left, right) => this.fingerprint(left) === this.fingerprint(right);
    this.adapter = adapter;
    this.storage = storage;
    this.cacheKey = cacheKey;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.onConflict = onConflict;
    this.makeId = makeId || (() => {
      if (!globalThis.crypto?.randomUUID) throw new Error('Não foi possível criar um identificador seguro.');
      return globalThis.crypto.randomUUID();
    });
    this.records = [];
    this.activeId = null;
    this.rows = new Map();
    this.running = false;
    this.generation = 0;
    this.flight = null;
    this.viewKey = null;
    this.storageError = '';
    this.cacheWritable = true;
    this.remoteIds = new Set();
  }

  getSnapshot() {
    return { records: clone(this.records), activeId: this.activeId };
  }

  async start({ records = [], activeId = null } = {}) {
    this.generation++;
    this.running = true;
    this.flight = null;
    this.viewKey = null;
    this.storageError = '';
    this.cacheWritable = true;
    this.records = normalizeRecords(records, this.normalizeRecord);
    this.activeId = activeId;
    this.rows = new Map(this.records.map(record => [record.id, { id: record.id, revision: 0, deleted: false, base: null }]));
    this._loadCache();
    this._fixActive();
    this._commit();
    return this.sync();
  }

  stop() {
    this.running = false;
    this.generation++;
    this.flight = null;
  }

  /** Local edits are already rendered by the caller; never echo them to onChange. */
  setRecords(records, activeId = this.activeId) {
    if (!this.running) return this.getSnapshot();
    const next = normalizeRecords(records, this.normalizeRecord);
    this.records = next;
    this.activeId = activeId;
    for (const record of next) if (!this.rows.has(record.id)) this.rows.set(record.id, { id: record.id, revision: 0, deleted: false, base: null });
    const ids = new Set(next.map(record => record.id));
    for (const [id, row] of this.rows) if (!ids.has(id) && row.revision === 0) this.rows.delete(id);
    this._fixActive();
    this.viewKey = this._viewKey();
    this._persist();
    return this.getSnapshot();
  }

  /** Concurrent callers share the operation; bounded CAS retries prevent loops. */
  sync() {
    if (!this.running) return Promise.resolve(this.getSnapshot());
    if (this.flight?.generation === this.generation) return this.flight.promise;
    const operation = { generation: this.generation, promise: null };
    operation.promise = this._run(operation.generation).finally(() => {
      if (this.flight === operation) this.flight = null;
    });
    this.flight = operation;
    return operation.promise;
  }

  _alive(generation) {
    return this.running && this.generation === generation;
  }

  _call(callback, value) {
    if (!this.running) return;
    // A UI callback must not turn an acknowledged write into a failed sync.
    try { callback(clone(value)); } catch { /* UI owns its error handling. */ }
  }

  _status(state, message) {
    this._call(this.onStatus, { state, message, pending: this._pendingIds().length, localSaved: !this.storageError });
  }

  _conflict(type, id, message, extra = {}) {
    this._call(this.onConflict, { type, id, message, ...extra });
  }

  _record(id) {
    return this.records.find(record => record.id === id);
  }

  _setRecord(character) {
    const index = this.records.findIndex(record => record.id === character.id);
    if (index === -1) this.records.push(this.normalizeRecord(character));
    else this.records[index] = this.normalizeRecord(character);
  }

  _removeRecord(id) {
    this.records = this.records.filter(record => record.id !== id);
  }

  _fixActive() {
    if (!this.records.some(record => record.id === this.activeId)) this.activeId = this.records[0]?.id ?? null;
  }

  _viewKey() {
    return JSON.stringify([this.activeId, this.records.map(record => this.fingerprint(record))]);
  }

  _commit() {
    if (!this.running) return;
    this._fixActive();
    this._persist();
    const key = this._viewKey();
    if (key !== this.viewKey) {
      this.viewKey = key;
      this._call(this.onChange, this.getSnapshot());
    }
  }

  _persist() {
    if (!this.running || !this.cacheWritable) return;
    try {
      if (!this.storage || typeof this.storage.setItem !== 'function') throw new Error('Armazenamento local indisponível.');
      this.storage.setItem(this.cacheKey, JSON.stringify({ version: CACHE_VERSION, ...this.getSnapshot(), rows: [...this.rows.values()] }));
      this.storageError = '';
    } catch {
      this.storageError = 'Não foi possível salvar a cópia neste navegador. Mantenha a página aberta até a sincronização terminar ou exporte a ficha.';
      this._status('error', this.storageError);
    }
  }

  _loadCache() {
    let raw;
    try {
      if (!this.storage || typeof this.storage.getItem !== 'function') throw new Error('Armazenamento local indisponível.');
      raw = this.storage.getItem(this.cacheKey);
    } catch {
      // An unread cache may contain the only copy of pending edits. Never
      // replace it later in this instance, even when writes still succeed.
      this.cacheWritable = false;
      this.storageError = 'Não foi possível ler a cópia deste navegador.';
      this._status('error', this.storageError);
      return;
    }
    if (raw === null || raw === undefined) return;
    try {
      const cache = JSON.parse(raw);
      if (!cache || cache.version !== CACHE_VERSION || !Array.isArray(cache.rows) || cache.rows.length > MAX_RECORDS * 2) throw new Error('Cache inválido.');
      const records = normalizeRecords(cache.records, this.normalizeRecord);
      const rows = new Map();
      for (const entry of cache.rows) {
        if (!entry || !isSyncCharacterId(entry.id) || !validRevision(entry.revision) || typeof entry.deleted !== 'boolean' || rows.has(entry.id)) throw new Error('Cache inválido.');
        const base = entry.base === null ? null : this.normalizeRecord(entry.base);
        if ((base && base.id !== entry.id) || (entry.deleted && base) || (entry.revision === 0 && (base || entry.deleted)) || (entry.revision > 0 && !entry.deleted && !base)) throw new Error('Cache inválido.');
        rows.set(entry.id, { id: entry.id, revision: entry.revision, deleted: entry.deleted, base });
      }
      for (const record of records) if (!rows.has(record.id)) rows.set(record.id, { id: record.id, revision: 0, deleted: false, base: null });
      this.records = records;
      this.activeId = typeof cache.activeId === 'string' ? cache.activeId : null;
      this.rows = rows;
    } catch {
      // Preserve the raw value for manual recovery instead of silently erasing it.
      try { this.storage.setItem(`${this.cacheKey}.recovery`, raw); } catch { this.cacheWritable = false; }
      this.storageError = 'A cópia deste navegador está inválida. A versão da nuvem será consultada; os dados anteriores foram mantidos para recuperação.';
      this._status('error', this.storageError);
      this._conflict('cache-recovery', null, this.storageError);
    }
  }

  _pendingIds() {
    const pending = [];
    for (const id of new Set([...this.rows.keys(), ...this.records.map(record => record.id)])) {
      const local = this._record(id), row = this.rows.get(id);
      if (local ? (!row || !row.base || row.deleted || !this.same(local, row.base)) : (row?.base && !row.deleted)) pending.push(id);
    }
    return pending;
  }

  _remember(remote) {
    this.rows.set(remote.id, { id: remote.id, revision: remote.revision, deleted: remote.deleted, base: remote.data ? this.normalizeRecord(remote.data) : null });
  }

  _fork(character, type, message, paths = []) {
    let id;
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = this.makeId();
      if (isSyncCharacterId(candidate) && !this.rows.has(candidate) && !this._record(candidate) && !this.remoteIds.has(candidate)) { id = candidate; break; }
    }
    if (!id) throw new Error('Não foi possível preservar uma cópia da ficha.');
    const suffix = ' (conflito)';
    const name = character.name || 'Sem nome';
    const copy = this.normalizeRecord({ ...character, id, name: name.endsWith(suffix) ? name : `${name.slice(0, 50_000 - suffix.length)}${suffix}` });
    this._setRecord(copy);
    this.rows.set(id, { id, revision: 0, deleted: false, base: null });
    if (this.activeId === character.id) this.activeId = id;
    this._conflict(type, character.id, message, { copyId: id, paths });
    return copy;
  }

  _reconcileRow(remote) {
    const local = this._record(remote.id), known = this.rows.get(remote.id);
    if (remote.deleted) {
      if (local && (!known?.base || known.deleted || !this.same(local, known.base))) {
        this._fork(local, 'remote-deleted', 'A ficha foi excluída em outro dispositivo. Suas alterações foram preservadas em uma cópia com “(conflito)”.');
      }
      this._removeRecord(remote.id);
      this._remember(remote);
      return;
    }
    if (!known?.base || known.deleted) {
      if (local && !this.same(local, remote.data)) this._fork(local, 'id-collision', 'Encontramos outra versão desta ficha. A versão deste dispositivo foi preservada com “(conflito)”.');
      this._setRecord(remote.data);
      this._remember(remote);
      return;
    }
    if (!local) {
      // A local deletion is safe only if the acknowledged data is unchanged.
      if (!this.same(known.base, remote.data)) {
        this._setRecord(remote.data);
        this._conflict('delete-modified', remote.id, 'A ficha que você excluiu recebeu alterações em outro dispositivo e foi restaurada para preservar esses dados.');
      }
      this._remember(remote);
      return;
    }
    const merged = mergeRecord(known.base, local, remote.data, this.normalizeRecord);
    if (merged.conflicts.length) {
      this._fork(merged.record, 'fields', 'Dois dispositivos alteraram o mesmo campo. Suas alterações foram preservadas em uma cópia com “(conflito)”.', merged.conflicts);
      this._setRecord(remote.data);
    } else this._setRecord(merged.record);
    this._remember(remote);
  }

  _reconcile(remotes) {
    this.remoteIds = new Set(remotes.map(row => row.id));
    for (const remote of remotes) {
      const known = this.rows.get(remote.id);
      if (known && remote.revision < known.revision) throw new Error('A nuvem retornou uma revisão anterior da ficha. Tente novamente.');
    }
    for (const remote of remotes) this._reconcileRow(remote);
    for (const [id, known] of [...this.rows]) {
      if (this.remoteIds.has(id) || known.revision === 0) continue;
      const local = this._record(id);
      if (local) this._fork(local, 'missing-remote', 'A ficha anterior não foi encontrada na nuvem. A cópia deste dispositivo foi preservada com “(conflito)”.');
      this._removeRecord(id);
      this.rows.delete(id);
    }
    this._commit();
  }

  _acceptSave(sent, saved) {
    if (saved.id !== sent.id || saved.revision <= sent.revision || saved.deleted !== sent.deleted) throw new Error('Confirmação de salvamento inválida.');
    if (sent.deleted) {
      const current = this._record(sent.id);
      if (current) this._fork(current, 'delete-in-flight', 'A exclusão já tinha sido enviada. A ficha reaberta foi preservada em uma cópia com “(conflito)”.');
      this._removeRecord(sent.id);
      this._remember(saved);
    } else {
      // The request snapshot, rather than the old base, distinguishes keystrokes
      // typed while the request was in flight from genuine concurrent edits.
      this.rows.set(sent.id, { id: sent.id, revision: sent.revision, deleted: false, base: this.normalizeRecord(sent.data) });
      this._reconcileRow(saved);
    }
    this._commit();
  }

  async _pull(generation) {
    const result = await this.adapter.list();
    if (!this._alive(generation)) return false;
    this._reconcile(normalizeRows(result, this.normalizeRecord));
    return true;
  }

  async _push(generation) {
    let casFailed = false;
    for (const id of this._pendingIds()) {
      if (!this._alive(generation)) return { stopped: true, casFailed };
      if (!this._pendingIds().includes(id)) continue;
      const local = this._record(id), known = this.rows.get(id);
      if (local && known?.deleted) {
        this._fork(local, 'remote-deleted', 'Esta ficha já foi excluída na nuvem. As alterações foram preservadas em uma cópia com “(conflito)”.');
        this._removeRecord(id);
        this._commit();
        continue;
      }
      const sent = { id, data: this.normalizeRecord(local || known.base), revision: known?.revision ?? 0, deleted: !local };
      const result = await this.adapter.save(clone(sent));
      if (!this._alive(generation)) return { stopped: true, casFailed };
      if (result === null) casFailed = true;
      else this._acceptSave(sent, normalizeRow(result, this.normalizeRecord));
    }
    return { stopped: false, casFailed };
  }

  async _run(generation) {
    this._status('syncing', 'Sincronizando suas fichas…');
    try {
      if (!this._alive(generation) || !await this._pull(generation)) return this.getSnapshot();
      let refreshedAfterCas = false;
      // Additional rounds flush keystrokes typed during a request. At most one
      // CAS refresh and three push rounds keep contention/network work bounded.
      for (let round = 0; round < 3 && this._alive(generation) && this._pendingIds().length; round++) {
        const result = await this._push(generation);
        if (result.stopped) return this.getSnapshot();
        if (result.casFailed) {
          if (refreshedAfterCas) break;
          refreshedAfterCas = true;
          if (!await this._pull(generation)) return this.getSnapshot();
        }
      }
      if (!this._alive(generation)) return this.getSnapshot();
      if (this.storageError) this._status('error', this._pendingIds().length ? this.storageError : 'Ficha salva online. A cópia deste navegador está indisponível.');
      else if (this._pendingIds().length) this._status('error', 'Ainda há alterações pendentes. A próxima sincronização tentará novamente.');
      else this._status('synced', 'Fichas salvas online.');
    } catch (error) {
      if (this._alive(generation)) {
        this._persist();
        const rejected = error?.status === 401 || error?.status === 403 || error?.code === 'PGRST301';
        this._status(rejected ? 'error' : 'offline', this.storageError
          ? 'Não foi possível sincronizar nem salvar neste navegador. Mantenha a página aberta ou exporte a ficha.'
          : rejected ? 'Sua sessão precisa ser renovada para sincronizar. As alterações continuam salvas neste navegador.'
            : 'Não foi possível acessar a nuvem. As alterações ficam salvas neste navegador e serão enviadas ao reconectar.');
      }
    }
    return this.getSnapshot();
  }
}
