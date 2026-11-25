import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateTabContract } from '@addons-poc/protocol';
import { createTab, request, setup } from './browser.js';
import { manifest } from './manifest.js';
import { createMetadataSearchEntry } from './catalog.js';
import { chartVersionRecord } from './chart-versions.js';
import { sha256 } from './source-import.js';
import { readFile } from 'node:fs/promises';

describe('chord catalogue browser tab', () => {
  it('matches the public runtime field and action contract', () => {
    expect(validateTabContract(manifest, createTab())).toEqual({ valid: true, errors: [] });
  });

  it('keeps remote credentials in a separate group from local files', () => {
    const fields = createTab().fields
      .filter(({ id }) => id === 'certificate' || id === 'certificatePassphrase')
      .map(({ id, group }) => ({ id, group }));

    expect(fields).toEqual([
      { id: 'certificate', group: 'Import from address' },
      { id: 'certificatePassphrase', group: 'Import from address' },
    ]);
    expect(createTab().fields.find(({ id }) => id === 'archives')).toMatchObject({
      group: 'Local archives', fileAction: 'import-local', sensitive: true, fileDirectories: true,
    });
    expect(createTab().actions.find(({ id }) => id === 'update').receives).toEqual(['sources', 'certificate', 'certificatePassphrase']);
  });
});

const stored = vi.hoisted(() => ({
  list: vi.fn(), summaries: vi.fn(), searchEntries: vi.fn(), getChartsByIds: vi.fn(), getChartVersions: vi.fn(),
  remove: vi.fn(), put: vi.fn(), putArtistRelations: vi.fn(), getArtistRelations: vi.fn(),
  hasArtistRelations: vi.fn(), countArtistRelations: vi.fn(),
}));
vi.mock('./library-store.js', () => ({
  createLibraryStore: () => stored,
}));

afterEach(() => vi.unstubAllGlobals());

it('imports loose pairs by relative path and updates individual versions without losing their siblings', async () => {
  const principalUrl = 'https://www.cifraclub.com.br/artist/song/';
  const files = new Map();
  async function setPair(path, sourceUrl, text, name) {
    files.set(`${path}.txt`, text);
    files.set(`${path}.source.json`, JSON.stringify({
      sourceUrl, title: 'Song', collectedAt: '2026-01-01',
      artist: { slug: 'artist', name: 'Artist' },
      chart: { version: { name } },
      file: { name: `${path.split('/').at(-1)}.txt`, sha256: await sha256(text) },
    }));
  }
  await setPair('artist/main/song', principalUrl, 'C', 'Principal');
  await setPair('artist/alternate/song', principalUrl + 'simplificada.html', 'D', 'Simplificada');
  const archiveCopy = {
    id: 'archive-copy', title: 'Song', sourceId: 'artist-portal-scraper', sourceUrl: principalUrl, collectedAt: '2026-01-01',
  };
  const snapshots = new Map();
  stored.put.mockReset().mockImplementation(async (snapshot) => snapshots.set(snapshot.root, snapshot));
  stored.searchEntries.mockReset().mockImplementation(async () => [
    archiveCopy, ...Array.from(snapshots.values()).flatMap(({ charts }) => charts),
  ].map(createMetadataSearchEntry));
  vi.stubGlobal('location', { origin: 'http://localhost:5280' });
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(files.get(url.slice(5)))));
  await setup({ registerService: vi.fn() });
  const tab = createTab();
  const run = (paths = [...files.keys()]) => tab.run('import-local', {
    archives: JSON.stringify(paths.map((path) => ({ name: path.split('/').at(-1), path, url: `blob:${path}` }))),
  });
  expect(await run()).toMatchObject({ status: 'success', body: expect.stringContaining('2 charts imported') });
  const [original, alternative] = snapshots.values();
  const [firstChart] = original.charts;
  const result = await request({ url: new URL('./search/chart/song.json', import.meta.url).href });
  expect(JSON.parse(result.body).metas.map(({ id }) => id)).toEqual([firstChart.id]);

  await setPair('artist/main/song', principalUrl, 'E', 'Principal');
  expect(await run(['artist/main/song.txt', 'artist/main/song.source.json'])).toMatchObject({ status: 'success' });
  expect([...snapshots.keys()]).toEqual([original.root, alternative.root]);
  expect(snapshots.get(alternative.root)).toBe(alternative);
  expect(snapshots.get(original.root).charts[0]).toMatchObject({ id: firstChart.id, text: 'E' });
  expect(await run(['artist/main/song.source.json'])).toMatchObject({ status: 'error', body: expect.stringContaining('Missing chart text') });
  expect(stored.put).toHaveBeenCalledTimes(3);
});

it('lists a song once under its principal and links both ways to its deduplicated versions', async () => {
  const sourceUrl = 'https://www.cifraclub.com.br/artist/song/';
  const principal = { id: 'principal', sourceId: 'artist-portal-scraper', sourceUrl, title: 'Song', text: 'C' };
  const simple = { ...principal, id: 'simple', sourceUrl: sourceUrl + 'simplificada.html', versionLabel: 'Simplificada' };
  const oldCopy = { ...simple, id: 'old-simple', collectedAt: '2025-01-01' };
  const charts = [oldCopy, { ...simple, collectedAt: '2026-01-01' }, principal];
  stored.searchEntries.mockReset().mockResolvedValue(charts.map(createMetadataSearchEntry));
  stored.getChartVersions.mockReset().mockResolvedValue(charts.map((chart) => chartVersionRecord(chart, 'archive')));
  stored.getChartsByIds.mockReset().mockImplementation(async ([id]) => charts.filter((chart) => chart.id === id));
  vi.stubGlobal('location', { origin: 'http://localhost:5280' });
  await setup({ registerService: vi.fn() });
  const payload = async (path) => JSON.parse((await request({ url: new URL(path, import.meta.url).href })).body);
  expect((await payload('./search/chart/song.json')).metas.map(({ id }) => id)).toEqual(['principal']);
  const principalUrl = new URL('./text/chart/principal/content.txt', import.meta.url).href;
  const plainUrl = new URL('./text/chart/simple/content.txt', import.meta.url).href;
  expect((await payload('./text/chart/principal/content.json')).contentVersions).toEqual([
    { label: 'Principal', url: principalUrl, current: true },
    { label: 'Simplificada', url: plainUrl, current: false },
  ]);
  expect((await payload('./text/chart/simple/content.json')).contentVersions).toEqual([
    { label: 'Principal', url: principalUrl, current: false },
    { label: 'Simplificada', url: plainUrl, current: true },
  ]);
});

it('loads a standalone relationship file and links compatible chart pages to the local profile', async () => {
  const dataset = {
    schemaVersion: 1, catalogue: 'artist-portal-scraper',
    artists: [{ slug: 'artist', name: 'Artist' }, { slug: 'other', name: 'Other' }],
    pairs: [{ a: 'artist', b: 'other', discovery: { jev: 'both' } }],
  };
  vi.stubGlobal('location', { origin: 'http://localhost:5280' });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(dataset)));
  stored.putArtistRelations.mockReset().mockResolvedValue(undefined);
  stored.hasArtistRelations.mockReset().mockImplementation(async (slug) => slug === 'artist');
  stored.getArtistRelations.mockReset().mockImplementation(async (slug) =>
    stored.putArtistRelations.mock.lastCall[0].find((artist) => artist.slug === slug));
  const chart = { id: 'song', title: 'Song', text: 'C', sourceId: 'artist-portal-scraper', artist: { name: 'Artist', slug: 'artist' } };
  stored.getChartsByIds.mockReset().mockResolvedValue([chart]);
  await setup({ registerService: vi.fn() });
  const response = await createTab().run('import-artist-relations', {
    artistRelations: JSON.stringify([{ name: 'artist-relations.v1.json', url: 'blob:relationships' }]),
  });
  expect(response.body).toContain('artist-relations.v1.json: 2 artist profiles');
  const openedUrl = new URL('./text/chart/song/content.json', import.meta.url).href;
  const opened = JSON.parse((await request({ url: openedUrl })).body);
  const profile = JSON.parse((await request({ url: opened.artistRelationsUrl })).body);
  expect(profile.related).toMatchObject([{ slug: 'other', discovery: { jev: 'both' } }]);

  vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid JSON')));
  const failed = await createTab().run('import-artist-relations', {
    artistRelations: JSON.stringify([{ name: 'invalid.json', url: 'blob:invalid' }]),
  });
  expect(failed).toMatchObject({ status: 'error', body: expect.stringContaining('invalid.json: failed') });
  expect(stored.putArtistRelations).toHaveBeenCalledTimes(1);

  stored.getChartsByIds.mockResolvedValue([{ ...chart, sourceId: 'another-source' }]);
  expect(JSON.parse((await request({ url: openedUrl })).body)).not.toHaveProperty('artistRelationsUrl');
});

it('imports valid parts in order, even when a file in the middle fails', async () => {
  const first = await readFile(new URL('./fixtures/downloads.tar.zst', import.meta.url));
  const second = await readFile(new URL('./fixtures/root-directory.tar.zst', import.meta.url));
  const responses = new Map([['blob:first', first], ['blob:bad', 'invalid'], ['blob:second', second]]);
  const fetch = vi.fn(async (url) => {
    if (url === 'blob:bad') expect(stored.put).toHaveBeenCalledTimes(1);
    return new Response(responses.get(url));
  });
  const setItem = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('location', { origin: 'http://localhost:5280' });
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('localStorage', { setItem });
  stored.put.mockReset().mockResolvedValue(undefined);
  await setup({ registerService: vi.fn() });
  const result = await createTab().run('import-local', {
    archives: JSON.stringify([...responses.keys()].map((url) => ({ name: url.slice(5) + '.tar.zst', url }))),
    sources: 'https://example.test/downloads.tar.zst.enc',
  });
  expect(fetch.mock.calls.flat()).toEqual([...responses.keys()]);
  expect(setItem).not.toHaveBeenCalled();
  expect(stored.put.mock.calls.map(([snapshot]) => snapshot.charts.length)).toEqual([2, 2]);
  expect(new Set(stored.put.mock.calls.map(([snapshot]) => snapshot.root)).size).toBe(2);
  expect(result.status).toBe('error');
  expect(result.body).toMatch(/first\.tar\.zst: 2 charts imported[\s\S]*bad\.tar\.zst: failed[\s\S]*second\.tar\.zst: 2 charts imported/u);
});

it('starts empty and returns 404 for the removed bundled charts', async () => {
  stored.list.mockReset().mockResolvedValue([]);
  stored.searchEntries.mockReset().mockResolvedValue([]);
  stored.getChartsByIds.mockReset().mockResolvedValue([]);
  vi.stubGlobal('location', { origin: 'http://localhost:5280' });
  await setup({ registerService: vi.fn() });
  const read = (path) => request({ url: new URL(path, import.meta.url).href });
  expect(JSON.parse((await read('./catalog/chart/recent.json')).body).metas).toEqual([]);
  expect(JSON.parse((await read('./search/chart/mare%20alta.json')).body).metas).toEqual([]);
  for (const id of [
    'static-and-rain', 'northbound-train', 'harbor-light', 'paper-lanterns',
    'sunday-kitchen', 'blue-hour-waltz', 'long-way-home', 'copper-kettle-road',
  ]) {
    expect((await read(`./text/chart/${id}/content.txt`)).status).toBe(404);
  }
});

it('copies all artists as TSV in both orders using the metadata index', async () => {
  const charts = [
    { title: 'Primeira', artist: { name: 'Zeca', slug: 'zeca' }, statistics: { allTimeViews: 42 } },
    { title: 'Primeira', artist: { name: 'Zeca', slug: 'zeca' }, statistics: { allTimeViews: 40 } },
    { title: 'Segunda', artist: { name: 'Zeca', slug: 'zeca' }, statistics: { allTimeViews: 18 } },
    { title: 'Uma', artist: { name: 'Ágata', slug: 'agata' }, statistics: { allTimeViews: 12 } },
    { title: 'Duas', artist: { name: 'Ágata', slug: 'agata' }, statistics: { listAppearances: 4 } },
    { title: 'Uma', artist: { name: '=1+1\nArtista', slug: 'test' } },
  ];
  stored.searchEntries.mockReset().mockResolvedValue(charts.map(createMetadataSearchEntry));
  stored.list.mockClear();
  vi.stubGlobal('location', { origin: 'http://localhost:5280' });
  vi.stubGlobal('ClipboardItem', undefined);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  await setup({ registerService: vi.fn() });
  const tab = createTab();
  for (const [action, order] of [
    ['copy-artists-alphabetical', ['Ágata', 'Zeca']],
    ['copy-artists-by-views', ['Zeca', 'Ágata']],
  ]) {
    expect(await tab.run(action, {})).toEqual({ status: 'success', body: '3 artists copied to the clipboard.' });
    const [header, ...rows] = writeText.mock.lastCall[0].split('\n');
    expect(header).toBe('Artist\tSongs\tTotal views');
    expect(rows.filter((row) => /^(Ágata|Zeca)\t/u.test(row))).toEqual(order.map((name) => name === 'Ágata' ? 'Ágata\t2\t12' : 'Zeca\t2\t60'));
    expect(rows).toHaveLength(3);
    expect(rows).toContain("'=1+1 Artista\t1\t0");
  }
  expect(stored.list).not.toHaveBeenCalled();
  writeText.mockRejectedValueOnce(new Error('Clipboard denied'));
  await expect(tab.run('copy-artists-alphabetical', {})).rejects.toThrow('Could not copy');
});

describe('browser catalogue navigation cache', () => {
  it('compares details to the maximum across all sources and refreshes it after a source is removed', async () => {
    const opened = {
      id: 'opened', title: 'Opened chart', artist: { name: 'First artist' }, text: 'C',
      key: 'C', statistics: { allTimeViews: 250 },
    };
    const mostViewed = { id: 'leader', title: 'Another chart', statistics: { allTimeViews: 1000 } };
    const entries = [opened, mostViewed].map(createMetadataSearchEntry);
    stored.searchEntries.mockReset().mockResolvedValue(entries);
    stored.getChartsByIds.mockReset().mockResolvedValue([opened]);
    stored.remove.mockReset().mockImplementation(async () => { stored.searchEntries.mockResolvedValue(entries.slice(0, 1)); });
    vi.stubGlobal('location', { origin: 'http://localhost:5280' });
    await setup({ registerService: vi.fn() });
    const stats = async () => JSON.parse((await request({
      url: new URL('./text/chart/opened/content.json', import.meta.url).href,
    })).body).playableVersion.statistics;

    expect(await stats()).toEqual({ allTimeViews: 250, catalogueMaxViews: 1000 });
    expect(await stats()).toEqual({ allTimeViews: 250, catalogueMaxViews: 1000 });
    expect(stored.searchEntries).toHaveBeenCalledTimes(1);
    await createTab().run('delete', { deleteSource: 'https://example.test/leader/' });
    expect(await stats()).toEqual({ allTimeViews: 250, catalogueMaxViews: 250 });
    expect(stored.searchEntries).toHaveBeenCalledTimes(2);
  });

  it('persists a shared order and applies it to every matching chart before pagination', async () => {
    const storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    });
    vi.stubGlobal('location', { origin: 'http://localhost:5280' });
    const charts = [
      { id: 'missing', title: 'Amor', artist: { name: 'Anitta' }, updatedAt: '9999-01-01' },
      { id: 'views', title: 'O Amor', artist: { name: 'Anitta' }, statistics: { allTimeViews: 900, listAppearances: 2 } },
      { id: 'lists', title: 'Amor Maior', artist: { name: 'Anitta' }, statistics: { allTimeViews: 2, listAppearances: 15 } },
    ].map((chart) => ({ updatedAt: '9998-01-01', ...chart }));
    stored.list.mockReset().mockResolvedValue([{ charts }]);
    stored.searchEntries.mockReset().mockResolvedValue(charts.map(createMetadataSearchEntry));
    const registerService = vi.fn();
    await setup({ registerService });
    const preference = registerService.mock.calls.find(([id]) => id === 'peekmosaic.search-order')[1];
    const firstMatch = async (query, cursor = 0) => {
      const path = query ? `search/chart/${query}` : 'catalog/chart/recent';
      const response = await request({ url: new URL(`./${path}.json?limit=1&cursor=${cursor}`, import.meta.url).href });
      return JSON.parse(response.body).metas[0]?.id;
    };
    expect(await firstMatch('amor')).toBe('missing');
    expect(await firstMatch('')).toBe('missing');
    preference.set('allTimeViews');
    expect(await firstMatch('amor')).toBe('views');
    expect(await firstMatch('amor', 2)).toBe('missing');
    expect(await firstMatch('')).toBe('views');
    expect(await firstMatch('', 1)).toBe('lists');
    preference.set('listAppearances');
    expect(await firstMatch('amor')).toBe('lists');
    await setup({ registerService });
    expect(preference.get()).toBe('listAppearances');
    expect(await firstMatch('anitta')).toBe('lists');
    expect(await firstMatch('')).toBe('lists');
    preference.set('');
    expect(await firstMatch('amor')).toBe('missing');
    expect(await firstMatch('')).toBe('missing');
  });

  it('loads the library once for multiple pages and invalidates results after deleting a source', async () => {
    stored.sources = [{ root: 'https://example.test/charts/', charts: [
      { artist: { name: 'Imported artist' }, id: 'imported-cache-test', title: 'Unique cached chart', checksum: 'test' },
    ] }];
    stored.list.mockReset().mockImplementation(async () => stored.sources);
    stored.searchEntries.mockReset().mockImplementation(async () => stored.sources.flatMap((source) => source.charts.map(createMetadataSearchEntry)));
    stored.getChartsByIds.mockReset().mockImplementation(async (ids) => stored.sources.flatMap((source) => source.charts.filter((chart) => ids.includes(chart.id))));
    stored.remove.mockReset().mockImplementation(async () => { stored.sources = []; });
    vi.stubGlobal('location', { origin: 'http://localhost:5280' });
    await setup({ registerService: vi.fn() });
    const search = (cursor) => request({ url: new URL(
      `./search/chart/unique%20cached%20chart.json?limit=1&cursor=${cursor}`, import.meta.url,
    ).href });
    const first = JSON.parse((await search(0)).body);
    expect(first.metas.map((chart) => chart.id)).toEqual(['imported-cache-test']);
    expect(JSON.parse((await search(1)).body).metas).toEqual([]);
    expect(stored.searchEntries).toHaveBeenCalledTimes(1);
    expect(stored.getChartsByIds).not.toHaveBeenCalled();
    await createTab().run('delete', { deleteSource: 'https://example.test/charts/' });
    expect(JSON.parse((await search(0)).body).metas).toEqual([]);
    expect(stored.searchEntries).toHaveBeenCalledTimes(2);
  });
});
