<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffChars;
use PhpDiffText\DiffHeatmap;
use PhpDiffText\DiffWords;
use PhpDiffText\LineModel;
use PhpDiffText\Minimap;
use PhpDiffText\Moves;
use PhpDiffText\Str;
use PhpDiffText\Tokenizer;

/**
 * Property tests mirroring packages/core/src/__tests__ (moves, heatmap, minimap),
 * on seeded random inputs.
 */
final class VisualizationPropertiesTest extends TestCase
{
    protected function setUp(): void
    {
        mt_srand(20260929);
    }

    /** @param list<string> $items */
    private static function pick(array $items): string
    {
        return $items[mt_rand(0, count($items) - 1)];
    }

    /** @param list<string> $pool */
    private static function make(array $pool, int $maxLen, string $sep): string
    {
        $out = [];
        for ($i = 0, $n = mt_rand(0, $maxLen - 1); $i < $n; $i++) {
            $out[] = self::pick($pool);
        }
        return implode($sep, $out);
    }

    public function testMovesNeverOverlapPairEqualNormalizedLinesAndAreOrdered(): void
    {
        $pool = ['alpha', 'beta', 'gamma', 'delta', '', '  alpha', 'BETA', 'x', 'y', 'z'];
        for ($k = 0; $k < 300; $k++) {
            $a = self::make($pool, 14, "\n") . "\n";
            $b = self::make($pool, 14, "\n") . "\n";
            $ignoreCase = mt_rand(0, 1) === 1;
            $rows = LineModel::buildRows($a, $b, ['ignoreCase' => $ignoreCase]);
            $moves = Moves::build($rows, ['ignoreCase' => $ignoreCase]);
            $removedText = [];
            $addedText = [];
            foreach ($rows as $r) {
                if ($r['type'] === 'removed') {
                    $removedText[$r['oldNo']] = $r['text'];
                } elseif ($r['type'] === 'added') {
                    $addedText[$r['newNo']] = $r['text'];
                }
            }
            $usedOld = [];
            $usedNew = [];
            foreach ($moves as $i => $m) {
                $this->assertSame($i, $m['id']);
                if ($i > 0) {
                    $this->assertGreaterThan($moves[$i - 1]['newStart'], $m['newStart']);
                }
                for ($j = 0; $j < $m['lines']; $j++) {
                    $this->assertArrayNotHasKey($m['oldStart'] + $j, $usedOld);
                    $this->assertArrayNotHasKey($m['newStart'] + $j, $usedNew);
                    $usedOld[$m['oldStart'] + $j] = true;
                    $usedNew[$m['newStart'] + $j] = true;
                    $this->assertArrayHasKey($m['oldStart'] + $j, $removedText);
                    $this->assertArrayHasKey($m['newStart'] + $j, $addedText);
                    $this->assertSame(
                        Moves::normalizeLine($removedText[$m['oldStart'] + $j], $ignoreCase),
                        Moves::normalizeLine($addedText[$m['newStart'] + $j], $ignoreCase),
                    );
                }
                $this->assertNotSame('', Str::trim($addedText[$m['newStart']]));
                $this->assertNotSame('', Str::trim($addedText[$m['newStart'] + $m['lines'] - 1]));
            }
            // Split pairing never pairs a moved row with anything.
            foreach (LineModel::buildSplitRows($a, $b, ['ignoreCase' => $ignoreCase, 'detectMoves' => true]) as $h) {
                if ($h['type'] === 'collapsed') {
                    continue;
                }
                foreach ($h['rows'] as $r) {
                    if ($r['type'] === 'moved-from') {
                        $this->assertArrayNotHasKey('right', $r);
                    }
                    if ($r['type'] === 'moved-to') {
                        $this->assertArrayNotHasKey('left', $r);
                    }
                }
            }
        }
    }

    public function testHeatIsMonotonicInSimilarity(): void
    {
        for ($k = 0; $k < 2000; $k++) {
            $a = mt_rand() / mt_getrandmax();
            $b = mt_rand() / mt_getrandmax();
            [$lo, $hi] = $a < $b ? [$a, $b] : [$b, $a];
            $this->assertLessThanOrEqual(DiffHeatmap::heatLevel($lo), DiffHeatmap::heatLevel($hi));
            $this->assertLessThanOrEqual(DiffHeatmap::changedPercent($lo), DiffHeatmap::changedPercent($hi));
        }
        $this->assertSame(0, DiffHeatmap::changedPercent(1.0));
        $this->assertSame(1, DiffHeatmap::changedPercent(0.999));
        $this->assertSame(28, DiffHeatmap::changedPercent(0.72));
        $this->assertSame(100, DiffHeatmap::changedPercent(0.0));
    }

    public function testHeatmapReconstructsTheNewTextAndAccountsForEveryOldSentence(): void
    {
        $words = ['the', 'cat', 'sat', 'on', 'a', 'mat', 'dog', 'ran', 'far', 'away', 'today', 'The', '"x"'];
        $sentence = static function () use ($words): string {
            $out = [];
            for ($i = 0, $n = 2 + mt_rand(0, 5); $i < $n; $i++) {
                $out[] = self::pick($words);
            }
            return implode(' ', $out) . self::pick(['.', '!', '?']);
        };
        for ($k = 0; $k < 150; $k++) {
            $make = static function () use ($sentence): string {
                $out = [];
                for ($i = 0, $n = mt_rand(0, 6); $i < $n; $i++) {
                    $out[] = $sentence();
                }
                return implode(self::pick([' ', '  ', "\n", "\r\n\r\n"]), $out) . self::pick(['', ' ', "\n"]);
            };
            $old = $make();
            $new = $make();
            $h = DiffHeatmap::build($old, $new, ['ignoreCase' => mt_rand(0, 1) === 1]);
            $this->assertFalse($h['exact']);
            $this->assertSame($new, VisualizationsTest::rebuild($h));

            $seenOld = [];
            foreach ($h['segments'] as $s) {
                if ($s['type'] === 'removed') {
                    $seenOld[] = $s['text'];
                } elseif ($s['type'] === 'sentence') {
                    $this->assertSame(DiffHeatmap::heatLevel($s['similarity']), $s['heat']);
                    match ($s['status']) {
                        'unchanged' => $this->assertSame(0, $s['heat']),
                        'edited' => $this->assertContains($s['heat'], [1, 2]),
                        'rewritten' => $this->assertContains($s['heat'], [3, 4]),
                        'added' => $this->assertSame([4, 100, false], [$s['heat'], $s['changed'], isset($s['old'])]),
                    };
                    if (isset($s['old'])) {
                        $seenOld[] = $s['old'];
                    }
                }
            }
            $oldSentences = array_values(array_filter(Tokenizer::sentences($old), static fn(string $t): bool => Str::trim($t) !== ''));
            sort($seenOld);
            sort($oldSentences);
            $this->assertSame($oldSentences, $seenOld);
        }
    }

    public function testMinimapMarksStayWithinBoundsAndInDocumentOrder(): void
    {
        $words = ['a', 'b', 'c', 'dd', "\u{1F600}", '東', ' ', "\n"];
        for ($k = 0; $k < 300; $k++) {
            $a = self::make($words, 40, '');
            $b = self::make($words, 40, '');
            $all = [
                Minimap::marksText(DiffChars::diff($a, $b)),
                Minimap::marksText(DiffWords::diff($a, $b)),
                Minimap::marksLines(LineModel::buildHunks($a, $b, ['contextLines' => mt_rand(0, 2)])),
                Minimap::marksLines(LineModel::buildSplitRows($a, $b, ['detectMoves' => true])),
            ];
            foreach ($all as $marks) {
                $prevTop = 0;
                foreach ($marks as $i => $m) {
                    $this->assertSame($i, $m['index']);
                    $this->assertGreaterThanOrEqual(0, $m['top']);
                    $this->assertGreaterThanOrEqual(0, $m['height']);
                    $this->assertLessThanOrEqual(10000, $m['top'] + $m['height']);
                    $this->assertGreaterThanOrEqual($prevTop, $m['top']);
                    $prevTop = $m['top'];
                }
            }
        }
    }
}
