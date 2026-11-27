import { parseChordSymbol } from './parser/parseChordSymbol';

const STRING_LINE = /^\s*(?:(?:[A-G](?:#|b)?|\d{1,2})\s*\||\|(?=.*[-–—]{2}))[-\d\s|:hpbrts/\\~^().+*=<>x–—]+$/i;
const TAB_TITLE = /^\s*\[Tab(?:\s|\s*-|\]).*\]\s*$/i;
const INSTRUMENT_CAPTION = /^\s*(?:\(\s*(?:(?:primeiro|segundo|terceiro|primeira|segunda|terceira|\d+[ºª]?)\s+)?(?:violão|guitarra|baixo)(?:\s+\d+[ºª]?)?\s*\)|\d+[ºª]\s+(?:violão|guitarra|baixo))\s*$/i;
const RIFF_CAPTION = /^\s*riff\s+\d+\s*$/i;
const PART = /^\s*Parte\s+\d+\s+de\s+\d+(?:\s*(?:[-–—].*|\([^)]*\)))?\s*$/i;
const TECHNIQUES = /^(?:H\.?N\.?|P\.?M\.?|P\.?H\.?|N\.?H\.?|A\.?H\.?|[.·<>~^\-–—])+$/i;
const TIME_MARKER = /^\s*(?:\d{1,2}:)?[0-5]?\d:[0-5]?\d(?:[.,]\d+)?\s*$/;
const BEAT_COUNT = /^\s*\d{1,2}(?:\s+[.·'‘’]+)+(?:\s+\d{1,2}(?:\s+[.·'‘’]+)+)+\s*$/;
const STRUMMING_ARROWS = /^\s*[↑↓](?:\s*[↑↓])*\s*$/;

function isTabMetadata(line: string): boolean {
  return TAB_TITLE.test(line)
    || PART.test(line)
    || INSTRUMENT_CAPTION.test(line)
    || RIFF_CAPTION.test(line)
    || TECHNIQUES.test(line.trim())
    || TIME_MARKER.test(line)
    || BEAT_COUNT.test(line)
    || STRUMMING_ARROWS.test(line);
}

export function isTablatureContent(line: string): boolean {
  return STRING_LINE.test(line) || isTabMetadata(line);
}

function isComplement(line: string): boolean {
  if (isTabMetadata(line)) return true;
  const tokens = line.trim().split(/\s+/);
  return tokens.every((token) => parseChordSymbol(token) !== null || TECHNIQUES.test(token));
}

/** Removes recognized string diagrams and their adjacent captions, never lyric lines. */
export function hideTablature(body: string): string {
  const lines = body.split(/\r?\n/);
  const removed = new Set<number>();
  for (let start = 0; start < lines.length; start++) {
    if (!STRING_LINE.test(lines[start])) continue;
    let end = start;
    while (end < lines.length && STRING_LINE.test(lines[end])) end++;
    for (let index = start; index < end; index++) removed.add(index);
    for (let index = start - 1; index >= 0; index--) {
      if (removed.has(index)) break;
      if (!lines[index].trim()) continue;
      if (!isComplement(lines[index])) break;
      removed.add(index);
      if (TAB_TITLE.test(lines[index])) break;
    }
    for (let index = end; index < lines.length; index++) {
      if (removed.has(index)) break;
      if (!lines[index].trim()) continue;
      if (!isTabMetadata(lines[index])) break;
      removed.add(index);
    }
    start = end - 1;
  }
  // Keep line positions and blank boundaries for diagnostics and section splitting.
  return lines.map((line, index) => removed.has(index) ? '' : line).join('\n');
}
