export const ARTIST_RELATIONS_FILE = 'artist-relations.v1.json';
export const MAX_ARTIST_RELATIONS_BYTES = 32 * 1024 * 1024;

const choices = new Set(['both', 'ab', 'ba', 'neither', 'unknown']);
const modelIds = ['jev', 'microsoft'];
const dimensions = ['festa', 'karaoke', 'intimista', 'escrachado', 'cantar_junto', 'casamento', 'acustico', 'pulsacao', 'vocal', 'experimental'];
const factIds = new Set(['gravacao_estudio', 'convite', 'apresentacao', 'mesmo_evento', 'mesma_banda', 'composicao', 'producao_arranjo', 'influencia', 'alias_historico']);

function requireCondition(condition, message) {
  if (!condition) throw new Error(`Invalid artist relationships: ${message}.`);
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function text(value, limit = 180) {
  return typeof value === 'string' && value.trim() && value.length <= limit;
}

function nonnegative(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value));
}

function validUrl(value) {
  if (!text(value, 2048)) return false;
  try { return /^https?:$/u.test(new URL(value).protocol); } catch { return false; }
}

function ratings(value) {
  if (value === undefined) return undefined;
  requireCondition(record(value), 'ratings must be an object');
  return Object.fromEntries(modelIds.flatMap((model) => {
    if (value[model] === undefined) return [];
    requireCondition(record(value[model]), 'invalid model ratings');
    const entries = dimensions.filter((key) => value[model][key] !== undefined).map((key) => {
      const score = value[model][key];
      requireCondition(nonnegative(score) && score <= 3, 'ratings must be between 0 and 3');
      return [key, score];
    });
    return [[model, Object.fromEntries(entries)]];
  }));
}

function audienceContext(value) {
  if (value === undefined) return undefined;
  requireCondition(record(value) && text(value.source) && date(value.from) && date(value.through) && value.from <= value.through
    && nonnegative(value.totalListeners) && value.totalListeners > 0
    && nonnegative(value.minArtistListeners) && value.minArtistListeners > 0
    && nonnegative(value.minSharedListeners) && value.minSharedListeners > 0, 'invalid audience sample');
  const { source, from, through, totalListeners, minArtistListeners, minSharedListeners } = value;
  return { source, from, through, totalListeners, minArtistListeners, minSharedListeners };
}

function documentaryEvidence(value) {
  if (value === undefined) return undefined;
  requireCondition(Array.isArray(value) && value.length <= 24, 'invalid evidence list');
  return value.map((item) => {
    requireCondition(record(item) && factIds.has(item.kind) && validUrl(item.url)
      && (item.detail === undefined || text(item.detail, 500)), 'invalid evidence entry');
    return { kind: item.kind, url: item.url, detail: item.detail };
  });
}

function pairDecisions(value, reverse = false) {
  if (value === undefined) return undefined;
  requireCondition(record(value), 'invalid discovery judgments');
  return Object.fromEntries(modelIds.flatMap((model) => {
    const choice = value[model];
    if (choice === undefined) return [];
    requireCondition(choices.has(choice), 'unknown discovery judgment');
    return [[model, reverse && choice === 'ab' ? 'ba' : reverse && choice === 'ba' ? 'ab' : choice]];
  }));
}

export function parseArtistRelations(bytes) {
  requireCondition(bytes.byteLength <= MAX_ARTIST_RELATIONS_BYTES, 'file exceeds 32 MiB');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Invalid artist relationships: expected UTF-8 JSON.'); }
  requireCondition(record(value) && value.schemaVersion === 1 && value.catalogue === 'artist-portal-scraper',
    'expected schemaVersion 1 for the artist-portal-scraper catalogue');
  requireCondition(Array.isArray(value.artists) && value.artists.length > 0 && value.artists.length <= 2_000
    && Array.isArray(value.pairs) && value.pairs.length <= 250_000, 'artist or pair count out of range');
  const audience = audienceContext(value.audience);
  const artists = new Map();
  for (const artist of value.artists) {
    requireCondition(record(artist) && typeof artist.slug === 'string' && /^[a-z0-9-]{1,160}$/u.test(artist.slug)
      && text(artist.name), 'invalid artist identity');
    requireCondition(!artists.has(artist.slug), `duplicate artist ${artist.slug}`);
    requireCondition(artist.style === undefined || text(artist.style), 'invalid artist style');
    requireCondition(artist.careerStart === undefined || (nonnegative(artist.careerStart) && artist.careerStart >= 1500
      && artist.careerStart <= 2100), 'invalid career start');
    requireCondition(artist.listeners === undefined || (audience && nonnegative(artist.listeners)
      && artist.listeners <= audience.totalListeners), 'invalid listener count');
    requireCondition(artist.musicBrainzId === undefined || (typeof artist.musicBrainzId === 'string'
      && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(artist.musicBrainzId)), 'invalid MusicBrainz identifier');
    requireCondition(artist.biographyUrl === undefined || validUrl(artist.biographyUrl), 'invalid biography link');
    requireCondition(artist.songs === undefined || (Array.isArray(artist.songs) && artist.songs.length <= 20), 'invalid songs');
    const songs = artist.songs?.map((song) => {
      requireCondition(record(song) && text(song.title, 350) && (song.url === undefined || validUrl(song.url)), 'invalid song');
      return { title: song.title, url: song.url, ratings: ratings(song.ratings) };
    });
    artists.set(artist.slug, {
      slug: artist.slug, name: artist.name, style: artist.style, careerStart: artist.careerStart,
      listeners: artist.listeners, musicBrainzId: artist.musicBrainzId, biographyUrl: artist.biographyUrl,
      ratings: ratings(artist.ratings), songs, audience, related: [],
    });
  }

  const seen = new Set();
  for (const pair of value.pairs) {
    requireCondition(record(pair) && pair.a !== pair.b && artists.has(pair.a) && artists.has(pair.b), 'invalid pair identity');
    const key = [pair.a, pair.b].sort().join('/');
    requireCondition(!seen.has(key), `duplicate pair ${key}`);
    seen.add(key);
    const a = artists.get(pair.a);
    const b = artists.get(pair.b);
    requireCondition(pair.sharedListeners === undefined || (nonnegative(pair.sharedListeners)
      && Number.isSafeInteger(a.listeners) && Number.isSafeInteger(b.listeners)
      && pair.sharedListeners <= Math.min(a.listeners, b.listeners)
      && a.listeners + b.listeners - pair.sharedListeners <= audience.totalListeners), 'invalid shared listener count');
    const evidence = documentaryEvidence(pair.evidence);
    const related = ({ slug, name, style, careerStart, listeners, ratings }, reverse) => ({
      slug, name, style, careerStart, listeners, ratings, sharedListeners: pair.sharedListeners,
      discovery: pairDecisions(pair.discovery, reverse), evidence,
    });
    a.related.push(related(b, false));
    b.related.push(related(a, true));
  }
  return [...artists.values()];
}

export function readArchiveArtistRelations(files) {
  const paths = [...files.keys()].filter((path) => path.split('/').at(-1) === ARTIST_RELATIONS_FILE);
  if (!paths.length) return {};
  if (paths.length > 1) return { warning: `Multiple ${ARTIST_RELATIONS_FILE} files found. Artist relationships were skipped.` };
  try { return { records: parseArtistRelations(files.get(paths[0])) }; }
  catch (error) { return { warning: error.message }; }
}
