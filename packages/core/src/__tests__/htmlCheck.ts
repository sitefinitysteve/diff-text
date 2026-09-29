/**
 * Output checks for the HTML diff tests: structural validity (balanced tags, allowed nesting,
 * markers that only hold text) and the text each side of the diff shows.
 */
import { lexHtml } from '../htmlLexer';
import { decodeHtmlText, scrubUnicode } from '../htmlTokens';
import { normalizeQuotes, stripFormattingTags } from '../normalize';

const set = (s: string): ReadonlySet<string> => new Set(s.split(' '));
const RESTRICTED: Record<string, ReadonlySet<string>> = {
  ul: set('li'), ol: set('li'), menu: set('li'), table: set('caption colgroup thead tbody tfoot tr'),
  thead: set('tr'), tbody: set('tr'), tfoot: set('tr'), tr: set('td th'), colgroup: set('col'), dl: set('dt dd div'),
};
const REQUIRED: Record<string, ReadonlySet<string>> = {
  li: set('ul ol menu'), tr: set('table thead tbody tfoot'), td: set('tr'), th: set('tr'),
  thead: set('table'), tbody: set('table'), tfoot: set('table'), dt: set('dl'), dd: set('dl'),
};
const BLOCK = set('address article aside blockquote details div dl fieldset figure footer form h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section table ul');
const PHRASING = set('p h1 h2 h3 h4 h5 h6 pre span a em strong b i u s mark sub sup small code abbr cite q label button');

interface Open {
  name: string;
  marker: 'added' | 'removed' | null;
}

const markerOf = (raw: string): Open['marker'] => {
  const m = /^<span class="diff-(added|removed)" data-change-index="\d+">$/.exec(raw);
  return m ? (m[1] as 'added' | 'removed') : null;
};

/** Problems with the output, [] when it is valid. `strict` adds the content-model rules. */
export function htmlProblems(html: string, strict = true): string[] {
  const problems: string[] = [];
  const stack: Open[] = [];
  const inMarker = () => stack.some((o) => o.marker !== null);
  for (const seg of lexHtml(html)) {
    const parent = stack[stack.length - 1]?.name;
    if (seg.kind === 'text') {
      if (strict && parent && parent in RESTRICTED && !/^[\t\n\f\r ]*$/.test(seg.raw)) problems.push(`text in <${parent}>: ${seg.raw}`);
      if (/<[a-zA-Z/!?]/.test(seg.raw)) problems.push(`unescaped < in text: ${seg.raw}`);
      continue;
    }
    if (seg.kind === 'comment') continue;
    if (seg.kind === 'close') {
      const top = stack.pop();
      if (!top || top.name !== seg.name) problems.push(`mismatched ${seg.raw}`);
      if (inMarker()) problems.push(`${seg.raw} inside a marker`);
      continue;
    }
    if (inMarker() && !(seg.kind === 'void' && seg.name === 'img')) problems.push(`${seg.raw} inside a marker`);
    if (seg.kind !== 'open' && seg.kind !== 'void') continue;
    if (strict) {
      const req = REQUIRED[seg.name];
      if (req && !(parent && req.has(parent))) problems.push(`<${seg.name}> in <${parent ?? '#root'}>`);
      if (parent && RESTRICTED[parent] && !RESTRICTED[parent]!.has(seg.name)) problems.push(`<${seg.name}> in <${parent}>`);
      if (parent && BLOCK.has(seg.name) && PHRASING.has(parent)) problems.push(`block <${seg.name}> in <${parent}>`);
      if (seg.name === 'a' && stack.some((o) => o.name === 'a')) problems.push('<a> inside <a>');
    }
    if (seg.kind === 'open') stack.push({ name: seg.name, marker: markerOf(seg.raw) });
  }
  if (stack.length) problems.push(`unclosed ${stack.map((o) => o.name).join(',')}`);
  return problems;
}

/** Visible text, skipping markers of one kind; entities decoded, quotes normalized, whitespace removed. */
export function sideText(html: string, skip: 'added' | 'removed' | null, lower = false): string {
  const stack: boolean[] = [];
  let out = '';
  for (const seg of lexHtml(html)) {
    if (seg.kind === 'text') {
      if (!stack.includes(true)) out += decodeHtmlText(seg.raw);
    } else if (seg.kind === 'open') {
      stack.push(skip !== null && markerOf(seg.raw) === skip);
    } else if (seg.kind === 'close') {
      stack.pop();
    }
  }
  const t = normalizeQuotes(out).replace(/\s+/g, '');
  return lower ? t.toLowerCase() : t;
}

/** The text a document shows, in the form sideText produces. */
export function documentText(html: string, ignoreFormattingTags = true, lower = false): string {
  const clean = scrubUnicode(html);
  return sideText(ignoreFormattingTags ? stripFormattingTags(clean) : clean, null, lower);
}

/** data-change-index values in document order. */
export function changeIndexes(html: string): number[] {
  return [...html.matchAll(/data-change-index="(\d+)"/g)].map((m) => Number(m[1]));
}
