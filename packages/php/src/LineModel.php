<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Line model shared by the unified and split views (SPEC §9–10).
 *
 * Rows, hunks and split rows are plain arrays whose keys (and key order)
 * match the canonical fixtures:
 *
 *   row:       ['type' => 'equal'|'removed'|'added', 'oldNo'?, 'newNo'?, 'text']
 *   moved row: ['type' => 'moved-from', 'oldNo', 'text', 'move', 'counterpart']
 *              ['type' => 'moved-to', 'newNo', 'text', 'move', 'counterpart']
 *   hunk:      ['type' => 'hunk', 'oldStart', 'oldLines', 'newStart', 'newLines', 'rows']
 *   collapsed: ['type' => 'collapsed', 'count', 'oldStart', 'newStart', 'rows']
 *   split row: ['type' => 'equal'|'modified'|'removed'|'added'|'moved-from'|'moved-to', 'left'?, 'right'?]
 *   cell:      ['type', 'lineNo', 'text', 'move'?, 'counterpart'?, 'parts'?]  (parts: change arrays)
 *
 * Options: ignoreCase, ignoreWhitespace, stripTrailingCr, contextLines (default 3),
 * detectMoves, minMoveLines, moveSimilarity (SPEC §19, see {@see Moves}).
 */
final class LineModel
{
    public const DEFAULT_CONTEXT_LINES = 3;

    /** Intra-line diffs are skipped when either line is longer than this (code points). */
    public const INTRALINE_MAX_LENGTH = 1000;

    /** Intra-line diffs are dropped when the pair's word similarity is below this. */
    public const INTRALINE_MIN_SIMILARITY = 0.3;

    /**
     * Split a change value into lines: cut after every "\n", keep a trailing
     * piece without "\n", then drop each line's "\n" or "\r\n" terminator.
     *
     * @return list<string>
     */
    public static function splitLines(string $value): array
    {
        $out = [];
        $start = 0;
        $len = strlen($value);
        while ($start < $len) {
            $nl = strpos($value, "\n", $start);
            if ($nl === false) {
                $out[] = substr($value, $start);
                break;
            }
            $line = substr($value, $start, $nl - $start);
            if (str_ends_with($line, "\r")) {
                $line = substr($line, 0, -1);
            }
            $out[] = $line;
            $start = $nl + 1;
        }
        return $out;
    }

    /**
     * Every line as a row, numbered from 1 on each side.
     *
     * @param array<string, mixed> $options
     * @return list<array<string, mixed>>
     */
    public static function buildRows(string $oldText, string $newText, array $options = []): array
    {
        $changes = DiffLines::diff($oldText, $newText, [
            'ignoreCase' => Options::flag($options, 'ignoreCase'),
            'ignoreWhitespace' => Options::flag($options, 'ignoreWhitespace'),
            'stripTrailingCr' => Options::flag($options, 'stripTrailingCr'),
        ]);
        $rows = [];
        $oldNo = 1;
        $newNo = 1;
        foreach ($changes as $c) {
            foreach (self::splitLines($c->value) as $text) {
                if ($c->added) {
                    $rows[] = ['type' => 'added', 'newNo' => $newNo++, 'text' => $text];
                } elseif ($c->removed) {
                    $rows[] = ['type' => 'removed', 'oldNo' => $oldNo++, 'text' => $text];
                } else {
                    $rows[] = ['type' => 'equal', 'oldNo' => $oldNo++, 'newNo' => $newNo++, 'text' => $text];
                }
            }
        }
        return $rows;
    }

    /**
     * buildRows(), then (when detectMoves is true) moved-block detection (SPEC §19).
     *
     * @param array<string, mixed> $options
     * @return list<array<string, mixed>>
     */
    public static function buildLineRows(string $oldText, string $newText, array $options = []): array
    {
        $rows = self::buildRows($oldText, $newText, $options);
        if (!Options::isTrue($options, 'detectMoves')) {
            return $rows;
        }
        return Moves::apply($rows, Moves::build($rows, $options));
    }

    /** @param array<string, mixed> $options */
    public static function contextLines(array $options): int
    {
        $n = $options['contextLines'] ?? null;
        if ((is_int($n) || is_float($n)) && !is_nan((float) $n) && $n >= 0) {
            // Saturating (also for INF): a plain (int) cast of a huge float warns and wraps.
            return Options::floorInt($n);
        }
        return self::DEFAULT_CONTEXT_LINES;
    }

    /**
     * Unified hunks: visible runs (changes plus context) and collapsed runs of
     * unchanged lines, in document order.
     *
     * @param array<string, mixed> $options
     * @return list<array<string, mixed>>
     */
    public static function buildHunks(string $oldText, string $newText, array $options = []): array
    {
        $rows = self::buildLineRows($oldText, $newText, $options);
        $n = count($rows);
        $context = self::contextLines($options);

        $visible = array_fill(0, $n, false);
        for ($i = 0; $i < $n; $i++) {
            if ($rows[$i]['type'] === 'equal') {
                continue;
            }
            $lo = max(0, $i - $context);
            // With contextLines = PHP_INT_MAX the sum overflows to a float; min() still returns $n - 1.
            $hi = min($n - 1, $i + $context);
            for ($j = $lo; $j <= $hi; $j++) {
                $visible[$j] = true;
            }
        }

        // A hidden run of a single row stays visible: folding it would save no space.
        if (in_array(true, $visible, true)) {
            for ($i = 0; $i < $n; $i++) {
                if (!$visible[$i] && ($visible[$i - 1] ?? true) && ($visible[$i + 1] ?? true)) {
                    $visible[$i] = true;
                }
            }
        }

        $out = [];
        $oldBefore = 0;
        $newBefore = 0;
        $i = 0;
        while ($i < $n) {
            $j = $i;
            while ($j < $n && $visible[$j] === $visible[$i]) {
                $j++;
            }
            $slice = array_slice($rows, $i, $j - $i);
            $oldLines = 0;
            $newLines = 0;
            foreach ($slice as $r) {
                if (isset($r['oldNo'])) {
                    $oldLines++;
                }
                if (isset($r['newNo'])) {
                    $newLines++;
                }
            }
            if ($visible[$i]) {
                $out[] = [
                    'type' => 'hunk',
                    'oldStart' => $oldBefore + 1,
                    'oldLines' => $oldLines,
                    'newStart' => $newBefore + 1,
                    'newLines' => $newLines,
                    'rows' => $slice,
                ];
            } else {
                $out[] = [
                    'type' => 'collapsed',
                    'count' => count($slice),
                    'oldStart' => $oldBefore + 1,
                    'newStart' => $newBefore + 1,
                    'rows' => $slice,
                ];
            }
            $oldBefore += $oldLines;
            $newBefore += $newLines;
            $i = $j;
        }
        return $out;
    }

    /**
     * Intra-line diff (wordsWithSpace, so whitespace changes are kept) for a removed/added
     * pair, or null when skipped (a line over 1000 code points, or similarity below 0.3).
     * Unchanged values carry the new text; {@see splitParts()} gives the per-side parts.
     *
     * @param array<string, mixed> $options
     * @return Change[]|null
     */
    public static function intraLineDiff(string $oldLine, string $newLine, array $options = []): ?array
    {
        $oldLine = Str::utf8($oldLine);
        $newLine = Str::utf8($newLine);
        if (mb_strlen($oldLine, 'UTF-8') > self::INTRALINE_MAX_LENGTH || mb_strlen($newLine, 'UTF-8') > self::INTRALINE_MAX_LENGTH) {
            return null;
        }
        $changes = DiffWordsWithSpace::diff($oldLine, $newLine, ['ignoreCase' => Options::flag($options, 'ignoreCase')]);
        if (Similarity::fromChanges($changes, $oldLine, $newLine) < self::INTRALINE_MIN_SIMILARITY) {
            return null;
        }
        return $changes;
    }

    /**
     * Per-side parts of an intra-line diff (SPEC §10): left = removed and unchanged changes
     * with every value taken from the old line's tokens, right = added and unchanged changes,
     * so each side joins back to its own line exactly (also under ignoreCase).
     *
     * @param Change[] $changes
     * @return array{left: list<array{value:string, added:bool, removed:bool, count:int}>, right: list<array{value:string, added:bool, removed:bool, count:int}>}
     */
    public static function splitParts(array $changes, string $oldLine): array
    {
        $oldTokens = Tokenizer::wordsWithSpace($oldLine);
        $left = [];
        $right = [];
        $pos = 0;
        foreach ($changes as $c) {
            if (!$c->added) {
                $value = implode('', array_slice($oldTokens, $pos, $c->count));
                $left[] = ['value' => $value, 'added' => false, 'removed' => $c->removed, 'count' => $c->count];
                $pos += $c->count;
            }
            if (!$c->removed) {
                $right[] = ['value' => $c->value, 'added' => $c->added, 'removed' => false, 'count' => $c->count];
            }
        }
        return ['left' => $left, 'right' => $right];
    }

    /**
     * Pair rows side by side (SPEC §10). Within each run of changed rows the
     * i-th removed row pairs with the i-th added row; moved rows are never
     * paired: each one flushes the pending rows and becomes its own row.
     *
     * @param list<array<string, mixed>> $rows
     * @param array<string, mixed> $options
     * @return list<array<string, mixed>>
     */
    public static function pairRows(array $rows, array $options = []): array
    {
        $out = [];
        $removed = [];
        $added = [];
        foreach ($rows as $row) {
            $type = $row['type'];
            if ($type === 'equal') {
                self::flushPairs($removed, $added, $out, $options);
                $out[] = [
                    'type' => 'equal',
                    'left' => ['type' => 'equal', 'lineNo' => $row['oldNo'], 'text' => $row['text']],
                    'right' => ['type' => 'equal', 'lineNo' => $row['newNo'], 'text' => $row['text']],
                ];
            } elseif ($type === 'removed') {
                $removed[] = $row;
            } elseif ($type === 'added') {
                $added[] = $row;
            } else {
                self::flushPairs($removed, $added, $out, $options);
                $out[] = $type === 'moved-from'
                    ? ['type' => 'moved-from', 'left' => self::cell($row)]
                    : ['type' => 'moved-to', 'right' => self::cell($row)];
            }
        }
        self::flushPairs($removed, $added, $out, $options);
        return $out;
    }

    /**
     * @param list<array<string, mixed>> $removed
     * @param list<array<string, mixed>> $added
     * @param list<array<string, mixed>> $out
     * @param array<string, mixed> $options
     */
    private static function flushPairs(array &$removed, array &$added, array &$out, array $options): void
    {
        for ($k = 0, $max = max(count($removed), count($added)); $k < $max; $k++) {
            $l = $removed[$k] ?? null;
            $r = $added[$k] ?? null;
            if ($l !== null && $r !== null) {
                $left = self::cell($l);
                $right = self::cell($r);
                $changes = self::intraLineDiff($l['text'], $r['text'], $options);
                if ($changes !== null) {
                    $parts = self::splitParts($changes, $l['text']);
                    $left['parts'] = $parts['left'];
                    $right['parts'] = $parts['right'];
                }
                $out[] = ['type' => 'modified', 'left' => $left, 'right' => $right];
            } elseif ($l !== null) {
                $out[] = ['type' => 'removed', 'left' => self::cell($l)];
            } else {
                $out[] = ['type' => 'added', 'right' => self::cell($r)];
            }
        }
        $removed = [];
        $added = [];
    }

    /**
     * Side-by-side hunks: buildHunks() with each visible hunk's rows paired.
     *
     * @param array<string, mixed> $options
     * @return list<array<string, mixed>>
     */
    public static function buildSplitRows(string $oldText, string $newText, array $options = []): array
    {
        $out = [];
        foreach (self::buildHunks($oldText, $newText, $options) as $h) {
            if ($h['type'] === 'hunk') {
                $h['rows'] = self::pairRows($h['rows'], $options);
            }
            $out[] = $h;
        }
        return $out;
    }

    /**
     * @param iterable<Change> $changes
     * @return list<array{value:string, added:bool, removed:bool, count:int}>
     */
    public static function changesToArrays(iterable $changes): array
    {
        $out = [];
        foreach ($changes as $c) {
            $out[] = ['value' => $c->value, 'added' => $c->added, 'removed' => $c->removed, 'count' => $c->count];
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function cell(array $row): array
    {
        if ($row['type'] === 'added') {
            return ['type' => 'added', 'lineNo' => $row['newNo'], 'text' => $row['text']];
        }
        if ($row['type'] === 'moved-to') {
            return ['type' => 'moved-to', 'lineNo' => $row['newNo'], 'text' => $row['text'], 'move' => $row['move'], 'counterpart' => $row['counterpart']];
        }
        if ($row['type'] === 'moved-from') {
            return ['type' => 'moved-from', 'lineNo' => $row['oldNo'], 'text' => $row['text'], 'move' => $row['move'], 'counterpart' => $row['counterpart']];
        }
        return ['type' => $row['type'], 'lineNo' => $row['oldNo'], 'text' => $row['text']];
    }
}
