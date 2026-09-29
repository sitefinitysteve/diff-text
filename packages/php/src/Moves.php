<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Moved-block detection on the line model (SPEC §19).
 *
 * A move is a contiguous run of removed lines whose normalized text equals a
 * contiguous run of added lines in a different change region. Blocks are found
 * greedily, longest first, and numbered by their position in the new text.
 *
 * Options: detectMoves (bool, default false), minMoveLines (default 1),
 * moveSimilarity (a number strictly between 0 and 1 enables near matches),
 * ignoreCase.
 *
 * Blocks are ['id' => int, 'oldStart' => int, 'newStart' => int, 'lines' => int].
 */
final class Moves
{
    /** Move detection is skipped when (removed rows) × (added rows) exceeds this. */
    public const MAX_PAIRS = 1_000_000;

    /** Near-match comparisons are skipped (exact only) when (removed rows) × (added rows) exceeds this. */
    public const MAX_NEAR_PAIRS = 250_000;

    /** Number of move color slots: diff-move-0 … diff-move-5. */
    public const COLORS = 6;

    private const WS_RUN = '/[' . Str::WS . ']+/u';

    /** Collapse whitespace runs to one space, trim, and lowercase when ignoreCase. */
    public static function normalizeLine(string $text, bool $ignoreCase = false): string
    {
        $s = Str::trim(preg_replace(self::WS_RUN, ' ', Str::utf8($text)) ?? $text);
        return $ignoreCase ? Str::lower($s) : $s;
    }

    /**
     * minMoveLines: a number >= 1 is floored; anything else means 1.
     *
     * @param array<string, mixed> $options
     */
    public static function minMoveLines(array $options): int
    {
        $n = $options['minMoveLines'] ?? null;
        return Options::isNumber($n) && $n >= 1 ? Options::floorInt($n) : 1;
    }

    /**
     * moveSimilarity: a number strictly between 0 and 1 enables near matches
     * with that threshold; anything else means 1 (exact only).
     *
     * @param array<string, mixed> $options
     */
    public static function threshold(array $options): float
    {
        $t = $options['moveSimilarity'] ?? null;
        return Options::isNumber($t) && $t > 0 && $t < 1 ? (float) $t : 1.0;
    }

    /**
     * Detect moved blocks in a full row list (LineModel::buildRows() output,
     * before collapsing). Returns blocks sorted by newStart, ids 0, 1, 2, …
     *
     * @param list<array<string, mixed>> $rows
     * @param array<string, mixed> $options
     * @return list<array{id:int, oldStart:int, newStart:int, lines:int}>
     */
    public static function build(array $rows, array $options = []): array
    {
        $n = count($rows);
        $region = array_fill(0, $n, -1);
        $r = -1;
        $removedIdx = [];
        $addedIdx = [];
        for ($i = 0; $i < $n; $i++) {
            $t = $rows[$i]['type'];
            if ($t === 'equal') {
                continue;
            }
            if ($i === 0 || $rows[$i - 1]['type'] === 'equal') {
                $r++;
            }
            $region[$i] = $r;
            if ($t === 'removed') {
                $removedIdx[] = $i;
            } elseif ($t === 'added') {
                $addedIdx[] = $i;
            }
        }
        $pairs = count($removedIdx) * count($addedIdx);
        if ($pairs === 0 || $pairs > self::MAX_PAIRS) {
            return [];
        }

        $ignoreCase = Options::isTrue($options, 'ignoreCase');
        $minLines = self::minMoveLines($options);
        $threshold = self::threshold($options);
        $near = $threshold < 1 && $pairs <= self::MAX_NEAR_PAIRS;

        $norm = [];
        $isRemoved = [];
        $isAdded = [];
        foreach ($rows as $i => $row) {
            $norm[$i] = $row['type'] === 'equal' ? '' : self::normalizeLine($row['text'], $ignoreCase);
            $isRemoved[$i] = $row['type'] === 'removed';
            $isAdded[$i] = $row['type'] === 'added';
        }

        // Candidates per added row: removed row indices in ascending order. In exact
        // mode only equal normalized text can match, so index by it (same result).
        // Each list is appended in ascending row order.
        $byNorm = [];
        if (!$near) {
            foreach ($removedIdx as $i) {
                $byNorm[$norm[$i]][] = $i;
            }
        }

        $simCache = [];
        $eq = static function (int $i, int $j) use ($norm, $near, $n, $threshold, &$simCache): bool {
            $a = $norm[$i];
            $b = $norm[$j];
            if ($a === $b) {
                return true;
            }
            if (!$near || $a === '' || $b === '') {
                return false;
            }
            $key = $i * $n + $j;
            return $simCache[$key] ??= Similarity::compute($a, $b, false) >= $threshold;
        };

        $assigned = array_fill(0, $n, false);
        $found = [];
        while (true) {
            $bestRi = -1;
            $bestAj = -1;
            $bestLen = 0;
            foreach ($addedIdx as $aj) {
                if ($assigned[$aj] || $norm[$aj] === '') {
                    continue;
                }
                $candidates = $near ? $removedIdx : ($byNorm[$norm[$aj]] ?? []);
                foreach ($candidates as $ri) {
                    if ($assigned[$ri] || $region[$ri] === $region[$aj] || !$eq($ri, $aj)) {
                        continue;
                    }
                    $len = 1;
                    while (
                        $ri + $len < $n
                        && $aj + $len < $n
                        && $isRemoved[$ri + $len]
                        && $isAdded[$aj + $len]
                        && !$assigned[$ri + $len]
                        && !$assigned[$aj + $len]
                        && $eq($ri + $len, $aj + $len)
                    ) {
                        $len++;
                    }
                    while ($norm[$aj + $len - 1] === '') {
                        $len--; // blocks never end with a blank line
                    }
                    if ($len > $bestLen) {
                        $bestRi = $ri;
                        $bestAj = $aj;
                        $bestLen = $len;
                    }
                }
            }
            if ($bestLen === 0 || $bestLen < $minLines) {
                break;
            }
            for ($k = 0; $k < $bestLen; $k++) {
                $assigned[$bestRi + $k] = true;
                $assigned[$bestAj + $k] = true;
            }
            $found[] = [$bestRi, $bestAj, $bestLen];
        }

        // New positions are unique, so the comparator never ties.
        usort($found, static fn(array $x, array $y): int => $x[1] <=> $y[1]);
        $out = [];
        foreach ($found as $id => [$ri, $aj, $len]) {
            $out[] = ['id' => $id, 'oldStart' => $rows[$ri]['oldNo'], 'newStart' => $rows[$aj]['newNo'], 'lines' => $len];
        }
        return $out;
    }

    /**
     * Rewrite removed/added rows covered by moves as moved-from/moved-to rows (SPEC §19.2).
     *
     * @param list<array<string, mixed>> $rows
     * @param list<array{id:int, oldStart:int, newStart:int, lines:int}> $moves
     * @return list<array<string, mixed>>
     */
    public static function apply(array $rows, array $moves): array
    {
        if ($moves === []) {
            return $rows;
        }
        $from = [];
        $to = [];
        foreach ($moves as $m) {
            for ($k = 0; $k < $m['lines']; $k++) {
                $from[$m['oldStart'] + $k] = [$m['id'], $m['newStart'] + $k];
                $to[$m['newStart'] + $k] = [$m['id'], $m['oldStart'] + $k];
            }
        }
        foreach ($rows as $i => $row) {
            if ($row['type'] === 'removed' && isset($from[$row['oldNo']])) {
                [$id, $counterpart] = $from[$row['oldNo']];
                $rows[$i] = ['type' => 'moved-from', 'oldNo' => $row['oldNo'], 'text' => $row['text'], 'move' => $id, 'counterpart' => $counterpart];
            } elseif ($row['type'] === 'added' && isset($to[$row['newNo']])) {
                [$id, $counterpart] = $to[$row['newNo']];
                $rows[$i] = ['type' => 'moved-to', 'newNo' => $row['newNo'], 'text' => $row['text'], 'move' => $id, 'counterpart' => $counterpart];
            }
        }
        return $rows;
    }
}
