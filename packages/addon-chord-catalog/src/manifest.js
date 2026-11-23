import { defineAddonManifest } from '@addons-poc/protocol';
import { CATALOGS } from './data/catalogs.js';
import { ARTIST_EXPORT_ACTIONS } from './artist-export.js';

/**
 * Chord-chart catalogue manifest.
 *
 * The add-on publishes only metadata for listing and searching; the chart text
 * is delivered on demand by the content routes, in the two-stage flow of the
 * protocol. The contract describes every route and its expected payload.
 */
const string = (description, classification = 'public', format) => ({
  type: 'string',
  description,
  classification,
  ...(format ? { format } : {}),
});

const integer = (description, classification = 'public') => ({ type: 'integer', description, classification });

const object = (description, classification, properties, required = []) => ({
  type: 'object',
  description,
  classification,
  properties,
  ...(required.length ? { required } : {}),
});

const array = (description, classification, items) => ({ type: 'array', description, classification, items });

const payload = (description, schema) => ({ description, schema });

const chartDisplayFieldSchema = object('One provider-defined display field.', 'public', {
  id: string('Stable field identifier.'),
  label: string('Column heading shown by the host.'),
  value: string('Plain-text field value.'),
  detail: string('Optional secondary plain-text value.'),
  image: string('Optional image URL associated with this field.', 'public', 'uri'),
  url: string('Optional URL opened from this field.', 'public', 'uri'),
}, ['id', 'label', 'value']);

const pageFields = {
  limit: integer('Maximum number of rows requested for this page.'),
  cursor: string('Opaque cursor received from the previous page.', 'personal'),
};

const incoming = (description, properties, required) => payload(
  description,
  object(description, 'personal', properties, required),
);

const paginationSchema = object('Continuation of the listing.', 'public', {
  limit: integer('Effective page size.'),
  total: integer('Known total of rows for this query.'),
  next: string('Opaque cursor for the next page.'),
}, ['limit']);

const chartMetaSchema = object('One chart normalized for the host table.', 'public', {
  id: string('Chart identifier.'),
  type: string('Resource type, always chart.'),
  name: string('Chart title.'),
  artist: string('Artist name.'),
  description: string('Artist, key, and tempo in one line.'),
  url: string('Plain-text content URL served by this add-on.', 'public', 'uri'),
  emoji: string('Emoji used by the host row.'),
  image: string('Artist portrait used by the host row.', 'public', 'uri'),
  displayFields: array('Generic table columns and values supplied by the catalogue.', 'public', chartDisplayFieldSchema),
}, ['id', 'type', 'name', 'url']);

const metasResponse = (description) => payload(description, object(description, 'public', {
  metas: array('Rows found.', 'public', chartMetaSchema),
  pagination: paginationSchema,
}, ['metas']));

const voicingSchema = object('One chord shape.', 'public', {
  symbol: string('Chord symbol as it appears in the chart.'),
  frets: string('Six strings from the lowest to the highest; x means muted.'),
  fingers: string('Finger used on each string; 0 means none.'),
  position: integer('Base fret of the shape.'),
}, ['symbol']);

const sectionSchema = object('One section of the chart.', 'public', {
  title: string('Section title without the brackets.'),
  line: integer('Zero-based line where the section starts.'),
}, ['title', 'line']);

const chartContentSchema = object('Chart text and its measures.', 'public', {
  text: string('Complete chart text: chord lines, lyrics, and section markers.', 'public'),
  charCount: integer('Number of Unicode characters.'),
  lineCount: integer('Number of lines.'),
  contentType: string('MIME type of the text content.'),
  encoding: string('Text content encoding.'),
}, ['text', 'charCount', 'lineCount', 'contentType', 'encoding']);

const chartSourceSchema = object('Origin and licence of the delivered chart.', 'public', {
  name: string('Name of the catalogue.'),
  provider: string('Add-on that answered the request.'),
  origin: string('HTTP origin of the add-on.', 'public', 'uri'),
  url: string('Exact content URL.', 'public', 'uri'),
  catalogueUrl: string('Archive or catalogue used to import the chart.', 'public', 'uri'),
  canonicalUrl: string('Canonical URL declared on the source page.', 'public', 'uri'),
  imageUrl: string('Image URL declared on the source page.', 'public', 'uri'),
  license: string('Licence declared for the text.'),
  notice: string('Optional provenance notice.'),
}, ['name', 'provider', 'origin', 'url']);

const chartRecordSchema = object('Chart record, in the vocabulary of the AC archive.', 'public', {
  id: string('Record identifier.'),
  playableVersionId: string('Version this chart belongs to.'),
  rawFormat: string('Notation family of the raw text.'),
  rawText: string('Canonical chart text.'),
  rawTextChecksum: string('SHA-256 of the raw text, so a change is detectable.'),
  sourceKey: string('Key of the chart as published.'),
  capo: integer('Capo fret declared by the author.'),
  instrumentId: string('Instrument assumed by the shapes.'),
  tuningId: string('Tuning assumed by the shapes.'),
  parserVersion: string('Parser version the text is published against.'),
  astVersion: string('AST version the text is published against.'),
  verifiedStatus: string('Editorial status of the chart.'),
  updatedAt: string('Date of the last update.', 'public', 'date-time'),
}, ['id', 'playableVersionId', 'rawFormat', 'rawText', 'rawTextChecksum', 'sourceKey']);

const chartJsonSchema = object('Structured chart payload consumed by a renderer.', 'public', {
  id: string('Chart identifier.'),
  type: string('Resource type, always chart.'),
  title: string('Chart title.'),
  description: string('Artist, key, and tempo in one line.'),
  extract: string('Notation summary in one sentence.'),
  artistRelationsUrl: string('Optional device-local artist profile and relationship URL.', 'public', 'uri'),
  musicalWork: object('Work the chart belongs to.', 'public', {
    title: string('Work title.'),
    artistSlug: string('Artist slug.'),
    artistName: string('Artist display name.'),
    artistImage: string('Portrait URL for the artist.', 'public', 'uri'),
    albumTitle: string('Album that first released this song.'),
    firstReleasedYear: integer('Year the album was first released.'),
    composers: array('Composers credited for the work.', 'public', string('Composer name.')),
    genre: object('Artist genre reported by the source.', 'public', {
      id: integer('Source genre identifier.'),
      name: string('Genre name.'),
      slug: string('Source genre slug.'),
    }),
  }, ['title']),
  playableVersion: object('Version of the work this chart describes.', 'public', {
    id: string('Version identifier.'),
    label: string('Version label.'),
    key: string('Declared musical key.'),
    capo: integer('Capo fret declared by the author; 0 means none.'),
    tempo: integer('Suggested tempo in beats per minute.'),
    time: string('Time signature.'),
    difficulty: integer('Difficulty from 1 to 5.'),
    statistics: object('Recorded views and list appearances with an optional catalogue comparison.', 'public', {
      allTimeViews: integer('Views reported by the source.'),
      listAppearances: integer('Appearances in source lists.'),
      catalogueMaxViews: integer('Highest recorded view count across the full catalogue.'),
    }),
  }, ['id', 'key']),
  notation: object('Notation rules of the delivered text.', 'public', {
    format: string('Chord-over-lyrics is the supported layout.'),
    sectionMarkers: string('How section titles are marked.'),
    annotationLines: string('How instrumental annotations are marked.'),
    tuning: string('Tuning assumed by the chord shapes.'),
  }, ['format']),
  sections: array('Sections found in the text, in reading order.', 'public', sectionSchema),
  chordChart: chartRecordSchema,
  chords: array('Shapes used by the chart.', 'public', voicingSchema),
  tags: array('Free tags of the chart.', 'public', string('Tag.')),
  content: chartContentSchema,
  source: chartSourceSchema,
  observability: object('Collection identifiers and timings.', 'public', {
    requestId: string('Identifier correlating the request with debug data.'),
    durationMs: integer('Time spent building the response.'),
    collectedAt: string('Time when the payload was built.', 'public', 'date-time'),
  }, ['requestId', 'durationMs', 'collectedAt']),
}, ['id', 'type', 'title', 'content', 'chords', 'source']);

const textOptionSchema = object('One deliverable version of a chart.', 'public', {
  id: string('Chart identifier.'),
  name: string('Title and artist.'),
  description: string('Notation summary of the chart.'),
  url: string('Plain-text content URL.', 'public', 'uri'),
  contentJsonUrl: string('Structured content URL.', 'public', 'uri'),
  key: string('Declared musical key.'),
  capo: integer('Capo fret declared by the author.'),
  tempo: integer('Suggested tempo in beats per minute.'),
  time: string('Time signature.'),
  difficulty: integer('Difficulty from 1 to 5.'),
  updatedAt: string('Date of the last update.', 'public', 'date-time'),
}, ['id', 'url', 'contentJsonUrl']);

const trafficEntrySchema = object('One HTTP exchange observed by the server.', 'public', {
  sequence: integer('Sequence number within the process.'),
  recordedAt: string('Time when the entry was recorded.', 'public', 'date-time'),
  source: string('Component that observed the exchange.'),
  requestId: string('Identifier correlating attempt and response.'),
  direction: string('Direction relative to the add-on.'),
  phase: string('Request or response phase.'),
  method: string('HTTP method.'),
  url: string('Observed URL.', 'public', 'uri'),
  path: string('Observed local route.'),
  status: integer('Returned HTTP status.'),
  ok: integer('One when the response succeeded, zero otherwise.'),
  durationMs: integer('Operation duration in milliseconds.'),
});

export const manifest = defineAddonManifest({
  entrypoint: './bundle.js',
  id: 'chord-catalog',
  version: '1.3.0',
  name: 'Chord Chart Catalogue',
  description: 'Lists, searches and imports chord charts, including locally decrypted private archives.',
  author: 'AC Team',
  license: 'MIT',
  ui: {
    title: '🎼 Chord charts',
    body: 'A catalogue of imported chord charts available on this device. Encrypted archives are decrypted in this browser with the selected local certificate; its private key and passphrase are not saved. Use the global search to find a chart by title, artist, key, tag, chord, or lyric.',
  },
  resources: [
    { name: 'catalog', types: ['chart'], idPrefixes: [] },
    { name: 'search', types: ['chart'], idPrefixes: [] },
    { name: 'text', types: ['chart'], idPrefixes: [] },
  ],
  types: ['chart'],
  idPrefixes: [],
  catalogs: CATALOGS.map(({ id, name }) => ({ type: 'chart', id, name })),
  contract: {
    version: '1.0.0',
    protocol: { version: '1.0.0', range: '^1.0.0' },
    capabilities: { required: [], optional: ['registry.services', 'ui.tab', 'logs'] },
    services: [{
      id: 'host.resource-client', role: 'provides', version: '1.0.0',
      description: 'Reads catalogue resource responses from the browser library.',
      methods: [{ id: 'request', description: 'Reads a local resource or declines a URL.',
        receives: payload('Requested resource.', object('Resource request.', 'public', { url: string('Absolute resource URL.', 'public', 'uri') }, ['url'])),
        returns: payload('Local response or nothing for unrelated URLs.', object('Resource response.', 'public', { status: integer('HTTP status.'), contentType: string('Media type.'), body: string('Serialized response body.') })),
      }],
    }, {
      id: 'peekmosaic.search-order', role: 'provides', version: '1.0.0',
      description: 'Offers optional search orders and shares one preference across searches on this device.',
      methods: [
        { id: 'options', description: 'Lists available search orders.',
          returns: payload('Search order options.', array('Selectable orders.', 'public', object('Search order option.', 'public', {
            id: string('Order identifier.'),
            label: string('Display label.'),
          }, ['id', 'label']))) },
        { id: 'get', description: 'Returns the selected search order or an empty string for the default.',
          returns: payload('Selected order.', string('Search order identifier.')) },
        { id: 'set', description: 'Persists the selected search order.',
          receives: payload('Selected order.', string('Search order identifier or an empty string for the default.')) },
      ],
    }, {
      id: 'peekmosaic.artist-recommendations', role: 'provides', version: '1.0.0',
      description: 'Reads imported artist relationships and ratings from this device.',
      methods: [
        { id: 'directory', description: 'Lists the artists and editorial ratings in the imported dataset.',
          returns: payload('Artist directory.', array('Artist summaries.', 'public', object('Artist summary.', 'public', {
            slug: string('Stable artist identifier.'),
            name: string('Artist display name.'),
            ratings: object('Optional category ratings by model, from 0 to 3.', 'public', {}),
          }, ['slug', 'name']))) },
        { id: 'profile', description: 'Reads the relationships for one artist.',
          receives: payload('Artist identifier.', string('Stable artist identifier.')),
          returns: payload('Artist profile if found.', object('Artist and its paired discovery, co-listening and documented evidence.', 'public', {
            slug: string('Stable artist identifier.'),
            name: string('Artist display name.'),
            listeners: integer('Unique listeners in the audience sample.'),
            audience: object('Audience source, dates and minimum sample sizes.', 'public', {}),
            related: array('Paired relationships.', 'public', object('Relationship with another artist.', 'public', {})),
          }, ['slug', 'name', 'related'])) },
      ],
    }],
    ui: {
      fields: [
        { id: 'sources', label: 'Source catalogue URLs (one per line)', description: 'Source Catalog roots or ZIP or TAR.ZST archives to refresh manually.', schema: string('One HTTP(S) catalogue root or ZIP, TAR.ZST or encrypted TAR.ZST URL per line.') },
        { id: 'deleteSource', label: 'Downloaded source to delete (URL)', description: 'Source snapshot explicitly selected for deletion.', schema: string('Catalogue root or ZIP, TAR.ZST or encrypted TAR.ZST URL to remove.') },
        { id: 'archives', label: 'Archive files (.zip, .tar.zst, .tzst)', description: 'Local archives selected on this device and read only during import.', schema: string('JSON list of file names and temporary object URLs.', 'personal') },
        { id: 'artistRelations', label: 'Relationship dataset (artist-relations.v1.json)', description: 'Imports a relationship dataset independently of the chart archives.', schema: string('JSON with one file name and a temporary object URL.', 'personal') },
        { id: 'certificate', label: 'Local private certificate (.cvcert)', description: 'Encrypted local certificate read into memory only when updating an encrypted source.', schema: string('Certificate JSON held in the current page only.', 'secret') },
        { id: 'certificatePassphrase', label: 'Certificate passphrase', description: 'Passphrase used to unlock the local certificate in the browser only.', schema: string('Local passphrase held in the current page only.', 'secret') },
      ],
      actions: [
        { id: 'import-local', label: 'Import local archives', description: 'Imports local archives sequentially and reports the result for each file.', receives: ['archives'], returns: payload('Import report.', object('Tab response.', 'public', {})) },
        { id: 'import-artist-relations', label: 'Import artist relationships', description: 'Replaces the relationship dataset stored on this device.', receives: ['artistRelations'], returns: payload('Import report.', object('Tab response.', 'public', {})) },
        { id: 'update', label: 'Update catalogue', description: 'Downloads snapshots and decrypts encrypted archives in the browser, retaining previous data on failure.', receives: ['sources', 'certificate', 'certificatePassphrase'], returns: payload('Import report.', object('Tab response.', 'public', {})) },
        { id: 'delete', label: 'Delete downloaded source', description: 'Deletes the selected downloaded snapshot from this device.', receives: ['deleteSource'], returns: payload('Deletion report.', object('Tab response.', 'public', {})) },
        ...ARTIST_EXPORT_ACTIONS.map((action) => ({
          ...action, receives: [], returns: payload('Clipboard copy report.', object('Tab response.', 'public', {})),
        })),
      ],
    },
    state: [
      { id: 'source-library', description: 'Browser IndexedDB source snapshots and optional artist relationship dataset.', key: 'addons:state:chord-catalog:v1', operations: ['read', 'write', 'remove', 'list', 'clear'], value: payload('Source snapshots and relationships.', object('Downloaded charts and imported artist profiles.', 'public', {})), retention: 'Until explicitly deleted, replaced or browser site data is cleared.', deletionTrigger: 'Delete downloaded source action for charts, replacement import for relationships, or browser site data removal.' },
      { id: 'source-settings', description: 'Source URLs stored in browser localStorage.', key: 'addons:state:chord-catalog:settings:v1', operations: ['read', 'write', 'remove'], value: payload('Source settings.', object('Configuration.', 'public', {})), retention: 'Until browser site data is cleared.', deletionTrigger: 'Factory reset or browser site data removal.' },
      { id: 'search-order', description: 'Global search order stored in browser localStorage.', key: 'addons:state:chord-catalog:search-order:v1', operations: ['read', 'write', 'remove'], value: payload('Search order.', string('Search order identifier.')), retention: 'Until changed or browser site data is cleared.', deletionTrigger: 'Default order, factory reset or browser site data removal.' },
    ],
    http: [
      { id: 'source-pull', direction: 'outgoing', method: 'GET', origin: 'https://{configured-source}', path: '/{catalogueRoot}/{file}', purpose: 'Downloads configured Source Catalog documents or encrypted archives; a certificate token is sent in an Authorization header and the archive is decrypted locally.', returns: payload('Source bytes.', string('Static source document or encrypted archive.')) },
      {
        id: 'catalog',
        direction: 'incoming',
        method: 'GET',
        path: '/catalog/{type}/{catalogId}.json?limit={limit}&cursor={cursor}',
        purpose: 'Lists one named view of the catalogue, ordered by recency, visits, difficulty, or title.',
        resource: 'catalog',
        receives: incoming('Parameters the host sends to list a catalogue view.', {
          type: string('Type requested by the host.'),
          catalogId: string('Catalogue view: recent, popular, beginner, or alphabetical.'),
          ...pageFields,
        }, ['type', 'catalogId']),
        returns: metasResponse('Rows of the requested view and its pagination.'),
      },
      {
        id: 'search',
        direction: 'incoming',
        method: 'GET',
        path: '/search/{type}/{query}.json?limit={limit}&cursor={cursor}',
        purpose: 'Searches charts by title, artist, composer, key, tag, chord symbol, or lyric word.',
        resource: 'search',
        receives: incoming('Parameters the host sends to search charts.', {
          type: string('Type requested by the host.'),
          query: string('Term entered by the person.', 'personal'),
          ...pageFields,
        }, ['type', 'query']),
        returns: metasResponse('Rows that matched every term of the query.'),
      },
      {
        id: 'text',
        direction: 'incoming',
        method: 'GET',
        path: '/text/{type}/{id}.json',
        purpose: 'Lists the deliverable versions of one chart and their content links.',
        resource: 'text',
        receives: incoming('Parameters the host sends to discover a chart version.', {
          type: string('Type requested by the host.'),
          id: string('Chart identifier.'),
        }, ['type', 'id']),
        returns: payload('Available versions and their links.', object('Object with texts.', 'public', {
          texts: array('Available versions.', 'public', textOptionSchema),
        }, ['texts'])),
      },
      {
        id: 'content',
        direction: 'incoming',
        method: 'GET',
        path: '/text/{type}/{id}/content.txt',
        purpose: 'Returns the chart text exactly as authored, for plain-text readers.',
        receives: incoming('Parameters the host sends to read the chart text.', {
          type: string('Type requested by the host.'),
          id: string('Chart identifier.'),
        }, ['type', 'id']),
        returns: payload('Chart text with chord lines, lyrics, and section markers.', string('Chart text.')),
      },
      {
        id: 'content-json',
        direction: 'incoming',
        method: 'GET',
        path: '/text/{type}/{id}/content.json',
        purpose: 'Returns the structured chart payload, including sections and chord shapes, without changing content.txt.',
        receives: incoming('Parameters a renderer sends to read the structured chart.', {
          type: string('Type requested by the host.'),
          id: string('Chart identifier.'),
        }, ['type', 'id']),
        returns: payload('Structured chart payload.', chartJsonSchema),
      },
      {
        id: 'debug-traffic',
        direction: 'incoming',
        method: 'GET',
        path: '/debug/traffic.json',
        purpose: 'Exposes the recent HTTP history of this server to the host observability panel.',
        returns: payload('Recent exchanges of the current process.', object('Traffic history.', 'public', {
          addon: string('Add-on identifier.'),
          generatedAt: string('Time when the history was read.', 'public', 'date-time'),
          retainedEntries: integer('Number of entries currently retained.'),
          maxEntries: integer('Process retention limit.'),
          entries: array('Retained exchanges.', 'public', trafficEntrySchema),
        }, ['addon', 'generatedAt', 'entries'])),
      },
    ],
    logs: [
      { id: 'lifecycle', level: 'info', message: 'Chord chart catalogue configured successfully', description: 'Confirms that the server started with a valid manifest.' },
      { id: 'chart-served', level: 'info', message: 'Chart served', description: 'Records which chart was delivered and in which format.', details: payload('Served chart and format.', object('Served chart.', 'public', {
        id: string('Chart identifier.'),
        format: string('Delivered format: txt or json.'),
      }, ['id', 'format'])) },
    ],
  },
});
