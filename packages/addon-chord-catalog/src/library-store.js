import { createMetadataSearchEntry } from './catalog.js';

export const LIBRARY_DATABASE = 'addons:state:chord-catalog:v1';
const LIBRARY_DATABASE_VERSION = 5;

function selectedGenre(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const genre = {};
  if (Number.isSafeInteger(value.id)) genre.id = value.id;
  if (typeof value.name === 'string' && value.name.trim()) genre.name = value.name.trim();
  if (typeof value.slug === 'string' && value.slug.trim()) genre.slug = value.slug.trim();
  return Object.keys(genre).length ? genre : undefined;
}

function selectedStatistics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const statistics = {};
  if (Number.isSafeInteger(value.allTimeViews)) statistics.allTimeViews = value.allTimeViews;
  if (Number.isSafeInteger(value.listAppearances)) statistics.listAppearances = value.listAppearances;
  return Object.keys(statistics).length ? statistics : undefined;
}

function compactLegacyChart(chart) {
  const source = chart?.scraperMetadata;
  if (!source) return false;
  delete chart.scraperMetadata;
  const genre = selectedGenre(chart.genre ?? source.artist?.genre);
  const statistics = selectedStatistics(chart.statistics ?? source.chart?.statistics);
  delete chart.chords;
  if (genre) {
    chart.genre = genre;
    chart.tags = genre.name ? [genre.name] : [];
  } else {
    delete chart.genre;
  }
  if (statistics) chart.statistics = statistics;
  else delete chart.statistics;
  chart.visits = statistics?.allTimeViews ?? chart.visits ?? 0;
  return true;
}

function migrateCharts(store) {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const record = cursor.value;
    if (Array.isArray(record.charts)) {
      let changed = false;
      for (const chart of record.charts) if (compactLegacyChart(chart)) changed = true;
      if (changed) cursor.update(record);
    }
    cursor.continue();
  };
}

/** Replaces complete legacy source metadata with the fields still used by the app. */
function migrateUnusedScraperMetadata(transaction, oldVersion) {
  if (oldVersion >= 3) return;
  migrateCharts(transaction.objectStore('sources'));
  migrateCharts(transaction.objectStore('chunks'));
}

function chartLocations(root, index, charts) {
  return { root, index, ids: charts.map(chart => chart.id).filter(id => typeof id === 'string') };
}

/** One transaction replaces a source; small records avoid Chromium's per-value limit. */
export function createLibraryStore(indexedDB = globalThis.indexedDB) {
  let database;
  const open = () => database ??= new Promise((resolve, reject) => {
    if (!indexedDB) { reject(new Error('Persistent storage is unavailable in this browser.')); return; }
    const request = indexedDB.open(LIBRARY_DATABASE, LIBRARY_DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      if (!db.objectStoreNames.contains('sources')) db.createObjectStore('sources', { keyPath: 'root' });
      if (!db.objectStoreNames.contains('chunks')) {
        const chunks = db.createObjectStore('chunks', { keyPath: ['root', 'index'] });
        chunks.createIndex('root', 'root');
      } else {
        const chunks = transaction.objectStore('chunks');
        if (!chunks.indexNames.contains('root')) chunks.createIndex('root', 'root');
      }
      migrateUnusedScraperMetadata(transaction, event.oldVersion);
      if (!db.objectStoreNames.contains('search')) {
        const search = db.createObjectStore('search', { keyPath: ['root', 'index'] });
        search.createIndex('root', 'root');
        for (const name of ['sources', 'chunks']) {
          const cursorRequest = transaction.objectStore(name).openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const record = cursor.value;
            if (Array.isArray(record.charts)) {
              search.put({
                root: record.root, index: name === 'sources' ? -1 : record.index,
                entries: record.charts.map(createMetadataSearchEntry),
              });
            }
            cursor.continue();
          };
        }
      }
      if (!db.objectStoreNames.contains('locations')) {
        const locations = db.createObjectStore('locations', { keyPath: ['root', 'index'] });
        locations.createIndex('ids', 'ids', { multiEntry: true });
        locations.createIndex('root', 'root');
        for (const name of ['sources', 'chunks']) {
          const cursorRequest = transaction.objectStore(name).openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const record = cursor.value;
            if (Array.isArray(record.charts)) {
              locations.put(chartLocations(record.root, name === 'sources' ? -1 : record.index, record.charts));
            }
            cursor.continue();
          };
        }
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other catalogue tabs to open persistent storage.'));
  });

  async function execute(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sources', 'chunks', 'search', 'locations'], mode);
      let result;
      transaction.oncomplete = () => { try { resolve(result?.()); } catch (error) { reject(error); } };
      transaction.onerror = () => reject(transaction.error ?? new Error('Library transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Library write aborted.'));
      try { result = operation(transaction.objectStore('sources'), transaction.objectStore('chunks'), transaction.objectStore('search'), transaction.objectStore('locations')); }
      catch (error) { transaction.abort(); reject(error); }
    });
  }

  function replace(root, snapshot) {
    const parts = [];
    let charts = [];
    let size = 0;
    for (const chart of snapshot?.charts ?? []) {
      const bytes = JSON.stringify(chart).length * 2;
      if (charts.length && size + bytes > 8 * 1024 * 1024) { parts.push(charts); charts = []; size = 0; }
      charts.push(chart);
      size += bytes;
    }
    if (charts.length) parts.push(charts);
    return execute('readwrite', (sources, chunks, search, locations) => {
      const oldLocations = locations.index('root').openKeyCursor(root);
      oldLocations.onsuccess = () => {
        if (oldLocations.result) { locations.delete(oldLocations.result.primaryKey); oldLocations.result.continue(); return; }
        parts.forEach((charts, index) => locations.put(chartLocations(root, index, charts)));
      };
      const cached = search.index('root').openKeyCursor(root);
      cached.onsuccess = () => {
        if (cached.result) { search.delete(cached.result.primaryKey); cached.result.continue(); return; }
        parts.forEach((charts, index) => search.put({ root, index, entries: charts.map(createMetadataSearchEntry) }));
      };
      const cursor = chunks.index('root').openKeyCursor(root);
      cursor.onsuccess = () => {
        if (cursor.result) { chunks.delete(cursor.result.primaryKey); cursor.result.continue(); return; }
        if (snapshot) {
          const { charts: ignored, ...metadata } = snapshot;
          sources.put({ ...metadata, chunkCount: parts.length, chartCount: snapshot.charts.length });
          parts.forEach((charts, index) => chunks.put({ root, index, charts }));
        } else sources.delete(root);
      };
    });
  }

  function searchEntries() {
    return execute('readonly', (_sources, _chunks, search) => {
      const entries = [];
      const request = search.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        entries.push(...cursor.value.entries);
        cursor.continue();
      };
      return () => entries;
    });
  }

  function getChartsByIds(ids) {
    const orderedIds = [...new Set(ids)];
    if (orderedIds.length === 0) return Promise.resolve([]);
    const wanted = new Set(orderedIds);
    return execute('readonly', (sources, chunks, _search, locations) => {
      const blocks = new Map();
      for (const id of orderedIds) {
        const lookup = locations.index('ids').getAll(id);
        lookup.onsuccess = () => {
          for (const location of lookup.result) {
            const key = JSON.stringify([location.root, location.index]);
            if (blocks.has(key)) continue;
            blocks.set(key, { ...location, charts: [] });
            const request = location.index === -1
              ? sources.get(location.root)
              : chunks.get([location.root, location.index]);
            request.onsuccess = () => { blocks.get(key).charts = request.result?.charts ?? []; };
          }
        };
      }
      return () => {
        const found = new Map();
        // Preserve the previous precedence: ordered blocks, then legacy sources.
        const ordered = [...blocks.values()].sort((a, b) =>
          Number(a.index === -1) - Number(b.index === -1)
          || (a.root < b.root ? -1 : a.root > b.root ? 1 : 0)
          || a.index - b.index);
        for (const block of ordered) {
          for (const chart of block.charts) if (wanted.has(chart.id)) found.set(chart.id, chart);
        }
        return orderedIds.flatMap(id => found.has(id) ? [found.get(id)] : []);
      };
    });
  }

  function summaries() {
    return execute('readonly', (sources, chunks) => {
      const records = new Map();
      const chunkCounts = new Map();
      const sourceCursor = sources.openCursor();
      sourceCursor.onsuccess = () => {
        const cursor = sourceCursor.result;
        if (!cursor) return;
        const { charts: sourceCharts, ...source } = cursor.value;
        records.set(source.root, {
          root: source.root,
          name: source.name,
          importedAt: source.importedAt,
          count: Number.isSafeInteger(source.chartCount) ? source.chartCount : sourceCharts?.length ?? 0,
          needsChunkCount: !Number.isSafeInteger(source.chartCount) && source.chunkCount !== undefined,
        });
        cursor.continue();
      };
      const chunkCursor = chunks.openCursor();
      chunkCursor.onsuccess = () => {
        const cursor = chunkCursor.result;
        if (!cursor) return;
        const root = cursor.value.root;
        chunkCounts.set(root, (chunkCounts.get(root) ?? 0) + (cursor.value.charts?.length ?? 0));
        cursor.continue();
      };
      return () => [...records.values()].map(({ needsChunkCount, ...summary }) => ({
        ...summary,
        ...(needsChunkCount ? { count: chunkCounts.get(summary.root) ?? 0 } : {}),
      }));
    });
  }

  function list() {
    return execute('readonly', (sources, chunks) => {
      const records = sources.getAll();
      const parts = chunks.getAll();
      return () => {
        const grouped = new Map();
        for (const part of parts.result) {
          if (!grouped.has(part.root)) grouped.set(part.root, []);
          grouped.get(part.root)[part.index] = part.charts;
        }
        return records.result.map((source) => {
          if (source.chunkCount === undefined) return source;
          const { chunkCount, chartCount: _chartCount, ...metadata } = source;
          const blocks = grouped.get(source.root) ?? [];
          if (blocks.length !== chunkCount || Array.from({ length: chunkCount }, (_, index) => blocks[index]).some((block) => !block)) throw new Error('Incomplete stored chart library.');
          return { ...metadata, charts: blocks.flat() };
        });
      };
    });
  }

  return {
    list,
    summaries,
    searchEntries,
    getChartsByIds,
    put: (snapshot) => replace(snapshot.root, snapshot),
    remove: (root) => replace(root),
    clear: () => execute('readwrite', (sources, chunks, search, locations) => { sources.clear(); chunks.clear(); search.clear(); locations.clear(); }),
  };
}
