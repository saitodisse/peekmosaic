/**
 * Renders a chart with the ported tab renderer.
 *
 * The HTML and the clipboard report use the same parsed and prepared song.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { PreparedTab } from './tab-renderer/react/Tab';
import { parseTab, prepareSongFromParsedTab, summarizeParsedTab, transposeChordSymbol, transposeParsedTab } from './tab-renderer/core';
import type { ParsedTab } from './tab-renderer/core/types';
import { inferKey } from './chart-transform';
import { normalizeSettings, type ViewerSettings } from './settings';

export interface RenderRequest {
  text: string;
  settings?: Partial<ViewerSettings>;
  /** Key declared by the catalogue, when the chart has metadata. */
  key?: string;
  /** Enables clipboard exports and supplies the text before chord simplification. */
  clipboardSource?: string;
}

export interface ChartRenderDiagnostics {
  source: string;
  settings: ViewerSettings;
  keys: { original: string | null; current: string | null; inferred: boolean };
  parserInput: string;
  summary: ReturnType<typeof summarizeParsedTab>;
  parsed: Pick<ParsedTab, 'astVersion' | 'diagnostics' | 'sections'>;
  transposed: Pick<ParsedTab, 'chordsFound' | 'sections'>;
  paired: ReturnType<typeof prepareSongFromParsedTab>['pairedSections'];
  prepared: ReturnType<typeof prepareSongFromParsedTab>['sections'];
}

export interface ChartClipboard {
  currentText(): string;
  diagnostics(): ChartRenderDiagnostics;
}

export interface RenderedChart {
  html: string;
  /** Chords exactly as the person will play them. */
  playedChords: string[];
  sections: number;
  lines: number;
  chordTokens: number;
  diagnostics: number;
  key?: string;
  keyInferred: boolean;
  /** Key the person plays after the transposition. */
  shapeKey?: string;
  parserVersion: string;
  clipboard?: ChartClipboard;
}

function chordTextInCurrentKey(tab: ParsedTab): string {
  return tab.sections.map((section) => section.lines.map((line) => {
    if (line.kind !== 'chords') return line.text;

    let text = '';
    for (const token of line.tokens) {
      if (token.kind === 'SpaceToken' && text.length !== token.startColumn) {
        text += ' '.repeat(Math.max(1, token.endColumn - text.length));
      } else {
        text += token.text;
      }
    }
    return text;
  }).join('\n')).join('\n\n');
}

/** Parses and renders one chart, returning the HTML and its summary. */
export function renderChart(request: RenderRequest): RenderedChart {
  const text = String(request?.text ?? '');
  const settings = normalizeSettings(request?.settings ?? {});
  const parsed = parseTab(text, { hideTablature: settings.hideTablature });
  const summary = summarizeParsedTab(parsed);

  const declaredKey = request?.key ?? inferKey(summary.chordsFound);
  const shapeKey = declaredKey ? transposeChordSymbol(declaredKey, settings.transposeNumber) : undefined;

  const transposed = transposeParsedTab(parsed, settings.transposeNumber);
  const prepared = prepareSongFromParsedTab(transposed, { viewMode: settings.viewMode });
  const html = renderToStaticMarkup(<PreparedTab song={prepared} style={settings} />);
  const playedChords = summary.chordsFound.map((symbol) => transposeChordSymbol(symbol, settings.transposeNumber));
  const source = request?.clipboardSource;
  const clipboard: ChartClipboard | undefined = source === undefined ? undefined : {
    currentText: () => chordTextInCurrentKey(transposed),
    diagnostics: () => ({
      source,
      settings,
      keys: { original: declaredKey ?? null, current: shapeKey ?? null, inferred: request?.key === undefined && declaredKey !== undefined },
      parserInput: text,
      summary,
      parsed: { astVersion: parsed.astVersion, diagnostics: parsed.diagnostics, sections: parsed.sections },
      transposed: { chordsFound: transposed.chordsFound, sections: transposed.sections },
      paired: prepared.pairedSections,
      prepared: prepared.sections,
    }),
  };

  return {
    html,
    playedChords,
    sections: summary.sections,
    lines: summary.lines,
    chordTokens: summary.chordTokens,
    diagnostics: summary.diagnostics,
    ...(declaredKey ? { key: declaredKey } : {}),
    keyInferred: request?.key === undefined && declaredKey !== undefined,
    ...(shapeKey ? { shapeKey } : {}),
    parserVersion: summary.parserVersion,
    ...(clipboard ? { clipboard } : {}),
  };
}

/** Summary of the parsed chart, used by the "Data format" action. */
export function inspectChart(text: string): unknown {
  return summarizeParsedTab(parseTab(String(text ?? '')));
}
