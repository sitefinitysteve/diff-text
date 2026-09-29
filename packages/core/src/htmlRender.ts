/**
 * Renders the grouped HTML diff (SPEC section 12.2, "Rendering"). The PHP port
 * (HtmlDiffRenderer.php) implements the same rules.
 *
 * - Tokens of the NEW document are emitted once, in order (a close tag with no open element of
 *   that name is dropped; elements still open are closed where their parent closes, or at the end).
 * - Removed tags are emitted only as a balanced pair from one removed run, and only where the
 *   element may appear; otherwise the marker simply continues across them.
 * - Markers wrap text runs (and `<img>`) only, and are split at every emitted tag.
 */
import type { HtmlToken } from './htmlTokens';

export type HtmlItem =
  | { eq: true; old: HtmlToken[]; new: HtmlToken[] }
  | { eq: false; removed: HtmlToken[]; added: HtmlToken[] };

type Set_ = ReadonlySet<string>;
const set = (s: string): Set_ => new Set(s.split(' '));

/** Elements that only accept specific children. */
const RESTRICTED_PARENTS: Record<string, Set_> = {
  ul: set('li'),
  ol: set('li'),
  menu: set('li'),
  table: set('caption colgroup thead tbody tfoot tr'),
  thead: set('tr'),
  tbody: set('tr'),
  tfoot: set('tr'),
  tr: set('td th'),
  colgroup: set('col'),
  dl: set('dt dd div'),
  select: set('option optgroup'),
  optgroup: set('option'),
  html: set('head body'),
  head: set('title meta link style script base noscript template'),
};

/** Elements that must sit in a specific parent. */
const REQUIRED_PARENTS: Record<string, Set_> = {
  li: set('ul ol menu'),
  tr: set('table thead tbody tfoot'),
  td: set('tr'),
  th: set('tr'),
  thead: set('table'),
  tbody: set('table'),
  tfoot: set('table'),
  caption: set('table'),
  colgroup: set('table'),
  dt: set('dl'),
  dd: set('dl'),
  option: set('select optgroup datalist'),
  optgroup: set('select'),
};

/** Flow (block) elements: not allowed inside phrasing-only parents. */
const BLOCK = set(
  'address article aside blockquote details dialog div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 ' +
    'header hgroup hr main menu nav ol p pre section table ul',
);

/** Parents that only accept phrasing content. */
const PHRASING_PARENTS = set(
  'p h1 h2 h3 h4 h5 h6 pre span a em strong b i u s mark sub sup small big code abbr cite q kbd samp var time label ' +
    'button dt legend summary font tt del ins dfn bdi bdo',
);

/** Removed document-level elements are never emitted. */
const NEVER_KEPT = set('html head body');

/** Elements whose (dropped) tags separate words: a space joins the removed text on either side. */
const BREAKING = new Set([...BLOCK, 'li', 'dt', 'dd', 'tr', 'td', 'th', 'caption', 'thead', 'tbody', 'tfoot', 'br']);

/** Wrappers that make removed text valid inside a parent that does not accept text. */
const WRAPPERS: Record<string, readonly string[]> = {
  ul: ['li'],
  ol: ['li'],
  menu: ['li'],
  dl: ['dd'],
  tr: ['td'],
  table: ['tr', 'td'],
  thead: ['tr', 'td'],
  tbody: ['tr', 'td'],
  tfoot: ['tr', 'td'],
};

const PARSER_WS_ONLY = /^[\t\n\f\r ]+$/;

const isMarkerContent = (t: HtmlToken): boolean => t.kind === 'text' || t.kind === 'space' || (t.kind === 'void' && t.name === 'img');

export function renderHtmlItems(items: HtmlItem[]): string {
  const stack: string[] = [];
  let out = '';
  let index = 0;

  const top = (): string | undefined => stack[stack.length - 1];

  const marker = (cls: 'added' | 'removed', content: string): string =>
    `<span class="diff-${cls}" data-change-index="${index++}">${content}</span>`;

  const flush = (cls: 'added' | 'removed', content: string): void => {
    if (content === '') return;
    const parent = top();
    if (parent !== undefined && parent in RESTRICTED_PARENTS) {
      if (PARSER_WS_ONLY.test(content)) {
        if (cls === 'added') out += content;
        return;
      }
      const wrap = cls === 'removed' ? WRAPPERS[parent] : undefined;
      if (wrap) {
        out += wrap.map((w) => `<${w}>`).join('') + marker(cls, content) + [...wrap].reverse().map((w) => `</${w}>`).join('');
        return;
      }
    }
    out += marker(cls, content);
  };

  /** Emit a tag of the new document. */
  const emitTag = (t: HtmlToken): void => {
    if (t.kind === 'open') {
      out += t.raw;
      stack.push(t.name);
    } else if (t.kind === 'close') {
      const at = stack.lastIndexOf(t.name);
      if (at < 0) return; // stray close tag: dropped
      while (stack.length - 1 > at) out += `</${stack.pop()!}>`;
      out += t.raw;
      stack.pop();
    } else {
      out += t.raw; // void, raw, opaque
    }
  };

  const allowedHere = (name: string): boolean => {
    if (NEVER_KEPT.has(name)) return false;
    const parent = top();
    const required = REQUIRED_PARENTS[name];
    if (required) return parent !== undefined && required.has(parent);
    if (parent === undefined) return true;
    const restricted = RESTRICTED_PARENTS[parent];
    if (restricted) return restricted.has(name);
    if (BLOCK.has(name)) return !PHRASING_PARENTS.has(parent);
    if (name === 'a' && stack.includes('a')) return false;
    return true;
  };

  const emitAdded = (tokens: HtmlToken[]): void => {
    let buf = '';
    for (const t of tokens) {
      if (isMarkerContent(t)) {
        buf += t.raw;
        continue;
      }
      flush('added', buf);
      buf = '';
      emitTag(t);
    }
    flush('added', buf);
  };

  const emitRemoved = (tokens: HtmlToken[]): void => {
    // Pair open/close tags within the run (a close pairs only with the innermost open).
    const closeOf = new Map<number, number>();
    const open: number[] = [];
    tokens.forEach((t, i) => {
      if (t.kind === 'open') open.push(i);
      else if (t.kind === 'close' && open.length && tokens[open[open.length - 1]!]!.name === t.name) {
        closeOf.set(open.pop()!, i);
      }
    });

    let buf = '';
    let separate = false;
    const keptClose = new Set<number>();
    tokens.forEach((t, i) => {
      if (isMarkerContent(t)) {
        // A dropped block boundary still separates the words around it.
        if (separate && !/[\t\n\f\r ]$/.test(buf) && !/^[\t\n\f\r ]/.test(t.raw)) buf += ' ';
        separate = false;
        buf += t.raw;
        return;
      }
      const close = closeOf.get(i);
      if (t.kind === 'open' && close !== undefined && allowedHere(t.name)) {
        keptClose.add(close);
        flush('removed', buf);
        buf = '';
        separate = false;
        out += t.raw;
        stack.push(t.name);
      } else if (t.kind === 'close' && keptClose.has(i)) {
        flush('removed', buf);
        buf = '';
        separate = false;
        out += t.raw;
        stack.pop();
      } else if (buf !== '' && BREAKING.has(t.name)) {
        separate = true;
      }
    });
    flush('removed', buf);
  };

  for (const item of items) {
    if (item.eq) {
      for (const t of item.new) {
        if (t.kind === 'text' || t.kind === 'space') out += t.raw;
        else emitTag(t);
      }
    } else {
      emitRemoved(item.removed);
      emitAdded(item.added);
    }
  }
  while (stack.length) out += `</${stack.pop()!}>`;
  return out;
}
