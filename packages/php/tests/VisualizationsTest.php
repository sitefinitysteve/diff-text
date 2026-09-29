<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffHeatmap;
use PhpDiffText\DiffPlayback;
use PhpDiffText\DiffText;
use PhpDiffText\DiffTimeline;
use PhpDiffText\Html;
use PhpDiffText\Minimap;
use PhpDiffText\Moves;
use PhpDiffText\Options;

/**
 * What the fixtures cannot prove for the visualizations (SPEC §17–23):
 * option validation and defaults, the size caps and fallbacks, and idPrefix escaping.
 */
final class VisualizationsTest extends TestCase
{
    public static function minMoveLinesProvider(): array
    {
        return [
            'absent' => [null, 1],
            'one' => [1, 1],
            'three' => [3, 3],
            'float floored' => [2.9, 2],
            'float below one' => [0.5, 1],
            'zero' => [0, 1],
            'negative' => [-2, 1],
            'negative float' => [-2.5, 1],
            'numeric string' => ['3', 1],
            'bool' => [true, 1],
            'NaN' => [NAN, 1],
            'infinity' => [INF, PHP_INT_MAX],
        ];
    }

    #[DataProvider('minMoveLinesProvider')]
    public function testMinMoveLines(mixed $value, int $expected): void
    {
        $options = $value === null ? [] : ['minMoveLines' => $value];
        $this->assertSame($expected, Moves::minMoveLines($options));
    }

    public static function moveSimilarityProvider(): array
    {
        return [
            'absent' => [null, 1.0],
            'half' => [0.5, 0.5],
            'int zero' => [0, 1.0],
            'zero' => [0.0, 1.0],
            'one' => [1, 1.0],
            'above one' => [1.5, 1.0],
            'negative' => [-0.5, 1.0],
            'numeric string' => ['0.5', 1.0],
            'NaN' => [NAN, 1.0],
        ];
    }

    #[DataProvider('moveSimilarityProvider')]
    public function testMoveSimilarity(mixed $value, float $expected): void
    {
        $options = $value === null ? [] : ['moveSimilarity' => $value];
        $this->assertSame($expected, Moves::threshold($options));
    }

    public static function idPrefixProvider(): array
    {
        return [
            'absent' => [null, 'td'],
            'empty string' => ['', 'td'],
            'custom' => ['doc', 'doc'],
            'int' => [5, 'td'],
            'false' => [false, 'td'],
            'whitespace kept' => [' ', ' '],
        ];
    }

    #[DataProvider('idPrefixProvider')]
    public function testIdPrefix(mixed $value, string $expected): void
    {
        $options = $value === null ? [] : ['idPrefix' => $value];
        $this->assertSame($expected, Options::idPrefix($options));
    }

    public static function speedProvider(): array
    {
        return [
            'absent' => [null, null],
            'int' => [200, 200],
            'float floored' => [250.7, 250],
            'exactly one' => [1, 1],
            'just below one' => [0.99, null],
            'zero' => [0, null],
            'negative' => [-5, null],
            'numeric string' => ['300', null],
            'bool' => [true, null],
            'infinity' => [INF, null],
            'NaN' => [NAN, null],
        ];
    }

    #[DataProvider('speedProvider')]
    public function testPlaybackSpeed(mixed $speed, ?int $expected): void
    {
        $this->assertSame($expected, DiffPlayback::step($speed));
        $html = DiffText::playback('slow fox', 'quick fox', ['speed' => $speed]);
        if ($expected === null) {
            $this->assertStringContainsString('<div class="text-diff text-diff-words text-diff-playback"><span', $html);
        } else {
            $this->assertStringContainsString('text-diff-playback" style="--text-diff-playback-step:' . $expected . 'ms">', $html);
        }
    }

    public function testDefaultsLeaveExistingMarkupUnchanged(): void
    {
        // Moves and anchors are opt-in (SPEC §17).
        $old = "moved\nk1\nk2\n";
        $new = "k1\nk2\nmoved\n";
        $this->assertStringNotContainsString('moved-from', DiffText::unified($old, $new));
        $this->assertStringNotContainsString(' id=', DiffText::unified($old, $new, ['detectMoves' => 1]));
        $this->assertStringContainsString('diff-row-moved-from', DiffText::unified($old, $new, ['detectMoves' => true]));
        $this->assertStringNotContainsString(' id=', DiffText::words('a b', 'a c', ['anchors' => 1]));
        $this->assertStringContainsString(' id="td-change-0"', DiffText::words('a b', 'a c', ['anchors' => true]));
    }

    public function testMinimapOptionImpliesAnchors(): void
    {
        $html = DiffText::words('a b', 'a c', ['minimap' => true, 'anchors' => false, 'idPrefix' => 'x']);
        $this->assertSame(
            '<div class="text-diff-with-minimap"><div class="text-diff text-diff-words"><span>a </span>'
            . '<span class="diff-removed" id="x-change-0" data-change-index="0">b</span>'
            . '<span class="diff-added" id="x-change-1" data-change-index="1">c</span></div>'
            . '<nav class="text-diff-minimap" aria-label="Change minimap">'
            . '<a class="diff-minimap-mark diff-minimap-removed" href="#x-change-0" style="top:66.67%;height:0.00%" aria-label="Change 1: removed"></a>'
            . '<a class="diff-minimap-mark diff-minimap-added" href="#x-change-1" style="top:66.67%;height:33.33%" aria-label="Change 2: added"></a>'
            . '</nav></div>',
            $html,
        );
    }

    public function testHundredthsIsExactHalfUp(): void
    {
        $this->assertSame(0, Minimap::hundredths(5, 0));
        $this->assertSame(0, Minimap::hundredths(5, -1));
        $this->assertSame(5000, Minimap::hundredths(1, 2));
        $this->assertSame(6667, Minimap::hundredths(2, 3));
        // 1/800 = 0.125% exactly: half-up gives 0.13 (a float round() of 0.125 * 100 might not).
        $this->assertSame(13, Minimap::hundredths(1, 800));
        $this->assertSame('0.13%', Minimap::formatPercent(13));
        $this->assertSame('0.05%', Minimap::formatPercent(5));
        $this->assertSame('12.50%', Minimap::formatPercent(1250));
        $this->assertSame('100.00%', Minimap::formatPercent(10000));
    }

    public function testCarriageReturnsAreEmittedAsLineFeeds(): void
    {
        $this->assertSame("a\nb\nc&amp;", Html::escape("a\r\nb\rc&"));
        $html = DiffText::lines("one\r\ntwo\r\n", "one\ntwo\n");
        $this->assertStringNotContainsString("\r", $html);
    }

    // ---- heatmap fallback -----------------------------------------------------

    /** @return list<string> Distinct sentences with no words in common with the other side. */
    private static function sentences(int $count, string $word): array
    {
        $out = [];
        for ($i = 1; $i <= $count; $i++) {
            $out[] = ucfirst($word) . " {$word}{$i} alpha{$word} beta{$word}.";
        }
        return $out;
    }

    public function testHeatmapAlignsUpTo500SentencesAndFallsBackAbove(): void
    {
        $at = DiffHeatmap::build(implode(' ', self::sentences(500, 'old')), implode(' ', self::sentences(500, 'new')));
        $this->assertFalse($at['exact']);

        $above = DiffHeatmap::build(implode(' ', self::sentences(501, 'old')), implode(' ', self::sentences(500, 'new')));
        $this->assertTrue($above['exact']);
    }

    public function testHeatmapExactFallbackPairsPositionallyAndKeepsEqualSentences(): void
    {
        $old = [];
        $new = [];
        for ($i = 1; $i <= 600; $i++) {
            $old[] = "Sentence number {$i}.";
            $new[] = match ($i) {
                1 => 'A changed opening.',
                300 => 'Sentence number 300 edited.',
                600 => 'A changed ending.',
                default => "Sentence number {$i}.",
            };
        }
        $new[] = 'Brand new tail.';
        $newText = implode(' ', $new);
        $heatmap = DiffHeatmap::build(implode(' ', $old), $newText);

        $this->assertTrue($heatmap['exact']);
        $sentences = array_values(array_filter($heatmap['segments'], static fn(array $s): bool => $s['type'] === 'sentence'));
        $this->assertCount(601, $sentences);
        $this->assertSame([], array_values(array_filter($heatmap['segments'], static fn(array $s): bool => $s['type'] === 'removed')));
        // Unmatched runs are paired positionally with their real similarity.
        $this->assertSame('Sentence number 1.', $sentences[0]['old']);
        $this->assertSame('Sentence number 300.', $sentences[299]['old']);
        $this->assertSame(DiffText::similarity('Sentence number 300.', 'Sentence number 300 edited.'), $sentences[299]['similarity']);
        $this->assertSame(0, $sentences[1]['heat']);
        $this->assertSame('added', $sentences[600]['status']);
        $this->assertSame($newText, self::rebuild($heatmap));
    }

    // ---- move size caps --------------------------------------------------------

    /**
     * Rows: $removed removed lines, one equal line, $added added lines. The first
     * removed line is $movedOld and the last added line is $movedNew; the rest are blank
     * (cheap: blank rows never start a move) unless $distinct.
     *
     * @return list<array<string, mixed>>
     */
    private static function capRows(int $removed, int $added, string $movedOld, string $movedNew, bool $distinct = false): array
    {
        $rows = [];
        for ($i = 0; $i < $removed; $i++) {
            $text = $i === 0 ? $movedOld : ($distinct ? "gone {$i}" : '');
            $rows[] = ['type' => 'removed', 'oldNo' => $i + 1, 'text' => $text];
        }
        $rows[] = ['type' => 'equal', 'oldNo' => $removed + 1, 'newNo' => 1, 'text' => 'keep'];
        for ($j = 0; $j < $added; $j++) {
            $text = $j === $added - 1 ? $movedNew : ($distinct ? "fresh {$j}" : '');
            $rows[] = ['type' => 'added', 'newNo' => $j + 2, 'text' => $text];
        }
        return $rows;
    }

    public function testMoveDetectionIsSkippedAboveOneMillionPairs(): void
    {
        $at = Moves::build(self::capRows(1000, 1000, 'moved line', 'moved line', true));
        $this->assertSame([['id' => 0, 'oldStart' => 1, 'newStart' => 1001, 'lines' => 1]], $at);

        $this->assertSame([], Moves::build(self::capRows(1001, 1000, 'moved line', 'moved line', true)));
    }

    public function testNearMatchesOnlyUpTo250000Pairs(): void
    {
        $old = 'alpha beta gamma delta epsilon';
        $new = 'alpha beta gamma delta zeta';
        $options = ['moveSimilarity' => 0.6];
        $this->assertGreaterThanOrEqual(0.6, DiffText::similarity($old, $new));

        $at = Moves::build(self::capRows(500, 500, $old, $new), $options);
        $this->assertSame([['id' => 0, 'oldStart' => 1, 'newStart' => 501, 'lines' => 1]], $at);

        // 501 × 500 pairs: exact matches only.
        $this->assertSame([], Moves::build(self::capRows(501, 500, $old, $new), $options));
        $this->assertCount(1, Moves::build(self::capRows(501, 500, $old, $old), $options));
    }

    // ---- idPrefix escaping -----------------------------------------------------

    public function testIdPrefixIsEscapedEverywhere(): void
    {
        $prefix = 'a"<&\'b';
        $escaped = 'a&quot;&lt;&amp;&#39;b';
        $options = ['idPrefix' => $prefix, 'anchors' => true];

        $views = [
            'words' => DiffText::words('a b', 'a c', $options),
            'unified' => DiffText::unified("m\nk1\nk2\n", "k1\nk2\nm\n", $options + ['detectMoves' => true]),
            'split' => DiffText::split("m\nk1\nk2\n", "k1\nk2\nm\n", $options + ['detectMoves' => true]),
            'minimap' => DiffText::words('a b', 'a c', $options + ['minimap' => true]),
            'heatmap' => DiffText::heatmap('One. Two.', 'One. Three.', $options),
            'timeline' => DiffText::timeline(['a', 'b', 'c'], $options),
            'playback' => DiffText::playback('a b', 'a c', $options),
        ];
        foreach ($views as $name => $html) {
            $this->assertStringNotContainsString($prefix, $html, $name);
            $this->assertStringContainsString($escaped, $html, $name);
            HtmlAssert::assertWellFormed($this, '<div>' . $html . '</div>');
        }
        $this->assertStringContainsString('id="' . $escaped . '-move-0-from" href="#' . $escaped . '-move-0-to"', $views['unified']);
        $this->assertStringContainsString('name="' . $escaped . '-rev" id="' . $escaped . '-rev-2" checked>', $views['timeline']);
        // Panels use the raw prefix + "-rev-K", escaped once when emitted.
        $this->assertStringContainsString('id="' . $escaped . '-rev-1-change-0"', $views['timeline']);
        $this->assertStringContainsString('id="' . $escaped . '-replay"', $views['playback']);
    }

    // ---- timeline and facade ----------------------------------------------------

    public function testTimelineOptions(): void
    {
        $empty = '<div class="text-diff-timeline" role="group" aria-label="Revision timeline"><div class="diff-empty">Nothing to compare</div></div>';
        $this->assertSame($empty, DiffText::timeline([]));
        $this->assertSame($empty, DiffText::timeline(['only']));

        $this->assertSame('words', DiffTimeline::mode(null));
        $this->assertSame('words', DiffTimeline::mode('html'));
        $this->assertSame('split', DiffTimeline::mode('split'));
        $this->assertSame('chars', DiffTimeline::mode('chars'));

        $t = DiffTimeline::build(['a', 'b', 'c'], ['labels' => ['First', 7]]);
        $this->assertSame(['First', 'v2', 'v3'], $t['labels']);
        $this->assertSame(['labels' => ['v1', 'v2']], array_intersect_key(DiffTimeline::build(['a', 'b'], ['labels' => 'xy']), ['labels' => 1]));
    }

    public function testUnknownPlaybackModeThrows(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        DiffText::playback('a', 'b', ['mode' => 'unified']);
    }

    /** @param array{segments: list<array<string, mixed>>} $heatmap */
    public static function rebuild(array $heatmap): string
    {
        $out = '';
        foreach ($heatmap['segments'] as $seg) {
            if ($seg['type'] !== 'removed') {
                $out .= $seg['text'];
            }
        }
        return $out;
    }
}
