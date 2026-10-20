import './vendor/supabase.js';
import { isSyncCharacterId } from './sync-state.js';

const PAGE_SIZE = 500;
const MAX_CHARACTERS = 10000;
const COLUMNS = 'id,data,revision,deleted_at,updated_at';
const REQUEST_TIMEOUT_MS = 15000;

function requestDeadline(operation, timeoutMs) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const error = new Error('A conexão demorou demais. Suas alterações continuam guardadas neste dispositivo.');
      error.name = 'TimeoutError';
      error.code = 'NETWORK_TIMEOUT';
      controller.abort(error);
      reject(error);
    }, timeoutMs);
    // The SDK may wait for a session lock/refresh before reaching global.fetch.
    // Keep that wait inside the deadline and abort the query if it resumes late.
    Promise.resolve().then(() => operation(controller.signal)).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function timedFetch(fetchImpl, timeoutMs) {
  return (input, init = {}) => new Promise((resolve, reject) => {
    const controller = new AbortController();
    const outerSignal = init.signal || (typeof Request !== 'undefined' && input instanceof Request ? input.signal : null);
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outerSignal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => {
      const error = outerSignal.reason || new DOMException('Requisição cancelada.', 'AbortError');
      controller.abort(error);
      finish(reject, error);
    };
    if (outerSignal?.aborted) { onAbort(); return; }
    outerSignal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      const error = new Error('A conexão demorou demais. Suas alterações continuam guardadas neste dispositivo.');
      error.name = 'TimeoutError';
      error.code = 'NETWORK_TIMEOUT';
      controller.abort(error);
      finish(reject, error);
    }, timeoutMs);
    Promise.resolve().then(async () => {
      const response = await fetchImpl(input, { ...init, signal: controller.signal });
      // This app uses JSON Auth/REST responses. Read the body within the same
      // deadline; a server sending headers then stalling must time out as well.
      const body = response.body === null ? null : await response.arrayBuffer();
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    }).then(response => finish(resolve, response), error => finish(reject, error));
  });
}

function isPublicKey(key) {
  if (typeof key !== 'string') return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  // Legacy anon JWTs are public too; reject service-role JWTs and secret keys.
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(encoded)).role === 'anon';
  } catch {
    return false;
  }
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Configuração de sincronização ausente.');
  let url;
  try { url = new URL(config.url); } catch { throw new Error('URL de sincronização inválida.'); }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(localHost && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new Error('URL de sincronização inválida.');
  }
  if (!isPublicKey(config.publishableKey)) throw new Error('A sincronização exige uma chave pública.');
  const table = config.table || 'trespasser_characters';
  const rpc = config.rpc || 'trespasser_save_character';
  if (!/^trespasser_[a-z0-9_]+$/.test(table) || !/^trespasser_[a-z0-9_]+$/.test(rpc)) {
    throw new Error('Tabela ou operação de sincronização inválida.');
  }
  return { url: url.href.replace(/\/$/, ''), key: config.publishableKey, table, rpc };
}

/** Public browser client. factory is injectable so transport tests need no network. */
export function createCloudClient(config, {
  createClient = globalThis.supabase?.createClient,
  fetch: fetchImpl = globalThis.fetch,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const { url, key, table, rpc } = validateConfig(config);
  if (typeof createClient !== 'function') throw new Error('Não foi possível carregar a sincronização.');
  if (typeof fetchImpl !== 'function' || !Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error('Configuração de conexão inválida.');
  }
  const client = createClient(url, key, {
    global: { fetch: timedFetch(fetchImpl, requestTimeoutMs) },
    auth: {
      storageKey: 'trespasser.auth.v1',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
  });

  function makeAdapter(userId = null) {
    async function request(build) {
      if (userId === null) return build(null, null);
      return requestDeadline(async signal => {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const session = data?.session;
        if (session?.user?.id !== userId || typeof session.access_token !== 'string' || !session.access_token) {
          const changed = new Error('A conta conectada mudou. Entre novamente para sincronizar.');
          changed.status = 401;
          changed.code = 'AUTH_ACCOUNT_CHANGED';
          throw changed;
        }
        if (signal.aborted) throw signal.reason;
        // fetchWithAuth resolves its own session lazily. An explicit header pins
        // this operation to the checked account even if another tab signs in.
        return build(`Bearer ${session.access_token}`, signal);
      }, requestTimeoutMs);
    }

    function bind(query, authorization, signal) {
      if (authorization) return query.setHeader('Authorization', authorization).abortSignal(signal);
      return query;
    }

    return {
      async list() {
        const rows = [];
        // One extra page distinguishes exactly 10,000 rows from an incomplete list.
        for (let from = 0; from <= MAX_CHARACTERS; from += PAGE_SIZE) {
          const { data, error } = await request((authorization, signal) => bind(client.from(table).select(COLUMNS)
            .order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1), authorization, signal));
          if (error) throw error;
          if (!Array.isArray(data)) throw new Error('Resposta de sincronização inválida.');
          if (rows.length + data.length > MAX_CHARACTERS) {
            throw new Error('A conta ultrapassou o limite de 10.000 fichas. A lista completa não foi carregada.');
          }
          rows.push(...data);
          if (data.length < PAGE_SIZE) return rows;
        }
        throw new Error('Não foi possível carregar a lista completa de fichas.');
      },

      async save({ id, data, revision, deleted = false }) {
        if (!isSyncCharacterId(id) || !data || typeof data !== 'object' || Array.isArray(data)
          || data.id !== id || !Number.isSafeInteger(revision) || revision < 0 || typeof deleted !== 'boolean') {
          throw new Error('Dados de sincronização inválidos.');
        }
        const { data: saved, error } = await request((authorization, signal) => bind(client.rpc(rpc, {
          p_id: id,
          p_data: data,
          p_expected_revision: revision,
          p_deleted: deleted,
        }), authorization, signal));
        if (error) throw error;
        if (!Array.isArray(saved) || saved.length > 1) throw new Error('Resposta de salvamento inválida.');
        return saved[0] ?? null;
      },
    };
  }

  const adapter = {
    ...makeAdapter(),
    forUser(userId) {
      if (typeof userId !== 'string' || !userId.trim()) throw new Error('Conta de sincronização inválida.');
      return makeAdapter(userId);
    },
  };

  return { auth: client.auth, adapter, client };
}
