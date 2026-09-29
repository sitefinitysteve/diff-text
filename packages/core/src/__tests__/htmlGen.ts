/**
 * Seeded random HTML documents for the HTML diff property tests and the generated html fixtures
 * (scripts/fixtures-lib.ts). Documents are valid: every element sits in an allowed parent and text
 * only appears where phrasing content is allowed, so the diff output must be valid too.
 */
import { pick, prng } from './prng';

const WORDS = [
  'alpha', 'beta', 'gamma', 'delta', 'the', 'a', 'fox', 'Fox', '&amp;', '&nbsp;', '&eacute;cole', 'école', '&lt;',
  '1 < 2', 'x&gt;y', '“quoted”', '"quoted"', 'café', '\u{1F600}', '\u{1F468}‍\u{1F469}‍\u{1F467}', '猫', '&#233;', '&#x1F600;',
];
const INLINE = ['a href="#"', 'a href="/x"', 'span class="k"', 'code', 'strong', 'em', 'b title="a>b"'];

type Rand = () => number;
const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

function text(r: Rand): string {
  const out: string[] = [];
  for (let n = int(r, 1, 5); n > 0; n--) out.push(pick(r, WORDS));
  return out.join(pick(r, [' ', ' ', ' ', '  ', '\n']));
}

function inline(r: Rand, depth = 0): string {
  const parts: string[] = [];
  for (let n = int(r, 1, 3); n > 0; n--) {
    const k = int(r, 0, 7);
    if (k === 0 && depth < 1) {
      const tag = pick(r, INLINE);
      const name = tag.split(' ')[0]!;
      parts.push(`<${tag}>${inline(r, depth + 1)}</${name}>`);
    } else if (k === 1) {
      parts.push(pick(r, ['<br>', '<br />', '<img src="i1.png">', '<img src="i2.png" alt="">', '<img src="i1.png"/>']));
    } else if (k === 2 && depth === 0) {
      parts.push(pick(r, ['<!-- note -->', '<!-- <b>x</b> -->']));
    } else {
      parts.push(text(r));
    }
  }
  return parts.join(' ');
}

function block(r: Rand, depth: number): string {
  switch (int(r, 0, 9)) {
    case 0:
    case 1: {
      let items = '';
      for (let k = int(r, 1, 3); k > 0; k--) items += `<li>${int(r, 0, 4) === 0 && depth > 0 ? blocks(r, depth - 1) : inline(r)}</li>`;
      const list = pick(r, ['ul', 'ol']);
      return `<${list}>${items}</${list}>`;
    }
    case 2: {
      let rows = '';
      for (let k = int(r, 1, 2); k > 0; k--) {
        let cells = '';
        for (let c = int(r, 1, 2); c > 0; c--) cells += `<td>${inline(r)}</td>`;
        rows += `<tr>${cells}</tr>`;
      }
      return int(r, 0, 1) ? `<table>${rows}</table>` : `<table><tbody>${rows}</tbody></table>`;
    }
    case 3:
      return depth > 0 ? `<div>${blocks(r, depth - 1)}</div>` : `<div>${inline(r)}</div>`;
    case 4:
      return depth > 0 ? `<blockquote>${blocks(r, depth - 1)}</blockquote>` : `<h2>${inline(r)}</h2>`;
    case 5:
      return pick(r, ['<script>if (a < b) { s = "</div>"; }</script>', '<style>p > b { color: red }</style>', '<SCRIPT>x = "<p>";</SCRIPT>']);
    default:
      return int(r, 0, 3) === 0 ? `<p class="${pick(r, ['a', 'b'])}">${inline(r)}</p>` : `<p>${inline(r)}</p>`;
  }
}

function blocks(r: Rand, depth: number): string {
  let out = '';
  for (let n = int(r, 1, 3); n > 0; n--) out += block(r, depth);
  return out;
}

/** Mutate a document: word swaps, inserted/removed blocks and items, attribute changes. */
function mutate(r: Rand, doc: string): string {
  for (let e = int(r, 1, 4); e > 0; e--) {
    switch (int(r, 0, 6)) {
      case 0: {
        const w = pick(r, ['alpha', 'beta', 'gamma', 'delta', 'fox', 'the']);
        doc = doc.replace(w, pick(r, WORDS));
        break;
      }
      case 1:
        doc += block(r, 1);
        break;
      case 2:
        doc = doc.replace(/<(p|li|td|h2)>(?:(?!<\/?\1[ >]).)*<\/\1>/s, (m, name: string) => (name === 'p' || name === 'h2' ? '' : `<${name}>${inline(r)}</${name}>`));
        break;
      case 3:
        doc = doc.replace('href="#"', 'href="/new"').replace('class="a"', 'class="b"');
        break;
      case 4:
        doc = block(r, 1) + doc;
        break;
      case 5:
        doc = doc.replace(/<(p|li)>/, (m) => m + text(r) + ' ');
        break;
      default:
        doc = doc.replace(/<li>(?:(?!<\/?li>).)*<\/li>/s, '');
    }
  }
  return doc;
}

/** A pair [old, new] from a seed: usually an edited copy, sometimes two unrelated documents. */
export function randomHtmlPair(seed: number): [string, string] {
  const r = prng(seed);
  const old = blocks(r, 2);
  const neu = int(r, 0, 5) === 0 ? blocks(r, 2) : mutate(r, old);
  return [old, neu];
}
