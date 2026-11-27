import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { readDebugReport, replayChart } from './replay';

describe('Tab Renderer debug replay', () => {
  it('replays the active draft and settings while retaining the original and captured HTML', () => {
    const original = 'B   D/F#\r\nUma frase\r\n';
    const draft = 'B7  D/F#\nUma frase editada';
    const settings = { ...DEFAULT_SETTINGS, simplifyChords: true, transposeNumber: 1, viewMode: 'o' as const };
    const before = replayChart(draft, settings, 'B');
    const restored = readDebugReport(JSON.stringify({
      schemaVersion: 1,
      original,
      rendered: { html: before.html, text: before.text },
      diagnostics: before.steps,
    }));

    const after = replayChart(restored.source, restored.settings, restored.key);
    expect(restored.original).toBe(original);
    expect(restored.source).toBe(draft);
    expect(after.html).toBe(restored.capturedHtml);
    expect(after.text).toBe('C  Eb/G\nUma frase editada');
    expect(after.steps.parserInput).toBe('B  D/F#\nUma frase editada');
    expect(after.steps.keys).toEqual({ original: 'B', current: 'C', inferred: false });
    expect(after.steps.paired[0].lines?.[0].chordLineMarkers).toEqual(expect.arrayContaining([
      expect.objectContaining({ simpleChord: expect.objectContaining({ original: 'Eb/G' }) }),
    ]));
  });

  it('accepts the original as a fallback, preserving automatic key inference', () => {
    const input = readDebugReport(JSON.stringify({
      schemaVersion: 1,
      original: 'C  G\nUma frase',
      rendered: { html: '<img src=x onerror=alert(1)>' },
      diagnostics: { keys: { original: 'C', inferred: true } },
    }));
    expect(input.key).toBe('');
    const output = replayChart(input.source, input.settings, input.key);
    expect(output.steps.keys.inferred).toBe(true);
    expect(output.html).not.toContain('onerror');
  });

  it('rejects missing original source and unknown formats', () => {
    expect(() => readDebugReport('{ "schemaVersion": 1 }')).toThrow('texto original');
    expect(() => readDebugReport('{ "schemaVersion": 2, "original": "C" }')).toThrow('schemaVersion 1');
  });
});
