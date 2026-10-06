// Schlanker Promise-Wrapper um IndexedDB.

const DB_NAME = 'gymtracker';
const DB_VERSION = 2; // 2: Körpermaße (measurements)

export const STORES = ['exercises', 'templates', 'workouts', 'meta', 'measurements'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB wird von diesem Browser nicht unterstützt.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('workouts')) {
        const s = db.createObjectStore('workouts', { keyPath: 'id' });
        s.createIndex('startedAt', 'startedAt');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('measurements')) db.createObjectStore('measurements', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Falls eine neuere App-Version in einem anderen Tab die DB aktualisiert.
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank blockiert – bitte andere Tabs der App schließen.'));
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Führt `fn(stores)` in einer Transaktion aus. `stores` ist ein Objekt
 * { name: IDBObjectStore }. Das Promise erfüllt sich erst, wenn die
 * Transaktion vollständig geschrieben wurde.
 */
export async function tx(storeNames, mode, fn) {
  const db = await openDB();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    let result;
    try {
      result = fn(stores);
    } catch (err) {
      t.abort();
      reject(err);
      return;
    }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaktion abgebrochen'));
  });
}

export async function getAll(store) {
  const db = await openDB();
  return reqToPromise(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, key) {
  const db = await openDB();
  return reqToPromise(db.transaction(store).objectStore(store).get(key));
}

export function put(store, value) {
  return tx(store, 'readwrite', (s) => { s[store].put(value); });
}

export function putMany(store, values) {
  return tx(store, 'readwrite', (s) => { for (const v of values) s[store].put(v); });
}

export function del(store, key) {
  return tx(store, 'readwrite', (s) => { s[store].delete(key); });
}
