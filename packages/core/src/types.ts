/** A run of consecutive tokens that were all kept, all added, or all removed. */
export interface Change {
  /** Concatenated token text. For unchanged runs this is taken from the NEW text. */
  value: string;
  added: boolean;
  removed: boolean;
  /** Number of tokens in the run. */
  count: number;
}

export type TextMode = 'chars' | 'words' | 'wordsWithSpace' | 'lines' | 'sentences';

/** The only options passed through to jsdiff (see SPEC.md "Options"). */
export interface DiffOptions {
  /** All modes. */
  ignoreCase?: boolean;
  /** lines only: trim leading/trailing whitespace before comparing lines. */
  ignoreWhitespace?: boolean;
  /** lines only: newline characters become their own tokens. */
  newlineIsToken?: boolean;
  /** lines only: replace every "\r\n" with "\n" before tokenizing. */
  stripTrailingCr?: boolean;
  /** All modes: give up past this edit distance and return a whole replacement. */
  maxEditLength?: number;
}

export interface LineOptions {
  ignoreCase?: boolean;
  ignoreWhitespace?: boolean;
  stripTrailingCr?: boolean;
  /** Unchanged lines kept around each change. Default 3. */
  contextLines?: number;
  /** Detect moved blocks (SPEC section 19). Default false. */
  detectMoves?: boolean;
  /** Minimum lines in a moved block. Default 1. */
  minMoveLines?: number;
  /** Near-match threshold for moved lines, in (0, 1). Default 1 (exact normalized matches only). */
  moveSimilarity?: number;
}

export type LineRowType = 'equal' | 'added' | 'removed' | 'moved-from' | 'moved-to';

export interface LineRow {
  type: LineRowType;
  /** 1-based old line number (equal, removed and moved-from rows). */
  oldNo?: number;
  /** 1-based new line number (equal, added and moved-to rows). */
  newNo?: number;
  /** Line content without its line terminator. Equal rows carry the NEW text. */
  text: string;
  /** Moved rows only: the move id (0-based, ordered by position in the new text). */
  move?: number;
  /** Moved rows only: the line number of the matching row on the other side. */
  counterpart?: number;
}

/** A detected moved block (SPEC section 19). */
export interface MoveBlock {
  id: number;
  /** 1-based old line number of the first moved-from line. */
  oldStart: number;
  /** 1-based new line number of the first moved-to line. */
  newStart: number;
  lines: number;
}

export interface VisibleHunk {
  type: 'hunk';
  /** 1-based old line number of the hunk start (old lines before the hunk + 1). */
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  rows: LineRow[];
}

export interface CollapsedHunk {
  type: 'collapsed';
  /** Number of hidden unchanged lines (>= 1). */
  count: number;
  /** 1-based old/new line numbers of the first hidden line. */
  oldStart: number;
  newStart: number;
  /** The hidden rows, so interactive renderers can expand them. */
  rows: LineRow[];
}

export type Hunk = VisibleHunk | CollapsedHunk;

/** One side of a split row. */
export interface SplitCell {
  type: LineRowType;
  lineNo: number;
  text: string;
  /** Moved cells only. */
  move?: number;
  counterpart?: number;
  /**
   * Intra-line word diff for paired modified rows. Left cells hold equal+removed
   * parts, right cells hold equal+added parts. Absent when not computed.
   */
  parts?: Change[];
}

export interface SplitRow {
  type: 'equal' | 'modified' | 'removed' | 'added' | 'moved-from' | 'moved-to';
  left?: SplitCell;
  right?: SplitCell;
}

export interface VisibleSplitHunk {
  type: 'hunk';
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  rows: SplitRow[];
}

export type SplitHunk = VisibleSplitHunk | CollapsedHunk;

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
  unit: 'codepoints' | 'lines';
}

export interface HtmlDiffOptions {
  /** When set, texts less similar than this are shown as a full replacement. */
  similarityThreshold?: number | null;
  /** Strip inline formatting tags before diffing. Default true. */
  ignoreFormattingTags?: boolean;
  /** Absorb unchanged text runs shorter than this share of the changes around them. Default 0.3. */
  orphanMatchThreshold?: number;
  /** Compare text case-insensitively (the new document's spelling is shown). */
  ignoreCase?: boolean;
  /** Past this edit distance (in tokens), the whole documents are one replacement. */
  maxEditLength?: number;
}

export interface HtmlDiffResult {
  /** Inner HTML (without the `.text-diff` container). */
  html: string;
  fullReplacement: boolean;
  /** Present when similarityThreshold was given and both inputs were non-empty. */
  similarity?: number;
}

/** Options for renderers that can emit element ids (SPEC section 18). */
export interface RenderOptions {
  /** Prefix for every emitted id. Default "td". */
  idPrefix?: string;
  /** Put id="{idPrefix}-change-N" on every element that carries data-change-index="N". Default false. */
  anchors?: boolean;
}
