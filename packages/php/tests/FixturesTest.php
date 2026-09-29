<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use PhpDiffText\Change;
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
use PhpDiffText\LineModel;
use PhpDiffText\Minimap;
use PhpDiffText\Moves;
use PhpDiffText\Similarity;
use PhpDiffText\TextMode;

/**
 * Checks the PHP engine against the shared fixtures (fixtures/*.json).
 *
 * Every group is covered: text-mode changes/markup/stats, similarity, the
 * unified and split line models and markup, the stats badge, the HTML mode
 * (byte-equal, plus valid HTML and the same highlighted text), and the
 * visualizations (heatmap, moves, minimap, timeline, playback), byte-equal.
 */
final class FixturesTest extends TestCase
{
    private const TEXT_MODES = [
        'chars' => DiffChars::class,
        'words' => DiffWords::class,
        'wordsWithSpace' => DiffWordsWithSpace::class,
        'lines' => DiffLines::class,
        'sentences' => DiffSentences::class,
    ];

    public static function charsCases(): array { return FixtureLoader::cases('chars'); }
    public static function wordsCases(): array { return FixtureLoader::cases('words'); }
    public static function wordsWithSpaceCases(): array { return FixtureLoader::cases('wordsWithSpace'); }
    public static function linesCases(): array { return FixtureLoader::cases('lines'); }
    public static function sentencesCases(): array { return FixtureLoader::cases('sentences'); }
    public static function htmlCases(): array { return FixtureLoader::cases('html'); }
    public static function similarityCases(): array { return FixtureLoader::cases('similarity'); }
    public static function unifiedCases(): array { return FixtureLoader::cases('unified'); }
    public static function splitCases(): array { return FixtureLoader::cases('split'); }
    public static function statsCases(): array { return FixtureLoader::cases('stats'); }
    public static function heatmapCases(): array { return FixtureLoader::cases('heatmap'); }
    public static function movesCases(): array { return FixtureLoader::cases('moves'); }
    public static function minimapCases(): array { return FixtureLoader::cases('minimap'); }
    public static function timelineCases(): array { return FixtureLoader::cases('timeline'); }
    public static function playbackCases(): array { return FixtureLoader::cases('playback'); }

    /** Every group in fixtures/ must be covered here. */
    public function testAllFixtureGroupsAreCovered(): void
    {
        if (!is_dir(FixtureLoader::dir())) {
            $this->markTestSkipped('fixtures/ not found (only available inside the monorepo)');
        }
        $groups = array_map(static fn(string $f): string => basename($f, '.json'), glob(FixtureLoader::dir() . '/*.json') ?: []);
        sort($groups);
        $covered = ['chars', 'heatmap', 'html', 'lines', 'minimap', 'moves', 'playback', 'sentences', 'similarity', 'split', 'stats', 'timeline', 'unified', 'words', 'wordsWithSpace'];
        sort($covered);
        $this->assertSame($covered, $groups);
    }

    #[DataProvider('heatmapCases')]
    public function testHeatmap(?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, 'heatmap');
        $heatmap = DiffHeatmap::build($case['old'], $case['new'], $case['options']);
        $expected = $case['expected']['heatmap'];
        $this->assertSame($expected['exact'], $heatmap['exact']);
        $this->assertCount(count($expected['segments']), $heatmap['segments']);
        foreach ($expected['segments'] as $i => $seg) {
            $actual = $heatmap['segments'][$i];
            if (array_key_exists('similarity', $seg)) {
                $this->assertArrayHasKey('similarity', $actual);
                $this->assertIsFloat($actual['similarity']);
                $this->assertEqualsWithDelta($seg['similarity'], $actual['similarity'], 1e-12, "segment {$i} similarity");
                $seg['similarity'] = $actual['similarity'];
            }
            $this->assertSame($seg, $actual, "segment {$i}");
        }
        $this->assertSame($case['expected']['html'], DiffHeatmap::renderHeatmap($heatmap, $case['options']));
        $this->assertSame($case['expected']['html'], DiffText::heatmap($case['old'], $case['new'], $case['options']));
    }

    #[DataProvider('movesCases')]
    public function testMoves(?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, 'moves');
        $options = $case['options'];
        $expected = $case['expected'];
        $this->assertSame($expected['moves'], Moves::build(LineModel::buildRows($case['old'], $case['new'], $options), $options));
        if ($options['view'] === 'unified') {
            $hunks = DiffUnified::hunks($case['old'], $case['new'], $options);
            $this->assertSame($expected['hunks'], $hunks);
            $this->assertSame($expected['html'], DiffUnified::renderHunks($hunks, $options));
            $this->assertSame($expected['html'], DiffText::unified($case['old'], $case['new'], $options));
        } else {
            $hunks = DiffSplit::hunks($case['old'], $case['new'], $options);
            $this->assertSame($expected['hunks'], $hunks);
            $this->assertSame($expected['html'], DiffSplit::renderHunks($hunks, $options));
            $this->assertSame($expected['html'], DiffText::split($case['old'], $case['new'], $options));
        }
        $this->assertSame($expected['stats'], DiffStats::fromHunks($hunks));
        $this->assertSame($expected['stats'], DiffStats::compute($case['old'], $case['new'], ['mode' => $options['view']] + $options));
    }

    #[DataProvider('minimapCases')]
    public function testMinimap(?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, 'minimap');
        $options = $case['options'];
        $view = $options['view'];
        $expected = $case['expected'];
        if ($view === 'unified' || $view === 'split') {
            $hunks = $view === 'unified' ? DiffUnified::hunks($case['old'], $case['new'], $options) : DiffSplit::hunks($case['old'], $case['new'], $options);
            $marks = Minimap::marksLines($hunks);
            $diff = $view === 'unified' ? DiffUnified::renderHunks($hunks, $options) : DiffSplit::renderHunks($hunks, $options);
            $viaFacade = $view === 'unified' ? DiffText::unified(...) : DiffText::split(...);
        } else {
            $changes = TextMode::diff($view, $case['old'], $case['new'], $options);
            $marks = Minimap::marksText($changes);
            $diff = TextMode::render($view, $changes, $options);
            $viaFacade = DiffText::{$view}(...);
        }
        $this->assertSame($expected['marks'], $marks);
        $this->assertSame($expected['diff'], $diff);
        $minimap = Minimap::render($marks, $options);
        $this->assertSame($expected['minimap'], $minimap);
        $this->assertSame($expected['html'], Minimap::wrap($diff, $minimap));
        // The minimap render option: same bytes, anchors implied.
        $withoutAnchors = $options;
        unset($withoutAnchors['anchors']);
        $this->assertSame($expected['html'], $viaFacade($case['old'], $case['new'], ['minimap' => true] + $withoutAnchors));
    }

    #[DataProvider('timelineCases')]
    public function testTimeline(?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, 'timeline');
        $timeline = DiffTimeline::build($case['versions'], $case['options']);
        $expected = $case['expected'];
        $this->assertSame($expected['mode'], $timeline['mode']);
        $this->assertSame($expected['labels'], $timeline['labels']);
        $this->assertCount(count($expected['steps']), $timeline['steps']);
        foreach ($expected['steps'] as $i => $step) {
            $actual = $timeline['steps'][$i];
            $this->assertIsFloat($actual['similarity']);
            $this->assertEqualsWithDelta($step['similarity'], $actual['similarity'], 1e-12, "step {$i} similarity");
            $step['similarity'] = $actual['similarity'];
            $this->assertSame($step, array_intersect_key($actual, $step), "step {$i}");
        }
        $this->assertSame($expected['html'], DiffTimeline::renderTimeline($timeline, $case['options']));
        $this->assertSame($expected['html'], DiffText::timeline($case['versions'], $case['options']));
    }

    #[DataProvider('playbackCases')]
    public function testPlayback(?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, 'playback');
        $options = $case['options'];
        $changes = TextMode::diff($options['mode'], $case['old'], $case['new']);
        $this->assertSame($case['expected']['changes'], LineModel::changesToArrays($changes));
        $this->assertSame($case['expected']['html'], DiffPlayback::renderChanges($options['mode'], $changes, $options));
        $this->assertSame($case['expected']['html'], DiffText::playback($case['old'], $case['new'], $options));
    }

    #[DataProvider('unifiedCases')]
    public function testUnified(?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, 'unified');
        $hunks = DiffUnified::hunks($case['old'], $case['new'], $case['options']);
        $this->assertSame($case['expected']['hunks'], $hunks);
        $this->assertSame($case['expected']['html'], DiffUnified::renderHunks($hunks));
        $this->assertSame($case['expected']['html'], DiffUnified::render($case['old'], $case['new'], $case['options']));
        $this->assertSame($case['expected']['stats'], DiffStats::fromHunks($hunks));
    }

    #[DataProvider('splitCases')]
    public function testSplit(?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, 'split');
        $hunks = DiffSplit::hunks($case['old'], $case['new'], $case['options']);
        $this->assertSame($case['expected']['hunks'], $hunks);
        $this->assertSame($case['expected']['html'], DiffSplit::renderHunks($hunks));
        $this->assertSame($case['expected']['stats'], DiffStats::fromHunks($hunks));
    }

    #[DataProvider('statsCases')]
    public function testStats(?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, 'stats');
        $expected = $case['expected'];
        $this->assertSame($expected['stats'], DiffStats::compute($case['old'], $case['new'], $case['options']));
        $this->assertEqualsWithDelta($expected['similarity'], Similarity::compute($case['old'], $case['new'], false), 1e-12);
        $this->assertSame($expected['html'], DiffStats::render($case['old'], $case['new'], $case['options']));
        $this->assertSame($expected['htmlWithoutSimilarity'], DiffStats::renderStats($expected['stats']));
    }

    #[DataProvider('charsCases')]
    public function testChars(?array $case): void { $this->assertTextCase('chars', $case); }

    #[DataProvider('wordsCases')]
    public function testWords(?array $case): void { $this->assertTextCase('words', $case); }

    #[DataProvider('wordsWithSpaceCases')]
    public function testWordsWithSpace(?array $case): void { $this->assertTextCase('wordsWithSpace', $case); }

    #[DataProvider('linesCases')]
    public function testLines(?array $case): void { $this->assertTextCase('lines', $case); }

    #[DataProvider('sentencesCases')]
    public function testSentences(?array $case): void { $this->assertTextCase('sentences', $case); }

    #[DataProvider('htmlCases')]
    public function testHtml(?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, 'html');
        $html = DiffHtml::render($case['old'], $case['new'], $case['options'] ?? []);
        $expected = $case['expected'];

        // One engine on every platform: byte-identical output (SPEC §12).
        $this->assertSame($expected['html'], $html);
        if (!empty($case['mustBeValidHtml'])) {
            HtmlAssert::assertWellFormed($this, $html);
        }
        $this->assertSame($expected['fullReplacement'], DiffHtml::diff($case['old'], $case['new'], $case['options'] ?? [])['fullReplacement']);
        $this->assertSame($expected['addedText'], HtmlAssert::markedText($html, 'diff-added'), 'added text');
        $this->assertSame($expected['removedText'], HtmlAssert::markedText($html, 'diff-removed'), 'removed text');
        if (array_key_exists('similarity', $expected)) {
            $this->assertEqualsWithDelta($expected['similarity'], Similarity::compute($case['old'], $case['new']), 1e-12);
        }
    }

    #[DataProvider('similarityCases')]
    public function testSimilarity(?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, 'similarity');
        $this->assertEqualsWithDelta($case['expected']['similarity'], Similarity::compute($case['old'], $case['new']), 1e-12);
        $text = Similarity::compute($case['old'], $case['new'], false);
        $this->assertEqualsWithDelta($case['expected']['similarityText'], $text, 1e-12);
        $stats = DiffStats::fromChanges(DiffWords::diff($case['old'], $case['new']));
        $this->assertSame($case['expected']['stats'], $stats);
        $this->assertSame($case['expected']['html'], DiffStats::renderStats($stats, $text));
    }

    private function assertTextCase(string $mode, ?array $case): void
    {
        $case = FixtureLoader::requireCase($this, $case, $mode);
        $class = self::TEXT_MODES[$mode];
        $changes = $class::diff($case['old'], $case['new'], $case['options'] ?? []);
        $actual = array_map(static fn(Change $c): array => [
            'value' => $c->value,
            'added' => $c->added,
            'removed' => $c->removed,
            'count' => $c->count,
        ], $changes);
        $this->assertSame($case['expected']['changes'], $actual);
        $this->assertSame($case['expected']['html'], $class::render($case['old'], $case['new'], $case['options'] ?? []));
        $this->assertSame($case['expected']['stats'], DiffStats::fromChanges($changes));
    }
}
