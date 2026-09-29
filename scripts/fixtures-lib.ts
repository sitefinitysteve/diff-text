/**
 * Builds every fixture group in memory from @diff-text/core.
 * generate-fixtures.ts writes them; check-fixtures.ts compares them with fixtures/.
 */
import {
  buildHeatmap,
  buildHunks,
  buildMoves,
  buildRows,
  buildSplitRows,
  buildTimeline,
  computeDiff,
  computeSimilarity,
  computeStats,
  diffHtml,
  lineStats,
  minimapMarksLines,
  minimapMarksText,
  renderHeatmap,
  renderHtmlDiff,
  renderMinimap,
  renderPlayback,
  renderTimeline,
  renderWithMinimap,
  renderSplit,
  renderStats,
  renderText,
  renderUnified,
} from '../packages/core/src/index';
import type {
  DiffOptions,
  HeatmapRenderOptions,
  HtmlDiffOptions,
  LineOptions,
  MinimapMark,
  PlaybackOptions,
  RenderOptions,
  TextMode,
  TimelineOptions,
} from '../packages/core/src/index';
import { extractMarkerText } from './html-text';
import { randomHtmlPair } from '../packages/core/src/__tests__/htmlGen';

type Case = [name: string, oldText: string, newText: string, options?: Record<string, unknown>];

export interface Fixture {
  name: string;
  old?: string;
  new?: string;
  /** timeline fixtures only (instead of old/new). */
  versions?: string[];
  options: Record<string, unknown>;
  expected: Record<string, unknown>;
  mustBeValidHtml?: boolean;
}

export type FixtureGroups = Record<string, Fixture[]>;

// ---------------------------------------------------------------------------
// Text modes
// ---------------------------------------------------------------------------

const common: Case[] = [
  ['both empty', '', ''],
  ['old empty', '', 'Hello world'],
  ['new empty', 'Hello world', ''],
  ['identical', 'The same text. Twice!\nLine two.', 'The same text. Twice!\nLine two.'],
  ['single word replaced', 'The quick brown fox', 'The quick red fox'],
  ['punctuation', 'Hello, world!', 'Hello world.'],
  ['emoji', 'I ❤️ cats \u{1F63A}', 'I ❤️ dogs \u{1F436}'],
  ['CJK', '我喜欢猫。', '我喜欢狗。'],
  ['mixed CJK and Latin', '東京 is big', '京都 is big'],
  ['accents', 'café naïve résumé', 'cafe naive résumé'],
  ['combining mark vs precomposed', 'café', 'café'],
  ['CRLF vs LF', 'one\r\ntwo\r\n', 'one\ntwo\nthree\n'],
  ['whitespace-only change', 'a b  c', 'a  b c'],
  ['tabs and newlines', ' foo\tbar\n', 'foo bar\n\n'],
  ['ignoreCase off', 'Hello World', 'hello world'],
  ['ignoreCase on', 'Hello World', 'hello world', { ignoreCase: true }],
  ['multi-line prose', 'First sentence. Second one!\nThird?', 'First sentence. Second two!\nThird? Fourth.'],
  ['insert at both ends', 'world', 'hello world again'],
  ['HTML-special characters are escaped', `<b>"x" & 'y'</b>`, `<b>"x" & 'z'</b>`],
  ['repeated tokens', 'a a a b', 'a b a a'],
  ['maxEditLength fallback', 'one two three', 'uno dos tres', { maxEditLength: 1 }],
  ['unusual whitespace', 'a\uFEFFb\u2028c\u2029d e', 'a\u1680b\u202Fc\u205Fd  e'],
  ['ignoreCase final sigma', 'ΣΟΦΟΣ ΟΔΟΣ.', 'σοφος οδος.', { ignoreCase: true }],
  ['ignoreCase dotted I and Kelvin sign', 'İstanbul 5\u212A', 'i\u0307stanbul 5k', { ignoreCase: true }],
  ['ignoreCase sharp s and titlecase digraph', 'STRASSE \u01C5', 'straße \u01C6', { ignoreCase: true }],
];

const extra: Record<TextMode, Case[]> = {
  chars: [
    ['surrogate pair edit', 'x\u{1F600}y', 'x\u{1F601}y'],
    ['ignoreCase chars', 'ABC', 'abd', { ignoreCase: true }],
  ],
  words: [
    ['dedupe: deletion between keeps', 'foo bar baz', 'foo baz'],
    ['dedupe: replacement', 'foo bar baz', 'foo qux baz'],
    ['dedupe: newline before deletion', 'foo\nbar baz', 'foo baz'],
    ['dedupe: newline insertion', 'foo baz', 'foo\nbar baz'],
    ['dedupe: runs of spaces', 'foo   bar baz', 'foo  baz'],
    ['deletion at start', 'foo bar', 'bar'],
    ['deletion at end', 'foo bar', 'foo'],
    ['insertion at start', 'bar', 'foo bar'],
    ['whitespace-only text', '   ', ' \n '],
    ['leading and trailing whitespace', '  lead trail  ', ' lead  trail '],
    ['contractions and hyphens', "don't re-enter", "do not reenter"],
    ['numbers and underscores', 'v1_2 costs 10.50', 'v1_3 costs 10.75'],
  ],
  wordsWithSpace: [
    ['each newline is a token', 'a\n\nb', 'a\nb'],
    ['CRLF newline token', 'a\r\nb', 'a\nb'],
    ['spaces are tokens', 'a b', 'a  b'],
  ],
  lines: [
    ['no final newline', 'a\nb', 'a\nb\n'],
    ['blank lines', 'a\n\nb\n', 'a\nb\n\n'],
    ['ignoreWhitespace', 'a\n  b  \nc\n', 'a\nb\nc \n', { ignoreWhitespace: true }],
    ['ignoreWhitespace off', 'a\n  b  \nc\n', 'a\nb\nc \n'],
    ['newlineIsToken', 'a\nb\nc', 'a\nb c\n', { newlineIsToken: true }],
    ['stripTrailingCr', 'one\r\ntwo\r\n', 'one\ntwo\nthree\n', { stripTrailingCr: true }],
    ['ignoreCase lines', 'Alpha\nBeta\n', 'alpha\nBETA\ngamma\n', { ignoreCase: true }],
    ['ignoreWhitespace and ignoreCase', '  Alpha\nBeta\n', 'alpha  \nbeta\n', { ignoreWhitespace: true, ignoreCase: true }],
    ['lone CR is not a line break', 'a\rb\n', 'a\rc\n'],
    ['ignoreWhitespace with newlineIsToken', 'a\n \nb', 'a\n\nb', { ignoreWhitespace: true, newlineIsToken: true }],
  ],
  sentences: [
    ['abbreviation splits', 'Mr. Smith went home. He left!', 'Mr. Jones went home. He left!'],
    ['runs of whitespace between sentences', 'Wait...  what?  Yes.', 'Wait...  why?  Yes.'],
    ['trailing newline', 'End.', 'End.\n'],
    ['no space after period', 'a.b. c', 'a.b. d'],
    ['question and exclamation', 'Why? Because! Fine.', 'Why? Because. Fine.'],
    ['ignoreCase sentences', 'Hello there. Bye.', 'HELLO THERE. Bye!', { ignoreCase: true }],
  ],
};

function textGroup(mode: TextMode): Fixture[] {
  return [...common, ...extra[mode]].map(([name, oldText, newText, options = {}]) => {
    const changes = computeDiff(mode, oldText, newText, options as DiffOptions);
    return {
      name,
      old: oldText,
      new: newText,
      options,
      expected: { changes, html: renderText(mode, changes), stats: computeStats(changes) },
    };
  });
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

const similarityCases: Case[] = [
  ['whitespace runs do not inflate similarity', 'a b', 'a          b'],
  ['punctuation removed', 'Hello, world!', 'Hello world!'],
  ['both empty', '', ''],
  ['old empty', '', 'abc'],
  ['new empty', 'abc', ''],
  ['tags only', '<p></p>', '<br>'],
  ['identical', 'The quick brown fox.', 'The quick brown fox.'],
  ['one word changed', 'The quick brown fox jumps over the lazy dog.', 'The quick brown fox leaps over the lazy dog.'],
  ['unrelated', 'It is expressly agreed and understood by the parties.', 'Item 1: House. Item 2: Car.'],
  ['tags are stripped', '<p>Hello <b>world</b></p>', 'Hello world'],
  ['smart quotes normalized', '“Quoted” and ‘single’', '"Quoted" and \'single\''],
  ['emoji counts as one code point', 'a \u{1F600}', 'a'],
  ['CJK', '我喜欢猫', '我喜欢狗'],
  ['newlines collapse', 'line one\n\n\nline two', 'line one line two'],
  ['case sensitive', 'Hello World', 'hello world'],
  ['angle brackets are a tag only for HTML input', 'hello < world > test', 'hello test'],
  ['plain-text comparison operators', '1 < 2 and 3 > 2', '1 2'],
  ['directional: old to new', 'cc b', 'b!cc'],
  ['directional: new to old', 'b!cc', 'cc b'],
  ['whitespace-only markup counts as empty', '<p>  </p>', 'hello'],
  ['curly apostrophe normalized', 'don\u2019t stop', "don't stop"],
];

function similarityGroup(): Fixture[] {
  return similarityCases.map(([name, oldText, newText]) => {
    // similarity: HTML input (tags stripped, the diffHtml threshold); similarityText: plain text
    // (what the stats badge shows, so html renders with it).
    const similarity = computeSimilarity(oldText, newText);
    const similarityText = computeSimilarity(oldText, newText, { html: false });
    const stats = computeStats(computeDiff('words', oldText, newText));
    return {
      name,
      old: oldText,
      new: newText,
      options: {},
      expected: { similarity, similarityText, stats, html: renderStats(stats, similarityText) },
    };
  });
}

// ---------------------------------------------------------------------------
// Line views
// ---------------------------------------------------------------------------

const numbered = (n: number, change: (i: number) => string | null = () => null) =>
  Array.from({ length: n }, (_, k) => change(k + 1) ?? `line ${k + 1}`).join('\n') + '\n';

const lineCases: Case[] = [
  ['both empty', '', ''],
  ['old empty', '', 'a\nb\n'],
  ['new empty', 'a\nb\n', ''],
  ['identical', 'a\nb\nc\n', 'a\nb\nc\n'],
  ['one line changed in the middle', numbered(20), numbered(20, (i) => (i === 10 ? 'line ten' : null))],
  ['two distant changes', numbered(30), numbered(30, (i) => (i === 4 ? 'four' : i === 25 ? 'twenty-five' : null))],
  ['changes merged by overlapping context', numbered(15), numbered(15, (i) => (i === 5 ? 'five' : i === 10 ? 'ten' : null))],
  ['a single unchanged line between changes is never folded', 'a\nb\nc\n', 'A\nb\nC\n'],
  ['two unchanged lines between changes fold at context 0', 'a\nb\nc\nd\n', 'A\nb\nc\nD\n'],
  ['more removed than added', 'keep\nold one\nold two\nold three\nkeep\n', 'keep\nnew one\nkeep\n'],
  ['more added than removed', 'keep\nold\nkeep\n', 'keep\nnew one\nnew two\nnew three\nkeep\n'],
  ['intra-line word diff', 'The quick brown fox\njumps over\n', 'The quick red fox\njumps over\n'],
  ['low-similarity pair skips intra-line', 'alpha beta gamma\n', 'one two three\n'],
  ['long line skips intra-line', 'x '.repeat(600) + 'end\n', 'x '.repeat(600) + 'fin\n'],
  ['CRLF vs LF', 'one\r\ntwo\r\n', 'one\ntwo\n'],
  ['stripTrailingCr', 'one\r\ntwo\r\n', 'one\ntwo\nthree\n', { stripTrailingCr: true }],
  ['ignoreWhitespace', 'a\n  b\nc\n', 'a\nb  \nd\n', { ignoreWhitespace: true }],
  ['ignoreCase', 'Alpha\nBeta\n', 'alpha\nGamma\n', { ignoreCase: true }],
  ['no final newline', 'a\nb', 'a\nb\n'],
  ['HTML-special characters are escaped', '<p class="x">\n&amp;\n', '<p class=\'y\'>\n&amp;\n'],
  ['unicode lines', '\u{1F600} smile\n東京\n', '\u{1F601} grin\n東京\n'],
  ['indentation change keeps each side', '    return x;\n', '  return y;\n'],
  ['tab-indented edit', '\tif (a) {\n\t\tgo();\n', '\tif (b) {\n\t\tgo();\n'],
  ['whitespace-only change within a line', 'a b\n', 'a  b\n'],
  ['ignoreCase keeps each side spelling', 'Hello World\n', 'hello world!\n', { ignoreCase: true }],
];

function unifiedGroup(): Fixture[] {
  const out: Fixture[] = [];
  for (const contextLines of [3, 0]) {
    for (const [name, oldText, newText, options = {}] of lineCases) {
      const opts = { ...options, contextLines } as LineOptions;
      const hunks = buildHunks(oldText, newText, opts);
      out.push({
        name: `${name} (context ${contextLines})`,
        old: oldText,
        new: newText,
        options: opts as Record<string, unknown>,
        expected: { hunks, html: renderUnified(hunks), stats: lineStats(hunks) },
      });
    }
  }
  return out;
}

function splitGroup(): Fixture[] {
  const out: Fixture[] = [];
  for (const contextLines of [3, 1, 0]) {
    for (const [name, oldText, newText, options = {}] of lineCases) {
      const opts = { ...options, contextLines } as LineOptions;
      const hunks = buildSplitRows(oldText, newText, opts);
      out.push({
        name: `${name} (context ${contextLines})`,
        old: oldText,
        new: newText,
        options: opts as Record<string, unknown>,
        expected: { hunks, html: renderSplit(hunks), stats: lineStats(hunks) },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const statsCases: Case[] = [
  ['chars', 'kitten', 'sitting', { mode: 'chars' }],
  ['chars emoji', '\u{1F600}\u{1F600}', '\u{1F600}', { mode: 'chars' }],
  ['words', 'The quick brown fox', 'The slow brown fox', { mode: 'words' }],
  ['words both empty', '', '', { mode: 'words' }],
  ['words old empty', '', 'one two', { mode: 'words' }],
  ['wordsWithSpace', 'a b', 'a  b', { mode: 'wordsWithSpace' }],
  ['sentences', 'One. Two.', 'One. Three.', { mode: 'sentences' }],
  ['lines text mode', 'a\nb\n', 'a\nc\n', { mode: 'lines' }],
  ['unified lines', numbered(10), numbered(10, (i) => (i === 3 ? 'three' : null)) + 'extra\n', { mode: 'unified' }],
  ['unified identical', 'a\nb\n', 'a\nb\n', { mode: 'unified' }],
  ['split lines', 'a\nb\nc\n', 'a\nB\n', { mode: 'split' }],
  ['CJK chars', '我喜欢猫', '我喜欢狗', { mode: 'chars' }],
  ['singular units', 'a', 'ab', { mode: 'chars' }],
  ['singular lines', 'a\n', 'a\nb\n', { mode: 'unified' }],
  ['similarity rounding', 'Hello, world!', 'Hello world!', { mode: 'words' }],
];

function statsGroup(): Fixture[] {
  return statsCases.map(([name, oldText, newText, options = {}]) => {
    const mode = options.mode as TextMode | 'unified' | 'split';
    const stats =
      mode === 'unified'
        ? lineStats(buildHunks(oldText, newText))
        : mode === 'split'
          ? lineStats(buildSplitRows(oldText, newText))
          : computeStats(computeDiff(mode, oldText, newText));
    const similarity = computeSimilarity(oldText, newText, { html: false });
    return {
      name,
      old: oldText,
      new: newText,
      options,
      expected: { stats, similarity, html: renderStats(stats, similarity), htmlWithoutSimilarity: renderStats(stats) },
    };
  });
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const htmlCases: Case[] = [
  ['attribute-only change', '<p class="a">Hello world</p>', '<p class="b">Hello world</p>'],
  ['link href change', '<p><a href="/x">link</a> text</p>', '<p><a href="/y">link</a> text</p>'],
  ['link href and text change', '<p><a href="/x">old link</a></p>', '<p><a href="/y">new link</a></p>'],
  ['new paragraph', '<p>One</p>', '<p>One</p><p>Two</p>'],
  ['removed paragraph', '<p>One</p><p>Two</p>', '<p>One</p>'],
  ['word change in paragraph', '<p>The quick brown fox</p>', '<p>The quick red fox</p>'],
  ['entities', '<p>Tom &amp; Jerry</p>', '<p>Tom &amp; Jerry &lt;3</p>'],
  ['comments', '<p>a<!-- c1 --> b</p>', '<p>a<!-- c2 --> c</p>'],
  ['br and img', '<p>a<br>b</p>', '<p>a<br>c<img src="x.png" alt=""></p>'],
  ['quoted > in attribute', '<p title="a>b">x y</p>', '<p title="a>b">x z</p>'],
  ['list edit', '<ul><li>a</li><li>b</li></ul>', '<ul><li>a</li><li>c</li><li>d</li></ul>'],
  ['table cell edit', '<table><tr><td>1</td><td>2</td></tr></table>', '<table><tr><td>1</td><td>3</td></tr></table>'],
  ['formatting tags ignored', '<p>Hello <strong>world</strong></p>', '<p>Hello world</p>'],
  ['smart quotes normalized', '<p>“Hello”</p>', '<p>"Hello"</p>'],
  [
    'full replacement',
    '<p>It is expressly agreed and understood by the parties that the Husband shall maintain his policy.</p>',
    '<ul><li>Item 1: House.</li><li>Item 2: Car.</li></ul>',
    { similarityThreshold: 0.3 },
  ],
  [
    'above threshold stays word level',
    '<p>The quick brown fox jumps over the lazy dog.</p>',
    '<p>The quick brown fox leaps over the lazy dog.</p>',
    { similarityThreshold: 0.3 },
  ],
  ['both empty', '', ''],
  ['old empty', '', '<p>New text</p>'],
  ['new empty', '<p>Old text</p>', ''],
  ['empty side never fully replaced', '', '<p>New text</p>', { similarityThreshold: 0.9 }],
  ['plain text', 'Hello world', 'Hello brave new world'],
  // Regressions from the 1.5.x component suites: a replaced sentence must come out as one
  // removed run and one added run, never with old and new words interleaved.
  [
    'second sentence replaced, no interleaving',
    'The quick brown fox jumps over the lazy dog. Each party acknowledges that any term of this agreement will be interpreted accordingly.',
    'The quick brown fox jumps over the lazy dog. Test writing new content.',
    { similarityThreshold: 0.3 },
  ],
  [
    'long paragraph, second sentence replaced',
    '<p>Each Party acknowledges that at all times during the Term of this Agreement the Surrogate will retain bodily autonomy and the right to obtain a second medical opinion with respect to any proposed test, procedure, treatment, or medication which will be covered by the Intended Parents as an Additional Expense Amounts. Each Party acknowledges that any term of this Agreement where the Surrogate gives her consent with respect to any proposed test, procedure, treatment, or medication will be interpreted by the Parties to mean that the Surrogate intends to give her consent at the relevant time if such consent is fully informed and voluntary.</p>\n',
    '<p>Each Party acknowledges that at all times during the Term of this Agreement the Surrogate will retain bodily autonomy and the right to obtain a second medical opinion with respect to any proposed test, procedure, treatment, or medication which will be covered by the Intended Parents as an Additional Expense Amounts. Test writing new content.</p>\n',
  ],
  [
    'paragraph with strong, sentences replaced',
    '<p>The Surrogate has offered to act as an altruistic surrogate and to gestate the Embryo created with the Ova and the Sperm until the Birth of the Child. The Surrogate is over the age of TWENTY-ONE (21) years and is in a relationship of permanence with the Spouse. The Surrogate has 3 dependant child or children ("<strong>Surrogate\'s Dependant(s)</strong>").</p>\n',
    '<p>The Surrogate has offered to act as an altruistic surrogate and to gestate the Embryo created with the Ova and the Sperm until the Birth of the Child. Test writing new content.</p>\n',
  ],
  ['nested formatting tags ignored', '<strong><em>"Clinic"</em></strong> means selected.', '"Clinic" means selected and revised.'],
  [
    'formatting tags kept when ignoreFormattingTags is false',
    '<strong>"Clinic"</strong> means selected.',
    '"Clinic" means selected.',
    { ignoreFormattingTags: false },
  ],
  ['threshold 0 never fully replaces', 'Completely different text here.', 'XYZ 123.', { similarityThreshold: 0 }],
  ['threshold 1 fully replaces any change', 'Hello world', 'Hello worlds', { similarityThreshold: 1 }],
  ['threshold 1 keeps identical text', 'Hello world', 'Hello world', { similarityThreshold: 1 }],
  // Unified engine (SPEC 12.2): raw text elements, validity, entities, recovery, grouping, Unicode.
  ['content after a script is kept', '<p>alpha</p>', '<p>alpha</p><script>var s = "</div>";</script><p>beta</p>'],
  ['uppercase script end tag', '<script>var s = "</div>";</SCRIPT><p>tail one</p>', '<script>var s = "</div>";</script><p>tail two</p>'],
  ['changed style body', '<p>x</p><style>p { color: red }</style><p>after</p>', '<p>x</p><style>p { color: blue }</style><p>after 2</p>'],
  ['unterminated script', '<p>a</p>', '<p>a</p><script>if (x) <p>'],
  ['added paragraph after a table', '<table><tr><td></td></tr></table>', '<table><tr><td>one</td></tr></table><p>one<br>one</p>'],
  ['removed list item', '<ul><li>a</li><li>b</li></ul>', '<ul><li>a</li></ul>'],
  ['removed table row', '<table><tr><td>a</td></tr><tr><td>b</td></tr></table>', '<table><tr><td>a</td></tr></table>'],
  ['removed div with a paragraph', '<div><p>a</p></div><p>b</p>', '<p>b</p>'],
  ['link inside a link', '<p>see <a href="/y">docs</a> now</p>', '<p><a href="/x">see now</a></p>'],
  ['nested same-name elements', '<div><div>a</div><div>b</div></div>', '<div><div>a</div></div>'],
  ['removed wrapper', '<div><div>a</div></div>', '<div>a</div>'],
  ['dropped boundary separates words', '<p>x</p><p>a</p><p>b</p><p>y</p>', '<p>x</p><p>y</p>'],
  ['unclosed and stray tags in the new document', '<div>a</div>', '<div>a<p>b</div></span>'],
  ['entities compare decoded', '<p>&eacute;cole &amp; co&nbsp;x &#233;t&#xE9; &#x1F600;</p>', '<p>école & co\u00a0x été 😀</p>'],
  ['stray < equals &lt;', '<p>a &lt; b</p>', '<p>a < b</p>'],
  ['unknown entity is literal', '<p>&check;</p>', '<p>✓</p>'],
  ['unbalanced attribute quote', '<p>one</p>', '<p>one</p><p title="x>two</p>'],
  ['orphan below the threshold', 'ab XY cde', 'fg XY hij'],
  ['orphan exactly at the threshold', 'ab XYZ cde', 'fg XYZ hij'],
  ['orphan run containing a tag', '<p>alpha <a href="#">beta</a> gamma</p>', '<p>one <a href="#">beta</a> two</p>', { orphanMatchThreshold: 0.9 }],
  ['orphanMatchThreshold 0', 'alpha beta gamma delta', 'one beta two three', { orphanMatchThreshold: 0 }],
  ['orphanMatchThreshold 0.9', 'the quick brown fox jumps', 'the slow brown dog jumps', { orphanMatchThreshold: 0.9 }],
  ['emoji and ZWJ sequences', '<p>x😀y 👨\u200d👩\u200d👧 🇨🇦 e\u0301</p>', '<p>x😁y 👨\u200d👩\u200d👦 🇫🇷 e</p>'],
  ['ignoreCase with a real change', '<p>Hello World</p>', '<p>hello there WORLD</p>', { ignoreCase: true }],
  ['formatting added, ignoreFormattingTags false', '<p>make this bold now</p>', '<p>make <strong>this bold</strong> now</p>', { ignoreFormattingTags: false }],
  ['doctype, CDATA and processing instructions', '<!DOCTYPE html><?pi x?><p><![CDATA[x<y]]>a</p>', '<!doctype html><?pi x?><p><![CDATA[x<y]]>b</p>'],
  ['uppercase tags and void spellings', '<P CLASS="x">Hello<BR>there<img src="x.png"></P>', '<p class="y">Hello<br />there<img src="x.png"/></p>'],
  ['whitespace runs are equal', '<p>a b</p>', '<p>a \n  b</p>'],
  ['maxEditLength fallback', '<p>a b c d</p>', '<p>w b y d</p>', { maxEditLength: 1, orphanMatchThreshold: 0 }],
];

// Generated documents (packages/core/src/__tests__/htmlGen.ts): the TS and PHP engines must agree byte for byte.
const RANDOM_HTML_OPTIONS: Array<Record<string, unknown>> = [{}, { ignoreFormattingTags: false }, { ignoreCase: true }, { orphanMatchThreshold: 0 }, { orphanMatchThreshold: 0.9 }];
for (let seed = 1; seed <= 50; seed++) {
  const [oldHtml, newHtml] = randomHtmlPair(seed);
  htmlCases.push([`random document ${seed}`, oldHtml, newHtml, RANDOM_HTML_OPTIONS[seed % RANDOM_HTML_OPTIONS.length]!]);
}

function htmlGroup(): Fixture[] {
  return htmlCases.map(([name, oldText, newText, options = {}]) => {
    const result = diffHtml(oldText, newText, options as HtmlDiffOptions);
    const html = renderHtmlDiff(result);
    const { addedText, removedText, valid } = extractMarkerText(html);
    if (!valid) throw new Error(`html fixture "${name}" produced invalid HTML: ${html}`);
    const expected: Record<string, unknown> = { html, addedText, removedText, fullReplacement: result.fullReplacement };
    if (result.similarity !== undefined) expected.similarity = result.similarity;
    return { name, old: oldText, new: newText, options, expected, mustBeValidHtml: true };
  });
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

const sentencesN = (n: number, change: (i: number) => string | null = () => null) =>
  Array.from({ length: n }, (_, k) => change(k + 1) ?? `Sentence number ${k + 1}.`).join(' ');

const heatmapCases: Case[] = [
  ['both empty', '', ''],
  ['old empty (all new)', '', 'A brand new opening. And a second thought!'],
  ['new empty (all removed)', 'Everything here goes. Nothing stays.', ''],
  ['identical', 'The cat sat on the mat. It was warm.', 'The cat sat on the mat. It was warm.'],
  ['single sentence lightly edited', 'The quick brown fox jumps over the lazy dog.', 'The quick brown fox leaps over the lazy dog.'],
  ['single sentence edited', 'Dogs barked loudly outside.', 'Dogs barked outside the house.'],
  ['single sentence rewritten', 'The meeting is on Monday.', 'Please join us for the quarterly review.'],
  [
    'AI-edited paragraph',
    'Our product helps teams work faster. It was built in 2019. Customers love the simple interface. We plan to add more features soon.',
    'Our platform helps teams work much faster. Customers love the clean, simple interface. It now supports real-time collaboration! We plan to add more integrations soon.',
  ],
  ['heavily edited but still paired', 'The report was finished late on Friday evening.', 'The final report was delivered late on Monday morning instead.'],
  ['sentence inserted in the middle', 'First point. Second point. Third point.', 'First point. A new aside appears here. Second point. Third point.'],
  ['sentence removed in the middle', 'First point. Second point. Third point.', 'First point. Third point.'],
  ['sentences reordered', 'Alpha comes first. Beta follows it. Gamma ends the list.', 'Gamma ends the list. Alpha comes first. Beta follows it.'],
  ['whitespace-only change is unchanged', 'Hello   there. General Kenobi.', 'Hello there.  General   Kenobi.'],
  ['ignoreCase off', 'THE END IS NEAR. Run.', 'the end is near. Run.'],
  ['ignoreCase on', 'THE END IS NEAR. Run.', 'the end is near. Run.', { ignoreCase: true }],
  ['unicode', 'Café au lait costs €3. Das ist gut! 東京は大きい。', 'Café au lait costs €4. Das ist sehr gut! 東京は大きい。'],
  ['emoji', 'I love cats \u{1F63A}. They purr.', 'I love dogs \u{1F436}. They purr.'],
  ['CRLF paragraphs', 'Line one ends.\r\nLine two ends.\r\n', 'Line one ends.\r\nLine 2 ends here.\r\n'],
  ['multiple paragraphs', 'Intro sentence.\n\nBody has facts. More facts!\n\nThe end.', 'Intro sentence.\n\nBody has new facts. More facts!\n\nA different ending.'],
  ['leading and trailing whitespace', '  Starts with space. Ends with space.  ', ' Starts with space. Ends differently.   '],
  ['no terminal punctuation', 'no punctuation at all', 'no punctuation here at all'],
  ['HTML-special characters are escaped', 'Use <b> & "quotes". Fine.', "Use <i> & 'quotes'. Fine."],
  ['removed markers hidden', 'Keep this. Drop this one. Keep that.', 'Keep this. Keep that.', { showRemoved: false }],
  ['legend hidden', 'One. Two.', 'One. Three.', { legend: false }],
  ['anchors with idPrefix', 'One fish. Two fish.', 'One fish. Red fish. Blue fish.', { anchors: true, idPrefix: 'hm' }],
  [
    'exact-match fallback above 500 sentences',
    sentencesN(503),
    sentencesN(503, (i) => (i === 1 ? 'A changed opening.' : i === 503 ? 'A changed ending.' : i === 250 ? 'Sentence number 250 edited.' : null)),
  ],
];

function heatmapGroup(): Fixture[] {
  return heatmapCases.map(([name, oldText, newText, options = {}]) => {
    const heatmap = buildHeatmap(oldText, newText, options as { ignoreCase?: boolean });
    return {
      name,
      old: oldText,
      new: newText,
      options,
      expected: { heatmap, html: renderHeatmap(heatmap, options as HeatmapRenderOptions) },
    };
  });
}

// ---------------------------------------------------------------------------
// Moves (unified and split with detectMoves)
// ---------------------------------------------------------------------------

const moveCases: Case[] = [
  ['both empty', '', ''],
  ['identical', 'a\nb\nc\n', 'a\nb\nc\n'],
  ['old empty (all new)', '', 'a\nb\n'],
  ['new empty (all removed)', 'a\nb\n', ''],
  ['single line moved down', 'moved\nkeep 1\nkeep 2\nkeep 3\n', 'keep 1\nkeep 2\nkeep 3\nmoved\n'],
  [
    'block moved up',
    'head\nx 1\nx 2\nx 3\nfunction f() {\n  return 1;\n}\ntail\n',
    'head\nfunction f() {\n  return 1;\n}\nx 1\nx 2\nx 3\ntail\n',
  ],
  [
    'many moves cycle the color slots',
    Array.from({ length: 8 }, (_, i) => `line ${i + 1}`).join('\n') + '\n',
    ['line 8', 'line 7', 'line 6', 'line 5', 'line 4', 'line 3', 'line 2', 'line 1'].join('\n') + '\n',
  ],
  [
    'move plus an edit',
    'alpha beta gamma delta\nalpha beta gamma epsilon one\nalpha beta gamma zeta\nk1\nk2\nk3\nk4\nk5\n',
    'k1\nk2\nk3\nk4\nk5\nalpha beta gamma delta\nalpha beta gamma epsilon two\nalpha beta gamma zeta\n',
  ],
  [
    'move plus an edit with near matches',
    'alpha beta gamma delta\nalpha beta gamma epsilon one\nalpha beta gamma zeta\nk1\nk2\nk3\nk4\nk5\n',
    'k1\nk2\nk3\nk4\nk5\nalpha beta gamma delta\nalpha beta gamma epsilon two\nalpha beta gamma zeta\n',
    { moveSimilarity: 0.6 },
  ],
  ['blank lines inside a moved block', 'p1\n\np2\nk1\nk2\nk3\nk4\n', 'k1\nk2\nk3\nk4\np1\n\np2\n'],
  ['blank-only blocks are never moves', 'x\n\n\nk1\nk2\nk3\n', 'k1\nk2\nk3\n\n\nx\n'],
  ['minMoveLines 2 ignores single-line moves', 'solo\nk1\nk2\nk3\nk4\npair a\npair b\n', 'k1\npair a\npair b\nk2\nk3\nk4\nsolo\n', { minMoveLines: 2 }],
  ['minMoveLines default keeps single-line moves', 'solo\nk1\nk2\nk3\nk4\npair a\npair b\n', 'k1\npair a\npair b\nk2\nk3\nk4\nsolo\n'],
  ['ignoreCase normalization', 'Moved Line\nk1\nk2\n', 'k1\nk2\nmoved line\n', { ignoreCase: true }],
  ['whitespace-normalized move', '    indented   text\nk1\nk2\n', 'k1\nk2\nindented text\n'],
  ['indentation change in place is not a move', 'k1\n  same\nk2\n', 'k1\nsame\nk2\n'],
  ['unicode lines', '東京\n\u{1F600} smile\nkeep\n', 'keep\n東京\n\u{1F600} smile\n'],
  ['CRLF', 'm1\r\nm2\r\nk\r\n', 'k\r\nm1\r\nm2\r\n'],
  ['moved block next to a repeated line', 'k0\nx\ny\nz\nk1\nk2\nk3\nk4\n', 'x\nk0\nk1\nk2\nk3\nk4\nx\ny\nz\n'],
  ['collapsed context around moves', numbered(20), numbered(20).replace('line 2\n', '').replace('line 19\n', 'line 19\nline 2\n'), { contextLines: 1 }],
  ['HTML-special characters are escaped', '<a href="x">\n&\nk\n', 'k\n<a href="x">\n&\n'],
];

function movesGroup(): Fixture[] {
  const out: Fixture[] = [];
  for (const view of ['unified', 'split'] as const) {
    for (const [name, oldText, newText, options = {}] of moveCases) {
      const opts = { ...options, detectMoves: true, idPrefix: 'mv' } as LineOptions & RenderOptions;
      const moves = buildMoves(buildRows(oldText, newText, opts), opts);
      const hunks = view === 'unified' ? buildHunks(oldText, newText, opts) : buildSplitRows(oldText, newText, opts);
      const html = view === 'unified' ? renderUnified(hunks as never, opts) : renderSplit(hunks as never, opts);
      out.push({
        name: `${name} (${view})`,
        old: oldText,
        new: newText,
        options: { view, ...opts } as Record<string, unknown>,
        expected: { moves, hunks, html, stats: lineStats(hunks) },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

const minimapCases: Case[] = [
  ['words both empty', '', '', { view: 'words' }],
  ['words identical', 'same text here', 'same text here', { view: 'words' }],
  ['words all new', '', 'all of this is new', { view: 'words' }],
  ['words all removed (empty new text)', 'all of this goes', '', { view: 'words' }],
  ['words single change', 'the quick brown fox', 'the slow brown fox jumps', { view: 'words' }],
  ['chars many changes', 'abcdefghij', 'aXcdYfghiZ', { view: 'chars' }],
  ['chars half-up rounding', 'x'.repeat(799), 'y' + 'x'.repeat(799), { view: 'chars' }],
  ['chars code points', '\u{1F600}a\u{1F600}', '\u{1F600}b\u{1F600}\u{1F601}', { view: 'chars' }],
  ['sentences', 'One. Two. Three.', 'One. Deux. Three. Four.', { view: 'sentences' }],
  ['lines text mode', 'a\nb\nc\n', 'a\nB\nc\nd\n', { view: 'lines' }],
  ['unified identical', 'a\nb\n', 'a\nb\n', { view: 'unified' }],
  ['unified one change in the middle', numbered(30), numbered(30, (i) => (i === 15 ? 'fifteen' : null)), { view: 'unified' }],
  ['unified all new', '', 'a\nb\nc\n', { view: 'unified' }],
  ['unified all removed', 'a\nb\nc\n', '', { view: 'unified' }],
  ['unified thirds', 'a\nb\nc\n', 'a\nB\nc\n', { view: 'unified' }],
  ['unified several runs with collapsed blocks', numbered(40), numbered(40, (i) => (i === 3 ? 'three' : i === 20 ? null : i === 37 ? 'x' : null)).replace('line 20\n', ''), { view: 'unified', contextLines: 1 }],
  ['split several runs', numbered(12), numbered(12, (i) => (i === 2 ? 'two' : i === 9 ? 'nine' : null)) + 'thirteen\n', { view: 'split', contextLines: 1 }],
  ['unified with moves', 'm\nk1\nk2\nk3\n', 'k1\nk2\nk3\nm\n', { view: 'unified', detectMoves: true }],
  ['split with moves and edits', 'm\nk1\nold\nk2\n', 'k1\nnew\nk2\nm\n', { view: 'split', detectMoves: true }],
  ['CRLF unified', 'one\r\ntwo\r\nthree\r\n', 'one\r\n2\r\nthree\r\n', { view: 'unified' }],
];

function minimapGroup(): Fixture[] {
  return minimapCases.map(([name, oldText, newText, options = {}]) => {
    const view = options.view as TextMode | 'unified' | 'split';
    const opts = { ...options, idPrefix: 'mm', anchors: true } as LineOptions & RenderOptions & DiffOptions;
    let marks: MinimapMark[];
    let diff: string;
    if (view === 'unified' || view === 'split') {
      const hunks = view === 'unified' ? buildHunks(oldText, newText, opts) : buildSplitRows(oldText, newText, opts);
      marks = minimapMarksLines(hunks);
      diff = view === 'unified' ? renderUnified(hunks as never, opts) : renderSplit(hunks as never, opts);
    } else {
      const changes = computeDiff(view, oldText, newText, opts);
      marks = minimapMarksText(changes);
      diff = renderText(view, changes, opts);
    }
    const minimap = renderMinimap(marks, opts);
    return {
      name,
      old: oldText,
      new: newText,
      options: opts as Record<string, unknown>,
      expected: { marks, minimap, diff, html: renderWithMinimap(diff, minimap) },
    };
  });
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

type TimelineCase = [name: string, versions: string[], options?: Record<string, unknown>];

const drafts = [
  'The plan is simple. We ship on Friday.',
  'The plan is simple. We ship on Monday.',
  'The plan is simple and clear. We ship on Monday.',
  'Our plan is simple and clear. We ship on Monday! Tell the team.',
  'Our plan is clear. We ship Monday. Tell the whole team.',
];

const timelineCases: TimelineCase[] = [
  ['no versions', []],
  ['1 version', ['Only one draft.']],
  ['2 versions', drafts.slice(0, 2)],
  ['2 identical versions', ['Same.', 'Same.']],
  ['3 versions', drafts.slice(0, 3)],
  ['5 versions', drafts],
  ['5 versions unified', ['a\n', 'a\nb\n', 'a\nB\n', 'a\nB\nc\n', 'B\nc\n'], { mode: 'unified' }],
  ['3 versions split', ['x\ny\n', 'x\nY\n', 'X\nY\nz\n'], { mode: 'split' }],
  ['unified with moves', ['m\nk1\nk2\n', 'k1\nk2\nm\n', 'k1\nm\nk2\n'], { mode: 'unified', detectMoves: true }],
  ['custom labels', drafts.slice(0, 3), { labels: ['Draft', 'Review', 'Final'] }],
  ['partial labels', drafts.slice(0, 3), { labels: ['Start'] }],
  ['labels are escaped', ['a', 'b'], { labels: ['<old> & "x"', "it's new"] }],
  ['empty versions', ['', 'text', '']],
  ['unicode', ['東京 is big', '京都 is big', '京都 is huge \u{1F600}']],
  ['CRLF lines mode', ['one\r\ntwo\r\n', 'one\ntwo\n', 'one\ntwo\nthree\n'], { mode: 'lines' }],
  ['chars mode', ['kitten', 'sitten', 'sittin', 'sitting'], { mode: 'chars' }],
  ['sentences mode', ['One. Two.', 'One. Three.', 'Zero. One. Three.'], { mode: 'sentences' }],
  ['ignoreCase', ['Hello World', 'hello world', 'hello there'], { ignoreCase: true }],
  ['unknown mode falls back to words', ['a b', 'a c'], { mode: 'nope' }],
];

function timelineGroup(): Fixture[] {
  return timelineCases.map(([name, versions, options = {}]) => {
    const opts = { ...options, idPrefix: 'tl' } as TimelineOptions & RenderOptions;
    const timeline = buildTimeline(versions, opts);
    const steps = timeline.steps.map((s) => ({
      step: s.step,
      fromLabel: s.fromLabel,
      toLabel: s.toLabel,
      stats: s.stats,
      similarity: s.similarity,
    }));
    return {
      name,
      versions,
      options: opts as Record<string, unknown>,
      expected: { mode: timeline.mode, labels: timeline.labels, steps, html: renderTimeline(timeline, opts) },
    };
  });
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

const playbackCases: Case[] = [
  ['both empty', '', '', { mode: 'words' }],
  ['identical', 'nothing changes', 'nothing changes', { mode: 'words' }],
  ['all new', '', 'fresh text', { mode: 'words' }],
  ['all removed', 'old text', '', { mode: 'words' }],
  ['single change', 'The quick brown fox', 'The quick red fox', { mode: 'words' }],
  ['many changes', 'one two three four five six', 'uno two tres four cinco six seven', { mode: 'words' }],
  ['chars', 'kitten', 'sitting', { mode: 'chars' }],
  ['sentences', 'Hi. How are you? Bye.', 'Hi. How is it going? Bye!', { mode: 'sentences' }],
  ['lines', 'a\nb\nc\n', 'a\nB\nc\nd\n', { mode: 'lines' }],
  ['wordsWithSpace', 'a  b', 'a b c', { mode: 'wordsWithSpace' }],
  ['speed 200', 'slow fox', 'quick fox', { mode: 'words', speed: 200 }],
  ['fractional speed is floored', 'slow fox', 'quick fox', { mode: 'words', speed: 250.7 }],
  ['zero speed is ignored', 'slow fox', 'quick fox', { mode: 'words', speed: 0 }],
  ['negative speed is ignored', 'slow fox', 'quick fox', { mode: 'words', speed: -5 }],
  ['non-numeric speed is ignored', 'slow fox', 'quick fox', { mode: 'words', speed: '300' }],
  ['unicode', '東京 \u{1F600}', '京都 \u{1F601}', { mode: 'chars' }],
  ['CRLF', 'one\r\ntwo\r\n', 'one\ntwo\n', { mode: 'lines' }],
  ['custom idPrefix', 'a b', 'a c', { mode: 'words', idPrefix: 'pb' }],
  ['anchors', 'a b', 'a c', { mode: 'words', idPrefix: 'pb', anchors: true }],
  ['HTML-special characters are escaped', '<b>"x"</b>', "<b>'y'</b>", { mode: 'words' }],
];

function playbackGroup(): Fixture[] {
  return playbackCases.map(([name, oldText, newText, options = {}]) => {
    const mode = options.mode as TextMode;
    const changes = computeDiff(mode, oldText, newText);
    return {
      name,
      old: oldText,
      new: newText,
      options,
      expected: { changes, html: renderPlayback(mode, changes, options as PlaybackOptions) },
    };
  });
}

// ---------------------------------------------------------------------------

export function buildFixtures(): FixtureGroups {
  return {
    chars: textGroup('chars'),
    words: textGroup('words'),
    wordsWithSpace: textGroup('wordsWithSpace'),
    lines: textGroup('lines'),
    sentences: textGroup('sentences'),
    similarity: similarityGroup(),
    split: splitGroup(),
    unified: unifiedGroup(),
    stats: statsGroup(),
    html: htmlGroup(),
    heatmap: heatmapGroup(),
    moves: movesGroup(),
    minimap: minimapGroup(),
    timeline: timelineGroup(),
    playback: playbackGroup(),
  };
}

export function serialize(fixtures: Fixture[]): string {
  return JSON.stringify(fixtures, null, 2) + '\n';
}
