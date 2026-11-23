const artist = { slug: 'test-artist', name: 'Test Artist' };
const base = { artist, key: 'G', difficulty: 1, updatedAt: '2026-01-01', visits: 1 };

export const TEST_CHARTS = [
  { ...base, id: 'chart-a', title: 'Alpha', chords: ['D/F#'], text: '[Intro]\nD/F#\nFirst line' },
  { ...base, id: 'chart-b', title: 'Chart B', chords: ['Bb7M'], text: '[Intro]\nBb7M', difficulty: 3 },
  { ...base, id: 'chart-c', title: 'Chart C', tags: ['waltz'], text: '[Verse]\nAlpha', updatedAt: '2026-01-02', visits: 20 },
];
