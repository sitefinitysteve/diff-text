import { FORMATTING_ELEMENTS, lexHtml } from './htmlLexer';

/**
 * Normalize curly/smart quotes to their straight equivalents.
 *
 *  - U+201C U+201D U+201E (double) -> "
 *  - U+2018 U+2019 U+201A (single) -> '
 */
export function normalizeQuotes(text: string): string {
  return text.replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'");
}

/**
 * Strip inline formatting tags while preserving everything else byte for byte (SPEC 12.1).
 * Removes opening, closing and self-closing <strong>, <em>, <b>, <i>, <u>, <s>, <mark>, <sub>,
 * <sup> tags (any attributes, any case) as recognised by the HTML lexer: a `>` inside a quoted
 * attribute value does not end the tag, and comments, CDATA and raw text elements (script,
 * style, ...) are left untouched.
 */
export function stripFormattingTags(text: string): string {
  let out = '';
  for (const seg of lexHtml(text)) {
    if ((seg.kind === 'open' || seg.kind === 'close' || seg.kind === 'void') && FORMATTING_ELEMENTS.has(seg.name)) continue;
    out += seg.raw;
  }
  return out;
}

/** Number of Unicode code points in a string. */
export function codePointLength(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}
