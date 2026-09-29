/**
 * Minimal promise wrapper around IndexedDB (the browser's database) for the offline outbox.
 * Stores:
 *   ops    operations recorded on this device (key = operation key), index byUser
 *   blobs  proof files attached to operations recorded offline (uploaded when sending)
 *   meta   small values (who used this device last …)
 * Falls back to memory when IndexedDB is not available (very old or locked-down browsers): the
 * app still works online and while the page stays open.
 */
const DB_NAME = "springer-finance";
const DB_VERSION = 1;
export const STORES = { ops: "ops", blobs: "blobs", meta: "meta" };

let dbPromise = null;

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.ops)) {
        const ops = db.createObjectStore(STORES.ops, { keyPath: "key" });
        ops.createIndex("byUser", "userId");
      }
      if (!db.objectStoreNames.contains(STORES.blobs)) db.createObjectStore(STORES.blobs, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta, { keyPath: "k" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrades the database: let it (this tab reopens on next use).
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("The offline database is blocked by another tab."));
  });
}

/** In-memory stand-in with the same interface. */
function memoryBackend() {
  const data = { [STORES.ops]: new Map(), [STORES.blobs]: new Map(), [STORES.meta]: new Map() };
  const keyOf = (store, v) => (store === STORES.ops ? v.key : store === STORES.meta ? v.k : v.id);
  return {
    memory: true,
    get: async (store, key) => data[store].get(key),
    put: async (store, value) => void data[store].set(keyOf(store, value), structuredClone(value)),
    del: async (store, key) => void data[store].delete(key),
    all: async (store) => [...data[store].values()].map((v) => structuredClone(v)),
    byIndex: async (store, index, value) => [...data[store].values()].filter((v) => v[index === "byUser" ? "userId" : index] === value).map((v) => structuredClone(v)),
    clear: async (store) => void data[store].clear(),
  };
}

function idbBackend(getDb) {
  const run = async (store, mode, fn) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      let result;
      Promise.resolve(fn(tx.objectStore(store))).then((r) => {
        result = r;
      }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Offline database write aborted."));
    });
  };
  return {
    memory: false,
    get: (store, key) => run(store, "readonly", (s) => promisify(s.get(key))),
    put: (store, value) => run(store, "readwrite", (s) => promisify(s.put(value)).then(() => undefined)),
    del: (store, key) => run(store, "readwrite", (s) => promisify(s.delete(key)).then(() => undefined)),
    all: (store) => run(store, "readonly", (s) => promisify(s.getAll())),
    byIndex: (store, index, value) => run(store, "readonly", (s) => promisify(s.index(index).getAll(value))),
    clear: (store) => run(store, "readwrite", (s) => promisify(s.clear()).then(() => undefined)),
  };
}

let backend = null;

/** The storage backend (IndexedDB, or memory when unavailable). */
export function storage() {
  if (backend) return backend;
  const available = typeof indexedDB !== "undefined";
  if (!available) {
    backend = memoryBackend();
    return backend;
  }
  const getDb = () => {
    if (!dbPromise) dbPromise = openIndexedDb();
    return dbPromise;
  };
  const idb = idbBackend(getDb);
  // If IndexedDB cannot be opened (private mode in some browsers), switch to memory once.
  let fallback = null;
  const guard =
    (name) =>
    async (...args) => {
      if (fallback) return fallback[name](...args);
      try {
        return await idb[name](...args);
      } catch (error) {
        if (!fallback && /blocked|SecurityError|InvalidStateError|QuotaExceeded|not allowed/i.test(`${error?.name} ${error?.message}`)) {
          fallback = memoryBackend();
          return fallback[name](...args);
        }
        throw error;
      }
    };
  backend = {
    get memory() {
      return Boolean(fallback);
    },
    get: guard("get"),
    put: guard("put"),
    del: guard("del"),
    all: guard("all"),
    byIndex: guard("byIndex"),
    clear: guard("clear"),
  };
  return backend;
}

/** Test hook: use a fresh in-memory backend. */
export function memoryStorageForTests() {
  backend = memoryBackend();
  return backend;
}
