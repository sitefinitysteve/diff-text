<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use PhpDiffText\Change;
use PhpDiffText\Diff;
use PhpDiffText\Myers;

/**
 * Property-style tests for the diff engine (seeded, so failures reproduce).
 */
final class MyersTest extends TestCase
{
    /** @return list<int> */
    private static function randomIds(int $len, int $alphabet): array
    {
        $out = [];
        for ($i = 0; $i < $len; $i++) {
            $out[] = mt_rand(0, $alphabet - 1);
        }
        return $out;
    }

    /** @return list<int> */
    private static function mutate(array $ids, int $edits, int $alphabet): array
    {
        for ($e = 0; $e < $edits; $e++) {
            $p = mt_rand(0, count($ids));
            if (mt_rand(0, 1) === 0 && $ids !== []) {
                array_splice($ids, min($p, count($ids) - 1), 1);
            } else {
                array_splice($ids, $p, 0, [mt_rand(0, $alphabet - 1)]);
            }
        }
        return $ids;
    }

    /** Classic O(n·m) LCS length, used as the minimality oracle for small inputs. */
    private static function lcsLength(array $a, array $b): int
    {
        $prev = array_fill(0, count($b) + 1, 0);
        foreach ($a as $x) {
            $cur = [0];
            foreach ($b as $j => $y) {
                $cur[] = $x === $y ? $prev[$j] + 1 : max($prev[$j + 1], $cur[$j]);
            }
            $prev = $cur;
        }
        return $prev[count($b)];
    }

    /**
     * Apply ops and check they rebuild both sides; returns the edit count.
     *
     * @param list<array{0:int,1:int}> $ops
     */
    private function assertOpsRebuild(array $a, array $b, array $ops): int
    {
        $oldPos = 0;
        $newPos = 0;
        $rebuiltOld = [];
        $rebuiltNew = [];
        $edits = 0;
        foreach ($ops as [$type, $count]) {
            $this->assertGreaterThan(0, $count);
            if ($type === Myers::EQUAL) {
                $this->assertSame(array_slice($a, $oldPos, $count), array_slice($b, $newPos, $count), 'equal run must match');
                array_push($rebuiltOld, ...array_slice($a, $oldPos, $count));
                array_push($rebuiltNew, ...array_slice($b, $newPos, $count));
                $oldPos += $count;
                $newPos += $count;
            } elseif ($type === Myers::DELETE) {
                array_push($rebuiltOld, ...array_slice($a, $oldPos, $count));
                $oldPos += $count;
                $edits += $count;
            } else {
                array_push($rebuiltNew, ...array_slice($b, $newPos, $count));
                $newPos += $count;
                $edits += $count;
            }
        }
        $this->assertSame($a, $rebuiltOld);
        $this->assertSame($b, $rebuiltNew);
        return $edits;
    }

    public static function seeds(): iterable
    {
        foreach ([1, 2, 3, 42, 1234, 99999] as $seed) {
            yield "seed $seed" => [$seed];
        }
    }

    #[DataProvider('seeds')]
    public function testFaithfulPassIsMinimalAndReconstructs(int $seed): void
    {
        mt_srand($seed);
        for ($i = 0; $i < 150; $i++) {
            $alphabet = mt_rand(2, 8);
            $a = self::randomIds(mt_rand(0, 60), $alphabet);
            $b = mt_rand(0, 2) === 0 ? self::randomIds(mt_rand(0, 60), $alphabet) : self::mutate($a, mt_rand(0, 12), $alphabet);
            $ops = Myers::diff($a, $b);
            $this->assertNotNull($ops);
            $edits = $this->assertOpsRebuild($a, $b, $ops);
            $this->assertSame(count($a) + count($b) - 2 * self::lcsLength($a, $b), $edits, 'edit script must be minimal');
        }
    }

    /**
     * With a zero trace budget, every input that needs more than one step goes through the
     * bisection fallback (testFallbackRunsWhenTraceBudgetIsExceeded proves it runs); its
     * scripts must still be minimal, rebuild both sides and list deletions before insertions.
     */
    #[DataProvider('seeds')]
    public function testZeroTraceBudgetGivesMinimalNormalizedScripts(int $seed): void
    {
        mt_srand($seed);
        for ($i = 0; $i < 150; $i++) {
            $alphabet = mt_rand(2, 8);
            $a = self::randomIds(mt_rand(0, 60), $alphabet);
            $b = mt_rand(0, 2) === 0 ? self::randomIds(mt_rand(0, 60), $alphabet) : self::mutate($a, mt_rand(0, 12), $alphabet);
            // A zero trace budget forces the middle-snake bisection after the first step.
            $ops = Myers::diff($a, $b, null, null, 0);
            $this->assertNotNull($ops);
            $edits = $this->assertOpsRebuild($a, $b, $ops);
            $this->assertSame(count($a) + count($b) - 2 * self::lcsLength($a, $b), $edits, 'edit script must be minimal');
            // Fallback output puts deletions before insertions inside each changed run.
            for ($j = 1, $n = count($ops); $j < $n; $j++) {
                $this->assertFalse($ops[$j - 1][0] === Myers::INSERT && $ops[$j][0] === Myers::DELETE);
                $this->assertNotSame($ops[$j - 1][0], $ops[$j][0], 'adjacent runs are merged');
            }
        }
    }

    public function testFallbackRunsWhenTraceBudgetIsExceeded(): void
    {
        // The forward pass (jsdiff) keeps 8 and inserts the repeat at the end...
        $this->assertSame([[Myers::DELETE, 1], [Myers::INSERT, 1], [Myers::EQUAL, 2], [Myers::INSERT, 2]], Myers::diff([7, 1, 2], [8, 1, 2, 1, 2]));
        // ...while the bisection fallback trims the common suffix first, so the insertion lands before it.
        $this->assertSame([[Myers::DELETE, 1], [Myers::INSERT, 3], [Myers::EQUAL, 2]], Myers::diff([7, 1, 2], [8, 1, 2, 1, 2], null, null, 0));
        // The budget counts strlen(step trace) + 64 bytes per completed step: this input finishes
        // in step 4, so 3 steps (195 bytes) fit exactly and one byte less switches to the fallback.
        $this->assertSame(Myers::diff([7, 1, 2], [8, 1, 2, 1, 2]), Myers::diff([7, 1, 2], [8, 1, 2, 1, 2], null, null, 195));
        $this->assertSame([[Myers::DELETE, 1], [Myers::INSERT, 3], [Myers::EQUAL, 2]], Myers::diff([7, 1, 2], [8, 1, 2, 1, 2], null, null, 194));
    }

    public function testMaxEditLengthAppliesToTheFallback(): void
    {
        // After the common prefix [1]: 2,3,4,5,6 vs 9,3,8,5,7 needs 6 edits (keep 3 and 5).
        $this->assertNull(Myers::diff([1, 2, 3, 4, 5, 6], [1, 9, 3, 8, 5, 7], 5, null, 0));
        $this->assertSame(
            [[0, 1], [-1, 1], [1, 1], [0, 1], [-1, 1], [1, 1], [0, 1], [-1, 1], [1, 1]],
            Myers::diff([1, 2, 3, 4, 5, 6], [1, 9, 3, 8, 5, 7], 6, null, 0),
        );
    }



    public function testMaxEditLengthReturnsNullWhenExceeded(): void
    {
        $this->assertNull(Myers::diff([1, 2, 3], [4, 5, 6], 5));
        $this->assertNull(Myers::diff([1, 2, 3, 4], [1, 9, 3, 8], 1));
        $this->assertSame([[Myers::EQUAL, 1], [Myers::DELETE, 1], [Myers::INSERT, 1], [Myers::EQUAL, 2]], Myers::diff([1, 2, 3, 4], [1, 9, 3, 4], 2));
        $this->assertSame([[Myers::EQUAL, 3]], Myers::diff([1, 2, 3], [1, 2, 3], 0));
        // Pure insertion/deletion after a common prefix still respects the limit (jsdiff returns undefined).
        $this->assertNull(Myers::diff([1, 2], [1, 2, 3, 4], 1));
        $this->assertNull(Myers::diff([1, 2, 3, 4], [1, 2], 1));
        $this->assertSame([[Myers::EQUAL, 2], [Myers::INSERT, 2]], Myers::diff([1, 2], [1, 2, 3, 4], 2));
    }


    public function testTimeoutParameterGivesUp(): void
    {
        // Not a public option (SPEC §3 drops jsdiff's timeout); the engine supports it internally.
        mt_srand(5);
        $this->assertNull(Myers::diff(self::randomIds(3000, 4), self::randomIds(3000, 4), null, 0.0));
    }

    public function testDisjointInputsAreDeleteThenInsert(): void
    {
        $this->assertSame([[Myers::DELETE, 3], [Myers::INSERT, 2]], Myers::diff([1, 2, 3], [4, 5]));
        $this->assertSame([[Myers::EQUAL, 1], [Myers::DELETE, 1], [Myers::INSERT, 1]], Myers::diff([7, 1], [7, 2]));
    }

    public function testEmptyInputs(): void
    {
        $this->assertSame([], Myers::diff([], []));
        $this->assertSame([[Myers::INSERT, 2]], Myers::diff([], [1, 2]));
        $this->assertSame([[Myers::DELETE, 2]], Myers::diff([1, 2], []));
    }

    public function testLargeInputWithSmallEditDistanceIsFast(): void
    {
        mt_srand(3);
        $a = self::randomIds(100000, 50);
        $b = self::mutate($a, 20, 50);
        $start = hrtime(true);
        $ops = Myers::diff($a, $b);
        $elapsedMs = (hrtime(true) - $start) / 1e6;
        $this->assertNotNull($ops);
        $this->assertLessThanOrEqual(20, $this->assertOpsRebuild($a, $b, $ops));
        $this->assertLessThan(2000, $elapsedMs);
    }

    public function testDiffTokensKeepsBackwardsCompatibleSignature(): void
    {
        $changes = Diff::diffTokens(['The', ' ', 'Cat'], ['the', ' ', 'dog'], true);
        $this->assertEquals([
            new Change('the ', false, false, 2),
            new Change('Cat', false, true, 1),
            new Change('dog', true, false, 1),
        ], $changes);
    }

    public function testDiffTokensDoesNotConfuseNumericStringTokens(): void
    {
        // "1" becomes an int array key when interned; "01" and "1.0" stay strings.
        $changes = Diff::diffTokens(['1', '01', '1.0'], ['01', '1', '1.0']);
        $this->assertSame('0111.0', self::side($changes, true));
        $this->assertSame('1011.0', self::side($changes, false));
        $this->assertSame('1.0', end($changes)->value);
        $this->assertFalse(end($changes)->added || end($changes)->removed);
    }

    /** @param Change[] $changes */
    private static function side(array $changes, bool $new): string
    {
        $out = '';
        foreach ($changes as $c) {
            if ($new ? !$c->removed : !$c->added) {
                $out .= $c->value;
            }
        }
        return $out;
    }
}
