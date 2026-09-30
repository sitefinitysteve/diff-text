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
use PhpDiffText\Myers;
use PhpDiffText\Str;
use PhpDiffText\Tokenizer;

/**
 * The text modes must reproduce jsdiff v8 exactly: same tokens, same change
 * objects (value, added, removed, count), same tie-breaking.
 *
 * Expected values live in tests/data/jsdiff-cases.php, generated from jsdiff
 * itself by tests/data/generate-jsdiff-cases.cjs.
 */
final class JsdiffParityTest extends TestCase
{
    private const DIFFS = [
        'chars' => DiffChars::class,
        'words' => DiffWords::class,
        'wordsWithSpace' => DiffWordsWithSpace::class,
        'lines' => DiffLines::class,
        'sentences' => DiffSentences::class,
    ];

    private static ?array $data = null;

    private static function data(): array
    {
        return self::$data ??= require __DIR__ . '/data/jsdiff-cases.php';
    }

    public static function diffCases(): iterable
    {
        foreach (self::data()['diff'] as $i => [$mode, $old, $new, $options, $expected, $fallback]) {
            $label = sprintf('%04d %s %s %s→%s', $i, $mode, json_encode($options), json_encode(mb_strimwidth($old, 0, 40, '…'), JSON_UNESCAPED_UNICODE), json_encode(mb_strimwidth($new, 0, 40, '…'), JSON_UNESCAPED_UNICODE));
            yield $label => [$mode, $old, $new, $options, $expected, $fallback];
        }
    }

    public static function tokenCases(): iterable
    {
        foreach (self::data()['tokens'] as $i => [$mode, $text, $tokens]) {
            yield sprintf('%04d %s %s', $i, $mode, json_encode($text, JSON_UNESCAPED_UNICODE)) => [$mode, $text, $tokens];
        }
    }

    /**
     * $fallback rows: jsdiff returned undefined (maxEditLength exceeded); the generator already
     * turned that into the SPEC §7.1 whole replacement with jsdiff's own token counts.
     */
    #[DataProvider('diffCases')]
    public function testDiffMatchesJsdiff(string $mode, string $old, string $new, array $options, array $expected, bool $fallback): void
    {
        $class = self::DIFFS[$mode];
        $actual = array_map(
            static fn(Change $c): array => [$c->added ? 1 : ($c->removed ? -1 : 0), $c->value, $c->count],
            $class::diff($old, $new, $options),
        );

        $this->assertSame($expected, $actual, $fallback ? 'whole replacement' : 'jsdiff changes');
    }

    public static function lowerCases(): iterable
    {
        foreach (self::data()['lower'] as $i => [$text, $expected]) {
            yield sprintf('%03d %s', $i, json_encode($text, JSON_UNESCAPED_UNICODE)) => [$text, $expected];
        }
    }

    /** Str::lower() (every ignoreCase comparison) equals JavaScript's toLowerCase(). */
    #[DataProvider('lowerCases')]
    public function testLowerMatchesJavaScript(string $text, string $expected): void
    {
        $this->assertSame($expected, Str::lower($text));
    }

    public static function utf8Cases(): iterable
    {
        foreach (self::data()['utf8'] as $i => [$hex, $expected]) {
            yield sprintf('%03d %s', $i, $hex) => [$hex, $expected];
        }
    }

    /** Str::utf8() (every entry point's input scrub) decodes like WHATWG TextDecoder. */
    #[DataProvider('utf8Cases')]
    public function testUtf8ScrubMatchesTextDecoder(string $hex, string $expected): void
    {
        $this->assertSame($expected, Str::utf8((string) hex2bin($hex)));
    }

    #[DataProvider('tokenCases')]
    public function testTokenizerMatchesJsdiff(string $mode, string $text, array $expected): void
    {
        $tokens = match ($mode) {
            'chars' => Tokenizer::chars($text),
            'words' => Tokenizer::words($text),
            'wordsWithSpace' => Tokenizer::wordsWithSpace($text),
            'lines' => Tokenizer::lines($text),
            'sentences' => Tokenizer::sentences($text),
        };
        // jsdiff drops empty tokens (removeEmpty) before diffing; so do we.
        $tokens = array_values(array_filter($tokens, static fn(string $t): bool => $t !== ''));
        $this->assertSame($expected, $tokens);
    }

    /**
     * The engine alone against jsdiff's diffChars: every binary pair up to length 6 plus 3000
     * random pairs (one test, not a data provider, to keep the run fast).
     */
    public function testMyersMatchesJsdiffOnStressPairs(): void
    {
        $ids = static fn(string $s): array => $s === '' ? [] : array_map(ord(...), str_split($s));
        $mismatches = [];
        foreach (self::data()['myers'] as [$old, $new, $expected]) {
            if (Myers::diff($ids($old), $ids($new)) !== $expected) {
                $mismatches[] = "$old → $new";
            }
        }
        $this->assertSame([], array_slice($mismatches, 0, 5));
        $this->assertGreaterThan(16000, count(self::data()['myers']));
    }

    public function testWordsRenderingKeepsSpaces(): void
    {
        // Regression: the old tokenizer discarded whitespace, rendering "Hellobigworld".
        $html = DiffWords::render('Hello world', 'Hello big world');
        $this->assertSame(
            '<div class="text-diff text-diff-words"><span>Hello </span><span class="diff-added" data-change-index="0">big </span><span>world</span></div>',
            $html,
        );
    }

    public function testSentencesKeepInterSentenceWhitespace(): void
    {
        $changes = DiffSentences::diff('One. Two.', 'One. Three.');
        $this->assertSame('One. ', $changes[0]->value);
        $this->assertSame(2, $changes[0]->count);
    }

    public function testWordsIgnoreWhitespaceFalseFallsBackToWordsWithSpace(): void
    {
        $this->assertEquals(
            DiffWordsWithSpace::diff('a  b', 'a b'),
            DiffWords::diff('a  b', 'a b', ['ignoreWhitespace' => false]),
        );
    }
}
