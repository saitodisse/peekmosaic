import { describe, it, expect, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createLibraryStore, LIBRARY_DATABASE } from './library-store.js';
import { toMeta } from './payloads-core.js';
import { createMetadataSearchEntry } from './catalog.js';

describe('persistent source library', () => {
  it('reads only the blocks containing requested charts, with ordered results and no full scan', async () => {
    const indexedDB = new IDBFactory();
    const store = createLibraryStore(indexedDB);
    await store.put({ root: 'a', charts: [{ id: 'one', text: 'C' }] });
    await store.put({ root: 'b', charts: [{ id: 'two', text: 'G' }, { id: 'three', text: 'Am' }] });
    const reopened = createLibraryStore(indexedDB);
    const cursor = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
    const get = vi.spyOn(IDBObjectStore.prototype, 'get');
    try {
      expect(await reopened.getChartsByIds(['three', 'missing', 'two', 'three'])).toEqual([
        { id: 'three', text: 'Am' }, { id: 'two', text: 'G' },
      ]);
      expect(cursor).not.toHaveBeenCalled();
      expect(get).toHaveBeenCalledExactlyOnceWith(['b', 0]);
    } finally { cursor.mockRestore(); get.mockRestore(); }
    await store.put({ root: 'b', charts: [{ id: 'new', text: 'Dm' }] });
    expect(await reopened.getChartsByIds(['two', 'three', 'new'])).toEqual([{ id: 'new', text: 'Dm' }]);
    await store.remove('b');
    expect(await reopened.getChartsByIds(['new', 'one'])).toEqual([{ id: 'one', text: 'C' }]);
    await store.clear();
    expect(await reopened.getChartsByIds(['one'])).toEqual([]);
  });

  it('persists list metadata across sessions and updates it atomically with the source', async () => {
    const indexedDB = new IDBFactory();
    const store = createLibraryStore(indexedDB);
    const chart = {
      id: 'one', title: 'A Noite', artist: { name: 'Tiê', image: 'artists/tie.png' },
      album: { title: 'Esmeraldas', firstReleasedYear: 2014 }, genre: { name: 'MPB' },
      key: 'C', capo: 2, tempo: 90, text: 'Private lyrics', scraperMetadata: { unused: true },
    };
    const root = 'https://example.test/cache/';
    await store.put({ root, charts: [chart] });
    const reopened = createLibraryStore(indexedDB);
    const [entry] = await reopened.searchEntries();
    expect(entry.artist).toBe('Tiê');
    expect(entry.genre).toBe('MPB');
    expect(entry.chart).not.toHaveProperty('text');
    expect(entry.chart).not.toHaveProperty('scraperMetadata');
    expect(toMeta(entry.chart, root)).toEqual(toMeta(chart, root));
    await expect(store.put({ root, charts: [{ ...chart, title: 'Failed' }], invalid: () => {} })).rejects.toThrow();
    expect((await reopened.searchEntries())[0].title).toBe('A Noite');
    expect(await reopened.getChartsByIds(['one'])).toEqual([chart]);
    await store.put({ root, charts: [{ ...chart, id: 'two', title: 'Amuleto' }] });
    expect((await reopened.searchEntries()).map(e => e.id)).toEqual(['two']);
    await store.remove(root);
    expect(await reopened.searchEntries()).toEqual([]);
    await store.put({ root, charts: [chart] });
    await store.clear();
    expect(await reopened.searchEntries()).toEqual([]);
  });

  it.each([3, 4])('migrates version %i blocks without losing content or indexed lookup', async (version) => {
    const indexedDB = new IDBFactory();
    const chart = { id: 'old', title: 'A Noite', artist: { name: 'Tiê' }, text: 'Original lyrics' };
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(LIBRARY_DATABASE, version);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('sources', { keyPath: 'root' });
        db.createObjectStore('chunks', { keyPath: ['root', 'index'] }).createIndex('root', 'root');
        if (version === 4) db.createObjectStore('search', { keyPath: ['root', 'index'] }).createIndex('root', 'root');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(version === 4 ? ['sources', 'chunks', 'search'] : ['sources', 'chunks'], 'readwrite');
        if (version === 4) tx.objectStore('search').put({ root: 'old', index: 0, entries: [createMetadataSearchEntry(chart)] });
        tx.objectStore('sources').put({ root: 'old', chartCount: 1, chunkCount: 1 });
        tx.objectStore('chunks').put({ root: 'old', index: 0, charts: [chart] });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
    const store = createLibraryStore(indexedDB);
    expect((await store.searchEntries()).map(e => e.title)).toEqual(['A Noite']);
    expect(await store.getChartsByIds(['old'])).toEqual([chart]);
    await store.remove('old');
    expect(await store.searchEntries()).toEqual([]);
  });

  it('round trips a source spanning multiple blocks, replaces it and deletes all its charts', async () => {
    const store = createLibraryStore(new IDBFactory());
    const snapshot = { root: 'https://example.test/downloads.tar.zst', charts: [
      { id: 'one', text: 'C'.repeat(3 * 1024 * 1024) },
      { id: 'two', text: 'G'.repeat(3 * 1024 * 1024) },
    ] };
    await store.put(snapshot);
    expect(await store.list()).toEqual([snapshot]);
    const replacement = { ...snapshot, charts: [{ id: 'new', text: 'Am' }] };
    await store.put(replacement);
    expect(await store.list()).toEqual([replacement]);
    expect(await store.getChartsByIds(['one', 'two', 'new'])).toEqual(replacement.charts);
    await store.remove(snapshot.root);
    expect(await store.list()).toEqual([]);
  });

  it('retains snapshots saved before block storage was introduced', async () => {
    const indexedDB = new IDBFactory();
    const original = { root: 'https://example.test/old/', charts: [{ id: 'old', text: 'Dm' }] };
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(LIBRARY_DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sources', { keyPath: 'root' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction('sources', 'readwrite');
        transaction.objectStore('sources').put(original);
        transaction.oncomplete = () => { request.result.close(); resolve(); };
      };
    });
    const store = createLibraryStore(indexedDB);
    expect(await store.list()).toEqual([original]);
    expect(await store.getChartsByIds(['old'])).toEqual(original.charts);
    expect((await store.searchEntries()).map(e => e.id)).toEqual(['old']);
    await store.put({ root: original.root, charts: [] });
    expect(await store.list()).toEqual([{ root: original.root, charts: [] }]);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('preserves the previous snapshot when a replacement cannot be serialized', async () => {
    const store = createLibraryStore(new IDBFactory());
    const original = { root: 'https://example.test/', charts: [{ text: 'Em' }] };
    await store.put(original);
    await expect(store.put({ ...original, invalid: () => {} })).rejects.toThrow();
    expect(await store.list()).toEqual([original]);
  });
});
