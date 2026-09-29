<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\Change;
use PhpDiffText\DiffChars;
use PhpDiffText\DiffLines;
use PhpDiffText\DiffWords;
use PhpDiffText\DiffWordsWithSpace;
use PhpDiffText\Tokenizer;

final class EdgeCasesTest extends TestCase
{
    /** @param Change[] $changes */
    private static function flat(array $changes): array
    {
        return array_map(static fn(Change $c): array => [$c->added ? '+' : ($c->removed ? '-' : '='), $c->value, $c->count], $changes);
    }

    public function testCharsCountCodePointsNotBytes(): void
    {
        $this->assertSame([['=', 'a', 1], ['-', '😀', 1], ['+', 'é', 1]], self::flat(DiffChars::diff('a😀', 'aé')));
    }

    public function testCommonSuffixIsNotTrimmed(): void
    {
        // SPEC §4: suffix trimming would give [+ a, = a].
        $this->assertSame([['=', 'a', 1], ['+', 'a', 1]], self::flat(DiffChars::diff('a', 'aa')));
        $this->assertSame([['+', 'c', 1], ['=', 'ab', 2], ['-', 'c', 1]], self::flat(DiffChars::diff('abc', 'cab')));
    }

    public function testIgnoreCaseShowsNewSpelling(): void
    {
        $this->assertSame([['=', 'hello world', 11]], self::flat(DiffChars::diff('Hello World', 'hello world', ['ignoreCase' => true])));
    }

    public function testMaxEditLengthZeroOnIdenticalInputIsNotAReplacement(): void
    {
        $this->assertSame([['=', 'same', 1]], self::flat(DiffWords::diff('same', 'same', ['maxEditLength' => 0])));
    }

    public function testMaxEditLengthIsFlooredAndNegativeIgnored(): void
    {
        $this->assertSame(self::flat(DiffChars::diff('abc', 'abd', ['maxEditLength' => 2])), self::flat(DiffChars::diff('abc', 'abd', ['maxEditLength' => 2.9])));
        $this->assertSame(self::flat(DiffChars::diff('abc', 'xyz')), self::flat(DiffChars::diff('abc', 'xyz', ['maxEditLength' => -1])));
        $this->assertSame([['-', 'abc', 3], ['+', 'abd', 3]], self::flat(DiffChars::diff('abc', 'abd', ['maxEditLength' => 1.5])));
    }

    public function testWholeReplacementCountsTokensOfTheMode(): void
    {
        $this->assertSame([['-', "a\nb\n", 2], ['+', "x\ny\nz", 3]], self::flat(DiffLines::diff("a\nb\n", "x\ny\nz", ['maxEditLength' => 1])));
    }

    public function testBooleanOptionsUseJavascriptTruthiness(): void
    {
        $expected = self::flat(DiffChars::diff('A', 'a', ['ignoreCase' => true]));
        $this->assertSame($expected, self::flat(DiffChars::diff('A', 'a', ['ignoreCase' => 1])));
        $this->assertSame($expected, self::flat(DiffChars::diff('A', 'a', ['ignoreCase' => 'yes'])));
        $this->assertNotSame($expected, self::flat(DiffChars::diff('A', 'a', ['ignoreCase' => 0])));
        $this->assertNotSame($expected, self::flat(DiffChars::diff('A', 'a', ['ignoreCase' => ''])));
    }

    public function testUnsupportedOptionsAreIgnored(): void
    {
        $this->assertSame(self::flat(DiffChars::diff('a b', 'a  b')), self::flat(DiffChars::diff('a b', 'a  b', ['ignoreWhitespace' => true, 'newlineIsToken' => true])));
    }

    public function testJavascriptWhitespaceSetIsUsed(): void
    {
        // U+00A0 and U+3000 are whitespace in JS (and in jsdiff's tokenizers), unlike PCRE's \s.
        $this->assertSame(["a\u{A0}", "\u{A0}b"], Tokenizer::words("a\u{A0}b"));
        $this->assertSame(['a', "\u{3000}", 'b'], Tokenizer::wordsWithSpace("a\u{3000}b"));
        $this->assertSame(['Hi.', "\u{3000}", 'There'], Tokenizer::sentences("Hi.\u{3000}There"));
        $this->assertSame([['=', "  x\u{3000}\n", 1]], self::flat(DiffLines::diff("x\n", "  x\u{3000}\n", ['ignoreWhitespace' => true])));
    }

    public function testNulIsNotWhitespace(): void
    {
        // PHP's trim() strips "\0"; JavaScript's does not.
        $this->assertSame(['a', "\0", 'b'], Tokenizer::wordsWithSpace("a\0b"));
        $this->assertNotSame([['=', "b\0", 1]], self::flat(DiffLines::diff("b\n", "b\0", ['ignoreWhitespace' => true])));
    }

    public function testInvalidUtf8DoesNotBreakTokenizers(): void
    {
        $bad = "caf\xC3 ok";
        $this->assertNotSame([], Tokenizer::words($bad));
        $this->assertNotSame([], DiffWords::diff($bad, 'cafe ok'));
    }

    public function testWordsDedupesWhitespaceLikeJsdiff(): void
    {
        $this->assertSame([['=', 'foo ', 1], ['-', 'bar ', 1], ['=', 'baz', 1]], self::flat(DiffWords::diff('foo bar baz', 'foo baz')));
        $this->assertSame([['=', 'foo ', 1], ['-', 'bar', 1], ['+', 'qux', 1], ['=', ' baz', 1]], self::flat(DiffWords::diff('foo bar baz', 'foo qux baz')));
        $this->assertSame([['=', 'Hello', 1], ['-', ',', 1], ['=', ' world!', 2]], self::flat(DiffWords::diff('Hello, world!', 'Hello world!')));
    }

    public function testWordsWithSpaceReportsWhitespaceChanges(): void
    {
        $this->assertSame([['=', 'a', 1], ['-', ' ', 1], ['+', '  ', 1], ['=', 'b', 1]], self::flat(DiffWordsWithSpace::diff('a b', 'a  b')));
    }

    public function testLineOptions(): void
    {
        $this->assertSame([['=', "a\n", 1], ['-', 'b', 1], ['+', "b\n", 1]], self::flat(DiffLines::diff("a\nb", "a\nb\n")));
        $this->assertSame([['=', "a\nb\n", 2]], self::flat(DiffLines::diff("a\r\nb\r\n", "a\nb\n", ['stripTrailingCr' => true])));
        $this->assertSame([['=', "a\n\n", 3], ['-', 'b', 1], ['+', 'c', 1]], self::flat(DiffLines::diff("a\n\nb", "a\n\nc", ['newlineIsToken' => true])));
    }

    public function testRenderEscapesExactlyFiveCharacters(): void
    {
        $this->assertSame(
            '<div class="text-diff text-diff-chars"><span>&lt;a href=&quot;x&quot;&gt;&amp;&#39;</span></div>',
            DiffChars::render('<a href="x">&\'', '<a href="x">&\''),
        );
    }
}
