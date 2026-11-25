import { describe, expect, it } from 'vitest';
import { renderChart } from './render-chart';

const CHART = [
  '[Verse]',
  'G        D',
  'Hello    world',
].join('\n');

describe('renderChart', () => {
  it.each(['e', 'o'] as const)('renders chords and barlines in an instrumental intro in layout %s', (viewMode) => {
    const text = [
      '\u200b| C   | C   | Bb F | F   |',
      '\u200b| C   | C   | F    | F   |',
      '',
      '[Chorus]',
      '  C',
      'In this life',
    ].join('\n');
    const rendered = renderChart({ text, settings: { viewMode, transposeNumber: 2 } });
    expect([...rendered.html.matchAll(/data-chord-line-decoration=""/g)]).toHaveLength(10);
    expect(rendered.playedChords).toEqual(['D', 'C', 'G']);
    expect(rendered.html).toContain('Chorus');
  });

  it.each(['e', 'o'] as const)('keeps inline section chords and chord columns around riff references in layout %s', (viewMode) => {
    const chorus = [
      '[Refrão]',
      'A           (Riff 1)',
      '  First lyric',
      '      D              (Riff 2)               A',
      'Second lyric stretches across the chord line',
      '              (Riff 1)',
      'Third lyric',
    ];
    const text = [
      '[Intro] A', '', '[Tab - Riff 1]', '   A', 'E|------9-6----|', '',
      ...chorus, '', '[Solo] A  E  A  D', '       A  E  D  A',
    ].join('\n');
    const expected = [
      '[Intro]', 'A', '',
      ...chorus.filter((line) => line.trim() !== '(Riff 1)')
        .map((line) => line.replace(/\(Riff \d+\)/g, (riff) => ' '.repeat(riff.length))),
      '', '[Solo]', 'A  E  A  D', '       A  E  D  A',
    ].join('\n');
    const settings = { viewMode };

    expect(renderChart({ text, settings })).toEqual(renderChart({ text: expected, settings }));
    const shown = renderChart({ text, settings: { ...settings, hideTablature: false } });
    expect(shown.html).toContain('Tab - Riff 1');
    expect(shown.html).toContain('(Riff 2)');
  });

  it.each(['e', 'o'] as const)('places an instrumental lead-in and vocal entry under the same heading in layout %s', (viewMode) => {
    const text = [
      '[Segunda Parte]',
      '',
      '[Tab - Segunda Parte]',
      '',
      'Parte 7 de 7  (Variação Final)',
      '   D    C    G/B  Am7  h.n.',
      'E|-2----0----3----0----5--------------------|',
      'B|-3----1----3----1----5--------------------|',
      '',
      '( Am7  G/B  C  D )',
      '',
      'Am7',
      '    I wanna know, wanna know',
    ].join('\n');
    const expected = [
      '[Segunda Parte]',
      '( Am7  G/B  C  D )   Am7',
      ' '.repeat('( Am7  G/B  C  D )   '.length) + '    I wanna know, wanna know',
    ].join('\n');
    const settings = { viewMode, transposeNumber: 2 };

    expect(renderChart({ text, settings })).toEqual(renderChart({ text: expected, settings }));
    expect(renderChart({ text, settings: { ...settings, hideTablature: false } }).html)
      .toContain('Tab - Segunda Parte');
    expect(renderChart({ text: text.replace('( Am7  G/B  C  D )', '(Volta ao início)'), settings }).html)
      .toContain('(Volta ao início)');
  });

  it.each(['e', 'o'] as const)('keeps an echoed phrase on the same chord line in layout %s', (viewMode) => {
    const pair = [
      '         Bm7',
      'Is this love, is this love',
      '',
      'Is this love',
      '               Am7',
      "Love that I'm feeling?",
    ].join('\n');
    const text = ['[Refrão]', pair, pair].join('\n');
    const expected = text.replaceAll('love\n\nIs this love', 'love    Is this love');

    expect(renderChart({ text, settings: { viewMode } }))
      .toEqual(renderChart({ text: expected, settings: { viewMode } }));
  });

  it.each(['e', 'o'] as const)('joins an echo with one added word before the next chord in layout %s', (viewMode) => {
    const text = [
      'Bm7',
      'Oh yes, I know, yes I know',
      '',
      'Yes I know now',
      '                Am7',
      "I'm willing and able",
      '   Em',
      'So I throw my cards',
      '         D    C  G/B  Am7',
      'On your table',
    ].join('\n');
    const expected = text.replace('\n\nYes I know now', '    Yes I know now');
    const settings = { viewMode };

    expect(renderChart({ text, settings })).toEqual(renderChart({ text: expected, settings }));
  });

  it.each(['e', 'o'] as const)('joins lyric continuations with four spaces in layout %s', (viewMode) => {
    const lines = [
      '[Primeira Parte]',
      '           F7M',
      'Eu levo essa canção',
      '',
      'De amor dançante',
      '',
      'Prá você lembrar de mim',
      '',
      'Seu coração lembrar de mim',
      '    E7M  Eb7M',
      'Na confusão do dia-a-dia',
      '',
      'No sufoco de uma dúvida',
      '    F7M',
      'Na dor de qualquer coisa',
      '',
      '',
      'É só tocar essa balada',
      '',
      'De swing inabalável',
    ];
    const text = lines.join('\n');
    const expected = [
      ...lines.slice(0, 2),
      'Eu levo essa canção    De amor dançante    Prá você lembrar de mim    Seu coração lembrar de mim',
      lines[9],
      'Na confusão do dia-a-dia    No sufoco de uma dúvida',
      ...lines.slice(13, 17),
      'É só tocar essa balada    De swing inabalável',
    ].join('\n');
    const settings = { viewMode };

    expect(renderChart({ text, settings })).toEqual(renderChart({ text: expected, settings }));
  });

  it.each(['e', 'o'] as const)('renders standalone and consecutive lyrics in layout %s', (viewMode) => {
    const text = 'A7      Dm\nNo babado da saia eu vejo\n\nA morena girando a renda\nOutra linha sem acordes\n                       Bb\nÉ prenda pro seu orixá.\n\n(Volta ao início)';
    const rendered = renderChart({ text, settings: { viewMode } });
    expect(rendered.html).toContain('A morena girando a renda');
    expect(rendered.html).toContain('Outra linha sem acordes');
    expect(rendered.html).toContain('(Volta ao início)');
  });

  it.each(['e', 'o'] as const)('separates untitled blocks in layout %s', (viewMode) => {
    const rendered = renderChart({
      text: '[Intro]\nA9  A7M(9)\n\nA9\nPrimeiro verso\n\nBm7\nSegundo verso',
      settings: { viewMode },
    });
    expect(rendered.sections).toBe(3);
    expect(rendered.html.match(/data-tab-section=/g)).toHaveLength(3);
    expect(rendered.html.match(/<h2/g)).toHaveLength(1);
    expect(rendered.html).toContain('Primeiro');
    expect(rendered.html).toContain('Segundo');
  });

  it('renders the chart with the ported tab component', () => {
    const rendered = renderChart({ text: CHART });
    expect(rendered.html).toContain('data-tab-root');
    expect(rendered.html).toContain('Hello');
    expect(rendered.html).toContain('world');
    expect(rendered.html).toContain('G');
    expect(rendered.html).toContain('D');
    expect(rendered.playedChords).toEqual(['G', 'D']);
    expect(rendered.sections).toBe(1);
    expect(rendered.parserVersion).toBe('2.2.11');
  });

  it('applies the style controls to the rendered markup', () => {
    const rendered = renderChart({
      text: CHART,
      settings: { fontSize: 28, chordColor: '#e67428', backgroundColor: '#ffffff', lyricColor: '#000000' },
    });
    expect(rendered.html).toContain('font-size:28px');
    expect(rendered.html).toContain('#e67428');
    expect(rendered.html).toContain('#ffffff');
  });

  it('transposes the chords that are printed', () => {
    const rendered = renderChart({ text: CHART, settings: { transposeNumber: 2 }, key: 'G' });
    expect(rendered.playedChords).toEqual(['A', 'E']);
    expect(rendered.shapeKey).toBe('A');
    expect(rendered.html).toContain('A');
    expect(rendered.html).not.toContain('>G<');
  });

  it('hides the chords when only the lyrics are requested', () => {
    const withChords = renderChart({ text: CHART, settings: { displayMode: 'both' } });
    const lyricsOnly = renderChart({ text: CHART, settings: { displayMode: 'lyrics' } });
    expect(withChords.html.length).toBeGreaterThan(lyricsOnly.html.length);
    expect(lyricsOnly.html).toContain('Hello');
  });

  it('infers the key from the first chord when the chart has no metadata', () => {
    const rendered = renderChart({ text: CHART });
    expect(rendered.key).toBe('G');
    expect(rendered.keyInferred).toBe(true);
    expect(renderChart({ text: CHART, key: 'C' }).keyInferred).toBe(false);
  });

  it('renders an empty chart without failing', () => {
    const rendered = renderChart({ text: '' });
    expect(rendered.html).toContain('data-tab-root');
    expect(rendered.playedChords).toEqual([]);
  });
});

describe('tablature visibility', () => {
  it.each(['e', 'o'] as const)('hides unlabelled diagrams and their captions in layout %s', (viewMode) => {
    const text = [
      'Intro:',
      '1ª guitarra',
      '|-----(7)----|-------------|----------| ',
      '|------------|-------------|----------| ',
      '',
      '2ª Guitarra',
      '                  Am  D   G',
      '|-----------------5-------7---5----|--5---5---5---5--| ',
      '',
      'riff 1',
      '  Am',
      '|--7--7~~-8--10---10--9--8---| ',
      '  Am                     F',
      'O por do sol     vai renovar',
      '',
      '|--0-----------0--------0---------3-| ',
      '  Am                F/C',
      'E libertar      da areia preta',
    ].join('\n');

    const hidden = renderChart({ text, settings: { viewMode } });
    expect(hidden.html).not.toMatch(/guitarra|riff 1|\|--/i);
    expect(hidden.html).toContain('Intro:');
    expect(hidden.html).toContain('por do sol');
    expect(hidden.html).toContain('libertar');
    expect(hidden.playedChords).toEqual(expect.arrayContaining(['Am', 'F', 'F/C']));
    expect(hidden.playedChords).not.toContain('D');
    expect(hidden.playedChords).not.toContain('G');

    const shown = renderChart({ text, settings: { viewMode, hideTablature: false } });
    expect(shown.html).toContain('1ª guitarra');
    expect(shown.html).toContain('riff 1');
    expect(shown.html).toContain('7--7~~');
  });

  const text = '[Solo]\n[Tab - Solo - 2x]\nParte 1 de 1\n G H.N. .\nE|--0--2h3--|\nB|----------|\n\n[Verse]\nEm\nMeu coração tá batendo';
  it.each(['e', 'o'] as const)('hides tablature and complements in %s layout by default, and can show them', (viewMode) => {
    const hidden = renderChart({ text, settings: { viewMode } });
    expect(hidden.html).toContain('Solo');
    expect(hidden.html).toContain('Meu coração');
    expect(hidden.html).not.toContain('Parte 1 de 1');
    expect(hidden.html).not.toContain('H.N.');
    expect(hidden.html).not.toContain('0--2h3');
    expect(hidden.playedChords).not.toContain('G');
    const shown = renderChart({ text, settings: { viewMode, hideTablature: false } });
    expect(shown.html).toContain('Parte 1 de 1');
    expect(shown.html).toContain('0--2h3');
  });
});
