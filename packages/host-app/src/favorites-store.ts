const DATABASE = 'addons:state:host:favorites:v1';
const STORE = 'favorites';

export interface FavoriteChart {
  url: string;
  title: string;
  createdAt: number;
}

function openFavorites(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'url' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function accessFavorites<T>(
  mode: IDBTransactionMode,
  access: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openFavorites();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = access(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? request.error);
    });
  } finally {
    database.close();
  }
}

export async function isFavorite(url: string): Promise<boolean> {
  return (await accessFavorites('readonly', (store) => store.getKey(url))) !== undefined;
}

export async function listFavorites(): Promise<FavoriteChart[]> {
  const favorites = await accessFavorites<FavoriteChart[]>('readonly', (store) => store.getAll());
  return favorites.sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title, 'pt-BR'));
}

export async function setFavorite(url: string, title: string, favorite: boolean): Promise<void> {
  if (favorite) {
    await accessFavorites('readwrite', (store) => store.put({ url, title, createdAt: Date.now() }));
  } else {
    await accessFavorites('readwrite', (store) => store.delete(url));
  }
}
