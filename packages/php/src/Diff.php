<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Core diff engine using the Myers diff algorithm.
 * Produces Change[] arrays from two token sequences.
 */
final class Diff
{
    /**
     * Compute the diff between two arrays of tokens.
     *
     * @param string[] $oldTokens
     * @param string[] $newTokens
     * @return Change[]
     */
    public static function diffTokens(array $oldTokens, array $newTokens, bool $ignoreCase = false): array
    {
        $compare = $ignoreCase
            ? fn(string $a, string $b): bool => mb_strtolower($a) === mb_strtolower($b)
            : fn(string $a, string $b): bool => $a === $b;

        $lcs = self::lcs($oldTokens, $newTokens, $compare);

        $changes = [];
        $oldIdx = 0;
        $newIdx = 0;
        $lcsIdx = 0;

        while ($oldIdx < count($oldTokens) || $newIdx < count($newTokens)) {
            if ($lcsIdx < count($lcs)) {
                // Emit removed tokens before the next LCS match
                $removedBuf = '';
                while ($oldIdx < count($oldTokens) && !$compare($oldTokens[$oldIdx], $lcs[$lcsIdx])) {
                    $removedBuf .= $oldTokens[$oldIdx];
                    $oldIdx++;
                }
                if ($removedBuf !== '') {
                    $changes[] = new Change($removedBuf, removed: true);
                }

                // Emit added tokens before the next LCS match
                $addedBuf = '';
                while ($newIdx < count($newTokens) && !$compare($newTokens[$newIdx], $lcs[$lcsIdx])) {
                    $addedBuf .= $newTokens[$newIdx];
                    $newIdx++;
                }
                if ($addedBuf !== '') {
                    $changes[] = new Change($addedBuf, added: true);
                }

                // Emit the unchanged LCS token (use newTokens value to preserve original casing)
                $changes[] = new Change($newTokens[$newIdx]);
                $oldIdx++;
                $newIdx++;
                $lcsIdx++;
            } else {
                // After LCS is exhausted, remaining old tokens are removed
                $removedBuf = '';
                while ($oldIdx < count($oldTokens)) {
                    $removedBuf .= $oldTokens[$oldIdx];
                    $oldIdx++;
                }
                if ($removedBuf !== '') {
                    $changes[] = new Change($removedBuf, removed: true);
                }

                // Remaining new tokens are added
                $addedBuf = '';
                while ($newIdx < count($newTokens)) {
                    $addedBuf .= $newTokens[$newIdx];
                    $newIdx++;
                }
                if ($addedBuf !== '') {
                    $changes[] = new Change($addedBuf, added: true);
                }
            }
        }

        return self::mergeConsecutive($changes);
    }

    /**
     * Merge consecutive changes with the same status into single changes.
     *
     * @param Change[] $changes
     * @return Change[]
     */
    private static function mergeConsecutive(array $changes): array
    {
        if (count($changes) === 0) {
            return [];
        }

        $merged = [];
        $current = $changes[0];

        for ($i = 1, $len = count($changes); $i < $len; $i++) {
            $next = $changes[$i];
            if ($current->added === $next->added && $current->removed === $next->removed) {
                $current = new Change(
                    $current->value . $next->value,
                    added: $current->added,
                    removed: $current->removed,
                );
            } else {
                $merged[] = $current;
                $current = $next;
            }
        }
        $merged[] = $current;

        return $merged;
    }

    /**
     * Compute the Longest Common Subsequence of two token arrays.
     *
     * @param string[] $a
     * @param string[] $b
     * @param callable(string, string): bool $compare
     * @return string[]
     */
    private static function lcs(array $a, array $b, callable $compare): array
    {
        $m = count($a);
        $n = count($b);

        // Build DP table
        $dp = array_fill(0, $m + 1, array_fill(0, $n + 1, 0));
        for ($i = 1; $i <= $m; $i++) {
            for ($j = 1; $j <= $n; $j++) {
                if ($compare($a[$i - 1], $b[$j - 1])) {
                    $dp[$i][$j] = $dp[$i - 1][$j - 1] + 1;
                } else {
                    $dp[$i][$j] = max($dp[$i - 1][$j], $dp[$i][$j - 1]);
                }
            }
        }

        // Backtrack to find LCS
        $result = [];
        $i = $m;
        $j = $n;
        while ($i > 0 && $j > 0) {
            if ($compare($a[$i - 1], $b[$j - 1])) {
                $result[] = $a[$i - 1];
                $i--;
                $j--;
            } elseif ($dp[$i - 1][$j] >= $dp[$i][$j - 1]) {
                $i--;
            } else {
                $j--;
            }
        }

        return array_reverse($result);
    }
}
