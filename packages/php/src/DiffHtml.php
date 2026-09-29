<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Tag-aware HTML diff (SPEC §12). Port of core's html.ts: the output is
 * byte-identical to the JavaScript packages.
 *
 *  1. Invalid UTF-8 is replaced with U+FFFD.
 *  2. With a similarityThreshold, when both inputs are non-empty and less
 *     similar than the threshold, the result is a full replacement:
 *     `<div class="diff-removed" data-change-index="0">OLD</div><div class="diff-added" data-change-index="1">NEW</div>`.
 *  3. Otherwise both documents are tokenized ({@see HtmlTokenizer}: tags are
 *     atomic, script/style/... elements are one token, text is split into
 *     words, whitespace runs and characters and compared by decoded value
 *     with curly quotes normalized), diffed with Myers, pure insertions and
 *     deletions are slid to balance their tags, small unchanged runs between
 *     changes are grouped, and the result is rendered along the new
 *     document's structure ({@see HtmlDiffRenderer}).
 *
 * Every marker carries `data-change-index`, numbered 0, 1, 2, … in document order.
 *
 * Options:
 *  - ignoreCase (bool, default false)
 *  - ignoreFormattingTags (bool, default true): drop <strong>, <em>, <b>, … first
 *  - orphanMatchThreshold (float, default 0.3): absorb small unchanged runs between changes
 *  - similarityThreshold (float|null, default null)
 *  - maxEditLength (int|null)
 *
 * The HTML is treated as trusted: callers must sanitize untrusted input.
 */
final class DiffHtml
{
    public const DEFAULT_ORPHAN_MATCH_THRESHOLD = 0.3;

    /**
     * Render HTML diff output (inside `<div class="text-diff text-diff-html">`).
     *
     * @param array<string, mixed> $options
     * @param float|null $similarityThreshold Positional form kept for backwards compatibility;
     *                                        takes precedence over $options['similarityThreshold'].
     */
    public static function render(
        string $oldText,
        string $newText,
        array $options = [],
        ?float $similarityThreshold = null,
    ): string {
        if ($similarityThreshold !== null) {
            $options['similarityThreshold'] = $similarityThreshold;
        }
        return '<div class="text-diff text-diff-html">' . self::diff($oldText, $newText, $options)['html'] . '</div>';
    }

    /**
     * The diff itself, like core's diffHtml(): the inner markup, whether it is a
     * full replacement, and the similarity when a threshold was given and both
     * inputs are non-empty.
     *
     * @param array<string, mixed> $options
     * @return array{html: string, fullReplacement: bool, similarity?: float}
     */
    public static function diff(string $oldText, string $newText, array $options = []): array
    {
        $old = HtmlTokenizer::scrub($oldText);
        $new = HtmlTokenizer::scrub($newText);

        $similarity = null;
        $threshold = $options['similarityThreshold'] ?? null;
        if ((is_int($threshold) || is_float($threshold)) && $old !== '' && $new !== '') {
            $similarity = Similarity::compute($old, $new);
            if ($similarity < $threshold) {
                return [
                    'html' => '<div class="diff-removed" data-change-index="0">' . $old . '</div>'
                        . '<div class="diff-added" data-change-index="1">' . $new . '</div>',
                    'fullReplacement' => true,
                    'similarity' => $similarity,
                ];
            }
        }

        $ignoreCase = Options::flag($options, 'ignoreCase');
        $ignoreFormatting = ($options['ignoreFormattingTags'] ?? true) !== false;
        $a = HtmlTokenizer::tokenize($old, $ignoreCase, $ignoreFormatting);
        $b = HtmlTokenizer::tokenize($new, $ignoreCase, $ignoreFormatting);
        [$x, $y] = Diff::intern(array_column($a, 'key'), array_column($b, 'key'));
        $ops = Diff::ops($x, $y, $options);

        $t = $options['orphanMatchThreshold'] ?? null;
        $orphanThreshold = (is_int($t) || (is_float($t) && is_finite($t))) ? (float) $t : self::DEFAULT_ORPHAN_MATCH_THRESHOLD;

        $items = self::groupOrphans(self::slide(self::items($a, $b, $ops)), $orphanThreshold);
        $result = ['html' => (new HtmlDiffRenderer())->render($items), 'fullReplacement' => false];
        if ($similarity !== null) {
            $result['similarity'] = $similarity;
        }
        return $result;
    }

    /**
     * Alternating unchanged runs ['eq' => true, 'old', 'new'] and changes
     * ['eq' => false, 'removed', 'added'].
     *
     * @param list<array> $a
     * @param list<array> $b
     * @param list<array{0:int,1:int}> $ops
     * @return list<array>
     */
    private static function items(array $a, array $b, array $ops): array
    {
        $items = [];
        $i = 0;
        $j = 0;
        foreach ($ops as [$type, $count]) {
            if ($count === 0) {
                continue;
            }
            if ($type === Myers::EQUAL) {
                $items[] = ['eq' => true, 'old' => array_slice($a, $i, $count), 'new' => array_slice($b, $j, $count)];
                $i += $count;
                $j += $count;
                continue;
            }
            $last = count($items) - 1;
            if ($last < 0 || $items[$last]['eq']) {
                $items[] = ['eq' => false, 'removed' => [], 'added' => []];
                $last++;
            }
            if ($type === Myers::DELETE) {
                array_push($items[$last]['removed'], ...array_slice($a, $i, $count));
                $i += $count;
            } else {
                array_push($items[$last]['added'], ...array_slice($b, $j, $count));
                $j += $count;
            }
        }
        return $items;
    }

    /**
     * Tags of tokens[start, end) left unpaired by stack pairing.
     *
     * @param list<array> $tokens
     */
    private static function unpairedTags(array $tokens, int $start, int $end): int
    {
        $open = [];
        $unpaired = 0;
        for ($i = $start; $i < $end; $i++) {
            $t = $tokens[$i];
            if ($t['kind'] === 'open') {
                $open[] = $t['name'];
            } elseif ($t['kind'] === 'close') {
                if ($open !== [] && $open[count($open) - 1] === $t['name']) {
                    array_pop($open);
                } else {
                    $unpaired++;
                }
            }
        }
        return $unpaired + count($open);
    }

    /**
     * Slide pure insertions/deletions along equal neighbours (SPEC §12.2
     * "Sliding"): only when that strictly reduces unpaired tags; among the best
     * positions the closest to the original wins, the left one on a tie.
     *
     * @param list<array> $items
     * @return list<array>
     */
    private static function slide(array $items): array
    {
        for ($k = 0; $k < count($items); $k++) {
            $item = $items[$k];
            if ($item['eq'] || (($item['removed'] !== []) === ($item['added'] !== []))) {
                continue;
            }
            $side = $item['removed'] !== [] ? 'removed' : 'added';
            $eqSide = $side === 'removed' ? 'old' : 'new';
            $otherSide = $side === 'removed' ? 'new' : 'old';
            $prev = $k > 0 ? $items[$k - 1] : null;
            $next = $items[$k + 1] ?? null;
            $before = $prev !== null ? $prev[$eqSide] : [];
            $after = $next !== null ? $next[$eqSide] : [];
            $run = $item[$side];
            $seq = array_merge($before, $run, $after);
            $start0 = count($before);
            $len = count($run);
            $total = count($seq);
            $leftRun = ($prev !== null && isset($items[$k - 2])) ? $items[$k - 2][$side] : null;
            $rightRun = ($next !== null && isset($items[$k + 2])) ? $items[$k + 2][$side] : null;
            $score = static function (int $start) use ($leftRun, $rightRun, $seq, $len, $total): int {
                $mergeLeft = $leftRun !== null && $start === 0;
                $mergeRight = $rightRun !== null && $start + $len === $total;
                $merged = array_merge($mergeLeft ? $leftRun : [], array_slice($seq, $start, $len), $mergeRight ? $rightRun : []);
                return self::unpairedTags($merged, 0, count($merged))
                    + ($leftRun !== null && !$mergeLeft ? self::unpairedTags($leftRun, 0, count($leftRun)) : 0)
                    + ($rightRun !== null && !$mergeRight ? self::unpairedTags($rightRun, 0, count($rightRun)) : 0);
            };
            $best = $start0;
            $bestScore = $score($start0);
            $bestDist = 0;
            $consider = static function (int $start) use (&$best, &$bestScore, &$bestDist, $score, $start0): void {
                $sc = $score($start);
                $dist = abs($start - $start0);
                if ($sc < $bestScore || ($sc === $bestScore && $best !== $start0 && ($dist < $bestDist || ($dist === $bestDist && $start < $best)))) {
                    $best = $start;
                    $bestScore = $sc;
                    $bestDist = $dist;
                }
            };
            for ($s = $start0; $s > 0 && $seq[$s - 1]['key'] === $seq[$s + $len - 1]['key']; $s--) {
                $consider($s - 1);
            }
            for ($s = $start0; $s + $len < $total && $seq[$s]['key'] === $seq[$s + $len]['key']; $s++) {
                $consider($s + 1);
            }
            if ($best === $start0) {
                continue;
            }

            $other = array_merge($prev !== null ? $prev[$otherSide] : [], $next !== null ? $next[$otherSide] : []);
            $moved = ['eq' => false, 'removed' => [], 'added' => []];
            $moved[$side] = array_slice($seq, $best, $len);
            $newPrev = ['eq' => true, $eqSide => array_slice($seq, 0, $best), $otherSide => array_slice($other, 0, $best)];
            $newNext = ['eq' => true, $eqSide => array_slice($seq, $best + $len), $otherSide => array_slice($other, $best)];
            $replacement = [];
            if ($newPrev['old'] !== []) {
                $replacement[] = $newPrev;
            }
            $replacement[] = $moved;
            if ($newNext['old'] !== []) {
                $replacement[] = $newNext;
            }
            $from = $prev !== null ? $k - 1 : $k;
            array_splice($items, $from, ($prev !== null ? 1 : 0) + 1 + ($next !== null ? 1 : 0), $replacement);
            // Merge with a neighbouring change when an equal run vanished.
            $at = $from + ($newPrev['old'] !== [] ? 1 : 0);
            $left = $items[$at - 1] ?? null;
            if ($left !== null && !$left['eq']) {
                array_splice($items, $at - 1, 2, [[
                    'eq' => false,
                    'removed' => array_merge($left['removed'], $moved['removed']),
                    'added' => array_merge($left['added'], $moved['added']),
                ]]);
                $at--;
            }
            $cur = $items[$at];
            $right = $items[$at + 1] ?? null;
            if ($right !== null && !$right['eq']) {
                array_splice($items, $at, 2, [[
                    'eq' => false,
                    'removed' => array_merge($cur['removed'], $right['removed']),
                    'added' => array_merge($cur['added'], $right['added']),
                ]]);
            }
            $k = $at;
        }
        return $items;
    }

    /** @param list<array> $tokens */
    private static function textLength(array $tokens): int
    {
        $n = 0;
        foreach ($tokens as $t) {
            $n += $t['len'];
        }
        return $n;
    }

    /**
     * Orphan grouping (SPEC §12.2): an unchanged run between two changes that
     * holds only text and whitespace is absorbed when
     * textLen(run) / (textLen(previous change) + textLen(next change)) < threshold.
     * Orphan status is decided on the ungrouped items; absorbing proceeds left
     * to right, so chains merge.
     *
     * @param list<array> $items
     * @return list<array>
     */
    private static function groupOrphans(array $items, float $threshold): array
    {
        $n = count($items);
        $orphan = [];
        for ($k = 1; $k < $n - 1; $k++) {
            $item = $items[$k];
            $prev = $items[$k - 1];
            $next = $items[$k + 1];
            if (!$item['eq'] || $prev['eq'] || $next['eq']) {
                continue;
            }
            foreach ($item['new'] as $t) {
                if ($t['kind'] !== 'text' && $t['kind'] !== 'space') {
                    continue 2;
                }
            }
            $surrounding = self::textLength($prev['removed']) + self::textLength($prev['added'])
                + self::textLength($next['removed']) + self::textLength($next['added']);
            $orphan[$k] = $surrounding > 0 && self::textLength($item['new']) / $surrounding < $threshold;
        }

        $out = [];
        for ($k = 0; $k < $n; $k++) {
            $item = $items[$k];
            $last = $out === [] ? null : $out[count($out) - 1];
            if (!empty($orphan[$k]) && $last !== null && !$last['eq']) {
                $next = $items[$k + 1];
                $out[count($out) - 1] = [
                    'eq' => false,
                    'removed' => array_merge($last['removed'], $item['old'], $next['removed']),
                    'added' => array_merge($last['added'], $item['new'], $next['added']),
                ];
                $k++;
            } else {
                $out[] = $item;
            }
        }
        return $out;
    }
}
