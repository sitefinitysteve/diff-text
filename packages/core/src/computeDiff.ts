import {
  characterDiff,
  diffChars,
  diffLines,
  diffSentences,
  diffWords,
  diffWordsWithSpace,
  lineDiff,
  sentenceDiff,
  wordDiff,
  wordsWithSpaceDiff,
} from 'diff';
import type { Change, DiffOptions, TextMode } from './types';

export const TEXT_MODES: readonly TextMode[] = ['chars', 'words', 'wordsWithSpace', 'lines', 'sentences'];

// A high surrogate not followed by a low one, or a low surrogate not preceded by a high one.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Replace every lone surrogate with U+FFFD (SPEC section 1), like String.prototype.toWellFormed().
 * A JS string may hold them; they are not code points, so every entry point scrubs its input first
 * (the PHP port does the same for invalid UTF-8).
 */
export function wellFormed(text: string): string {
  return text.replace(LONE_SURROGATE, '\uFFFD');
}

/** Keep only the options SPEC.md allows for the mode. */
export function pickOptions(mode: TextMode, options: DiffOptions = {}): DiffOptions {
  const out: DiffOptions = {};
  if (options.ignoreCase) out.ignoreCase = true;
  if (typeof options.maxEditLength === 'number' && options.maxEditLength >= 0) {
    out.maxEditLength = Math.floor(options.maxEditLength);
  }
  if (mode === 'lines') {
    if (options.ignoreWhitespace) out.ignoreWhitespace = true;
    if (options.newlineIsToken) out.newlineIsToken = true;
    if (options.stripTrailingCr) out.stripTrailingCr = true;
  }
  return out;
}

type Tokenizer = { tokenize(v: string, o: object): string[]; removeEmpty(a: string[]): string[] };

const tokenizers: Record<TextMode, Tokenizer> = {
  chars: characterDiff as unknown as Tokenizer,
  words: wordDiff as unknown as Tokenizer,
  wordsWithSpace: wordsWithSpaceDiff as unknown as Tokenizer,
  lines: lineDiff as unknown as Tokenizer,
  sentences: sentenceDiff as unknown as Tokenizer,
};

/** Non-empty tokens of a string under a mode's tokenizer (SPEC section 5). */
export function tokenize(mode: TextMode, text: string, options: DiffOptions = {}): string[] {
  const t = tokenizers[mode];
  return t.removeEmpty(t.tokenize(wellFormed(text), pickOptions(mode, options)));
}

/** Token count of a string under a mode's tokenizer (after dropping empty tokens). */
export function tokenCount(mode: TextMode, text: string, options: DiffOptions = {}): number {
  return tokenize(mode, text, options).length;
}

function run(mode: TextMode, a: string, b: string, o: DiffOptions): Change[] | undefined {
  // jsdiff's overloads don't accept a plain options object type-safely; results are Change[] or undefined.
  const opts = o as Record<string, unknown>;
  switch (mode) {
    case 'chars':
      return diffChars(a, b, opts as never) as Change[] | undefined;
    case 'words':
      return diffWords(a, b, opts as never) as Change[] | undefined;
    case 'wordsWithSpace':
      return diffWordsWithSpace(a, b, opts as never) as Change[] | undefined;
    case 'lines':
      return diffLines(a, b, opts as never) as Change[] | undefined;
    case 'sentences':
      return diffSentences(a, b, opts as never) as Change[] | undefined;
  }
}

/**
 * Drop empty-valued changes and merge neighbours of the same kind.
 * (diffWords' whitespace post-processing can, in rare cases, empty a change.)
 */
export function cleanChanges(changes: Change[]): Change[] {
  const out: Change[] = [];
  for (const c of changes) {
    if (c.value === '') continue;
    const last = out[out.length - 1];
    if (last && last.added === c.added && last.removed === c.removed) {
      last.value += c.value;
      last.count += c.count;
    } else {
      out.push({ value: c.value, added: c.added, removed: c.removed, count: c.count });
    }
  }
  return out;
}

/**
 * Diff two strings with jsdiff v8 semantics.
 * Returns plain {value, added, removed, count} objects with no empty values.
 * Lone surrogates in the inputs are replaced with U+FFFD first (see wellFormed).
 * If maxEditLength is exceeded, returns a whole replacement: removed(old) then added(new).
 */
export function computeDiff(mode: TextMode, oldText: string, newText: string, options: DiffOptions = {}): Change[] {
  oldText = wellFormed(oldText);
  newText = wellFormed(newText);
  const o = pickOptions(mode, options);
  const result = run(mode, oldText, newText, o);
  if (result === undefined) {
    const out: Change[] = [];
    if (oldText !== '') out.push({ value: oldText, added: false, removed: true, count: tokenCount(mode, oldText, o) });
    if (newText !== '') out.push({ value: newText, added: true, removed: false, count: tokenCount(mode, newText, o) });
    return out;
  }
  return cleanChanges(result);
}
