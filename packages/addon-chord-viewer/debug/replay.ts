import { simplifyChartText } from '../src/chart-transform';
import { renderChart } from '../src/render-chart';
import { normalizeSettings, type ViewerSettings } from '../src/settings';

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function readDebugReport(json: string) {
  const report = record(JSON.parse(json));
  const original = string(report?.original);
  if (report?.schemaVersion !== 1 || original === undefined) {
    throw new Error('Use um diagnóstico do PeekMosaic com schemaVersion 1 e o texto original da cifra.');
  }
  const diagnostics = record(report.diagnostics);
  const keys = record(diagnostics?.keys);
  const rendered = record(report.rendered);

  return {
    title: string(record(report.chart)?.title),
    original,
    source: string(diagnostics?.source) ?? original,
    key: keys?.inferred === false ? string(keys.original) ?? '' : '',
    settings: normalizeSettings(diagnostics?.settings),
    capturedText: string(rendered?.text),
    capturedHtml: string(rendered?.html),
  };
}

export function replayChart(source: string, settings: ViewerSettings, key: string) {
  const rendered = renderChart({
    text: settings.simplifyChords ? simplifyChartText(source) : source,
    clipboardSource: source,
    settings,
    key: key.trim() || undefined,
  });
  return {
    html: rendered.html,
    text: rendered.clipboard!.currentText(),
    steps: rendered.clipboard!.diagnostics(),
  };
}
