import { manifest } from './manifest.js';
import { ARTIST_EXPORT_ACTIONS, artistExport } from './artist-export.js';
import { ARTIST_RELATIONS_FILE, MAX_ARTIST_RELATIONS_BYTES, parseArtistRelations } from './artist-relations.js';
import { CATALOGS } from './data/catalogs.js';
import { listCatalog, maximumChartViews, searchMetadataIndex, paginate } from './catalog.js';
import { toMeta, toContentJson, toTextOption } from './payloads-core.js';
import { createLibraryStore } from './library-store.js';
import { MAX_ARCHIVE_BYTES } from './zip-source.js';
import { sha256, sourceLines, updateSources, importArchive } from './source-import.js';

export { manifest };
const SETTINGS_KEY = 'addons:state:chord-catalog:settings:v1';
const SEARCH_ORDER_KEY = 'addons:state:chord-catalog:search-order:v1';
const SEARCH_ORDER_OPTIONS = [
  { id: 'allTimeViews', label: 'Most viewed' },
  { id: 'listAppearances', label: 'Most list appearances' },
];
const LOCAL_IMPORT = 'Local archives';
const ARTIST_RELATIONS = 'Artist relationships';
const REMOTE_IMPORT = 'Import from address';
const LIBRARY = 'Library';
const FIELDS = [
  { id: 'archives', label: 'Archive files (.zip, .tar.zst, .tzst)', type: 'file', accept: '.zip,.tar.zst,.tzst,application/zip,application/zstd', group: LOCAL_IMPORT, sensitive: true, fileAction: 'import-local' },
  { id: 'artistRelations', label: `Relationship dataset (${ARTIST_RELATIONS_FILE})`, type: 'file', accept: '.json,application/json', group: ARTIST_RELATIONS, sensitive: true, fileAction: 'import-artist-relations', fileMultiple: false },
  { id: 'sources', label: 'Source catalogue URLs (one per line)', type: 'textarea', group: REMOTE_IMPORT, placeholder: 'https://example.com/source-catalog/\nhttps://example.com/downloads.tar.zst.enc#token=…' },
  { id: 'deleteSource', label: 'Downloaded source to delete (URL)', type: 'url', group: LIBRARY, placeholder: 'https://example.com/downloads.tar.zst.enc' },
  { id: 'certificate', label: 'Local private certificate (.cvcert)', type: 'file', accept: '.cvcert,.json,application/json', group: REMOTE_IMPORT, sensitive: true },
  { id: 'certificatePassphrase', label: 'Certificate passphrase', type: 'text', group: REMOTE_IMPORT, sensitive: true },
];
const ACTIONS = [
  { id: 'import-local', label: 'Import local archives', group: LOCAL_IMPORT, receives: ['archives'] },
  { id: 'import-artist-relations', label: 'Import artist relationships', group: ARTIST_RELATIONS, receives: ['artistRelations'] },
  { id: 'update', label: 'Update catalogue', group: REMOTE_IMPORT, receives: ['sources', 'certificate', 'certificatePassphrase'] },
  { id: 'delete', label: 'Delete downloaded source', variant: 'danger', group: LIBRARY, receives: ['deleteSource'] },
  ...ARTIST_EXPORT_ACTIONS.map(({ id, label }) => ({ id, label, group: LIBRARY, variant: 'secondary', receives: [] })),
];
let library;
let baseUrl;
let hostOrigin;
let chartSnapshot;
let searchIndex;
const resultCache = new Map();

function invalidateCatalogue() {
  chartSnapshot = undefined;
  searchIndex = undefined;
  resultCache.clear();
}

function loadCharts() {
  return chartSnapshot ??= library.list()
    .then((sources) => sources.flatMap((source) => source.charts))
    .catch((error) => { chartSnapshot = undefined; throw error; });
}

async function prepareSearchIndex() {
  return searchIndex ??= library.searchEntries()
    .then((entries) => ({ entries, catalogueMaxViews: maximumChartViews(entries) }))
    .catch((error) => { searchIndex = undefined; throw error; });
}

async function copyArtists(orderByViews) {
  const clipboard = navigator.clipboard;
  if (!clipboard) throw new Error('Clipboard access is unavailable in this browser.');
  const report = prepareSearchIndex().then(({ entries }) => artistExport(entries, orderByViews));
  const copy = async () => {
    if (typeof ClipboardItem === 'function' && clipboard.write) {
      // Start the clipboard write during the click while IndexedDB loads.
      await clipboard.write([new ClipboardItem({
        'text/plain': report.then(({ tsv }) => new Blob([tsv], { type: 'text/plain' })),
      })]);
    } else {
      await clipboard.writeText((await report).tsv);
    }
  };
  const [result] = await Promise.all([report, copy().catch(() => {
    throw new Error('Could not copy the artists. Check this site’s clipboard permission and try again.');
  })]);
  return { status: 'success', body: `${result.count} artists copied to the clipboard.` };
}

function settings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return { sources: typeof saved.sources === 'string' ? saved.sources : '' };
  } catch { return { sources: '' }; }
}

function getSearchOrder() {
  const saved = globalThis.localStorage?.getItem(SEARCH_ORDER_KEY);
  return SEARCH_ORDER_OPTIONS.find(({ id }) => id === saved)?.id ?? '';
}

function setSearchOrder(order) {
  if (order === '') localStorage.removeItem(SEARCH_ORDER_KEY);
  else if (SEARCH_ORDER_OPTIONS.some(({ id }) => id === order)) localStorage.setItem(SEARCH_ORDER_KEY, order);
}

export async function setup(host) {
  library = createLibraryStore();
  invalidateCatalogue();
  baseUrl = new URL('.', import.meta.url).href;
  hostOrigin = location.origin;
  host.registerService('host.resource-client', { request });
  host.registerService('peekmosaic.search-order', {
    options: () => SEARCH_ORDER_OPTIONS,
    get: getSearchOrder,
    set: setSearchOrder,
  });
  host.registerService('peekmosaic.artist-recommendations', {
    directory: library.listArtistSummaries,
    profile: library.getArtistRelations,
  });
}

async function contentPayload(chart) {
  const views = chart.statistics?.allTimeViews;
  const catalogueMaxViews = Number.isSafeInteger(views) && views >= 0
    ? await prepareSearchIndex().then((index) => index.catalogueMaxViews, () => undefined)
    : undefined;
  const payload = toContentJson(chart, { baseUrl, checksum: chart.checksum, catalogueMaxViews });
  const artistSlug = chart.artist?.slug;
  if (chart.sourceId === 'artist-portal-scraper' && artistSlug && await library.hasArtistRelations(artistSlug)) {
    payload.artistRelationsUrl = new URL(`artist-relations/${encodeURIComponent(artistSlug)}.json`, baseUrl).href;
  }
  if (chart.sourceRoot) {
    if (chart.tuningId !== 'guitar-standard') delete payload.notation.tuning;
    if (chart.tuning) payload.notation.tuning = chart.tuning;
    payload.playableVersion.label = chart.versionLabel ?? 'Imported version';
    payload.chordChart.instrumentId = chart.instrumentId;
    payload.chordChart.tuningId = chart.tuningId;
    if (chart.collectedAt) payload.observability.collectedAt = chart.collectedAt;
  }
  return payload;
}

/** Serves the same resource routes from the device, without consulting HTTP. */
export async function request({ url }) {
  const parsed = new URL(url);
  const base = new URL(baseUrl);
  if (parsed.origin !== base.origin || !parsed.pathname.startsWith(base.pathname)) return undefined;
  const path = parsed.pathname.slice(base.pathname.length);
  const artistMatch = /^artist-relations\/([a-z0-9-]{1,160})\.json$/u.exec(path);
  if (artistMatch) {
    const record = await library.getArtistRelations(artistMatch[1]);
    return { status: record ? 200 : 404, contentType: 'application/json',
      body: JSON.stringify(record ?? { error: 'Artist relationships not found' }) };
  }
  const match = /^(text)\/chart\/([^/]+)\/content\.(json|txt)$/.exec(path) ?? /^(catalog|search|text)\/chart\/([^/]+)\.json$/.exec(path);
  if (!match) return undefined;
  const [, resource, encodedId, extension] = match;
  const id = decodeURIComponent(encodedId);
  const charts = resource === 'catalog' ? await loadCharts() : undefined;
  let body;
  let contentType = 'application/json';
  if (resource === 'search' || resource === 'catalog') {
    const order = resource === 'search' || id === CATALOGS[0].id ? getSearchOrder() : '';
    const searchIndex = resource === 'search' ? await prepareSearchIndex() : undefined;
    const cacheKey = JSON.stringify([resource, id, order]);
    let matches = resultCache.get(cacheKey);
    if (!matches) {
      matches = searchIndex ? searchMetadataIndex(searchIndex.entries, id, order) : listCatalog(charts, id, order);
      if (resultCache.size >= 20) resultCache.delete(resultCache.keys().next().value);
      resultCache.set(cacheKey, matches);
    }
    const { items, pagination } = paginate(matches, {
      limit: parsed.searchParams.get('limit') ? Number(parsed.searchParams.get('limit')) : undefined,
      cursor: parsed.searchParams.get('cursor') ?? undefined,
    });
    if (resource === 'search') {
      body = JSON.stringify({ metas: items.map((entry) => toMeta(entry.chart, baseUrl)), pagination });
    } else {
      body = JSON.stringify({ metas: items.map((chart) => toMeta(chart, baseUrl)), pagination });
    }
  } else {
    const chart = (await library.getChartsByIds([id]))[0];
    if (!chart) return { status: 404, contentType, body: JSON.stringify({ error: 'Chart not found' }) };
    if (extension === 'txt') { body = chart.text; contentType = 'text/plain'; }
    else body = JSON.stringify(extension === 'json' ? await contentPayload(chart) : { texts: [toTextOption(chart, baseUrl)] });
  }
  return { status: 200, contentType, body };
}

export function createTab() {
  return {
    title: manifest.contract.ui.title, body: manifest.contract.ui.body,
    fields: FIELDS, actions: ACTIONS, settingsGroups: [LOCAL_IMPORT, ARTIST_RELATIONS, REMOTE_IMPORT, LIBRARY],
    persistence: {
      load: async () => ({ values: settings() }),
      save: async ({ values }) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(values)),
    },
    getSnapshot: async () => {
      const [sources, relationshipCount] = await Promise.all([library.summaries(), library.countArtistRelations()]);
      return { status: 'info', body: `${sources.reduce((total, source) => total + source.count, 0)} downloaded charts. Removing a URL stops updates and keeps downloaded charts.`,
        items: [
          ...(relationshipCount ? [{ label: 'Artist relationships', value: `${relationshipCount} artist profiles saved` }] : []),
          ...sources.map((source) => ({ label: source.name, value: `${source.root} · ${source.count} charts · ${source.importedAt}` })),
        ] };
    },
    async run(actionId, values) {
      if (ARTIST_EXPORT_ACTIONS.some(({ id }) => id === actionId)) {
        return copyArtists(actionId === 'copy-artists-by-views');
      }
      if (actionId === 'delete') {
        const candidates = sourceLines(values.deleteSource ?? '');
        if (candidates.length !== 1 || candidates[0].error) throw new Error('Enter one valid downloaded source URL to delete.');
        await library.remove(candidates[0].root);
        invalidateCatalogue();
        return { status: 'success', body: `Downloaded charts deleted: ${candidates[0].root}` };
      }
      if (actionId === 'import-local') return importLocalArchives(values.archives);
      if (actionId === 'import-artist-relations') return importLocalArtistRelations(values.artistRelations);
      if (actionId !== 'update') throw new Error('Unknown catalogue action.');
      // Save the list before downloading, even if every source fails.
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings(), sources: values.sources ?? '' }));
      const results = await updateSources(values.sources ?? '', library, fetch, {
        certificate: values.certificate,
        passphrase: values.certificatePassphrase,
      }).finally(invalidateCatalogue);
      return importReport(results);
    },
  };
}

async function readLocalFile(file, maximum, sizeError) {
  if (typeof file?.url !== 'string' || !file.url.startsWith('blob:')) throw new Error('Select a local file.');
  const response = await fetch(file.url);
  if (!response.ok) throw new Error('Could not read the selected file.');
  const blob = await response.blob();
  if (blob.size > maximum) throw new Error(sizeError);
  return new Uint8Array(await blob.arrayBuffer());
}

async function importLocalArtistRelations(value) {
  const files = JSON.parse(value ?? '[]');
  if (!Array.isArray(files) || files.length !== 1) throw new Error('Select one artist relationship JSON file.');
  const [file] = files;
  const name = typeof file?.name === 'string' ? file.name : 'Artist relationship file';
  try {
    const bytes = await readLocalFile(file, MAX_ARTIST_RELATIONS_BYTES, 'Artist relationship file exceeds 32 MiB.');
    const records = parseArtistRelations(bytes);
    await library.putArtistRelations(records);
    return { status: 'success', body: `${name}: ${records.length} artist profiles with relationships imported. They are available on imported chart pages.` };
  } catch (error) {
    return { status: 'error', body: `${name}: failed (${error.message}); previous relationships kept.` };
  }
}

async function importLocalArchives(value) {
  const archives = JSON.parse(value ?? '[]');
  if (!Array.isArray(archives) || archives.length === 0) throw new Error('Select at least one archive.');
  const results = [];
  for (const archive of archives) {
    const name = typeof archive?.name === 'string' ? archive.name : 'Local archive';
    try {
      const bytes = await readLocalFile(archive, MAX_ARCHIVE_BYTES, 'Archive exceeds the 128 MiB import limit.');
      const root = `https://local-upload.invalid/${await sha256(bytes)}/`;
      const snapshot = await importArchive(root, bytes);
      await library.put(snapshot);
      invalidateCatalogue();
      results.push({ name, count: snapshot.charts.length, artistCount: snapshot.artistRelations?.length, warnings: snapshot.warnings });
    } catch (error) {
      results.push({ name, error: error.message });
    }
  }
  return importReport(results);
}

async function importReport(results) {
  if (results.length === 0) return { status: 'error', body: 'No source URLs configured.' };
  let offline = '';
  if (results.some((result) => !result.error)) {
    try {
      const ready = await prepareOffline();
      offline = ready ? '\nOffline application ready on this device.' : '\nOffline application requires a production build; chart data is stored on this device.';
    } catch (error) { offline = `\nCharts saved, but offline application preparation failed: ${error.message}`; }
  }
  const lines = results.map(({ name, root, count, artistCount, error, warnings }) =>
    `${name ?? root}: ${error ? `failed (${error}); previous charts kept` : `${count} charts imported${artistCount ? ` · relationships for ${artistCount} artists` : ''}`}${warnings?.length ? `\n${warnings.join('\n')}` : ''}`);
  return { status: results.some((result) => result.error) ? 'error' : 'success', body: lines.join('\n') + offline };
}

async function prepareOffline() {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration(`${hostOrigin}/`);
  const worker = registration?.active;
  if (!worker) return false;
  // Ask the generic host worker to retain all installed manifests and bundles,
  // including add-ons the person has not opened before going offline.
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error('Offline preparation timed out.')), 30000);
    channel.port1.onmessage = ({ data }) => { clearTimeout(timer); channel.port1.close(); data.error ? reject(new Error(data.error)) : resolve(true); };
    worker.postMessage({ type: 'prepare-installed-addons' }, [channel.port2]);
  });
}
