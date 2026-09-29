<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Diff statistics and the stats badge (SPEC §11, §13.4).
 *
 * Stats are ['added' => int, 'removed' => int, 'unchanged' => int, 'unit' => 'codepoints'|'lines'].
 */
final class DiffStats
{
    private const TEXT_MODES = [
        'chars' => DiffChars::class,
        'words' => DiffWords::class,
        'wordsWithSpace' => DiffWordsWithSpace::class,
        'lines' => DiffLines::class,
        'sentences' => DiffSentences::class,
    ];

    /**
     * Stats for two texts. $options['mode'] is a text mode (default "words"),
     * "unified" or "split" (line stats); other options go to that mode.
     *
     * @param array<string, mixed> $options
     * @return array{added:int, removed:int, unchanged:int, unit:string}
     */
    public static function compute(string $oldText, string $newText, array $options = []): array
    {
        $mode = $options['mode'] ?? 'words';
        if ($mode === 'unified') {
            return self::fromHunks(LineModel::buildHunks($oldText, $newText, $options));
        }
        if ($mode === 'split') {
            return self::fromHunks(LineModel::buildSplitRows($oldText, $newText, $options));
        }
        if (!isset(self::TEXT_MODES[$mode])) {
            throw new \InvalidArgumentException("Unknown diff mode: {$mode}");
        }
        $class = self::TEXT_MODES[$mode];

        return self::fromChanges($class::diff($oldText, $newText, $options));
    }

    /**
     * Code points added/removed/unchanged over a change list.
     *
     * @param Change[] $changes
     * @return array{added:int, removed:int, unchanged:int, unit:string}
     */
    public static function fromChanges(array $changes): array
    {
        $stats = ['added' => 0, 'removed' => 0, 'unchanged' => 0, 'unit' => 'codepoints'];
        foreach ($changes as $c) {
            $n = mb_strlen($c->value, 'UTF-8');
            if ($c->added) {
                $stats['added'] += $n;
            } elseif ($c->removed) {
                $stats['removed'] += $n;
            } else {
                $stats['unchanged'] += $n;
            }
        }
        return $stats;
    }

    /**
     * Lines added/removed/unchanged over unified or split hunks
     * (moved-from lines count as removed, moved-to lines as added).
     *
     * @param list<array<string, mixed>> $hunks
     * @return array{added:int, removed:int, unchanged:int, unit:string}
     */
    public static function fromHunks(array $hunks): array
    {
        $stats = ['added' => 0, 'removed' => 0, 'unchanged' => 0, 'unit' => 'lines'];
        foreach ($hunks as $h) {
            if ($h['type'] === 'collapsed') {
                $stats['unchanged'] += $h['count'];
                continue;
            }
            foreach ($h['rows'] as $row) {
                if (array_key_exists('text', $row)) {
                    if ($row['type'] === 'added' || $row['type'] === 'moved-to') {
                        $stats['added']++;
                    } elseif ($row['type'] === 'removed' || $row['type'] === 'moved-from') {
                        $stats['removed']++;
                    } else {
                        $stats['unchanged']++;
                    }
                } elseif ($row['type'] === 'equal') {
                    $stats['unchanged']++;
                } else {
                    if (isset($row['left'])) {
                        $stats['removed']++;
                    }
                    if (isset($row['right'])) {
                        $stats['added']++;
                    }
                }
            }
        }
        return $stats;
    }

    /**
     * Render the stats badge for two texts, with similarity unless
     * $options['similarity'] === false.
     *
     * @param array<string, mixed> $options
     */
    public static function render(string $oldText, string $newText, array $options = []): string
    {
        $stats = self::compute($oldText, $newText, $options);
        $similarity = ($options['similarity'] ?? true) === false ? null : Similarity::compute($oldText, $newText, false);

        return self::renderStats($stats, $similarity);
    }

    /**
     * @param array{added:int, removed:int, unchanged:int, unit:string} $stats
     */
    public static function renderStats(array $stats, ?float $similarity = null): string
    {
        $unit = $stats['unit'];
        $out = '<div class="text-diff-stats" data-unit="' . $unit . '">';
        $out .= self::stat('added', '+' . $stats['added'], $stats['added'], $unit);
        $out .= self::stat('removed', "\u{2212}" . $stats['removed'], $stats['removed'], $unit);
        $out .= self::stat('unchanged', '=' . $stats['unchanged'], $stats['unchanged'], $unit);
        if ($similarity !== null) {
            $out .= '<span class="diff-stat diff-stat-similarity">' . Html::percent($similarity) . '% similar</span>';
        }
        return $out . '</div>';
    }

    private static function stat(string $kind, string $visible, int $n, string $unit): string
    {
        $word = $unit === 'lines' ? ($n === 1 ? 'line' : 'lines') : ($n === 1 ? 'character' : 'characters');

        return '<span class="diff-stat diff-stat-' . $kind . '">'
            . '<span aria-hidden="true">' . $visible . '</span>'
            . '<span class="diff-sr">' . $n . ' ' . $word . ' ' . $kind . '</span>'
            . '</span>';
    }
}
