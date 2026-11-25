import { describe, it, expect, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createLibraryStore, LIBRARY_DATABASE } from './library-store.js';
import { toMeta } from './payloads-core.js';
import { createMetadataSearchEntry } from './catalog.js';

describe('persistent source library', () => {
  it('imports relationships with a source and overwrites them independently of charts', async () => {
    const indexedDB = new IDBFactory();
    const store = createLibraryStore(indexedDB);
    const profiles = [{ slug: 'artist', name: 'Artist', ratings: { jev: { festa: 3 } }, related: [] }];
    await store.put({ root: 'a', charts: [{ id: 'song', text: 'C' }], artistRelations: profiles });
    await store.put({ root: 'b', charts: [] });
    const reopened = createLibraryStore(indexedDB);
    expect(await reopened.hasArtistRelations('artist')).toBe(true);
    expect(await reopened.getArtistRelations('artist')).toEqual(profiles[0]);
    expect(await reopened.listArtistSummaries()).toEqual([{ slug: 'artist', name: 'Artist', ratings: { jev: { festa: 3 } } }]);
    expect((await reopened.list())[0]).not.toHaveProperty('artistRelations');
    await reopened.putArtistRelations([{ slug: 'other', name: 'Other', related: [] }]);
    expect(await store.hasArtistRelations('artist')).toBe(false);
    expect((await store.listArtistSummaries()).map(({ slug }) => slug)).toEqual(['other']);
    expect(await store.getChartsByIds(['song'])).toEqual([{ id: 'song', text: 'C' }]);
    await reopened.clear();
    expect(await store.hasArtistRelations('other')).toBe(false);
    expect(await store.listArtistSummaries()).toEqual([]);
  });

  it.each([7, 8])('includes track ratings from profiles already stored in version %i', async (version) => {
    const indexedDB = new IDBFactory();
    const trackRatings = { microsoft: { festa: 3 } };
    const profile = { slug: 'artist', name: 'Artist', ratings: { jev: { festa: 3 } },
      songs: [{ title: 'Song', ratings: trackRatings }], related: [] };
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(LIBRARY_DATABASE, version);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ['sources', 'chunks', 'search', 'locations']) db.createObjectStore(name);
        db.createObjectStore('artistRelations', { keyPath: 'slug' }).put(profile);
        if (version === 8) {
          db.createObjectStore('artistDirectory', { keyPath: 'slug' })
            .put({ slug: 'artist', name: 'Artist', ratings: profile.ratings });
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    const migrated = createLibraryStore(indexedDB);
    expect(await migrated.getArtistRelations('artist')).toEqual(profile);
    expect(await migrated.listArtistSummaries()).toEqual([
      { slug: 'artist', name: 'Artist', ratings: profile.ratings, trackRatings: [trackRatings] },
    ]);
  });

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

  it.each([3, 4, 5])('migrates version %i blocks and indexes existing statistics', async (version) => {
    const indexedDB = new IDBFactory();
    const chart = { id: 'old', title: 'A Noite', artist: { name: 'Tiê' }, text: 'Original lyrics',
      statistics: { allTimeViews: 42, listAppearances: 3 } };
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(LIBRARY_DATABASE, version);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('sources', { keyPath: 'root' });
        db.createObjectStore('chunks', { keyPath: ['root', 'index'] }).createIndex('root', 'root');
        if (version >= 4) db.createObjectStore('search', { keyPath: ['root', 'index'] }).createIndex('root', 'root');
        if (version === 5) {
          const locations = db.createObjectStore('locations', { keyPath: ['root', 'index'] });
          locations.createIndex('root', 'root');
          locations.createIndex('ids', 'ids', { multiEntry: true });
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
        if (version >= 4) tx.objectStore('search').put({ root: 'old', index: 0, entries: [createMetadataSearchEntry({ ...chart, statistics: undefined })] });
        if (version === 5) tx.objectStore('locations').put({ root: 'old', index: 0, ids: [chart.id] });
        tx.objectStore('sources').put({ root: 'old', chartCount: 1, chunkCount: 1 });
        tx.objectStore('chunks').put({ root: 'old', index: 0, charts: [chart] });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
    const store = createLibraryStore(indexedDB);
    expect((await store.searchEntries()).map(e => e.title)).toEqual(['A Noite']);
    expect((await store.searchEntries())[0].statistics).toEqual(chart.statistics);
    expect(await store.getChartsByIds(['old'])).toEqual([chart]);
    await store.remove('old');
    expect(await store.searchEntries()).toEqual([]);
  });

  it('backfills version relationships and keeps them consistent across source replacements and removals', async () => {
    const indexedDB = new IDBFactory();
    const root = 'archive-a';
    const work = 'cifraclub:artist/song';
    const sourceUrl = 'https://www.cifraclub.com.br/artist/song/';
    const principal = { id: 'principal', sourceId: 'artist-portal-scraper', sourceUrl, text: 'C' };
    const simplified = { ...principal, id: 'simple', sourceUrl: sourceUrl + 'simplificada.html', versionLabel: 'Simplificada' };
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(LIBRARY_DATABASE, 9);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('sources', { keyPath: 'root' }).put({ root, chartCount: 1, chunkCount: 1 });
        const chunks = db.createObjectStore('chunks', { keyPath: ['root', 'index'] });
        chunks.createIndex('root', 'root');
        chunks.put({ root, index: 0, charts: [principal] });
        db.createObjectStore('search', { keyPath: ['root', 'index'] }).createIndex('root', 'root');
        const locations = db.createObjectStore('locations', { keyPath: ['root', 'index'] });
        locations.createIndex('root', 'root');
        locations.createIndex('ids', 'ids', { multiEntry: true });
        locations.put({ root, index: 0, ids: [principal.id] });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    const store = createLibraryStore(indexedDB);
    await store.put({ root: 'archive-b', charts: [simplified] });
    expect(await store.getChartVersions(work)).toMatchObject([
      { id: 'principal', principal: true, label: 'Principal' },
      { id: 'simple', principal: false, label: 'Simplificada' },
    ]);
    expect(await store.getChartsByIds(['principal', 'simple'])).toEqual([principal, simplified]);
    expect((await store.searchEntries()).map(e => e.version.work)).toEqual([work, work]);
    await store.put({ root: 'archive-b', charts: [] });
    expect(await store.getChartVersions(work)).toMatchObject([{ id: 'principal' }]);
    await store.remove(root);
    expect(await store.getChartVersions(work)).toEqual([]);
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
    const root = 'https://example.test/old/';
    const chart = {
      id: 'old', text: 'Dm', sourceUrl: root,
      scraperMetadata: { page: { canonicalUrl: '/canonical/', imageUrl: '/cover.jpg' } },
    };
    const original = { root, charts: [chart] };
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
    const migrated = {
      id: 'old', text: 'Dm', sourceUrl: root, visits: 0,
      canonicalUrl: 'https://example.test/canonical/', imageUrl: 'https://example.test/cover.jpg',
    };
    expect(await store.list()).toEqual([{ root, charts: [migrated] }]);
    expect(await store.getChartsByIds(['old'])).toEqual([migrated]);
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
