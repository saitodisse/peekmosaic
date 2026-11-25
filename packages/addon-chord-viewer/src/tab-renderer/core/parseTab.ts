// Ported from @achorde/tab-renderer@0.8.5 (MIT). See PROVENANCE.md.
import { hideTablature, isTablatureContent } from "./hideTablature";
import { collectDiagrammableChords } from "./collectDiagrammableChords";
import {
  logParseDiagnostics,
  logTabRenderer,
  measureTabRenderer,
  summarizeParsedTab,
} from "./observe";
import { parseChordSymbol } from "./parser/parseChordSymbol";
import { isRiffReference, tokenizeRawLine } from "./parser/tokenizeRawLine";
import type {
  ParseDiagnostic,
  ParsedTab,
  ParsedTabLine,
  ParsedTabLineKind,
  ParsedTabSection,
  ParsedTabToken,
} from "./types";

export const TAB_RENDERER_PARSER_VERSION = "2.2.11";
export const TAB_RENDERER_AST_VERSION = "2.2.2";

const SECTION_LABEL_RE = /^\s*\[([^\]]+)\](.*)$/;
const COMMENT_LINE_RE = /^\s*(#|\/\/)/;
const COMMENT_PAREN_RE = /^\s*\([^)]*\)\s*$/;
const TAB_LINE_RE = /^\s*[EADGBe]\|/;
/** Lyric word that looks like a failed chord spelling (C/D/E), not a plain word (Eu). */
function lyricTokenLooksLikeInvalidChord(text: string): boolean {
  if (parseChordSymbol(text) !== null) {
    return false;
  }

  const rootMatch = text.match(/^([A-G])([#b♯♭]?)(.+)$/);
  if (!rootMatch) {
    return false;
  }

  const suffix = rootMatch[3] ?? "";
  if (suffix.length === 0) {
    return false;
  }

  return (
    /[0-9/()+#°º-]/.test(suffix) ||
    /^(?:m|M|maj|min|dim|aug|sus|add)(?![a-z])/i.test(suffix)
  );
}

export const STRICT_LINE_DIAGNOSTIC_CODES = {
  invalidLine: "invalid-line",
  invalidChordToken: "invalid-chord-token",
  chordsAndLyricsOnSameLine: "chords-and-lyrics-on-same-line",
  sectionHeaderWithContent: "section-header-with-content",
} as const;

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

function createSectionId(order: number): string {
  return `section-${order + 1}`;
}

function createLineId(sectionOrder: number, lineOrder: number): string {
  return `section-${sectionOrder + 1}-line-${lineOrder + 1}`;
}

function classifyLine(
  raw: string,
  tokens: ParsedTabToken[],
): ParsedTabLineKind {
  if (raw.trim().length === 0) {
    return "blank";
  }

  const contentTokens = tokens.filter((token) => token.kind !== "SpaceToken");
  const chordCount = contentTokens.filter(
    (token) => token.kind === "ChordToken",
  ).length;
  const lyricCount = contentTokens.filter(
    (token) => token.kind === "LyricToken",
  ).length;

  if (chordCount === 0) {
    return isRiffReference(raw.trim()) ? "chords" : "lyrics";
  }

  if (chordCount > lyricCount) {
    return "chords";
  }

  return "lyrics";
}

function isPureSectionHeaderLine(raw: string): boolean {
  const match = raw.match(SECTION_LABEL_RE);
  if (!match) {
    return false;
  }

  return (match[2] ?? "").replace(/^\s+/, "").length === 0;
}

function sectionHeaderRemainder(raw: string): string {
  const match = raw.match(SECTION_LABEL_RE);
  return (match?.[2] ?? "").replace(/^\s+/, "");
}

function isChordOnly(tokens: ParsedTabToken[]): boolean {
  return tokens.some((token) => token.kind === "ChordToken")
    && !tokens.some((token) => token.kind === "LyricToken");
}

function buildLineDiagnostic(
  raw: string,
  tokens: ParsedTabToken[],
  lineNumber: number,
): ParseDiagnostic | null {
  const contentTokens = tokens.filter((token) => token.kind !== "SpaceToken");

  if (raw.trim().length === 0) {
    return null;
  }

  if (isPureSectionHeaderLine(raw)) {
    return null;
  }

  const sectionRemainder = sectionHeaderRemainder(raw);
  if (SECTION_LABEL_RE.test(raw) && sectionRemainder.length > 0) {
    return {
      code: STRICT_LINE_DIAGNOSTIC_CODES.sectionHeaderWithContent,
      message: `Line ${lineNumber} mixes a section header with other content.`,
      severity: "error",
      line: lineNumber,
      sourceRange: {
        startColumn: 0,
        endColumn: raw.length,
      },
    };
  }

  if (
    COMMENT_LINE_RE.test(raw) ||
    (COMMENT_PAREN_RE.test(raw) && !isChordOnly(contentTokens) && !isRiffReference(raw.trim())) ||
    TAB_LINE_RE.test(raw)
  ) {
    return {
      code: STRICT_LINE_DIAGNOSTIC_CODES.invalidLine,
      message: `Line ${lineNumber} is not a valid strict chord-chart line.`,
      severity: "error",
      line: lineNumber,
      sourceRange: {
        startColumn: 0,
        endColumn: raw.length,
      },
    };
  }

  if (contentTokens.length === 0) {
    return {
      code: STRICT_LINE_DIAGNOSTIC_CODES.invalidLine,
      message: `Line ${lineNumber} is not a valid strict chord-chart line.`,
      severity: "error",
      line: lineNumber,
      sourceRange: {
        startColumn: 0,
        endColumn: raw.length,
      },
    };
  }

  const lyricTokens = contentTokens.filter(
    (token) => token.kind === "LyricToken",
  );

  if (
    lyricTokens.length > 0 &&
    contentTokens.some(
      (token) =>
        token.kind === "LyricToken" &&
        lyricTokenLooksLikeInvalidChord(token.text),
    )
  ) {
    return {
      code: STRICT_LINE_DIAGNOSTIC_CODES.invalidChordToken,
      message: `Line ${lineNumber} contains an invalid chord token.`,
      severity: "error",
      line: lineNumber,
      sourceRange: {
        startColumn: 0,
        endColumn: raw.length,
      },
    };
  }

  return null;
}

function resolveKindForError(
  diagnostic: ParseDiagnostic,
  raw: string,
  tokens: ParsedTabToken[],
): ParsedTabLineKind {
  switch (diagnostic.code) {
    case STRICT_LINE_DIAGNOSTIC_CODES.sectionHeaderWithContent: {
      const remainder = sectionHeaderRemainder(raw);
      const remainderTokens = tokenizeRawLine(remainder);
      return classifyLine(remainder, remainderTokens);
    }
    case STRICT_LINE_DIAGNOSTIC_CODES.invalidChordToken:
      return "chords";
    case STRICT_LINE_DIAGNOSTIC_CODES.invalidLine:
      return "lyrics";
    default:
      return classifyLine(raw, tokens);
  }
}

function resolveLineKind(
  raw: string,
  tokens: ParsedTabToken[],
  diagnostic: ParseDiagnostic | null,
): ParsedTabLineKind {
  if (isPureSectionHeaderLine(raw)) {
    return "section-header";
  }

  if (diagnostic) {
    return resolveKindForError(diagnostic, raw, tokens);
  }

  return classifyLine(raw, tokens);
}

function isRiffToken(token: ParsedTabToken): boolean {
  return token.kind === "DecorationToken" && isRiffReference(token.text);
}

function pushLine(
  section: ParsedTabSection,
  rawLine: string,
  lineNumber: number,
  diagnostics: ParseDiagnostic[],
  hideRiffReferences = false,
): void {
  const lineOrder = section.lines.length;
  let tokens = isPureSectionHeaderLine(rawLine)
    ? []
    : tokenizeRawLine(rawLine);
  if (hideRiffReferences && tokens.some(isRiffToken) && !tokens.some((token) => token.kind === "LyricToken")) {
    rawLine = tokens.map((token) => isRiffToken(token) ? " ".repeat(token.text.length) : token.text).join("");
    if (!rawLine.trim()) return;
    tokens = tokenizeRawLine(rawLine);
  }
  const diagnostic = buildLineDiagnostic(rawLine, tokens, lineNumber);
  const kind = resolveLineKind(rawLine, tokens, diagnostic);
  const line: ParsedTabLine = {
    id: createLineId(section.order, lineOrder),
    order: lineOrder,
    text: rawLine,
    kind,
    tokens,
  };

  if (diagnostic) {
    diagnostics.push(diagnostic);
  }

  section.lines.push(line);
}

function canJoinLyricLine(raw: string): boolean {
  return !SECTION_LABEL_RE.test(raw)
    && !COMMENT_LINE_RE.test(raw)
    && !COMMENT_PAREN_RE.test(raw)
    && !isTablatureContent(raw);
}

function appendLyricContinuation(lyric: ParsedTabLine | undefined, next: string | undefined, lineNumber: number): boolean {
  if (lyric?.kind !== "lyrics" || !next?.trim()) return false;
  if (!canJoinLyricLine(lyric.text) || !canJoinLyricLine(next)) return false;

  const tokens = tokenizeRawLine(next);
  if (classifyLine(next, tokens) !== "lyrics" || buildLineDiagnostic(next, tokens, lineNumber)) return false;

  lyric.text = `${lyric.text.trimEnd()}    ${next.trim()}`;
  lyric.tokens = tokenizeRawLine(lyric.text);
  return true;
}

function joinInstrumentalEntry(lines: string[], index: number) {
  const instrumental = lines[index].trim();
  if (!instrumental.startsWith("(") || !instrumental.endsWith(")")) return;

  if (!isChordOnly(tokenizeRawLine(instrumental))) return;

  const entryIndex = lines[index + 1]?.trim() === "" ? index + 2 : index + 1;
  const entry = lines[entryIndex];
  const lyrics = lines[entryIndex + 1];
  if (!entry?.trim() || !lyrics?.trim() || SECTION_LABEL_RE.test(lyrics)) return;
  if (!tokenizeRawLine(entry).every((token) => token.kind === "ChordToken" || token.kind === "SpaceToken")) return;

  const lyricTokens = tokenizeRawLine(lyrics);
  if (classifyLine(lyrics, lyricTokens) !== "lyrics" || buildLineDiagnostic(lyrics, lyricTokens, entryIndex + 2)) return;

  const prefix = `${instrumental}   `;
  return {
    chords: prefix + entry.trimEnd(),
    lyrics: " ".repeat(prefix.length) + lyrics,
    lyricIndex: entryIndex + 1,
  };
}

function parseTabInternal(body: string, hideTabs: boolean): ParsedTab {
  const diagnostics: ParseDiagnostic[] = [];
  const sections: ParsedTabSection[] = [];
  const normalized = body.replace(/\r\n?/g, '\n').replace(/^\u200b+/gm, '');
  const rawLines = (hideTabs ? hideTablature(normalized) : normalized).split('\n');

  let currentSection: ParsedTabSection | null = null;

  const ensureCurrentSection = (): ParsedTabSection => {
    if (currentSection) {
      return currentSection;
    }

    currentSection = {
      id: createSectionId(sections.length),
      order: sections.length,
      title: null,
      originalTitle: null,
      lines: [],
    };
    return currentSection;
  };

  const finalizeCurrentSection = (): void => {
    if (!currentSection) {
      return;
    }

    if (currentSection.lines.length > 0 || currentSection.title !== null) {
      sections.push(currentSection);
    }

    currentSection = null;
  };

  for (let rawIndex = 0; rawIndex < rawLines.length; rawIndex++) {
    const rawLine = rawLines[rawIndex];
    const labelMatch = rawLine.match(SECTION_LABEL_RE);

    if (labelMatch) {
      const originalTitle = normalizeLabel(labelMatch[1] ?? "");

      finalizeCurrentSection();
      currentSection = {
        id: createSectionId(sections.length),
        order: sections.length,
        title: originalTitle,
        originalTitle,
        lines: [],
      };

      const remainder = sectionHeaderRemainder(rawLine);
      if (isChordOnly(tokenizeRawLine(remainder))) {
        const titleEnd = rawLine.length - labelMatch[2].length;
        pushLine(currentSection, rawLine.slice(0, titleEnd), rawIndex + 1, diagnostics);
        pushLine(currentSection, remainder, rawIndex + 1, diagnostics, hideTabs);
      } else {
        pushLine(currentSection, rawLine, rawIndex + 1, diagnostics);
      }
      continue;
    }

    if (rawLine.trim().length === 0) {
      if (appendLyricContinuation(currentSection?.lines.at(-1), rawLines[rawIndex + 1], rawIndex + 2)) {
        rawIndex += 1;
        continue;
      }
      if (currentSection?.lines.some((line) => line.kind !== "section-header")) {
        finalizeCurrentSection();
      }
      continue;
    }

    const section = ensureCurrentSection();
    const joined = joinInstrumentalEntry(rawLines, rawIndex);
    if (joined) {
      pushLine(section, joined.chords, rawIndex + 1, diagnostics);
      pushLine(section, joined.lyrics, joined.lyricIndex + 1, diagnostics);
      rawIndex = joined.lyricIndex;
      continue;
    }
    pushLine(section, rawLine, rawIndex + 1, diagnostics, hideTabs);
  }

  finalizeCurrentSection();

  const parsed: ParsedTab = {
    body,
    sections,
    diagnostics,
    parserVersion: TAB_RENDERER_PARSER_VERSION,
    astVersion: TAB_RENDERER_AST_VERSION,
    chordsFound: [],
  };

  return {
    ...parsed,
    chordsFound: collectDiagrammableChords(parsed),
  };
}

const shouldObserveParseTab =
  typeof import.meta !== "undefined" &&
  import.meta.env?.DEV === true &&
  import.meta.env?.VITEST !== "true";

export function parseTab(body: string, options: { hideTablature?: boolean } = {}): ParsedTab {
  if (!shouldObserveParseTab) {
    return parseTabInternal(body, options.hideTablature ?? true);
  }

  return measureTabRenderer(
    "parseTab",
    () => {
      const parsed = parseTabInternal(body, options.hideTablature ?? true);
      logTabRenderer("parseTab:summary", summarizeParsedTab(parsed));
      logParseDiagnostics(parsed.diagnostics);
      return parsed;
    },
    { lineCount: body.split(/\r?\n/).length },
  );
}
