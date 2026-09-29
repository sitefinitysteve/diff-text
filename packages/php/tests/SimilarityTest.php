<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use PhpDiffText\Similarity;

/**
 * Hand-computed similarity values (SPEC §8) not already in fixtures/similarity.json, which
 * FixturesTest checks for both input kinds. Range and identity are properties of the metric;
 * BoundariesTest holds the 0.3 edge, the html/text difference and the direction.
 */
final class SimilarityTest extends TestCase
{
    public static function values(): iterable
    {
        // No word in common.
        yield 'unrelated words' => ['alpha beta gamma delta', 'xylophone zebra quantum', true, 0.0];
        // Both sides are empty after prepare() (whitespace collapses and trims away).
        yield 'whitespace only' => ['   ', "\t\n", true, 1.0];
        // Tags stripped: "Hello world" vs "Goodbye world", unchanged "world" = 5 of 10 + 12 -> 10/22.
        yield 'html text change' => ['<p>Hello world</p>', '<p>Goodbye world</p>', true, 10 / 22];
        // As text the tags count: unchanged "<p>" + "world" + "</p>" = 12 of 17 + 19 -> 24/36.
        yield 'same input as text' => ['<p>Hello world</p>', '<p>Goodbye world</p>', false, 24 / 36];
        // Curly quotes normalize in both input kinds.
        yield 'curly quotes, text' => ["\u{201C}Clinic\u{201D} means selected.", '"Clinic" means selected.', false, 1.0];
    }

    #[DataProvider('values')]
    public function testValue(string $old, string $new, bool $html, float $expected): void
    {
        $this->assertSame($expected, Similarity::compute($old, $new, $html));
    }
}
