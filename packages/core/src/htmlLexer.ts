/**
 * HTML lexer for the tag-aware HTML diff (SPEC section 12.2, "Lexing"). It splits a document into
 * segments without changing a single character: concatenating every segment's `raw` gives the
 * input back. The PHP port (HtmlLexer.php) implements the same grammar.
 */

export type SegmentKind = 'text' | 'comment' | 'opaque' | 'open' | 'close' | 'void' | 'raw';

export interface Segment {
  kind: SegmentKind;
  /** The exact source text of the segment. */
  raw: string;
  /** ASCII-lowercased tag name (open, close, void, raw); '' otherwise. */
  name: string;
  /** raw kind only: false when the element has no end tag (it then runs to the end of the input). */
  closed?: boolean;
}

/** Void elements: never have a closing tag. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Elements whose content is raw text: the whole element (start tag, body, end tag) is one segment. */
export const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  'script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes',
]);

/** Inline formatting elements removed by ignoreFormattingTags (SPEC 12.1). */
export const FORMATTING_ELEMENTS: ReadonlySet<string> = new Set(['strong', 'em', 'b', 'i', 'u', 's', 'mark', 'sub', 'sup']);

/** Characters that end a tag name. */
const NAME_END = '\t\n\f\r />"\'';
/** Characters allowed right after `</name` for the end tag of a raw text element. */
const END_TAG_FOLLOW = '\t\n\f\r />';

const isAsciiLetter = (c: string | undefined): boolean => c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));

/** ASCII-only lowercase (tag names never fold non-ASCII letters). Keeps the string length. */
export function asciiLower(s: string): string {
  return s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}

/**
 * Parse a tag starting at `start` (the `<`); `nameStart` is the index of the first name letter.
 * Returns the index just past the closing `>`, or -1 when the tag is unterminated (no `>`, or an
 * attribute quote that never closes).
 */
function tagEnd(s: string, nameStart: number): { end: number; nameEnd: number } | null {
  let i = nameStart + 1;
  while (i < s.length && !NAME_END.includes(s[i]!)) i++;
  const nameEnd = i;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '>') return { end: i + 1, nameEnd };
    if (c === '"' || c === "'") {
      const j = s.indexOf(c, i + 1);
      if (j < 0) return null;
      i = j + 1;
    } else {
      i++;
    }
  }
  return null;
}

/** End of a raw text element whose start tag ends at `from`: [end, closed]. */
function rawEnd(lower: string, name: string, from: number): [number, boolean] {
  const needle = '</' + name;
  let k = lower.indexOf(needle, from);
  while (k >= 0) {
    const follow = lower[k + needle.length];
    if (follow !== undefined && END_TAG_FOLLOW.includes(follow)) {
      const gt = lower.indexOf('>', k + needle.length);
      if (gt >= 0) return [gt + 1, true];
      break;
    }
    k = lower.indexOf(needle, k + 1);
  }
  return [lower.length, false];
}

/** Split HTML into segments (SPEC 12.2 "Lexing"). */
export function lexHtml(s: string): Segment[] {
  const out: Segment[] = [];
  const lower = asciiLower(s);
  const n = s.length;
  let textStart = 0;
  let p = 0;
  const flushText = (end: number) => {
    if (end > textStart) out.push({ kind: 'text', raw: s.slice(textStart, end), name: '' });
  };
  const push = (seg: Segment, end: number) => {
    flushText(p);
    out.push(seg);
    p = end;
    textStart = end;
  };

  while (p < n) {
    const lt = s.indexOf('<', p);
    if (lt < 0) break;
    p = lt;
    const c1 = s[p + 1];
    if (s.startsWith('<!--', p)) {
      const e = s.indexOf('-->', p + 4);
      const end = e < 0 ? n : e + 3;
      push({ kind: 'comment', raw: s.slice(p, end), name: '' }, end);
      continue;
    }
    if (s.startsWith('<![CDATA[', p)) {
      const e = s.indexOf(']]>', p + 9);
      if (e >= 0) {
        push({ kind: 'opaque', raw: s.slice(p, e + 3), name: '' }, e + 3);
        continue;
      }
    } else if ((c1 === '!' && isAsciiLetter(s[p + 2])) || c1 === '?') {
      const e = s.indexOf('>', p + 2);
      if (e >= 0) {
        push({ kind: 'opaque', raw: s.slice(p, e + 1), name: '' }, e + 1);
        continue;
      }
    } else if (c1 === '/' && isAsciiLetter(s[p + 2])) {
      const t = tagEnd(s, p + 2);
      if (t) {
        push({ kind: 'close', raw: s.slice(p, t.end), name: lower.slice(p + 2, t.nameEnd) }, t.end);
        continue;
      }
    } else if (isAsciiLetter(c1)) {
      const t = tagEnd(s, p + 1);
      if (t) {
        const raw = s.slice(p, t.end);
        const name = lower.slice(p + 1, t.nameEnd);
        if (VOID_ELEMENTS.has(name) || raw.endsWith('/>')) {
          push({ kind: 'void', raw, name }, t.end);
        } else if (RAW_TEXT_ELEMENTS.has(name)) {
          const [end, closed] = rawEnd(lower, name, t.end);
          push({ kind: 'raw', raw: s.slice(p, end), name, closed }, end);
        } else {
          push({ kind: 'open', raw, name }, t.end);
        }
        continue;
      }
    }
    // Not a construct: the `<` is text.
    p++;
  }
  flushText(n);
  return out;
}
