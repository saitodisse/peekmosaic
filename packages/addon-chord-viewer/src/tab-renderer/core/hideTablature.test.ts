import { describe, expect, it } from 'vitest';
import { hideTablature } from './hideTablature';
import { parseTab } from './parseTab';

const ARM = ['E|----8-8-----7-7----------12---------------| ', 'B|-----------------------------12----12-----| ', 'G|-----------------------------------12-----| ', 'D|-0-------0--------------------------------| ', 'A|------------------------------------------| ', 'E|------------------------------------------| '].join('\n');
const VERSE = '[Primeira Parte]\n\n     Em  Em/F#    G\nMeu coração tá batendo\n   Em      Em/F#       G\nComo quem diz não tem jeito';
const visible = (text: string) => hideTablature(text).split('\n').filter((line) => line.trim()).join('\n');

describe('hideTablature', () => {
  it('hides numbered instrument captions inside a tab while retaining the solo progression above its tab title', () => {
    const solo = '[Solo 1] A  E/G#\n         Bm  G  D  D/E  E';
    const source = `${solo}\n\n[Tab - Solo 1]\n\n( Violão 1 )\nParte 1 de 2\n${ARM}\n\n(Violão 2)\nParte 2 de 2\n${ARM}\n\n${VERSE}`;
    expect(visible(source)).toBe(visible(`${solo}\n${VERSE}`));
  });

  it('hides beat counts between diagrams and after the final diagram', () => {
    const count = '   1 . . . 2 . . . 1 . . .';
    const spacedCount = '   2   .   .   .   1   .   .   .   2   .';
    const source = `[Intro]\n${ARM}\n${count}\n\n   F7M(6/9/11+)\n${ARM}\n${spacedCount}\n\n${VERSE}\n\n[Final] F7M(6/9/11+)`;
    expect(visible(source)).toBe(visible(`[Intro]\n${VERSE}\n[Final] F7M(6/9/11+)`));
    expect(parseTab(source).chordsFound).toContain('F7M(6/9/11+)');
  });

  it('hides strumming arrows and tab repeats while preserving verses between separate tab groups', () => {
    const tab = 'E|----7-7-7-|\nD|----------| (2x) \nA|----------|\n   ↓  ↓ ↓ ↑ ↓ ↑';
    const source = `[Tab - Intro]\nParte 1 de 2\n${tab}\n\nParte 2 De 2\n   G/B   D9\n${tab}\n\n${VERSE}\n\n[Tab - Final]\n${tab}`;
    expect(visible(source)).toBe(visible(VERSE));
    expect(parseTab(source, { hideTablature: false }).sections.flatMap(({ lines }) => lines.map(({ text }) => text)).join('\n'))
      .toContain('↓  ↓ ↓ ↑ ↓ ↑');
  });

  it('hides the guitar parts and slides from the reported intro while keeping the verse', () => {
    const source = '[Intro]\n\n(Primeiro Violão)\nE|----4s5--7s9--7--5------------------------| \nB|-------------------5s7--7-7---7s9--9-9----| \nG|------------------------------------------| \nD|------------------------------------------| \nA|------------------------------------------| \nE|------------------------------------------| \n\n(Segundo Violão)\nE|---------12--10--9---9s10--10s12----------| \nB|---9s10-----------------------------------| \nG|------------------------------------------| \nD|------------------------------------------| \nA|------------------------------------------| \nE|------------------------------------------| \n\nA         F#m   D\nPra entender o Ere';
    expect(visible(source)).toBe('[Intro]\nA         F#m   D\nPra entender o Ere');
    expect(parseTab(source).sections.flatMap((section) => section.lines).some((line) => /\|[-0-9]/.test(line.text))).toBe(false);
    expect(parseTab(source, { hideTablature: false }).sections.flatMap((section) => section.lines).some((line) => line.text.includes('4s5'))).toBe(true);
  });
  it('removes the diagram and both preceding complements from the first example', () => {
    expect(visible(`Parte 3 de 3 - variação\n                G         H.N. .     .\n${ARM}\n\n${VERSE}`)).toBe(visible(VERSE));
  });

  it('removes a complete multipart solo but keeps its musical section and surrounding lyrics', () => {
    const before = ' Bm7   Em      Bm7       Em\nBobo, bola, balão, São João\n   C         G\nA gente se ilude dizendo\n    A      C    Em\nJá não há mais coração';
    const solo = `[Solo]\n\n[Tab - Solo - 2x]\n\nParte 1 de 3\n${ARM}\n\nParte 2 de 3\n${ARM}\n\nParte 3 de 3 - variação\n                           H.N..     .\n${ARM}`;
    expect(visible(`${before}\n\n${solo}\n\n${VERSE}`)).toBe(visible(`${before}\n\n[Solo]\n\n${VERSE}`));
  });

  it('removes time markers around tablature and keeps surrounding lyrics', () => {
    const before = 'Hey! Oh, now\n\n[Solo]\nEm Am Em Am D C C Em G D\n\n2:52';
    const after = '3:25\n\nEm\nI said that life must be found';
    const source = `${before}\n${ARM}\n\n3:09\n${ARM}\n\n${ARM}\n\n${after}`;

    expect(visible(source)).toBe('Hey! Oh, now\n[Solo]\nEm\nI said that life must be found');
  });

  it.each(['[Solo]', '[Intro]', '[Primeira Parte]', '(Volta ao início)', 'A morena girando a renda', 'Parte da minha vida', 'H.N. na minha vida', '| C | G |'])('preserves unrelated text: %s', (line) => {
    expect(visible(`${line}\n\n${ARM}`)).toBe(line);
  });

  it('does not remove unaccompanied part and tab captions or chord lines', () => {
    const source = '[Tab - Solo - 2x]\nParte 1 de 3\nG Em\nMeu coração';
    expect(hideTablature(source)).toBe(source);
    expect(hideTablature('(Primeiro Violão)\nMeu coração')).toBe('(Primeiro Violão)\nMeu coração');
  });

  it('keeps indentation and line positions with CRLF input', () => {
    const source = `Parte 1 de 1\n${ARM}\n\n${VERSE}`;
    const result = hideTablature(source.replaceAll('\n', '\r\n'));
    expect(result.split('\n')).toHaveLength(source.split('\n').length);
    expect(result.endsWith(VERSE)).toBe(true);
  });

  it('recognizes bass, lower-case strings and alternate tuning', () => {
    expect(visible('Parte 1 de 1\ng|--2h3---|\nD|--0----|\nA|-------|\nE|-------|')).toBe('');
  });

  it.each(['e|--0h2p0/3\\2~--|', 'F#|--2---4--|', '1|--0---2--|'])('removes a single-string riff: %s', (riff) => {
    expect(visible(`Parte 1 de 1\n${riff}`)).toBe('');
  });

  it('keeps technique text when it is not next to a diagram', () => {
    expect(hideTablature('H.N. . .\nG\nMeu coração')).toBe('H.N. . .\nG\nMeu coração');
  });

  it('defaults to hidden in the parser and restores original text when disabled', () => {
    const source = `[Tab - Solo]\nParte 1 de 1\n  G H.N.\n${ARM}\n\n${VERSE}`;
    const hidden = parseTab(source);
    expect(hidden.body).toBe(source);
    expect(hidden.sections.map((section) => section.title)).toEqual(['Primeira Parte']);
    expect(hidden.diagnostics).toEqual([]);
    const shown = parseTab(source, { hideTablature: false });
    expect(shown.sections[0].title).toBe('Tab - Solo');
    expect(shown.sections.flatMap((section) => section.lines).some((line) => line.text.startsWith('E|'))).toBe(true);
  });
});
