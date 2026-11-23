import { describe, expect, it } from 'vitest';
import { TEST_CHARTS } from './fixtures/chart-records.js';
import { chartSections, findChart, listCatalog, normalizeText, paginate, resolveLimit, searchCharts } from './catalog.js';

describe('normalizeText', () => {
  it('folds accents, case, and repeated spaces', () => {
    expect(normalizeText('  Can\u00e7\u00e3o   do Farol ')).toBe('cancao do farol');
  });

  it('accepts an empty value', () => {
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('chartSections', () => {
  it('reads the section titles in order and ignores other brackets', () => {
    const text = '[Intro]\nG  D\n\n[Chorus]\nC  G\n[not a section\n';
    expect(chartSections(text)).toEqual([
      { title: 'Intro', line: 0 },
      { title: 'Chorus', line: 3 },
    ]);
  });
});

describe('searchCharts', () => {
  it('ranks a title match above a lyric match', () => {
    const results = searchCharts(TEST_CHARTS, 'alpha');
    expect(results[0]?.id).toBe('chart-a');
  });

  it('finds a chart by artist', () => {
    const ids = searchCharts(TEST_CHARTS, 'test artist').map((chart) => chart.id);
    expect(ids).toContain('chart-c');
    expect(ids).toContain('chart-a');
  });

  it('finds a chart by chord symbol', () => {
    const ids = searchCharts(TEST_CHARTS, 'bb7m').map((chart) => chart.id);
    expect(ids).toEqual(['chart-b']);
  });

  it('finds a chart by key and by tag', () => {
    expect(searchCharts(TEST_CHARTS, 'bb').map((chart) => chart.id)).toContain('chart-b');
    expect(searchCharts(TEST_CHARTS, 'waltz').map((chart) => chart.id)).toContain('chart-c');
  });

  it('requires every term to match somewhere', () => {
    expect(searchCharts(TEST_CHARTS, 'chart zzz')).toEqual([]);
  });

  it('returns nothing without a query', () => {
    expect(searchCharts(TEST_CHARTS, '   ')).toEqual([]);
  });

  it('is deterministic for the same query', () => {
    expect(searchCharts(TEST_CHARTS, 'g').map((chart) => chart.id))
      .toEqual(searchCharts(TEST_CHARTS, 'g').map((chart) => chart.id));
  });
});

describe('listCatalog', () => {
  it('sorts by update date for the recent view', () => {
    const ids = listCatalog(TEST_CHARTS, 'recent').map((chart) => chart.id);
    expect(ids[0]).toBe('chart-c');
  });

  it('sorts by visits for the popular view', () => {
    const ids = listCatalog(TEST_CHARTS, 'popular').map((chart) => chart.id);
    expect(ids[0]).toBe('chart-c');
  });

  it('keeps only easy charts in the beginner view', () => {
    const charts = listCatalog(TEST_CHARTS, 'beginner');
    expect(charts.length).toBeGreaterThan(0);
    expect(charts.every((chart) => chart.difficulty <= 2)).toBe(true);
  });

  it('sorts alphabetically', () => {
    const titles = listCatalog(TEST_CHARTS, 'alphabetical').map((chart) => chart.title);
    expect(titles).toEqual([...titles].sort((left, right) => left.localeCompare(right)));
  });

  it('returns nothing for an unknown view', () => {
    expect(listCatalog(TEST_CHARTS, 'nope')).toEqual([]);
  });
});

describe('paginate', () => {
  it('slices the requested page and reports the next cursor', () => {
    const page = paginate([1, 2, 3, 4, 5], { limit: 2 });
    expect(page.items).toEqual([1, 2]);
    expect(page.pagination).toEqual({ limit: 2, total: 5, next: '2' });
  });

  it('omits the cursor on the last page', () => {
    const page = paginate([1, 2, 3], { limit: 2, cursor: '2' });
    expect(page.items).toEqual([3]);
    expect(page.pagination.next).toBeUndefined();
  });

  it('falls back to the default size and ignores a broken cursor', () => {
    expect(resolveLimit(undefined)).toBe(10);
    expect(resolveLimit(0)).toBe(10);
    expect(resolveLimit(9999)).toBe(500);
    expect(paginate([1, 2, 3], { cursor: 'abc' }).items).toEqual([1, 2, 3]);
  });
});

describe('findChart', () => {
  it('finds a chart by identifier and returns undefined otherwise', () => {
    expect(findChart(TEST_CHARTS, 'chart-a')?.title).toBe('Alpha');
    expect(findChart(TEST_CHARTS, 'missing')).toBeUndefined();
  });
});
