const NAME = "ferry";
const VERSION = 1;
export type Store = "keys" | "files";

let opening: Promise<IDBDatabase> | null = null;

function database() {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}

function run<T>(
  store: Store,
  mode: IDBTransactionMode,
  work: (objects: IDBObjectStore) => IDBRequest<T>,
) {
  return database().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export const idb = {
  get: <T>(store: Store, key: string) =>
    run<T | undefined>(store, "readonly", (objects) => objects.get(key)),
  put: (store: Store, key: string, value: unknown) =>
    run(store, "readwrite", (objects) => objects.put(value, key)),
  delete: (store: Store, key: string) =>
    run(store, "readwrite", (objects) => objects.delete(key)),
  all: <T>(store: Store) =>
    run<T[]>(store, "readonly", (objects) => objects.getAll()),
};
