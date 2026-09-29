<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Myers O((N+M)·D) diff over integer token ids.
 *
 * Two strategies are used:
 *
 * 1. **jsdiff-faithful forward pass** (default). This is a direct port of the
 *    greedy forward algorithm in jsdiff v8 (`lib/diff/base.js`), including its
 *    diagonal clipping and its tie-breaking (a deletion is preferred when the
 *    deletion and insertion candidates are equally far along). Instead of keeping
 *    jsdiff's linked list of change objects per diagonal, it records one bit
 *    per visited (d, k) cell (insert vs delete), then backtracks through the
 *    bits and replays the path with greedy snakes. The output is identical to
 *    jsdiff's, and the trace costs roughly D²/16 bytes.
 *
 * 2. **Linear-space bisection** (fallback). When the trace would exceed the
 *    memory budget (D ≈ 16 000 with the default 16 MB budget), the remaining
 *    problem is solved with Myers' middle-snake divide and conquer (as in
 *    diff-match-patch's `bisect`), after trimming the common suffix. It still
 *    returns a minimal edit script in O(N+M) space, but where several minimal
 *    scripts exist it may pick a different one than jsdiff would.
 *
 * The common prefix is always trimmed first. That is exactly what jsdiff's
 * initial `extractCommon` does, so it does not affect parity. The common
 * suffix is only trimmed in the fallback, because jsdiff's greedy forward
 * search can align trailing repeats differently (e.g. "xab" → "yabab").
 *
 * Operations are returned as a list of [type, count] pairs where type is one
 * of self::EQUAL, self::INSERT, self::DELETE.
 */
final class Myers
{
    public const EQUAL = 0;
    public const INSERT = 1;
    public const DELETE = -1;

    /** Default memory budget (bytes) for the faithful pass's direction trace. */
    public const DEFAULT_TRACE_BUDGET = 16 * 1024 * 1024;

    /**
     * @param list<int> $a Old token ids.
     * @param list<int> $b New token ids.
     * @param int|null $maxEditLength Give up (return null) when more edits than this are needed.
     * @param float|null $timeoutMs Give up (return null) after this many milliseconds.
     * @param int $traceBudget Bytes the faithful pass may use before switching to bisection.
     * @return list<array{0:int,1:int}>|null
     */
    public static function diff(
        array $a,
        array $b,
        ?int $maxEditLength = null,
        ?float $timeoutMs = null,
        int $traceBudget = self::DEFAULT_TRACE_BUDGET,
    ): ?array {
        $m = count($a);
        $n = count($b);

        // Common prefix: identical to jsdiff's seed extractCommon() at editLength 0.
        $p = 0;
        $lim = min($m, $n);
        while ($p < $lim && $a[$p] === $b[$p]) {
            $p++;
        }
        $ops = $p > 0 ? [[self::EQUAL, $p]] : [];
        if ($p === $m && $p === $n) {
            return $ops;
        }
        if ($p > 0) {
            $a = array_slice($a, $p);
            $b = array_slice($b, $p);
            $m -= $p;
            $n -= $p;
        }

        $maxEdit = $m + $n;
        if ($maxEditLength !== null) {
            $maxEdit = min($maxEdit, $maxEditLength);
        }
        if ($maxEdit < 1) {
            return null;
        }

        if ($m === 0 || $n === 0) {
            if ($m + $n > $maxEdit) {
                return null;
            }
            $ops[] = $m === 0 ? [self::INSERT, $n] : [self::DELETE, $m];
            return $ops;
        }

        // No token in common: jsdiff ends up deleting everything, then inserting
        // everything. Skip the O(N·M) search for that case.
        $inA = array_flip($a);
        $disjoint = true;
        foreach ($b as $id) {
            if (isset($inA[$id])) {
                $disjoint = false;
                break;
            }
        }
        unset($inA);
        if ($disjoint) {
            if ($m + $n > $maxEdit) {
                return null;
            }
            $ops[] = [self::DELETE, $m];
            $ops[] = [self::INSERT, $n];
            return $ops;
        }

        $rest = self::forward($a, $b, $m, $n, $maxEdit, $timeoutMs, $traceBudget);
        if ($rest === false) {
            return null;
        }
        if ($rest === null) {
            $rest = self::bisectAll($a, $b, $maxEdit);
            if ($rest === null) {
                return null;
            }
        }

        foreach ($rest as $op) {
            $ops[] = $op;
        }
        return $ops;
    }

    /**
     * jsdiff-faithful forward pass on inputs whose first tokens differ.
     *
     * jsdiff's loop body (base.js execEditLength) guards against two situations that cannot
     * happen with its diagonal clipping, so this port leaves them out. Proof sketch, writing
     * V[k] for the furthest x on diagonal k and D for the edit step:
     *
     *  1. A path that reaches the right edge (x = m-1) on diagonal j sets maxDiag = j-1, and one
     *     that reaches the bottom edge (y = n-1) sets minDiag = j+1. Diagonals outside
     *     [minDiag, maxDiag] are never processed again, so a processed diagonal k never reads a
     *     source that is already on the edge it would step over: jsdiff's canRemove bound
     *     (x+1 < m) and canAdd bounds (0 <= y+1 < n) only fail when the source is undefined.
     *  2. The bounds keep the step parity: at step D+1 diagonal minDiag is processed first and
     *     its best move again lands on y = n-1 (removing keeps y; inserting from V[minDiag+1]
     *     beats removing only if that entry has y >= n-2), so minDiag moves to the D+2 parity;
     *     symmetrically for maxDiag. Hence every processed k has the parity of D, and at least one
     *     of V[k-1], V[k+1] was written at step D-1: jsdiff's "dead diagonal" branch (both
     *     undefined) is unreachable, and with undefined stored as -2 (below every real x >= -1)
     *     "insert iff canAdd and (not canRemove or V[k-1] < V[k+1])" reduces to V[k-1] < V[k+1].
     *  3. The chosen source was written at step D-1, never earlier: a stale V[k+1] would have to
     *     sit on the right edge at diagonal maxDiag+1, but the step after it was written, diagonal
     *     maxDiag inserts from it, reaches the edge and lowers maxDiag below k; a stale V[k-1] would
     *     have been cleared when diagonal k last read it. So backtracking always steps to D-1.
     *
     * Exhaustive checks against jsdiff (all binary pairs up to length 8, all ternary pairs up to
     * length 5, plus random pairs up to 3000 tokens) never executed either branch.
     *
     * @param list<int> $a
     * @param list<int> $b
     * @return list<array{0:int,1:int}>|false|null  false = limit exceeded, null = trace budget exceeded
     */
    private static function forward(array $a, array $b, int $m, int $n, int $maxEdit, ?float $timeoutMs, int $traceBudget): array|false|null
    {
        $deadline = $timeoutMs !== null ? hrtime(true) + (int) ($timeoutMs * 1e6) : null;

        // $V[k + $off] = oldPos (index of the last consumed old token) of the furthest
        // path on diagonal k (k = oldPos - newPos); -2 stands for jsdiff's `undefined`.
        // Packed arrays, grown on demand, are much faster than hash lookups here.
        $cap = min($maxEdit, 1024) + 2;
        $off = $cap;
        $V = array_fill(0, 2 * $cap + 1, -2);
        $V[$off] = -1;

        // Seed snake: the prefix was already trimmed, so a[0] !== b[0]; nothing to extend.

        $minDiag = PHP_INT_MIN;
        $maxDiag = PHP_INT_MAX;

        /** @var array<int, string> $bits one bit per processed diagonal: 1 = insert, 0 = delete */
        $bits = [];
        /** @var array<int, int> $los */
        $los = [];
        $traceBytes = 0;

        for ($d = 1; $d <= $maxEdit; $d++) {
            if ($deadline !== null && hrtime(true) > $deadline) {
                return false;
            }
            if ($d + 1 >= $cap) {
                // Grow, keeping diagonal k at index k + $off.
                $newCap = min($maxEdit + 2, $cap * 2);
                $pad = $newCap - $cap;
                $V = array_merge(array_fill(0, $pad, -2), $V, array_fill(0, $pad, -2));
                $cap = $newCap;
                $off = $cap;
            }
            $lo = $minDiag > -$d ? $minDiag : -$d;
            $hi = $maxDiag < $d ? $maxDiag : $d;
            $los[$d] = $lo;
            $buf = '';
            $acc = 0;
            $nb = 0;

            for ($k = $lo, $i = $lo + $off; $k <= $hi; $k += 2, $i += 2) {
                $rp = $V[$i - 1];
                $ap = $V[$i + 1];
                // jsdiff clears the remove source: no later diagonal may reuse it.
                $V[$i - 1] = -2;

                if ($rp < $ap) {
                    $x = $ap;
                    $bit = 1;
                } else {
                    $x = $rp + 1;
                    $bit = 0;
                }

                // Greedy snake (extractCommon).
                $y = $x - $k;
                while ($x + 1 < $m && $y + 1 < $n && $a[$x + 1] === $b[$y + 1]) {
                    $x++;
                    $y++;
                }

                if ($x + 1 >= $m && $y + 1 >= $n) {
                    // Flush the partial trace for this step and backtrack.
                    $acc |= $bit << $nb;
                    $buf .= chr($acc);
                    $bits[$d] = $buf;
                    return self::replay($a, $b, $m, $n, self::backtrack($d, $k, $bits, $los));
                }

                $V[$i] = $x;
                if ($x + 1 >= $m && $k - 1 < $maxDiag) {
                    $maxDiag = $k - 1;
                    if ($maxDiag < $hi) {
                        $hi = $maxDiag;
                    }
                }
                if ($y + 1 >= $n && $k + 1 > $minDiag) {
                    $minDiag = $k + 1;
                }

                $acc |= $bit << $nb;
                if (++$nb === 8) {
                    $buf .= chr($acc);
                    $acc = 0;
                    $nb = 0;
                }
            }

            if ($nb > 0) {
                $buf .= chr($acc);
            }
            $bits[$d] = $buf;
            $traceBytes += strlen($buf) + 64;
            if ($traceBytes > $traceBudget) {
                return null;
            }
        }

        return false;
    }

    /**
     * Walk the direction trace back from the final cell (each step's source is at step d - 1).
     *
     * @param array<int, string> $bits
     * @param array<int, int> $los
     * @return list<int> Directions in forward order (1 = insert, 0 = delete).
     */
    private static function backtrack(int $d, int $k, array $bits, array $los): array
    {
        $dirs = [];
        for (; $d > 0; $d--) {
            $idx = ($k - $los[$d]) >> 1;
            $bit = (ord($bits[$d][$idx >> 3]) >> ($idx & 7)) & 1;
            $dirs[] = $bit;
            $k += $bit === 1 ? 1 : -1;
        }
        return array_reverse($dirs);
    }

    /**
     * Replay a direction sequence with greedy snakes, building jsdiff-style
     * components (an edit merges with the previous component only when it has
     * the same type, exactly like jsdiff's addToPath()).
     *
     * @param list<int> $a
     * @param list<int> $b
     * @param list<int> $dirs
     * @return list<array{0:int,1:int}>
     */
    private static function replay(array $a, array $b, int $m, int $n, array $dirs): array
    {
        $ops = [];
        $x = 0;
        $y = 0;
        $last = -1;
        foreach ($dirs as $dir) {
            $type = $dir === 1 ? self::INSERT : self::DELETE;
            if ($last >= 0 && $ops[$last][0] === $type) {
                $ops[$last][1]++;
            } else {
                $ops[] = [$type, 1];
                $last++;
            }
            if ($dir === 1) {
                $y++;
            } else {
                $x++;
            }
            $c = 0;
            while ($x < $m && $y < $n && $a[$x] === $b[$y]) {
                $x++;
                $y++;
                $c++;
            }
            if ($c > 0) {
                $ops[] = [self::EQUAL, $c];
                $last++;
            }
        }
        return $ops;
    }

    // ─── Linear-space fallback ──────────────────────────────────────────

    /**
     * @param list<int> $a
     * @param list<int> $b
     * @return list<array{0:int,1:int}>|null
     */
    private static function bisectAll(array $a, array $b, int $maxEdit): ?array
    {
        $raw = [];
        self::bisectRec($a, $b, $raw);

        // Normalise: inside every run of edits, deletions first, then insertions.
        $ops = [];
        $del = 0;
        $ins = 0;
        $edits = 0;
        foreach ($raw as [$type, $count]) {
            if ($type === self::EQUAL) {
                if ($del > 0) {
                    $ops[] = [self::DELETE, $del];
                }
                if ($ins > 0) {
                    $ops[] = [self::INSERT, $ins];
                }
                $edits += $del + $ins;
                $del = $ins = 0;
                $ops[] = [self::EQUAL, $count];
            } elseif ($type === self::DELETE) {
                $del += $count;
            } else {
                $ins += $count;
            }
        }
        if ($del > 0) {
            $ops[] = [self::DELETE, $del];
        }
        if ($ins > 0) {
            $ops[] = [self::INSERT, $ins];
        }
        $edits += $del + $ins;

        // Merge adjacent equal runs produced by recursion boundaries.
        $merged = [];
        foreach ($ops as $op) {
            $j = count($merged) - 1;
            if ($j >= 0 && $merged[$j][0] === $op[0]) {
                $merged[$j][1] += $op[1];
            } else {
                $merged[] = $op;
            }
        }

        return $edits > $maxEdit ? null : $merged;
    }

    /**
     * @param list<int> $a
     * @param list<int> $b
     * @param list<array{0:int,1:int}> $out
     */
    private static function bisectRec(array $a, array $b, array &$out): void
    {
        $m = count($a);
        $n = count($b);

        $p = 0;
        $lim = min($m, $n);
        while ($p < $lim && $a[$p] === $b[$p]) {
            $p++;
        }
        $s = 0;
        $lim -= $p;
        while ($s < $lim && $a[$m - 1 - $s] === $b[$n - 1 - $s]) {
            $s++;
        }
        if ($p > 0) {
            $out[] = [self::EQUAL, $p];
        }
        $m2 = $m - $p - $s;
        $n2 = $n - $p - $s;
        if ($m2 === 0 || $n2 === 0) {
            if ($m2 > 0) {
                $out[] = [self::DELETE, $m2];
            }
            if ($n2 > 0) {
                $out[] = [self::INSERT, $n2];
            }
        } else {
            if ($p > 0 || $s > 0) {
                $a = array_slice($a, $p, $m2);
                $b = array_slice($b, $p, $n2);
            }
            $split = self::bisect($a, $b, $m2, $n2);
            if ($split === null) {
                $out[] = [self::DELETE, $m2];
                $out[] = [self::INSERT, $n2];
            } else {
                [$x, $y] = $split;
                self::bisectRec(array_slice($a, 0, $x), array_slice($b, 0, $y), $out);
                self::bisectRec(array_slice($a, $x), array_slice($b, $y), $out);
            }
        }
        if ($s > 0) {
            $out[] = [self::EQUAL, $s];
        }
    }

    /**
     * Find the middle-snake split point (port of diff-match-patch's diff_bisect).
     *
     * @param list<int> $a
     * @param list<int> $b
     * @return array{0:int,1:int}|null
     */
    private static function bisect(array $a, array $b, int $m, int $n): ?array
    {
        $maxD = intdiv($m + $n + 1, 2);
        $off = $maxD;
        $len = 2 * $maxD;
        $v1 = array_fill(0, $len, -1);
        $v2 = $v1;
        $v1[$off + 1] = 0;
        $v2[$off + 1] = 0;
        $delta = $m - $n;
        $front = ($delta % 2) !== 0;
        $k1start = $k1end = $k2start = $k2end = 0;

        for ($d = 0; $d < $maxD; $d++) {
            for ($k1 = -$d + $k1start; $k1 <= $d - $k1end; $k1 += 2) {
                $k1o = $off + $k1;
                if ($k1 === -$d || ($k1 !== $d && $v1[$k1o - 1] < $v1[$k1o + 1])) {
                    $x1 = $v1[$k1o + 1];
                } else {
                    $x1 = $v1[$k1o - 1] + 1;
                }
                $y1 = $x1 - $k1;
                while ($x1 < $m && $y1 < $n && $a[$x1] === $b[$y1]) {
                    $x1++;
                    $y1++;
                }
                $v1[$k1o] = $x1;
                if ($x1 > $m) {
                    $k1end += 2;
                } elseif ($y1 > $n) {
                    $k1start += 2;
                } elseif ($front) {
                    $k2o = $off + $delta - $k1;
                    if ($k2o >= 0 && $k2o < $len && $v2[$k2o] !== -1) {
                        if ($x1 >= $m - $v2[$k2o]) {
                            return [$x1, $y1];
                        }
                    }
                }
            }
            for ($k2 = -$d + $k2start; $k2 <= $d - $k2end; $k2 += 2) {
                $k2o = $off + $k2;
                if ($k2 === -$d || ($k2 !== $d && $v2[$k2o - 1] < $v2[$k2o + 1])) {
                    $x2 = $v2[$k2o + 1];
                } else {
                    $x2 = $v2[$k2o - 1] + 1;
                }
                $y2 = $x2 - $k2;
                while ($x2 < $m && $y2 < $n && $a[$m - $x2 - 1] === $b[$n - $y2 - 1]) {
                    $x2++;
                    $y2++;
                }
                $v2[$k2o] = $x2;
                if ($x2 > $m) {
                    $k2end += 2;
                } elseif ($y2 > $n) {
                    $k2start += 2;
                } elseif (!$front) {
                    $k1o = $off + $delta - $k2;
                    if ($k1o >= 0 && $k1o < $len && $v1[$k1o] !== -1) {
                        $x1 = $v1[$k1o];
                        $y1 = $off + $x1 - $k1o;
                        if ($x1 >= $m - $x2) {
                            return [$x1, $y1];
                        }
                    }
                }
            }
        }

        return null;
    }
}
