/**
 * IndexedDB media cache for chat attachments.
 * Stores blobs of private storage objects so repeat views are instant + offline-safe.
 */
const DB_NAME = 'averia-chat-media';
const STORE = 'blobs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCached(key: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      tx.onsuccess = () => resolve((tx.result as Blob) ?? null);
      tx.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function putCached(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
  } catch { /* cache is best-effort */ }
}
