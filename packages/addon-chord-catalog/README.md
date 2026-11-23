# `@addons/addon-chord-catalog`

An HTTP add-on that publishes a chord-chart catalogue: listing, search, and
two-stage content delivery.

## Why it exists

A catalogue is the part of a music application that must live outside the host.
This add-on proves that an independent server can list, search, and deliver
chord charts through the public protocol, with the host never knowing what a
chord is.

## What it offers

| Resource | Route | Answer |
| --- | --- | --- |
| `catalog` | `GET /catalog/chart/{catalogId}.json` | One named view: `recent`, `popular`, `beginner`, `alphabetical` |
| `search` | `GET /search/chart/{query}.json` | Rows ranked by title, artist, composer, key, tag, chord, or lyric word |
| `text` | `GET /text/chart/{id}.json` | The deliverable version of a chart and its content links |
| — | `GET /text/chart/{id}/content.txt` | The chart text exactly as authored |
| — | `GET /text/chart/{id}/content.json` | The structured payload: work, version, chart record, sections, shapes |
| — | `GET /debug/traffic.json` | The recent exchange history for the host observability panel |

Listing and search return metadata only; the chart text is delivered when
someone opens it (decision 14). Both accept `limit` and `cursor` and return an
optional `pagination` with `total` and `next`. The cursor is the offset itself,
so the server stays stateless.

The catalogue starts empty. Import a source in the browser to build the device library.

## How to run and test

```bash
pnpm --filter @addons/addon-chord-catalog test
pnpm --filter @addons/addon-chord-catalog serve
```

The manifest is at `http://localhost:5295/manifest.json`.

```bash
curl -s 'http://localhost:5295/catalog/chart/recent.json?limit=3'
```

## How it is organized

| File | Responsibility |
| --- | --- |
| [`src/data/catalogs.js`](src/data/catalogs.js) | The announced catalogue views |
| [`src/data/voicings.js`](src/data/voicings.js) | Chord shapes as `frets`, `fingers`, and `position` |
| [`src/catalog.js`](src/catalog.js) | Pure rules: text folding, ranking, listing, paging |
| [`src/payloads.js`](src/payloads.js) | Row, text-option, and structured payload builders |
| [`src/handlers.js`](src/handlers.js) | Route handlers, with injectable dependencies for tests |
| [`src/manifest.js`](src/manifest.js) | Contract v1 with one described route per resource |
| [`src/server.mjs`](src/server.mjs) | Node.js server built on `@addons/addon-server` |

The add-on uses plain ESM JavaScript and does not know the viewer add-on exists.
Its browser bundle includes `fflate` for ZIP and `fzstd` for TAR.ZST imports; the shared HTTP server
remains free of external runtime dependencies.

## Importing a downloaded library

Under **Local archives**, select or drop ZIP or TAR.ZST files to import them immediately.
The browser processes one file at a time and reports the result of each one.
Under **Import from address**, enter a URL in **Source catalogue URLs (one per line)**
and press **Update catalogue**. Local files stay in the browser. Each chart must have its `.txt` and
matching `.source.json`. Multiple artist folders are supported. An archive containing
one complete Source Catalog is also accepted, alongside regular catalogue root
URLs. Downloads must be served over HTTP(S) with CORS enabled.

Conversion preserves chart whitespace and the metadata used by the app, then stores
the result on the device for offline search and reading. It does not persist the
full `.source.json` or unused chord definitions. A failed import keeps
the previous snapshot. See [the import contract and limits](../../docs/CHORD-CHART.md#importing-a-zip-of-scraper-downloads).

In the browser, the offline search cache keeps only each chart's ID, title,
artist name, and genre. It searches those fields. The local search scans IndexedDB
chunks but retains full chart records only for the current result page; the detail
view retains only the selected chart. Catalogue views continue to use the full
snapshot. The snapshots contain selected metadata rather than the original
`.source.json`. The HTTP server keeps its broader search across composers, keys,
chords, tags, and lyrics.

The importer detects ZIP, TAR.ZST and encrypted archives from their contents, including when the filename or URL extension is misleading. In the catalogue's
**Import from address** section, select the local `.cvcert` file, enter its passphrase and run the update.
The browser decrypts and authenticates the archive before import. The host does
not persist either credential and clears them after the action. The short-lived
link permits downloading ciphertext only. Certificate backup and replacement
guidance is in [`docs/CHORD-CHART.md`](../../docs/CHORD-CHART.md).
