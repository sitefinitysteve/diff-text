import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { diffHtml } from '../html';
import type { HtmlDiffOptions } from '../types';
import { randomHtmlPair } from './htmlGen';
import { changeIndexes, documentText, htmlProblems, sideText } from './htmlCheck';

/**
 * Golden outputs for the tag-aware HTML diff (SPEC 12). PHP's DiffHtmlGoldenTest pins the same
 * strings. Expected strings use a shorthand: `«+text»` is an added marker and `«-text»` a removed
 * marker, numbered 0, 1, 2, ... in order by `markup()`.
 */
function markup(short: string): string {
  let n = 0;
  return short.replace(/«([+-])/g, (_m, sign: string) => `<span class="diff-${sign === '+' ? 'added' : 'removed'}" data-change-index="${n++}">`).replace(/»/g, '</span>');
}

type Golden = [name: string, oldHtml: string, newHtml: string, expected: string, options?: HtmlDiffOptions];

function check([, oldHtml, newHtml, expected, options]: Golden): void {
  const html = diffHtml(oldHtml, newHtml, options).html;
  expect(html).toBe(markup(expected));
  expect(htmlProblems(html, false)).toEqual([]);
}

describe('script, style and other raw text elements (1)', () => {
  it.each<Golden>([
    // The script body is one atomic token: its `</div>` is not a tag, and the paragraph after it survives.
    ['content after a script is kept', '<p>alpha</p>', '<p>alpha</p><script>var s = "</div>";</script><p>beta</p>', '<p>alpha</p><script>var s = "</div>";</script><p>«+beta»</p>'],
    // `</SCRIPT>` ends the element (ASCII case-insensitive); the two scripts differ only in the end
    // tag's case, so they are different atomic tokens: the old one is dropped, the new one emitted.
    ['uppercase end tag', '<script>var s = "</div>";</SCRIPT><p>tail one</p>', '<script>var s = "</div>";</script><p>tail two</p>', '<script>var s = "</div>";</script><p>tail «-one»«+two»</p>'],
    // A changed style body is not text: no marker, the new element is emitted.
    ['changed style body', '<p>x</p><style>p { color: red }</style><p>after</p>', '<p>x</p><style>p { color: blue }</style><p>after 2</p>', '<p>x</p><style>p { color: blue }</style><p>after«+ 2»</p>'],
    ['style with a > selector', '<style>p > b { }</style><p>a</p>', '<style>p > b { }</style><p>b</p>', '<style>p > b { }</style><p>«-a»«+b»</p>'],
    // An unterminated raw text element runs to the end and gets its end tag, so it cannot swallow the container.
    ['unterminated script', '<p>a</p>', '<p>a</p><script>if (x) <p>', '<p>a</p><script>if (x) <p></script>'],
    ['textarea content is raw', '<textarea></p></textarea><p>a</p>', '<textarea></p></textarea><p>b</p>', '<textarea></p></textarea><p>«-a»«+b»</p>'],
  ])('%s', (...g) => check(g));
});

describe('valid output (2) and removed structure (10)', () => {
  it.each<Golden>([
    // Each added text run gets its own marker, split at <br>; closers are emitted once.
    ['added paragraph after a table', '<table><tr><td></td></tr></table>', '<table><tr><td>one</td></tr></table><p>one<br>one</p>', '<table><tr><td>«+one»</td></tr></table><p>«+one»<br>«+one»</p>'],
    // The removed run is `<li>b</li>`: a balanced pair, and <li> may sit in <ul>, so it is kept.
    ['removed list item', '<ul><li>a</li><li>b</li></ul>', '<ul><li>a</li></ul>', '<ul><li>a</li><li>«-b»</li></ul>'],
    // Removed `<tr><td>b</td></tr>`: balanced, <tr> may sit in <table> and <td> in <tr>.
    ['removed table row', '<table><tr><td>a</td></tr><tr><td>b</td></tr></table>', '<table><tr><td>a</td></tr></table>', '<table><tr><td>a</td></tr><tr><td>«-b»</td></tr></table>'],
    // Myers deletes `<div>` and `a</p></div><p>` (the new <p> matches the old inner <p>); sliding the
    // second deletion one token left makes it `<p>a</p></div>`, which merges with the `<div>`
    // deletion into the balanced run `<div><p>a</p></div>`, so the old structure is shown intact.
    ['removed div with a paragraph', '<div><p>a</p></div><p>b</p>', '<p>b</p>', '<div><p>«-a»</p></div><p>b</p>'],
    // The removed `<a href="/y">docs</a>` pair would land inside the new <a>: links cannot nest, so
    // its tags are dropped and only its text is marked.
    ['link inside a link', '<p>see <a href="/y">docs</a> now</p>', '<p><a href="/x">see now</a></p>', '<p><a href="/x">see «-docs »now</a></p>'],
    // Myers deletes `<div>b` and a later `</div>`; sliding the `</div>` deletion left over the equal
    // `</div>` merges them into `<div>b</div>`, a balanced pair that may sit in the outer <div>.
    ['nested same-name elements', '<div><div>a</div><div>b</div></div>', '<div><div>a</div></div>', '<div><div>a</div><div>«-b»</div></div>'],
    // Removing a wrapper changes no text: the unpaired removed tags are dropped, nothing is marked.
    ['removed wrapper', '<div><div>a</div></div>', '<div>a</div>', '<div>a</div>'],
    // Tags inside a changed run are unpaired here (`</li><li>`), so they are dropped; the added space is marked.
    ['merged list items', '<ul><li>a</li><li>b</li></ul>', '<ul><li>a b</li></ul>', '<ul><li>a«+ »b</li></ul>'],
    // A dropped block boundary still separates the removed words ("a b", not "ab").
    ['dropped boundary separates words', '<p>x</p><p>a</p><p>b</p><p>y</p>', '<p>x</p><p>y</p>', '<p>x</p><p>«-a»</p><p>«-b»</p><p>y</p>'],
    ['stray close tag in the new document is dropped', '<p>a</p>', '<p>a</p></div><p>b</p>', '<p>a</p><p>«+b»</p>'],
    ['unclosed element in the new document is closed', '<div>a</div>', '<div>a<p>b</div>', '<div>a<p>«+b»</p></div>'],
    ['unclosed element at the end is closed', '', '<div><p>x', '<div><p>«+x»</p></div>'],
  ])('%s', (...g) => check(g));
});

describe('entities compare by decoded value (4)', () => {
  it.each<Golden>([
    // Unchanged text shows the NEW document's spelling.
    ['named, numeric and nbsp', '<p>&eacute;cole &amp; co&nbsp;x &#233;t&#xE9; &#x1F600;</p>', '<p>école & co x été 😀</p>', '<p>école & co x été 😀</p>'],
    ['new spelling kept', '<p>école</p>', '<p>&eacute;cole</p>', '<p>&eacute;cole</p>'],
    // A stray `<` in text is emitted as `&lt;` (and equals `&lt;`).
    ['stray < equals &lt;', '<p>a &lt; b</p>', '<p>a < b</p>', '<p>a &lt; b</p>'],
    ['&quot; equals "', '<p>&quot;hi&quot;</p>', '<p>"hi"</p>', '<p>"hi"</p>'],
    ['curly quotes equal straight ones', '<p>“Hello”</p>', '<p>"Hello"</p>', '<p>"Hello"</p>'],
    // HTML5-only names are not in the table: `&check;` is literal text.
    ['unknown entity is literal', '<p>&check;</p>', '<p>✓</p>', '<p>«-&check;»«+✓»</p>'],
    ['invalid code points decode to U+FFFD', '<p>&#0;&#xD800;&#x110000;</p>', '<p>���</p>', '<p>���</p>'],
    ['entity inside a changed word', '<p>&eacute;t&eacute;</p>', '<p>&eacute;tait</p>', '<p>«-&eacute;t&eacute;»«+&eacute;tait»</p>'],
  ])('%s', (...g) => check(g));
});

describe('unbalanced attribute quotes (5)', () => {
  it.each<Golden>([
    // A tag whose attribute quote never closes is not a tag: its `<` is text (emitted as `&lt;`).
    ['added', '<p>one</p>', '<p>one</p><p title="x>two</p>', '<p>one</p>«+&lt;p title="x>two»'],
    ['removed', '<p>one</p><p title="x>two</p>', '<p>one</p>', '<p>one</p>«-&lt;p title="x>two»'],
    ['unterminated tag at the end', '<p>a</p><a href="x', '<p>b</p><a href="x', '<p>«-a»«+b»</p>&lt;a href="x'],
    ['quoted > does not end a tag', '<p title="a>b">x y</p>', '<p title="a>b">x z</p>', '<p title="a>b">x «-y»«+z»</p>'],
  ])('%s', (...g) => check(g));
});

describe('orphan grouping (6)', () => {
  it.each<Golden>([
    // "XY" (2) between changes of 2+2 and 3+3 text code points: 2/10 = 0.2 < 0.3, absorbed.
    ['below the threshold', 'ab XY cde', 'fg XY hij', '«-ab XY cde»«+fg XY hij»'],
    // "XYZ" (3) / 10 = 0.3 is not < 0.3: kept (the boundary is exclusive).
    ['exactly the threshold', 'ab XYZ cde', 'fg XYZ hij', '«-ab»«+fg» XYZ «-cde»«+hij»'],
    ['just above the exact ratio', 'ab XYZ cde', 'fg XYZ hij', '«-ab XYZ cde»«+fg XYZ hij»', { orphanMatchThreshold: 0.30000000000000004 }],
    // A run with a tag is never absorbed, whatever the threshold.
    ['run containing a tag', '<p>alpha <a href="#">beta</a> gamma</p>', '<p>one <a href="#">beta</a> two</p>', '<p>«-alpha»«+one» <a href="#">beta</a> «-gamma»«+two»</p>', { orphanMatchThreshold: 0.9 }],
    // Whitespace-only runs between changes are always absorbed (0 < threshold), so chains merge.
    ['chains merge', 'alpha beta gamma delta', 'one beta two three', '«-alpha beta gamma delta»«+one beta two three»'],
    ['threshold 0 disables grouping', 'alpha beta gamma delta', 'one beta two three', '«-alpha»«+one» beta «-gamma»«+two» «-delta»«+three»', { orphanMatchThreshold: 0 }],
    // "brown" (5) / (5+4 + 3+3) = 1/3 < 0.9.
    ['threshold 0.9', 'the quick brown fox jumps', 'the slow brown dog jumps', 'the «-quick brown fox»«+slow brown dog» jumps', { orphanMatchThreshold: 0.9 }],
    ['non-numeric threshold uses the default', 'ab XY cde', 'fg XY hij', '«-ab XY cde»«+fg XY hij»', { orphanMatchThreshold: Number.NaN }],
  ])('%s', (...g) => check(g));
});

describe('surrogate pairs and emoji are never split (7), invalid input (12)', () => {
  it.each<Golden>([
    ['emoji', '<p>x😀y</p>', '<p>x😁y</p>', '<p>x«-😀»«+😁»y</p>'],
    ['ZWJ family', 'I 👨‍👩‍👧 x', 'I 👨‍👩‍👦 x', 'I «-👨‍👩‍👧»«+👨‍👩‍👦» x'],
    ['flag (regional indicator pair)', '<p>🇨🇦 flag</p>', '<p>🇫🇷 flag</p>', '<p>«-🇨🇦»«+🇫🇷» flag</p>'],
    ['combining mark stays with its letter', '<p>école</p>', '<p>ecole</p>', '<p>«-école»«+ecole»</p>'],
    ['emoji with variation selector', 'I ❤️ it', 'I ❤ it', 'I «-❤️»«+❤» it'],
    ['lone surrogate becomes U+FFFD', 'caf\ud800e', 'caf�e', 'caf�e'],
  ])('%s', (...g) => check(g));
});

describe('ignoreCase and ignoreFormattingTags: false (8)', () => {
  it.each<Golden>([
    ['ignoreCase shows the new spelling', '<p>Hello World</p>', '<p>hello world</p>', '<p>hello world</p>', { ignoreCase: true }],
    ['ignoreCase with a real change', '<p>Hello World</p>', '<p>hello there WORLD</p>', '<p>hello «+there »WORLD</p>', { ignoreCase: true }],
    // Text compares together with its formatting: bold "World" != plain "World". The old <b> pair is
    // kept around the removed text; the markers are siblings, never nested.
    ['formatting removed', '<p>Hello <b>World</b></p>', '<p>Hello World</p>', '<p>Hello <b>«-World»</b>«+World»</p>', { ignoreFormattingTags: false }],
    ['formatting added', '<p>make this bold now</p>', '<p>make <strong>this bold</strong> now</p>', '<p>make «-this bold»<strong>«+this bold»</strong> now</p>', { ignoreFormattingTags: false }],
    // The formatting context is a set: <b><i> equals <i><b>.
    ['formatting order does not matter', '<p><b><i>x</i></b> y</p>', '<p><i><b>x</b></i> y</p>', '<p><i><b>x</b></i> y</p>', { ignoreFormattingTags: false }],
    ['formatting ignored by default', '<p>Hello <strong class="x">world</strong></p>', '<p>Hello world</p>', '<p>Hello world</p>'],
  ])('%s', (...g) => check(g));
});

describe('token identity (11)', () => {
  it.each<Golden>([
    ['doctype is opaque', '<!DOCTYPE html><p>a</p>', '<!doctype html><p>b</p>', '<!doctype html><p>«-a»«+b»</p>'],
    ['CDATA is opaque', '<p><![CDATA[x<y]]>a</p>', '<p><![CDATA[x<y]]>b</p>', '<p><![CDATA[x<y]]>«-a»«+b»</p>'],
    ['processing instruction is opaque', '<?xml version="1.0"?><p>a</p>', '<?xml version="1.0"?><p>a</p>', '<?xml version="1.0"?><p>a</p>'],
    ['uppercase tags equal lowercase ones', '<P CLASS="x">Hello</P>', '<p class="y">Hello</p>', '<p class="y">Hello</p>'],
    ['<img> equals <img />', '<p>a<img src="x.png">b</p>', '<p>a<img src="x.png" />b</p>', '<p>a<img src="x.png" />b</p>'],
    ['changed img src is a change', '<p>x <img src="a.png"> y</p>', '<p>x <img src="b.png"> y</p>', '<p>x «-<img src="a.png">»«+<img src="b.png">» y</p>'],
    ['whitespace runs are equal', '<p>a b</p>', '<p>a \n  b</p>', '<p>a \n  b</p>'],
    ['attribute-only change', '<p class="a">Hello world</p>', '<p class="b">Hello world</p>', '<p class="b">Hello world</p>'],
    ['comments are dropped', '<p>a<!-- c1 --> b</p>', '<p>a<!-- <p> --> c</p>', '<p>a «-b»«+c»</p>'],
    ['tag name change keeps the new structure', '<p>a b</p>', '<div>a b</div>', '<div>a b</div>'],
    ['both empty', '', '', ''],
    ['old empty', '', '<p>New text</p>', '<p>«+New text»</p>'],
    ['new empty', '<p>Old text</p>', '', '<p>«-Old text»</p>'],
  ])('%s', (...g) => check(g));
});

describe('options', () => {
  it('full replacement uses the raw inputs', () => {
    const r = diffHtml('<p>The quick brown fox</p>', '<ul><li>Lorem ipsum</li></ul>', { similarityThreshold: 0.5 });
    expect(r).toStrictEqual({
      html: '<div class="diff-removed" data-change-index="0"><p>The quick brown fox</p></div><div class="diff-added" data-change-index="1"><ul><li>Lorem ipsum</li></ul></div>',
      fullReplacement: true,
      similarity: 0,
    });
  });

  it('maxEditLength falls back to one replacement of all tokens', () => {
    expect(diffHtml('<p>a b c d</p>', '<p>w b y d</p>', { maxEditLength: 1, orphanMatchThreshold: 0 }).html).toBe(
      markup('<p>«-a b c d»</p><p>«+w b y d»</p>'),
    );
    expect(diffHtml('<p>a b c d</p>', '<p>w b y d</p>', { maxEditLength: 4, orphanMatchThreshold: 0 }).html).toBe(
      markup('<p>«-a»«+w» b «-c»«+y» d</p>'),
    );
  });

  it('has no similarity key without a threshold', () => {
    expect(diffHtml('a', 'b')).toStrictEqual({ html: markup('«-a»«+b»'), fullReplacement: false });
  });
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const OPTION_SETS: HtmlDiffOptions[] = [{}, { ignoreFormattingTags: false }, { ignoreCase: true }, { orphanMatchThreshold: 0 }, { orphanMatchThreshold: 0.9 }];

function assertProperties(oldHtml: string, newHtml: string, options: HtmlDiffOptions, strict: boolean): void {
  const html = diffHtml(oldHtml, newHtml, options).html;
  const context = JSON.stringify({ oldHtml, newHtml, options, html });
  expect(htmlProblems(html, strict), context).toEqual([]);
  const ignoreFormatting = options.ignoreFormattingTags !== false;
  const lower = options.ignoreCase === true;
  // Everything outside removed markers is the new document; everything outside added markers is
  // the old one (unchanged text is spelled as in the new document, hence the key normalization).
  expect(sideText(html, 'removed'), context).toBe(documentText(newHtml, ignoreFormatting));
  expect(sideText(html, 'added', lower), context).toBe(documentText(oldHtml, ignoreFormatting, lower));
  const indexes = changeIndexes(html);
  expect(indexes, context).toEqual(indexes.map((_, i) => i));
}

describe('properties', () => {
  it('valid documents: valid output, content preserved, sequential indexes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), fc.constantFrom(...OPTION_SETS), (seed, options) => {
        const [oldHtml, newHtml] = randomHtmlPair(seed);
        assertProperties(oldHtml, newHtml, options, true);
      }),
      { numRuns: 1500, seed: 12 },
    );
  });

  const FRAGMENTS = [
    '<p>', '</p>', '<div>', '</div>', '<ul>', '</ul>', '<li>', '</li>', '<table>', '<tr>', '<td>', '</td>', '</tr>', '</table>',
    '<a href="x">', '</a>', '<b>', '</b>', '<br>', '<img src="y">', '<script>', '</script>', '</SCRIPT>', '<style>',
    '<!--', '-->', '<![CDATA[', ']]>', '<!doctype html>', '<?pi?>', '<p title="', '"', "'", '>', '<', '&', '&amp;', '&nbsp;',
    '&#x1F600;', '&bogus;', 'a', 'b', 'word', ' ', '\n', '😀', '\ud83d', '‍', 'é', 'é', '“',
  ];
  const soup = fc.array(fc.constantFrom(...FRAGMENTS), { maxLength: 25 }).map((parts) => parts.join(''));

  it('arbitrary tag soup: balanced output, markers hold text only, content preserved', () => {
    fc.assert(
      fc.property(soup, soup, fc.constantFrom(...OPTION_SETS), (oldHtml, newHtml, options) => {
        assertProperties(oldHtml, newHtml, options, false);
      }),
      { numRuns: 3000, seed: 34 },
    );
  });

  it('is deterministic and never throws on unrelated documents', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const [a] = randomHtmlPair(seed);
      const [, b] = randomHtmlPair(seed + 1000);
      expect(diffHtml(a, b)).toStrictEqual(diffHtml(a, b));
    }
  });
});
