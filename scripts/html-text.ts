/**
 * Minimal HTML walker used by the fixture generator (and mirrored by the PHP tests):
 * extracts the text inside diff markers and checks that tags nest correctly.
 * See SPEC.md "HTML diff: structural parity".
 */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** Raw text elements: their content is skipped up to the matching end tag. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[body] ?? m;
  });
}

/** Normalize marker text: NBSP -> space, collapse whitespace runs to one space, trim. */
export function normalizeMarkerText(text: string): string {
  return text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

interface Open {
  name: string;
  marker: 'added' | 'removed' | null;
}

export interface MarkerText {
  addedText: string;
  removedText: string;
  valid: boolean;
}

/** Find the index of the `>` that ends a tag starting at `start` (skipping quoted attribute values). */
function tagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

export function extractMarkerText(html: string): MarkerText {
  const stack: Open[] = [];
  let added = '';
  let removed = '';
  let valid = true;
  let i = 0;

  const nearestMarker = (): 'added' | 'removed' | null => {
    for (let k = stack.length - 1; k >= 0; k--) {
      const m = stack[k]!.marker;
      if (m) return m;
    }
    return null;
  };
  const addText = (raw: string) => {
    const m = nearestMarker();
    if (!m) return;
    const t = decodeEntities(raw);
    if (m === 'added') added += t;
    else removed += t;
  };

  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      if (end < 0) {
        valid = false;
        break;
      }
      i = end + 3;
      continue;
    }
    if (html[i] === '<' && /[a-zA-Z/!]/.test(html[i + 1] ?? '')) {
      const end = tagEnd(html, i);
      if (end < 0) {
        valid = false;
        break;
      }
      const inner = html.slice(i + 1, end);
      i = end + 1;
      if (inner[0] === '!') continue; // doctype
      const closing = inner[0] === '/';
      const nameMatch = /^\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(inner);
      if (!nameMatch) {
        valid = false;
        continue;
      }
      const name = nameMatch[1]!.toLowerCase();
      if (closing) {
        const top = stack.pop();
        if (!top || top.name !== name) valid = false;
        continue;
      }
      if (VOID.has(name) || /\/\s*$/.test(inner)) continue;
      const cls = /\sclass\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(inner);
      const classes = cls ? (cls[2] ?? cls[3] ?? cls[4] ?? '').split(/\s+/) : [];
      const marker = classes.includes('diff-added') ? 'added' : classes.includes('diff-removed') ? 'removed' : null;
      if (RAW_TEXT.has(name)) {
        const close = new RegExp(`</${name}[\\t\\n\\f\\r />]`, 'i').exec(html.slice(i));
        const gt = close ? html.indexOf('>', i + close.index) : -1;
        if (gt < 0) {
          valid = false;
          break;
        }
        i = gt + 1;
        continue;
      }
      stack.push({ name, marker });
      continue;
    }
    const next = html.slice(i + 1).search(/<(?:[a-zA-Z/!])/);
    const end = next < 0 ? html.length : i + 1 + next;
    addText(html.slice(i, end));
    i = end;
  }
  if (stack.length) valid = false;
  return { addedText: normalizeMarkerText(added), removedText: normalizeMarkerText(removed), valid };
}
