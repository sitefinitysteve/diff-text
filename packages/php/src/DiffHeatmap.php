<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Rewrite heatmap (SPEC §20): how much each sentence of the new text changed.
 *
 * Both texts are split with the sentences tokenizer, old sentences are aligned
 * to new ones by word similarity, and every new sentence gets a heat bucket 0..4.
 *
 * Model options: ignoreCase. Render options: showRemoved (default true),
 * legend (default true), anchors, idPrefix.
 *
 * The model is ['segments' => list<segment>, 'exact' => bool] where a segment is
 *   ['type' => 'gap', 'text']
 *   ['type' => 'removed', 'text']
 *   ['type' => 'sentence', 'text', 'heat', 'status', 'similarity', 'changed', 'old'?]
 */
final class DiffHeatmap
{
    /** Two sentences can be aligned when their similarity is at least this. */
    public const MATCH_THRESHOLD = 0.5;

    /** Above this many sentences (either side, after trimming) alignment falls back to exact matches. */
    public const MAX_SENTENCES = 500;

    /** Legend text per heat bucket. */
    public const LABELS = ['unchanged', 'lightly edited', 'edited', 'heavily edited', 'rewritten or new'];

    /** Heat bucket for a similarity: 1 → 0, ≥0.75 → 1, ≥0.5 → 2, ≥0.25 → 3, else 4. */
    public static function heatLevel(float $similarity): int
    {
        if ($similarity >= 1) {
            return 0;
        }
        if ($similarity >= 0.75) {
            return 1;
        }
        if ($similarity >= 0.5) {
            return 2;
        }
        if ($similarity >= 0.25) {
            return 3;
        }
        return 4;
    }

    /** Percent changed for a paired sentence: 0 when unchanged, else max(1, 100 − floor(s·100 + 0.5)). */
    public static function changedPercent(float $similarity): int
    {
        if ($similarity >= 1) {
            return 0;
        }
        return max(1, 100 - Html::percent($similarity));
    }

    private static function isSentence(string $token): bool
    {
        return Similarity::nonWhitespaceLength($token) > 0;
    }

    /**
     * Build the heatmap model for old → new.
     *
     * @param array<string, mixed> $options ignoreCase
     * @return array{segments: list<array<string, mixed>>, exact: bool}
     */
    public static function build(string $oldText, string $newText, array $options = []): array
    {
        $ignoreCase = Options::isTrue($options, 'ignoreCase');
        $newTokens = Tokenizer::sentences($newText);
        $O = array_values(array_filter(Tokenizer::sentences($oldText), self::isSentence(...)));
        $N = array_values(array_filter($newTokens, self::isSentence(...)));
        $oKeys = $ignoreCase ? array_map(Str::lower(...), $O) : $O;
        $nKeys = $ignoreCase ? array_map(Str::lower(...), $N) : $N;
        $oLen = count($O);
        $nLen = count($N);

        // matches[k] = [oldIndex, newIndex, similarity], strictly increasing in both indexes.
        $matches = [];

        // 1. Common prefix and suffix of equal sentences.
        $pre = 0;
        while ($pre < $oLen && $pre < $nLen && $oKeys[$pre] === $nKeys[$pre]) {
            $pre++;
        }
        $suf = 0;
        while ($suf < $oLen - $pre && $suf < $nLen - $pre && $oKeys[$oLen - 1 - $suf] === $nKeys[$nLen - 1 - $suf]) {
            $suf++;
        }
        for ($k = 0; $k < $pre; $k++) {
            $matches[] = [$k, $k, 1.0];
        }

        // 2. Align the middle.
        $n = $oLen - $pre - $suf;
        $m = $nLen - $pre - $suf;
        $exact = $n > self::MAX_SENTENCES || $m > self::MAX_SENTENCES;
        if ($exact) {
            // SPEC §4 over whole sentence keys (equality ===, no empty-token removal).
            [$a, $b] = Diff::intern(array_slice($oKeys, $pre, $n), array_slice($nKeys, $pre, $m));
            $i = $pre;
            $j = $pre;
            foreach (Diff::ops($a, $b) as [$type, $count]) {
                if ($type === Myers::INSERT) {
                    $j += $count;
                } elseif ($type === Myers::DELETE) {
                    $i += $count;
                } else {
                    for ($k = 0; $k < $count; $k++) {
                        $matches[] = [$i++, $j++, 1.0];
                    }
                }
            }
        } elseif ($n > 0 && $m > 0) {
            foreach (self::align($oKeys, $nKeys, $pre, $n, $m) as $match) {
                $matches[] = $match;
            }
        }
        for ($k = $suf; $k > 0; $k--) {
            $matches[] = [$oLen - $k, $nLen - $k, 1.0];
        }

        // 3. Pair leftovers positionally inside each run between matches.
        $pairOf = array_fill(0, $nLen, null);
        $oldUsed = array_fill(0, $oLen, false);
        $prevI = -1;
        $prevJ = -1;
        $walk = $matches;
        $walk[] = [$oLen, $nLen, 0.0];
        foreach ($walk as [$mi, $mj, $ms]) {
            $runs = min($mi - $prevI - 1, $mj - $prevJ - 1);
            for ($k = 0; $k < $runs; $k++) {
                $oi = $prevI + 1 + $k;
                $nj = $prevJ + 1 + $k;
                $pairOf[$nj] = [$oi, Similarity::compute($oKeys[$oi], $nKeys[$nj], false)];
                $oldUsed[$oi] = true;
            }
            if ($mi < $oLen) {
                $pairOf[$mj] = [$mi, $ms];
                $oldUsed[$mi] = true;
            }
            $prevI = $mi;
            $prevJ = $mj;
        }

        // 4. Removed old sentences go before the first matched new sentence whose old index is larger.
        $removedBefore = array_fill(0, $nLen, []);
        $removedAtEnd = [];
        $mk = 0;
        $matchCount = count($matches);
        for ($oi = 0; $oi < $oLen; $oi++) {
            if ($oldUsed[$oi]) {
                continue;
            }
            while ($mk < $matchCount && $matches[$mk][0] < $oi) {
                $mk++;
            }
            if ($mk < $matchCount) {
                $removedBefore[$matches[$mk][1]][] = $O[$oi];
            } else {
                $removedAtEnd[] = $O[$oi];
            }
        }

        // 5. Segments in new-text order.
        $segments = [];
        $j = 0;
        foreach ($newTokens as $token) {
            if (!self::isSentence($token)) {
                $segments[] = ['type' => 'gap', 'text' => $token];
                continue;
            }
            foreach ($removedBefore[$j] as $r) {
                $segments[] = ['type' => 'removed', 'text' => $r];
            }
            $p = $pairOf[$j];
            if ($p === null) {
                $segments[] = ['type' => 'sentence', 'text' => $token, 'heat' => 4, 'status' => 'added', 'similarity' => 0.0, 'changed' => 100];
            } else {
                [$oi, $sim] = $p;
                $heat = self::heatLevel($sim);
                $status = $heat === 0 ? 'unchanged' : ($sim >= self::MATCH_THRESHOLD ? 'edited' : 'rewritten');
                $segments[] = [
                    'type' => 'sentence',
                    'text' => $token,
                    'heat' => $heat,
                    'status' => $status,
                    'similarity' => $sim,
                    'changed' => self::changedPercent($sim),
                    'old' => $O[$oi],
                ];
            }
            $j++;
        }
        foreach ($removedAtEnd as $r) {
            $segments[] = ['type' => 'removed', 'text' => $r];
        }
        return ['segments' => $segments, 'exact' => $exact];
    }

    /**
     * Weighted alignment of the middle (SPEC §20.1 step 2b). The DP adds
     * doubles in exactly the order written, compares with strict >, and the
     * backtrack compares with == against the very same expression.
     *
     * @param list<string> $oKeys
     * @param list<string> $nKeys
     * @return list<array{0:int, 1:int, 2:float}>
     */
    private static function align(array $oKeys, array $nKeys, int $pre, int $n, int $m): array
    {
        // Result-neutral shortcuts skip pairs that cannot reach the threshold, using
        // u <= min(a, b) and u <= the multiset intersection of their word tokens
        // (u = unchanged non-whitespace code points, a/b = non-whitespace lengths).
        $oBag = [];
        for ($i = 0; $i < $n; $i++) {
            $oBag[] = self::wordBag($oKeys[$pre + $i]);
        }
        $nBag = [];
        for ($j = 0; $j < $m; $j++) {
            $nBag[] = self::wordBag($nKeys[$pre + $j]);
        }
        $W = [];
        for ($i = 0; $i < $n; $i++) {
            $row = [];
            for ($j = 0; $j < $m; $j++) {
                $a = $oBag[$i][0];
                $b = $nBag[$j][0];
                if (4 * min($a, $b) < $a + $b || 4 * self::bagIntersection($oBag[$i][1], $nBag[$j][1]) < $a + $b) {
                    $row[] = null;
                    continue;
                }
                $s = Similarity::compute($oKeys[$pre + $i], $nKeys[$pre + $j], false);
                $row[] = $s >= self::MATCH_THRESHOLD ? $s : null;
            }
            $W[] = $row;
        }

        $D = array_fill(0, $n + 1, array_fill(0, $m + 1, 0.0));
        for ($i = 1; $i <= $n; $i++) {
            for ($j = 1; $j <= $m; $j++) {
                $best = $D[$i - 1][$j];
                if ($D[$i][$j - 1] > $best) {
                    $best = $D[$i][$j - 1];
                }
                $w = $W[$i - 1][$j - 1];
                if ($w !== null && $D[$i - 1][$j - 1] + $w > $best) {
                    $best = $D[$i - 1][$j - 1] + $w;
                }
                $D[$i][$j] = $best;
            }
        }

        $mid = [];
        $i = $n;
        $j = $m;
        while ($i > 0 && $j > 0) {
            $w = $W[$i - 1][$j - 1];
            if ($w !== null && $D[$i][$j] == $D[$i - 1][$j - 1] + $w) {
                $mid[] = [$pre + $i - 1, $pre + $j - 1, $w];
                $i--;
                $j--;
            } elseif ($D[$i][$j] == $D[$i - 1][$j]) {
                $i--;
            } else {
                $j--;
            }
        }
        return array_reverse($mid);
    }

    /**
     * Non-whitespace size of the prepared sentence and its trimmed word tokens
     * with [count, non-whitespace length].
     *
     * @return array{0:int, 1:array<string, array{0:int, 1:int}>}
     */
    private static function wordBag(string $sentence): array
    {
        $prepared = Similarity::prepare($sentence, false);
        $words = [];
        foreach (Tokenizer::words($prepared) as $token) {
            if ($token === '') {
                continue;
            }
            $k = Str::trim($token);
            if (isset($words[$k])) {
                $words[$k][0]++;
            } else {
                $words[$k] = [1, Similarity::nonWhitespaceLength($k)];
            }
        }
        return [Similarity::nonWhitespaceLength($prepared), $words];
    }

    /**
     * Upper bound on unchanged non-whitespace code points of a word diff between two bags.
     *
     * @param array<string, array{0:int, 1:int}> $a
     * @param array<string, array{0:int, 1:int}> $b
     */
    private static function bagIntersection(array $a, array $b): int
    {
        if (count($a) > count($b)) {
            [$a, $b] = [$b, $a];
        }
        $sum = 0;
        foreach ($a as $k => [$count, $len]) {
            if (isset($b[$k])) {
                $sum += min($count, $b[$k][0]) * $len;
            }
        }
        return $sum;
    }

    /**
     * Title / screen-reader label of a changed sentence, e.g. "rewritten, 82% changed".
     *
     * @param array<string, mixed> $s
     */
    public static function label(array $s): string
    {
        if ($s['status'] === 'added') {
            return 'new sentence';
        }
        if ($s['status'] === 'rewritten' && $s['heat'] === 4) {
            return 'rewritten, ' . $s['changed'] . '% changed';
        }
        return self::LABELS[$s['heat']] . ', ' . $s['changed'] . '% changed';
    }

    /** @param array<string, mixed> $options */
    public static function render(string $oldText, string $newText, array $options = []): string
    {
        return self::renderHeatmap(self::build($oldText, $newText, $options), $options);
    }

    /**
     * Sentence spans with data-heat, optional removed markers, optional legend (SPEC §20.2).
     *
     * @param array{segments: list<array<string, mixed>>, exact: bool} $heatmap
     * @param array<string, mixed> $options showRemoved, legend, anchors, idPrefix
     */
    public static function renderHeatmap(array $heatmap, array $options = []): string
    {
        $showRemoved = Options::notFalse($options, 'showRemoved');
        $anchors = Options::isTrue($options, 'anchors');
        $prefix = Html::escape(Options::idPrefix($options));
        $counts = [0, 0, 0, 0, 0];
        $removed = 0;
        $index = 0;
        $body = '';
        $indexAttrs = static function () use ($anchors, $prefix, &$index): string {
            $id = $anchors ? ' id="' . $prefix . '-change-' . $index . '"' : '';
            return $id . ' data-change-index="' . $index++ . '"';
        };
        foreach ($heatmap['segments'] as $seg) {
            if ($seg['type'] === 'gap') {
                $body .= '<span>' . Html::escape($seg['text']) . '</span>';
            } elseif ($seg['type'] === 'removed') {
                if (!$showRemoved) {
                    continue;
                }
                $removed++;
                $body .= '<span class="diff-heat-removed"' . $indexAttrs() . ' title="removed sentence">'
                    . '<span class="diff-sr">removed sentence: </span>' . Html::escape($seg['text']) . '</span>';
            } else {
                $counts[$seg['heat']]++;
                if ($seg['heat'] === 0) {
                    $body .= '<span class="diff-heat" data-heat="0">' . Html::escape($seg['text']) . '</span>';
                } else {
                    $label = self::label($seg);
                    $body .= '<span class="diff-heat" data-heat="' . $seg['heat'] . '"' . $indexAttrs() . ' title="' . $label . '">'
                        . Html::escape($seg['text']) . '<span class="diff-sr"> (' . $label . ')</span></span>';
                }
            }
        }
        $out = '<div class="text-diff text-diff-heatmap"><div class="diff-heat-text">' . $body . '</div>';
        if (Options::notFalse($options, 'legend')) {
            $out .= '<ul class="diff-heat-legend" aria-label="Heat legend">';
            for ($h = 0; $h < 5; $h++) {
                $out .= '<li class="diff-heat-key" data-heat="' . $h . '"><span class="diff-heat-swatch" aria-hidden="true"></span>'
                    . self::LABELS[$h] . ' (' . $counts[$h] . ')</li>';
            }
            if ($showRemoved) {
                $out .= '<li class="diff-heat-key diff-heat-key-removed"><span class="diff-heat-swatch" aria-hidden="true"></span>'
                    . 'removed (' . $removed . ')</li>';
            }
            $out .= '</ul>';
        }
        return $out . '</div>';
    }
}
