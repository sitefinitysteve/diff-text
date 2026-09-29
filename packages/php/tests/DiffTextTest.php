<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffChars;
use PhpDiffText\DiffHeatmap;
use PhpDiffText\DiffHtml;
use PhpDiffText\DiffLines;
use PhpDiffText\DiffPlayback;
use PhpDiffText\DiffSentences;
use PhpDiffText\DiffSplit;
use PhpDiffText\DiffStats;
use PhpDiffText\DiffText;
use PhpDiffText\DiffTimeline;
use PhpDiffText\DiffUnified;
use PhpDiffText\DiffWords;
use PhpDiffText\DiffWordsWithSpace;
use PhpDiffText\Similarity;

/**
 * The DiffText facade forwards every argument to the right renderer. The renderers' output is
 * pinned byte-for-byte by FixturesTest; here each facade call must equal the direct call.
 */
final class DiffTextTest extends TestCase
{
    public static function forwards(): iterable
    {
        $old = "The quick fox.\nLine two <b>&</b>\n";
        $new = "The slow fox!\nLine 2 <b>&</b>\n";
        $opts = ['ignoreCase' => true, 'anchors' => true, 'idPrefix' => 'x'];
        yield 'chars' => [DiffText::chars($old, $new, $opts), DiffChars::render($old, $new, $opts)];
        yield 'words' => [DiffText::words($old, $new, $opts), DiffWords::render($old, $new, $opts)];
        yield 'wordsWithSpace' => [DiffText::wordsWithSpace($old, $new, $opts), DiffWordsWithSpace::render($old, $new, $opts)];
        yield 'lines' => [DiffText::lines($old, $new, $opts), DiffLines::render($old, $new, $opts)];
        yield 'sentences' => [DiffText::sentences($old, $new, $opts), DiffSentences::render($old, $new, $opts)];
        yield 'html' => [DiffText::html($old, $new, [], 0.9), DiffHtml::render($old, $new, [], 0.9)];
        yield 'unified' => [DiffText::unified($old, $new, ['contextLines' => 0] + $opts), DiffUnified::render($old, $new, ['contextLines' => 0] + $opts)];
        yield 'split' => [DiffText::split($old, $new, ['detectMoves' => true] + $opts), DiffSplit::render($old, $new, ['detectMoves' => true] + $opts)];
        yield 'stats' => [DiffText::stats($old, $new, ['mode' => 'chars']), DiffStats::render($old, $new, ['mode' => 'chars'])];
        yield 'heatmap' => [DiffText::heatmap($old, $new, ['legend' => false]), DiffHeatmap::render($old, $new, ['legend' => false])];
        yield 'timeline' => [DiffText::timeline([$old, $new, $old], ['mode' => 'split']), DiffTimeline::render([$old, $new, $old], ['mode' => 'split'])];
        yield 'playback' => [DiffText::playback($old, $new, ['speed' => 50]), DiffPlayback::render($old, $new, ['speed' => 50])];
        yield 'similarity (html)' => [DiffText::similarity('1 < 2 > 3', '1 3'), Similarity::compute('1 < 2 > 3', '1 3')];
        yield 'similarity (text)' => [DiffText::similarity('1 < 2 > 3', '1 3', false), Similarity::compute('1 < 2 > 3', '1 3', false)];
    }

    #[DataProvider('forwards')]
    public function testFacadeForwardsToTheRenderer(string|float $viaFacade, string|float $direct): void
    {
        $this->assertSame($direct, $viaFacade);
    }

    public function testFacadeArgumentsAreNotIgnored(): void
    {
        // Guards against a facade that drops its options: each pair must differ.
        $this->assertNotSame(DiffText::words('A', 'a'), DiffText::words('A', 'a', ['ignoreCase' => true]));
        $this->assertNotSame(DiffText::html('<p>a b</p>', '<p>x y</p>'), DiffText::html('<p>a b</p>', '<p>x y</p>', [], 0.5));
        $this->assertNotSame(DiffText::similarity('1 < 2 > 3', '1 3'), DiffText::similarity('1 < 2 > 3', '1 3', false));
    }
}
