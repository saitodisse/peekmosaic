// Ported from @achorde/tab-renderer@0.8.5 (MIT). See PROVENANCE.md.
import { tokenizeContentWord } from "./tokenizeContentWord";
import type { ParsedTabToken } from "../types";

const RIFF_REFERENCE = /\([ \t]*riff[ \t]+\d+[ \t]*\)/i;
const TOKEN_PATTERN = new RegExp(`${RIFF_REFERENCE.source}|\\s+|[^\\s]+`, "gi");

export function isRiffReference(text: string): boolean {
  return text.match(RIFF_REFERENCE)?.[0] === text;
}

export function tokenizeRawLine(raw: string): ParsedTabToken[] {
  if (raw.trim().length === 0) {
    return [];
  }

  const tokens: ParsedTabToken[] = [];

  for (const match of raw.matchAll(TOKEN_PATTERN)) {
    const text = match[0] ?? "";
    const startColumn = match.index ?? 0;
    const endColumn = startColumn + text.length;

    if (/^\s+$/.test(text)) {
      tokens.push({
        kind: "SpaceToken",
        text,
        startColumn,
        endColumn,
      });
      continue;
    }

    if (isRiffReference(text)) {
      tokens.push({ kind: "DecorationToken", text, startColumn, endColumn });
    } else {
      tokens.push(...tokenizeContentWord(text, startColumn));
    }
  }

  return tokens;
}
