import { normalizeText } from './catalog.js';

export const ARTIST_EXPORT_ACTIONS = [
  { id: 'copy-artists-alphabetical', label: 'Copy artists (A–Z)', description: 'Copies artists in alphabetical order, with song counts and total views, as tab-separated text.' },
  { id: 'copy-artists-by-views', label: 'Copy artists by total views', description: 'Copies artists ranked by total views, with song counts, as tab-separated text.' },
];

const alphabetic = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function spreadsheetName(name) {
  const cell = name.replace(/[\t\r\n]+/g, ' ').trim();
  return /^[=+@"-]/u.test(cell) ? "'" + cell : cell;
}

export function artistExport(entries, orderByViews) {
  const artists = new Map();
  for (const entry of entries) {
    const name = entry.artist.trim();
    if (!name) continue;
    const id = entry.chart.artist?.slug || normalizeText(name);
    let artist = artists.get(id);
    if (!artist) {
      artist = { name, songs: new Map() };
      artists.set(id, artist);
    }
    const song = entry.title.normalize('NFC').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
    const views = entry.statistics?.allTimeViews ?? 0;
    artist.songs.set(song, Math.max(artist.songs.get(song) ?? 0, views));
  }

  const rows = Array.from(artists.values(), ({ name, songs }) => ({
    name,
    count: songs.size,
    views: Array.from(songs.values()).reduce((sum, views) => sum + views, 0),
  }));
  rows.sort((left, right) =>
    (orderByViews ? right.views - left.views : 0) || alphabetic.compare(left.name, right.name));
  const lines = ['Artist\tSongs\tTotal views'];
  for (const row of rows) lines.push([spreadsheetName(row.name), row.count, row.views].join('\t'));
  return { count: rows.length, tsv: lines.join('\n') };
}
