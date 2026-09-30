#!/usr/bin/env node
/*
 * Regenerates jsdiff-cases.php: reference outputs from jsdiff v8 that the PHP
 * port must reproduce exactly (tokenizers and diff results).
 *
 *   npm pack diff@8 && tar xzf diff-8.*.tgz
 *   JSDIFF=./package node tests/data/generate-jsdiff-cases.cjs > tests/data/jsdiff-cases.php
 */
const path = require('path');
const D = require(path.resolve(process.env.JSDIFF || 'node_modules/diff', 'libcjs/index.js'));

const curated = [
  ['', ''], ['', 'Hello world'], ['Hello world', ''], ['Hello world', 'Hello world'],
  ['Hello world', 'Hello big world'], ['Hello big world', 'Hello world'],
  ['The quick brown fox', 'The slow brown fox'], ['foo bar baz', 'foo baz'],
  ['foo bar baz', 'foo qux baz'], ['foo\nbar baz', 'foo baz'], ['foo baz', 'foo\nbar baz'],
  ['foo   bar baz', 'foo  baz'], ['foo\tbar\nbaz', 'foo baz'], ['  leading', 'leading  '],
  ['   ', '  '], [' ', ''], ['Hello, world!', 'Hello world!'], ['a.b,c;d', 'a,b.c;d'],
  ['café au lait', 'cafe au lait'], ['naïve résumé', 'naive resume'], ['Größe', 'grösse'],
  ['日本語のテキスト', '日本語テキスト'], ['emoji 😀 here', 'emoji 😃 here'], ['👍🏽 ok', '👍🏻 ok'],
  ['Hello World', 'hello world'], ['ÉCOLE', 'école'],
  ['line one\nline two\nline three', 'line one\nline modified\nline three'],
  ['line one\nline two', 'line one\nline two\nline three'], ['a\nb\nc\n', 'a\nc\n'],
  ['a\r\nb\r\n', 'a\nb\n'], ['a\nb', 'a\nb\n'], ['  a\nb  \n', 'a\n  b\n'], ['\n\n\n', '\n\n'],
  ['one\n\ntwo', 'one\ntwo'], ['I like cats. Dogs are okay.', 'I like cats. Birds are great.'],
  ['First sentence. Second sentence.', 'First sentence.  Second sentence.'],
  ['Wait! What? Yes.', 'Wait! Why? Yes.'], ['No punctuation here', 'No punctuation there'],
  ['End.', 'End. '], ['A.B. C', 'A.B.  C'], ['Mr. Smith went.\nHome.', 'Mr. Jones went.\nHome.'],
  ['abcabba', 'cbabac'], ['xab', 'yabab'], ['abcd', 'acbd'], ['aaaa', 'aa'], ['ab', 'ba'],
  [' nbsp　ideographic', ' nbsp ideographic'], ['tab\there', 'tab here'],
  ['it’s “quoted”', "it's \"quoted\""], ['x y z', 'x y z'],
  ['soft­hyphen', 'softhyphen'], ['multiply × divide ÷', 'multiply * divide /'],
  // diffWords maximumOverlap corner cases (whitespace overlap between a deletion and its neighbour).
  ['c  bc\n', '\n. c  '], ['b.   aca', 'a. '],
  // ...and ones where the overlap is a proper suffix of the deletion's whitespace.
  ['a b. b\t', '.\n \n  '], ['.   a\t  \n', ' a\n\n'], ['.  \tb', '\tb.a'],
  // Unusual whitespace: all are JS \s (SPEC §1), so they split words and are trimmed.
  ['a\uFEFFb\u2028c', 'a b c'], ['x\u2029y\u1680z', 'x y  z'], ['p\u202Fq\u205Fr', 'p q\u3000r'],
  ['\uFEFF lead', 'lead\u2028'],
  // Case folding (the ignoreCase option sets include these): final sigma, dotted I, sharp s,
  // a titlecase digraph and the Kelvin sign.
  ['ΣΟΦΟΣ ΟΔΟΣ.', 'σοφος οδος.'], ['İstanbul', 'i\u0307stanbul'], ['STRASSE', 'straße'],
  ['\u01C5ungla', '\u01C6ungla'], ['5\u212A', '5k'], ['ΑΣ\nΣΑ', 'ας\nσα'],
];

// Unrelated ~2500-character texts: they share letters and some words but have a large edit
// distance (chars: well past 1024 edits, so the PHP engine grows its frontier arrays).
const vocab = ['the', 'of', 'and', 'river', 'stone', 'garden', 'quietly', 'north', 'engine', 'paper', 'seven',
  'harbor', 'yellow', 'bright', 'winter', 'market', 'silver', 'forest', 'window', 'ladder', 'copper', 'orange'];
function prose(seedValue, length) {
  let x = seedValue;
  const r = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let out = '';
  while (out.length < length) {
    out += vocab[Math.floor(r() * vocab.length)];
    out += r() < 0.1 ? '. ' : r() < 0.05 ? '\n' : ' ';
  }
  return out.slice(0, length);
}
const largePairs = [[prose(11, 2500), prose(97, 2500)], [prose(5, 2600), prose(6, 2400)], [prose(3, 2500), prose(3, 2500).split('').reverse().join('')],
  // Over 1024 pure insertions / deletions before a match: the frontier grows while the
  // outermost diagonals are still being extended.
  ['aaaaa', 'b'.repeat(1100) + 'aaaaa'], ['b'.repeat(1100) + 'aaaaa', 'aaaaa']];

let seed = 20260929;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
const alphabet = ['a', 'b', 'c', ' ', '  ', '\n', '\r\n', '.', '!', '?', ',', 'é', '　', '\t', 'X', 'Hello', 'world', 'A.', '😀', '-'];
function rs(n) { let s = ''; for (let i = 0; i < n; i++) s += alphabet[Math.floor(rnd() * alphabet.length)]; return s; }
function mutate(s) {
  const a = [...s];
  const k = 1 + Math.floor(rnd() * 4);
  for (let i = 0; i < k; i++) {
    const p = Math.floor(rnd() * (a.length + 1));
    const r = rnd();
    if (r < 0.33) a.splice(p, 1); else if (r < 0.66) a.splice(p, 0, ...rs(1)); else a.splice(p, 1, ...rs(2));
  }
  return a.join('');
}
const pairs = curated.slice();
for (let i = 0; i < 40; i++) { const a = rs(4 + Math.floor(rnd() * 14)); pairs.push([a, mutate(a)]); }
pairs.push(...largePairs);

const modes = {
  chars: [D.diffChars, [{}, { ignoreCase: true }]],
  words: [D.diffWords, [{}, { ignoreCase: true }]],
  wordsWithSpace: [D.diffWordsWithSpace, [{}, { ignoreCase: true }]],
  lines: [D.diffLines, [{}, { ignoreWhitespace: true }, { newlineIsToken: true }, { stripTrailingCr: true },
    { ignoreCase: true }, { ignoreWhitespace: true, newlineIsToken: true }]],
  sentences: [D.diffSentences, [{}, { ignoreCase: true }]],
};
const tokenizers = {
  chars: (s, o = {}) => D.characterDiff.removeEmpty(D.characterDiff.tokenize(s, o)),
  words: (s, o = {}) => D.wordDiff.removeEmpty(D.wordDiff.tokenize(s, o)),
  wordsWithSpace: (s, o = {}) => D.wordsWithSpaceDiff.removeEmpty(D.wordsWithSpaceDiff.tokenize(s, o)),
  lines: (s, o = {}) => D.lineDiff.removeEmpty(D.lineDiff.tokenize(s, o)),
  sentences: (s, o = {}) => D.sentenceDiff.removeEmpty(D.sentenceDiff.tokenize(s, o)),
};

const php = (v) => {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    return '"' + [...v].map((ch) => {
      const c = ch.codePointAt(0);
      if (ch === '\\') return '\\\\';
      if (ch === '"') return '\\"';
      if (ch === '$') return '\\$';
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      if (c < 0x20 || c > 0x7e) return '\\u{' + c.toString(16).toUpperCase() + '}';
      return ch;
    }).join('') + '"';
  }
  if (Array.isArray(v)) return '[' + v.map(php).join(', ') + ']';
  return '[' + Object.entries(v).map(([k, x]) => php(k) + ' => ' + php(x)).join(', ') + ']';
};

const diffCases = [];
const tokenCases = [];
const seen = new Set();
const toRows = (changes) => changes.map((c) => [c.added ? 1 : c.removed ? -1 : 0, c.value, c.count]);
for (const [a, b] of pairs) {
  const large = largePairs.some(([x, y]) => x === a && y === b);
  for (const [mode, [fn, optionSets]] of Object.entries(modes)) {
    // Large pairs: one run per mode is enough (lines/sentences have few tokens anyway).
    for (const options of large ? optionSets.slice(0, 1) : optionSets) {
      diffCases.push([mode, a, b, options, toRows(fn(a, b, options)), false]);
    }
  }
  for (const s of [a, b]) {
    if (seen.has(s) || large) continue;
    seen.add(s);
    for (const [mode, tok] of Object.entries(tokenizers)) tokenCases.push([mode, s, tok(s)]);
  }
}
// maxEditLength: jsdiff returns undefined; PHP returns a whole replacement.
// (largePairs[0] with a limit just above the initial frontier size also runs out: the engine
// must grow its arrays up to maxEditLength + 2, no further.)
const limitPairs = [['abcdef', 'abXdeY'], ['one two three', 'one 2 three'], ['same', 'same'], ['ab', 'abxyz'], ['abxyz', 'ab'], ['', 'abc']];
for (let i = 0; i < 20; i++) { const a = rs(3 + Math.floor(rnd() * 10)); limitPairs.push([a, mutate(a)]); }
const limitRuns = limitPairs.map((p) => [p, [0, 1, 2, 4]]);
limitRuns.push([largePairs[0], [1100, 3000]]);
for (const [[a, b], limits] of limitRuns) {
  for (const [mode, fn] of [['chars', D.diffChars], ['words', D.diffWords], ['lines', D.diffLines]]) {
    for (const maxEditLength of limits) {
      const r = fn(a, b, { maxEditLength });
      if (r) {
        diffCases.push([mode, a, b, { maxEditLength }, toRows(r), false]);
      } else {
        // jsdiff returns undefined; the contract (SPEC §7.1) is a whole replacement whose counts
        // are jsdiff's own token counts of each side.
        const whole = [];
        if (a !== '') whole.push([-1, a, tokenizers[mode](a, { maxEditLength }).length]);
        if (b !== '') whole.push([1, b, tokenizers[mode](b, { maxEditLength }).length]);
        diffCases.push([mode, a, b, { maxEditLength }, whole, true]);
      }
    }
  }
}

// Str::lower() must equal String.prototype.toLowerCase(), including Final_Sigma (which depends on
// the Cased / Case_Ignorable neighbours) on every PHP version.
const lowerAlphabet = ['Σ', 'σ', 'ς', 'Α', 'ο', 'A', 'b', ' ', "'", '.', ':', '\u0301', '\u00AD', '\u02B0', '\u2019',
  'ª', 'Ⓐ', '1', '😀', 'İ', 'ẞ', '\u01C5', '\u212A', '\u0345', '\u10A0', '-', '\u200D'];
const lowerCases = [];
for (let i = 0; i < 400; i++) {
  let t = '';
  for (let k = 1 + Math.floor(rnd() * 7); k > 0; k--) t += lowerAlphabet[Math.floor(rnd() * lowerAlphabet.length)];
  lowerCases.push([t, t.toLowerCase()]);
}

// Str::utf8() must decode like WHATWG TextDecoder: one U+FFFD per maximal ill-formed subpart.
const byteAlphabet = [0x41, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0, 0xc2, 0xdf, 0xe0, 0xe1, 0xed, 0xee, 0xef, 0xf0, 0xf1, 0xf4, 0xf5, 0xff];
const utf8Cases = [];
for (let i = 0; i < 300; i++) {
  const bytes = [];
  for (let k = 1 + Math.floor(rnd() * 8); k > 0; k--) bytes.push(byteAlphabet[Math.floor(rnd() * byteAlphabet.length)]);
  utf8Cases.push([Buffer.from(bytes).toString('hex'), new TextDecoder('utf-8').decode(Uint8Array.from(bytes))]);
}

// Myers stress rows for the engine itself (Myers::diff on code points): every pair of strings
// over {a, b} up to length 6, and random pairs over 2-4 letters up to length 40. The expected
// value is jsdiff's diffChars result as [type, count] runs, which is exactly Myers::diff's format.
function allStrings(alpha, max) {
  const out = [''];
  let frontier = [''];
  for (let l = 1; l <= max; l++) {
    frontier = frontier.flatMap((s) => alpha.map((c) => s + c));
    out.push(...frontier);
  }
  return out;
}
const runs = (a, b) => D.diffChars(a, b).map((c) => [c.added ? 1 : c.removed ? -1 : 0, c.count]);
const myersCases = [];
const binary = allStrings(['a', 'b'], 6);
for (const a of binary) for (const b of binary) myersCases.push([a, b, runs(a, b)]);
for (let i = 0; i < 3000; i++) {
  const alpha = 'abcd'.slice(0, 2 + Math.floor(rnd() * 3));
  const a = Array.from({ length: Math.floor(rnd() * 40) }, () => alpha[Math.floor(rnd() * alpha.length)]).join('');
  const b = rnd() < 0.5
    ? Array.from({ length: Math.floor(rnd() * 40) }, () => alpha[Math.floor(rnd() * alpha.length)]).join('')
    : mutate(a).replace(/[^abcd]/g, '');
  myersCases.push([a, b, runs(a, b)]);
}

let out = '<?php\n\n// Generated by generate-jsdiff-cases.cjs from jsdiff ' + require(path.resolve(process.env.JSDIFF || 'node_modules/diff', 'package.json')).version + '. Do not edit by hand.\n';
out += '// diff rows: [mode, old, new, options, changes, fallback] where a change is [type(1 add, -1 remove, 0 keep), value, count];\n';
out += '//   fallback = true when jsdiff returned undefined (maxEditLength): changes is then the whole replacement with jsdiff token counts\n';
out += '// token rows: [mode, text, tokens]; lower rows: [text, JS toLowerCase]; utf8 rows: [hex bytes, TextDecoder output];\n';
out += '// myers rows: [old, new, jsdiff diffChars runs as [type, count]]\n\n';
out += 'return [\n    \'diff\' => [\n' + diffCases.map((c) => '        ' + php(c) + ',').join('\n') + '\n    ],\n';
out += '    \'tokens\' => [\n' + tokenCases.map((c) => '        ' + php(c) + ',').join('\n') + '\n    ],\n';
out += '    \'lower\' => [\n' + lowerCases.map((c) => '        ' + php(c) + ',').join('\n') + '\n    ],\n';
out += '    \'utf8\' => [\n' + utf8Cases.map((c) => '        ' + php(c) + ',').join('\n') + '\n    ],\n';
// One compact line per row: myers rows are [old, new, [[type, count], ...]] over code points.
out += '    \'myers\' => [\n' + myersCases.map((c) => '        ' + php(c) + ',').join('\n') + '\n    ],\n];\n';
process.stdout.write(out);
