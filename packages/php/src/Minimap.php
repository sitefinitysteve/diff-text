<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Change minimap (SPEC §21): a strip of links, one per change, positioned by
 * where the change sits in the new document. Positions are integer hundredths
 * of a percent computed with integer arithmetic only.
 *
 * Marks are ['index' => int, 'kind' => 'added'|'removed'|'modified'|'moved',
 * 'top' => int, 'height' => int] (hundredths, 0..10000).
 *
 * The usual entry point is the `minimap => true` render option of the text,
 * unified and split views, which renders the view with anchors and wraps it
 * with the strip ({@see wrap()}, core's renderWithMinimap).
 */
final class Minimap
{
    /**
     * round(part / total * 100, two decimals, half up) as integer hundredths:
     * floor((2 · part · 10000 + total) / (2 · total)); 0 when total <= 0.
     */
    public static function hundredths(int $part, int $total): int
    {
        if ($total <= 0) {
            return 0;
        }
        return intdiv(2 * $part * 10000 + $total, 2 * $total);
    }

    /** Format hundredths with exactly two decimals: 1250 → "12.50%", 5 → "0.05%". */
    public static function formatPercent(int $h): string
    {
        $frac = $h % 100;
        return intdiv($h, 100) . '.' . ($frac < 10 ? '0' : '') . $frac . '%';
    }

    /** @return array{index:int, kind:string, top:int, height:int} */
    private static function mark(int $index, string $kind, int $start, int $end, int $total): array
    {
        $top = self::hundredths($start, $total);
        return ['index' => $index, 'kind' => $kind, 'top' => $top, 'height' => self::hundredths($end, $total) - $top];
    }

    /**
     * Marks for a text-mode change list: one per added/removed change,
     * positioned by code-point offset in the new text. Removed changes have zero height.
     *
     * @param Change[] $changes
     * @return list<array{index:int, kind:string, top:int, height:int}>
     */
    public static function marksText(array $changes): array
    {
        $total = 0;
        foreach ($changes as $c) {
            if (!$c->removed) {
                $total += mb_strlen($c->value, 'UTF-8');
            }
        }
        $out = [];
        $offset = 0;
        $index = 0;
        foreach ($changes as $c) {
            if ($c->value === '') {
                continue;
            }
            $len = mb_strlen($c->value, 'UTF-8');
            if ($c->added) {
                $out[] = self::mark($index++, 'added', $offset, $offset + $len, $total);
                $offset += $len;
            } elseif ($c->removed) {
                $out[] = self::mark($index++, 'removed', $offset, $offset, $total);
            } else {
                $offset += $len;
            }
        }
        return $out;
    }

    /**
     * Marks for unified or split hunks: one per contiguous run of changed rows
     * (the runs that carry data-change-index), positioned by new-document line.
     *
     * @param list<array<string, mixed>> $hunks
     * @return list<array{index:int, kind:string, top:int, height:int}>
     */
    public static function marksLines(array $hunks): array
    {
        $total = 0;
        foreach ($hunks as $h) {
            if ($h['type'] === 'collapsed') {
                $total += $h['count'];
                continue;
            }
            foreach ($h['rows'] as $row) {
                if (self::hasNewSide($row)) {
                    $total++;
                }
            }
        }
        $out = [];
        $before = 0;
        $run = null; // [start, types, lines]
        $close = static function () use (&$run, &$out, $total): void {
            if ($run === null) {
                return;
            }
            $out[] = self::mark(count($out), self::runKind($run[1]), $run[0], $run[0] + $run[2], $total);
            $run = null;
        };
        foreach ($hunks as $h) {
            if ($h['type'] === 'collapsed') {
                $close();
                $before += $h['count'];
                continue;
            }
            foreach ($h['rows'] as $row) {
                $newSide = self::hasNewSide($row);
                if ($row['type'] === 'equal') {
                    $close();
                } else {
                    $run ??= [$before, [], 0];
                    $run[1][] = $row['type'];
                    if ($newSide) {
                        $run[2]++;
                    }
                }
                if ($newSide) {
                    $before++;
                }
            }
        }
        $close();
        return $out;
    }

    /** @param array<string, mixed> $row */
    private static function hasNewSide(array $row): bool
    {
        return isset($row['newNo']) || isset($row['right']);
    }

    /** @param list<string> $types */
    private static function runKind(array $types): string
    {
        $all = static function (callable $test) use ($types): bool {
            foreach ($types as $t) {
                if (!$test($t)) {
                    return false;
                }
            }
            return true;
        };
        if ($all(static fn(string $t): bool => $t === 'added')) {
            return 'added';
        }
        if ($all(static fn(string $t): bool => $t === 'removed')) {
            return 'removed';
        }
        if ($all(static fn(string $t): bool => $t === 'moved-from' || $t === 'moved-to')) {
            return 'moved';
        }
        return 'modified';
    }

    /**
     * The minimap strip (SPEC §21.2). Each mark links to #{idPrefix}-change-N,
     * so render the diff with anchors => true and the same idPrefix.
     *
     * @param list<array{index:int, kind:string, top:int, height:int}> $marks
     * @param array<string, mixed> $options idPrefix
     */
    public static function render(array $marks, array $options = []): string
    {
        $prefix = Html::escape(Options::idPrefix($options));
        $out = '<nav class="text-diff-minimap" aria-label="Change minimap">';
        foreach ($marks as $m) {
            $out .= '<a class="diff-minimap-mark diff-minimap-' . $m['kind'] . '" href="#' . $prefix . '-change-' . $m['index'] . '"'
                . ' style="top:' . self::formatPercent($m['top']) . ';height:' . self::formatPercent($m['height']) . '"'
                . ' aria-label="Change ' . ($m['index'] + 1) . ': ' . $m['kind'] . '"></a>';
        }
        return $out . '</nav>';
    }

    /** Diff and minimap side by side (core's renderWithMinimap); the strip is sticky (see style.css). */
    public static function wrap(string $diffHtml, string $minimapHtml): string
    {
        return '<div class="text-diff-with-minimap">' . $diffHtml . $minimapHtml . '</div>';
    }
}
