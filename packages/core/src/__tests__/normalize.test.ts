import { describe, expect, it } from 'vitest';
import { normalizeQuotes, stripFormattingTags } from '../normalize';

// SPEC 12.1. These helpers decide what the HTML diff and similarity treat as equal, and
// both are ported to PHP, so the exact character and tag sets are the contract.
// (Moved here from the identical normalizeHtml.test.ts copies in the Vue and React packages.)

describe('normalizeQuotes', () => {
  it.each([
    ['left double', '“Hello', '"Hello'],
    ['right double', 'Hello”', 'Hello"'],
    ['low-9 double (German opening)', '„Hello”', '"Hello"'],
    ['left single', '‘Hello', "'Hello"],
    ['right single (apostrophe)', 'don’t', "don't"],
    ['low-9 single', '‚Hello’', "'Hello'"],
    ['only curly quotes', '“”‘’„‚', '""\'\'"\''],
    ['nested single in double', '“He said ‘hello’”', '"He said \'hello\'"'],
    ['straight quotes untouched', '"A" and \'B\'', '"A" and \'B\''],
    ['attribute quotes untouched', '<span class="test">“Hello”</span>', '<span class="test">"Hello"</span>'],
    ['other typographic quotes untouched (guillemets, primes)', '«a» ′ ″', '«a» ′ ″'],
    ['empty', '', ''],
  ])('%s', (_name, input, expected) => {
    expect(normalizeQuotes(input)).toBe(expected);
  });
});

describe('stripFormattingTags', () => {
  it.each([
    ['strong', '<strong>Hello</strong>', 'Hello'],
    ['em', '<em>Hello</em>', 'Hello'],
    ['b', '<b>Hello</b>', 'Hello'],
    ['i', '<i>Hello</i>', 'Hello'],
    ['u', '<u>Hello</u>', 'Hello'],
    ['s', '<s>Hello</s>', 'Hello'],
    ['mark', '<mark>Hello</mark>', 'Hello'],
    ['sub', '<sub>Hello</sub>', 'Hello'],
    ['sup', '<sup>Hello</sup>', 'Hello'],
    ['nested', '<strong><em>Hello</em></strong>', 'Hello'],
    ['inside a kept block', '<p><strong>Hello</strong> world</p>', '<p>Hello world</p>'],
    ['with attributes', '<strong class="bold" data-x="1">Hello</strong>', 'Hello'],
    ['case-insensitive', '<STRONG>Hello</Strong>', 'Hello'],
    ['several in sequence', '<strong>A</strong> <em>B</em> <b>C</b>', 'A B C'],
    ['block and structural tags kept', '<div><p><span>a</span></p><ul><li>b</li></ul></div>', '<div><p><span>a</span></p><ul><li>b</li></ul></div>'],
    ['links kept', '<a href="#">Hello</a>', '<a href="#">Hello</a>'],
    ['void tags kept', 'a<br>b<br/>c', 'a<br>b<br/>c'],
    ['tag names only matched whole (span, strike, section)', '<span>a</span><strike>b</strike><section>c</section>', '<span>a</span><strike>b</strike><section>c</section>'],
    // The tag grammar is the HTML lexer's (SPEC 12.2): quoted attribute values may contain `>`.
    ['> in a double-quoted attribute', '<b title="a>b">x</b>', 'x'],
    ['class attribute', '<strong class="x">y</strong>', 'y'],
    ['> in a single-quoted attribute', "<em data-x='1>0'>z</em>", 'z'],
    ['self-closing', 'a<b/>b', 'ab'],
    ['raw text elements untouched', '<script>s = "<b>";</script><style>b{}</style>', '<script>s = "<b>";</script><style>b{}</style>'],
    ['comments untouched', 'a<!-- <i>x</i> -->b', 'a<!-- <i>x</i> -->b'],
    ['unbalanced quote is not a tag', '<b title="x>y', '<b title="x>y'],
    ['similar names kept', '<br><bdi>x</bdi><small>y</small><summary>z</summary>', '<br><bdi>x</bdi><small>y</small><summary>z</summary>'],
    ['no tags', 'Hello world', 'Hello world'],
    ['empty', '', ''],
  ])('%s', (_name, input, expected) => {
    expect(stripFormattingTags(input)).toBe(expected);
  });
});
