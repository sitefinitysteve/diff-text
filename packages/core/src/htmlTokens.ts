/**
 * Tokens and equality keys for the tag-aware HTML diff (SPEC section 12.2, "Tokens" and "Keys").
 * The PHP port (HtmlTokenizer.php) implements the same rules.
 */
import { FORMATTING_ELEMENTS, lexHtml } from './htmlLexer';
import { namedEntity } from './htmlEntities';
import { normalizeQuotes } from './normalize';

export type TokenKind = 'open' | 'close' | 'void' | 'raw' | 'opaque' | 'text' | 'space';

export interface HtmlToken {
  kind: TokenKind;
  /** Output form: the source text (a stray `<` in text becomes `&lt;`; an unterminated raw text element gets its end tag). */
  raw: string;
  /** Tag name (open, close, void, raw), ASCII-lowercased; '' otherwise. */
  name: string;
  /** Equality key. */
  key: string;
  /** text tokens: number of code points of the decoded text (orphan grouping); 0 otherwise. */
  len: number;
}

export interface TokenizeOptions {
  ignoreCase?: boolean;
  ignoreFormattingTags?: boolean;
}

/** Replace lone UTF-16 surrogates with U+FFFD (the JS counterpart of PHP's invalid UTF-8 scrub). */
export function scrubUnicode(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
}

// ---------------------------------------------------------------------------
// Code point classes
// ---------------------------------------------------------------------------

const WS = 1;
const WORD = 2;
const EXT = 3;
const ZWJ = 4;
const RI = 5;
const OTHER = 0;

/** Sorted, non-overlapping [first, last, class] ranges; every other code point is OTHER. */
// prettier-ignore
const RANGES: readonly number[] = [
  0x09, 0x0d, WS, 0x20, 0x20, WS, 0x30, 0x39, WORD, 0x41, 0x5a, WORD, 0x5f, 0x5f, WORD, 0x61, 0x7a, WORD,
  0xa0, 0xa0, WS, 0xaa, 0xaa, WORD, 0xad, 0xad, WORD, 0xb5, 0xb5, WORD, 0xba, 0xba, WORD,
  0xc0, 0xd6, WORD, 0xd8, 0xf6, WORD, 0xf8, 0x2ff, WORD, 0x300, 0x36f, EXT,
  0x370, 0x374, WORD, 0x376, 0x37d, WORD, 0x37f, 0x383, WORD, 0x386, 0x386, WORD, 0x388, 0x481, WORD,
  0x483, 0x489, EXT, 0x48a, 0x52f, WORD, 0x531, 0x556, WORD, 0x561, 0x587, WORD, 0x5d0, 0x5ea, WORD,
  0x620, 0x64a, WORD, 0x660, 0x669, WORD, 0x66e, 0x6d3, WORD, 0x1680, 0x1680, WS, 0x1ab0, 0x1aff, EXT,
  0x1dc0, 0x1dff, EXT, 0x1e00, 0x1fff, WORD, 0x2000, 0x200a, WS, 0x200d, 0x200d, ZWJ, 0x2028, 0x2029, WS,
  0x202f, 0x202f, WS, 0x205f, 0x205f, WS, 0x20d0, 0x20ff, EXT, 0x3000, 0x3000, WS, 0xfe00, 0xfe0f, EXT,
  0xfe20, 0xfe2f, EXT, 0xfeff, 0xfeff, WS, 0x1f1e6, 0x1f1ff, RI, 0x1f3fb, 0x1f3ff, EXT,
  0xe0020, 0xe007f, EXT, 0xe0100, 0xe01ef, EXT,
];

function classOf(cp: number): number {
  let lo = 0;
  let hi = RANGES.length / 3 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < RANGES[mid * 3]!) hi = mid - 1;
    else if (cp > RANGES[mid * 3 + 1]!) lo = mid + 1;
    else return RANGES[mid * 3 + 2]!;
  }
  return OTHER;
}

// ---------------------------------------------------------------------------
// Text runs: units (one decoded code point each) and text/space tokens
// ---------------------------------------------------------------------------

const ENTITY = /&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/y;

function numericEntity(digits: string, radix: number): string {
  const d = digits.replace(/^0+/, '');
  if (d.length > 8) return '�';
  const v = d === '' ? 0 : parseInt(d, radix);
  if (v === 0 || v > 0x10ffff || (v >= 0xd800 && v <= 0xdfff)) return '�';
  return String.fromCodePoint(v);
}

interface Unit {
  raw: string;
  cp: number;
  ch: string;
}

function units(text: string): Unit[] {
  const out: Unit[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '&') {
      ENTITY.lastIndex = i;
      const m = ENTITY.exec(text);
      if (m) {
        const ch = m[1] !== undefined ? numericEntity(m[1], 10) : m[2] !== undefined ? numericEntity(m[2], 16) : namedEntity(m[3]!);
        if (ch !== undefined) {
          out.push({ raw: m[0], cp: ch.codePointAt(0)!, ch });
          i += m[0].length;
          continue;
        }
      }
    }
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    out.push({ raw: c === '<' ? '&lt;' : ch, cp, ch });
    i += ch.length;
  }
  return out;
}

/** Decode the entities of a text run exactly as the tokenizer does (unknown names stay literal). */
export function decodeHtmlText(text: string): string {
  return units(text)
    .map((u) => u.ch)
    .join('');
}

interface TextPiece {
  space: boolean;
  raw: string;
  decoded: string;
  len: number;
}

function textPieces(text: string): TextPiece[] {
  const u = units(text);
  const cls = u.map((x) => classOf(x.cp));
  const out: TextPiece[] = [];
  const n = u.length;
  let i = 0;
  while (i < n) {
    let j: number;
    const c = cls[i]!;
    if (c === WS) {
      j = i + 1;
      while (j < n && cls[j] === WS) j++;
    } else {
      if (c === WORD) {
        j = i + 1;
        while (j < n && (cls[j] === WORD || cls[j] === EXT)) j++;
      } else if (c === RI && i + 1 < n && cls[i + 1] === RI) {
        j = i + 2;
      } else {
        j = i + 1;
      }
      for (;;) {
        if (j < n && cls[j] === EXT) j++;
        else if (j + 1 < n && cls[j] === ZWJ && cls[j + 1] !== WS) j += 2;
        else break;
      }
    }
    let raw = '';
    let decoded = '';
    for (let k = i; k < j; k++) {
      raw += u[k]!.raw;
      decoded += u[k]!.ch;
    }
    out.push({ space: c === WS, raw, decoded, len: j - i });
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const ASCII_WS_RUN = /[\t\n\f\r ]+/g;
const collapse = (s: string): string => s.replace(ASCII_WS_RUN, ' ').replace(/^ | $/g, '');

/** Attributes of a void tag, normalized for comparison (`<img>` == `<img />`). */
function voidAttributes(raw: string, name: string): string {
  let s = collapse(raw.slice(1 + name.length, -1));
  if (s.endsWith('/')) s = s.slice(0, -1);
  return collapse(s);
}

/** Tokenize HTML for the diff (after scrubbing): tags, raw/opaque blocks, text and whitespace runs. */
export function tokenizeHtml(html: string, options: TokenizeOptions = {}): HtmlToken[] {
  const ignoreCase = !!options.ignoreCase;
  const ignoreFormatting = options.ignoreFormattingTags !== false;
  const out: HtmlToken[] = [];
  const formatting: string[] = [];

  for (const seg of lexHtml(html)) {
    switch (seg.kind) {
      case 'comment':
        break;
      case 'opaque':
        out.push({ kind: 'opaque', raw: seg.raw, name: '', key: '!' + seg.raw, len: 0 });
        break;
      case 'raw': {
        const raw = seg.closed ? seg.raw : seg.raw + '</' + seg.name + '>';
        out.push({ kind: 'raw', raw, name: seg.name, key: '!' + raw, len: 0 });
        break;
      }
      case 'open':
      case 'close':
      case 'void': {
        if (FORMATTING_ELEMENTS.has(seg.name)) {
          if (ignoreFormatting) break;
          if (seg.kind === 'open') formatting.push(seg.name);
          else if (seg.kind === 'close') {
            const at = formatting.lastIndexOf(seg.name);
            if (at >= 0) formatting.splice(at, 1);
          }
        }
        const key =
          seg.kind === 'open' ? '<' + seg.name : seg.kind === 'close' ? '</' + seg.name : '<' + seg.name + '/' + voidAttributes(seg.raw, seg.name);
        out.push({ kind: seg.kind, raw: seg.raw, name: seg.name, key, len: 0 });
        break;
      }
      case 'text': {
        const ctx = formatting.length ? [...new Set(formatting)].sort().join(',') : '';
        for (const piece of textPieces(seg.raw)) {
          if (piece.space) {
            out.push({ kind: 'space', raw: piece.raw, name: '', key: ' ', len: 0 });
          } else {
            const q = normalizeQuotes(piece.decoded);
            out.push({ kind: 'text', raw: piece.raw, name: '', key: 't' + ctx + '>' + (ignoreCase ? q.toLowerCase() : q), len: piece.len });
          }
        }
        break;
      }
    }
  }
  return out;
}
