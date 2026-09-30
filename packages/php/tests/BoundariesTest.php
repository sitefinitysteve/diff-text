<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use PhpDiffText\Change;
use PhpDiffText\DiffChars;
use PhpDiffText\DiffLines;
use PhpDiffText\DiffSentences;
use PhpDiffText\DiffWords;
use PhpDiffText\DiffWordsWithSpace;
use PhpDiffText\LineModel;
use PhpDiffText\Similarity;
use PhpDiffText\Str;

/**
 * Hand-verified boundary goldens (the PHP twin of core's boundaries.test.ts). Each expected
 * value was worked out from SPEC.md; the comment next to it says how.
 */
final class BoundariesTest extends TestCase
{
    private static function keep(string $v, int $n): array
    {
        return ['value' => $v, 'added' => false, 'removed' => false, 'count' => $n];
    }

    private static function del(string $v, int $n): array
    {
        return ['value' => $v, 'added' => false, 'removed' => true, 'count' => $n];
    }

    private static function add(string $v, int $n): array
    {
        return ['value' => $v, 'added' => true, 'removed' => false, 'count' => $n];
    }

    /** @param Change[]|null $changes */
    private static function arrays(?array $changes): ?array
    {
        return $changes === null ? null : LineModel::changesToArrays($changes);
    }

    /** The only row of a one-line-pair split diff. */
    private function onlyRow(string $old, string $new, array $options = []): array
    {
        $hunks = LineModel::buildSplitRows($old, $new, $options);
        $this->assertCount(1, $hunks);
        $this->assertSame('hunk', $hunks[0]['type']);
        $this->assertCount(1, $hunks[0]['rows']);
        return $hunks[0]['rows'][0];
    }

    // ─── SPEC §10: split cells reproduce each side exactly ──────────────

    public function testLeftColumnKeepsOldIndentation(): void
    {
        // wordsWithSpace tokens: old ["    ","return"," ","x",";"], new ["  ","return"," ","y",";"];
        // the first tokens differ, so "    " is deleted and "  " inserted (deletion first on ties).
        $row = $this->onlyRow("    return x;\n", "  return y;\n");
        $this->assertSame('modified', $row['type']);
        $this->assertSame([self::del('    ', 1), self::keep('return ', 2), self::del('x', 1), self::keep(';', 1)], $row['left']['parts']);
        $this->assertSame([self::add('  ', 1), self::keep('return ', 2), self::add('y', 1), self::keep(';', 1)], $row['right']['parts']);
    }

    public function testTabsAreKept(): void
    {
        $row = $this->onlyRow("\tif (a)\n", "\tif (b)\n");
        $this->assertSame([self::keep("\tif (", 4), self::del('a', 1), self::keep(')', 1)], $row['left']['parts']);
        $this->assertSame([self::keep("\tif (", 4), self::add('b', 1), self::keep(')', 1)], $row['right']['parts']);
    }

    public function testWhitespaceOnlyChangeIsShown(): void
    {
        // Unchanged non-ws = 2 of 2 + 2 -> similarity 1, and the changed space run is highlighted.
        $row = $this->onlyRow("a b\n", "a  b\n");
        $this->assertSame([self::keep('a', 1), self::del(' ', 1), self::keep('b', 1)], $row['left']['parts']);
        $this->assertSame([self::keep('a', 1), self::add('  ', 1), self::keep('b', 1)], $row['right']['parts']);
    }

    public function testIgnoreCaseLeftColumnKeepsOldSpelling(): void
    {
        // ["Hello"," ","World"] vs ["hello"," ","world","!"]: 3 tokens equal under ignoreCase, "!" added.
        $changes = LineModel::intraLineDiff('Hello World', 'hello world!', ['ignoreCase' => true]);
        $this->assertSame([self::keep('hello world', 3), self::add('!', 1)], self::arrays($changes));
        $this->assertSame(
            ['left' => [self::keep('Hello World', 3)], 'right' => [self::keep('hello world', 3), self::add('!', 1)]],
            LineModel::splitParts($changes, 'Hello World'),
        );
        $this->assertNull(LineModel::intraLineDiff('Hello World', 'hello world!'));
    }

    // ─── SPEC §10: intra-line bounds ───────────────────────────────────

    public function testIntraLineLengthBoundIsInclusive(): void
    {
        $base = str_repeat('x ', 498); // 996 code points
        $old = $base . 'old!';
        $new = $base . 'new!';
        $this->assertSame(1000, mb_strlen($old));
        $this->assertSame([self::keep($base, 996), self::del('old', 1), self::add('new', 1), self::keep('!', 1)], self::arrays(LineModel::intraLineDiff($old, $new)));
        $this->assertNull(LineModel::intraLineDiff($old . '?', $new));
        $this->assertNull(LineModel::intraLineDiff($old, $new . '?'));
        // Code points, not bytes: 😀 is 4 bytes but 1 code point.
        $emoji = str_repeat('😀 ', 498);
        $this->assertNotNull(LineModel::intraLineDiff($emoji . 'old!', $emoji . 'new!'));
        $this->assertNull(LineModel::intraLineDiff($emoji . 'old!😀', $emoji . 'new!'));
    }

    public function testExactlyPointThreeKeepsParts(): void
    {
        // 2*3/(10+10) = 6/20, the double 0.3 exactly, so "< 0.3" is false.
        $this->assertSame(0.3, Similarity::compute('abc defghij', 'abc klmnopq', false));
        $this->assertSame([self::keep('abc ', 2), self::del('defghij', 1), self::add('klmnopq', 1)], self::arrays(LineModel::intraLineDiff('abc defghij', 'abc klmnopq')));
        $this->assertNull(LineModel::intraLineDiff('abc defghijk', 'abc klmnopqr')); // 6/22
    }

    // ─── SPEC §3/§7: maxEditLength ──────────────────────────────────────

    public function testMaxEditLengthEdges(): void
    {
        $diff = static fn(string $a, string $b, $max): array => LineModel::changesToArrays(DiffWords::diff($a, $b, ['maxEditLength' => $max]));
        // "a b c" -> "a x c" needs exactly 2 edits.
        $this->assertSame([self::keep('a ', 1), self::del('b', 1), self::add('x', 1), self::keep(' c', 1)], $diff('a b c', 'a x c', 2));
        $this->assertSame([self::del('a b c', 3), self::add('a x c', 3)], $diff('a b c', 'a x c', 1));
        $this->assertCount(2, $diff('a b c', 'a x c', 1.7)); // floored to 1
        $this->assertCount(4, $diff('a b c', 'a x c', -1)); // ignored
        $this->assertCount(4, $diff('a b c', 'a x c', 1e20)); // saturates: no limit, no cast warning
        $this->assertCount(4, $diff('a b c', 'a x c', INF)); // no limit
        $this->assertSame([self::del('a b', 2)], $diff('a b', '', 0));
        $chars = static fn(string $a, string $b): array => LineModel::changesToArrays(DiffChars::diff($a, $b, ['maxEditLength' => 0]));
        $this->assertSame([self::del('ab', 2), self::add('ac', 2)], $chars('ab', 'ac'));
        $this->assertSame([self::keep('ab', 2)], $chars('ab', 'ab'));
    }

    // ─── SPEC §9.2: contextLines ────────────────────────────────────────

    public function testContextLinesNormalization(): void
    {
        $lines = static fn(callable $f): string => implode("\n", array_map($f, range(1, 20))) . "\n";
        $a = $lines(static fn(int $i): string => "line $i");
        $b = $lines(static fn(int $i): string => $i === 11 ? 'changed' : "line $i");
        $shape = static fn($ctx): array => array_map(
            static fn(array $h): string => ($h['type'] === 'collapsed' ? 'C' . $h['count'] : 'H' . count($h['rows'])),
            LineModel::buildHunks($a, $b, ['contextLines' => $ctx]),
        );
        foreach ([-1, NAN, '2', null] as $bad) {
            $this->assertSame(['C7', 'H8', 'C6'], $shape($bad));
        }
        $this->assertSame(['C9', 'H4', 'C8'], $shape(1.7));
        $this->assertSame(['H21'], $shape(INF));
        // Beyond the int range: saturates (no float-to-int cast warning, no garbage value).
        $this->assertSame(['H21'], $shape(1e20));
        $this->assertSame(
            [['type' => 'collapsed', 'count' => 1, 'oldStart' => 1, 'newStart' => 1, 'rows' => [['type' => 'equal', 'oldNo' => 1, 'newNo' => 1, 'text' => 'a']]]],
            LineModel::buildHunks("a\n", "a\n"),
        );
    }

    // ─── SPEC §8: similarity input kinds and direction ──────────────────

    public function testSimilarityStripsTagsOnlyForHtml(): void
    {
        $this->assertSame(1.0, Similarity::compute('1 < 2 and 3 > 2', '1 2'));
        // Text: "1" and the last "2" survive: 2*2/(9+2).
        $this->assertSame(4 / 11, Similarity::compute('1 < 2 and 3 > 2', '1 2', false));
    }

    public function testSimilarityIsDirectional(): void
    {
        $this->assertSame(2 / 7, Similarity::compute('cc b', 'b!cc', false));
        $this->assertSame(4 / 7, Similarity::compute('b!cc', 'cc b', false));
    }

    // ─── SPEC §1: invalid UTF-8 ─────────────────────────────────────────

    public static function invalidUtf8(): iterable
    {
        // Expected values from WHATWG TextDecoder: one U+FFFD per maximal ill-formed subpart.
        yield 'lone lead byte' => ["\xC3", "\u{FFFD}"];
        yield 'truncated 3-byte' => ["a\xE2\x82b", "a\u{FFFD}b"];
        yield 'truncated 4-byte' => ["\xF0\x9F\x98", "\u{FFFD}"];
        yield 'encoded surrogate' => ["\xED\xA0\x80", "\u{FFFD}\u{FFFD}\u{FFFD}"];
        yield 'overlong' => ["\xC0\xAF", "\u{FFFD}\u{FFFD}"];
        yield 'above U+10FFFF' => ["\xF4\x90\x80\x80", "\u{FFFD}\u{FFFD}\u{FFFD}\u{FFFD}"];
        yield 'stray continuations' => ["ok\x80\x80z", "ok\u{FFFD}\u{FFFD}z"];
        yield 'valid is untouched' => ["é😀\u{10FFFF}", "é😀\u{10FFFF}"];
    }

    #[DataProvider('invalidUtf8')]
    public function testUtf8Scrub(string $bytes, string $expected): void
    {
        $this->assertSame($expected, Str::utf8($bytes));
    }

    public function testInvalidUtf8BecomesReplacementInEveryMode(): void
    {
        foreach ([DiffChars::class, DiffWords::class, DiffWordsWithSpace::class, DiffLines::class, DiffSentences::class] as $class) {
            $changes = $class::diff("x\xC3\n", "x\u{FFFD}\n");
            $this->assertCount(1, $changes, $class);
            $this->assertSame("x\u{FFFD}\n", $changes[0]->value, $class);
        }
        $rows = LineModel::buildRows("\xFF\n", "a\n");
        $this->assertSame("\u{FFFD}", $rows[0]['text']);
        $this->assertSame(1.0, Similarity::compute("a\xFF", "a\u{FFFD}", false));
    }

    // ─── SPEC §1: lowercase(s) = JavaScript toLowerCase() ───────────────

    public static function lowercase(): iterable
    {
        // Expected values from Node's String.prototype.toLowerCase().
        yield 'final sigma' => ['ΣΟΦΟΣ', 'σοφος'];
        yield 'final sigma per word' => ['ΟΔΟΣ ΚΑΙ ΟΔΟΣ.', 'οδος και οδος.'];
        yield 'lone sigma is medial' => ['Σ', 'σ'];
        yield 'sigma before case-ignorable then end' => ["ΑΣ'", "ας'"];
        yield 'sigma followed by letter after ignorable' => ["ΑΣ'Α", "ασ'α"];
        yield 'dotted capital I' => ['İstanbul', "i\u{307}stanbul"];
        yield 'sharp s stays' => ['STRASSE straße', 'strasse straße'];
        yield 'titlecase digraph' => ["\u{1C5}", "\u{1C6}"];
        yield 'Kelvin sign' => ["\u{212A}", 'k'];
        yield 'Unicode 16 letter' => ["\u{A7CB}", "\u{264}"];
        yield 'Unicode 17 letter' => ["\u{16EA0}", "\u{16EBB}"];
    }

    #[DataProvider('lowercase')]
    public function testLowerMatchesJavaScript(string $input, string $expected): void
    {
        $this->assertSame($expected, Str::lower($input));
    }

    public function testIgnoreCaseUsesJavaScriptLowercase(): void
    {
        // lines: the token is the whole line, "ΣΟΦΟΣ\n" lowercases to "σοφος\n" (final sigma): one keep.
        $this->assertSame([self::keep("σοφος\n", 1)], LineModel::changesToArrays(DiffLines::diff("ΣΟΦΟΣ\n", "σοφος\n", ['ignoreCase' => true])));
        // chars (and words, where Greek letters are single-character tokens): a lone "Σ" lowercases
        // to medial "σ", which is not final "ς". jsdiff gives keep "α", remove "Σ", add "ς".
        $this->assertSame([self::keep('α', 1), self::del('Σ', 1), self::add('ς', 1)], LineModel::changesToArrays(DiffChars::diff('ΑΣ', 'ας', ['ignoreCase' => true])));
    }
}
