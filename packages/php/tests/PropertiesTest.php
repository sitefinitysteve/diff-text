<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use PhpDiffText\Change;
use PhpDiffText\DiffChars;
use PhpDiffText\DiffLines;
use PhpDiffText\DiffSentences;
use PhpDiffText\DiffStats;
use PhpDiffText\DiffWords;
use PhpDiffText\DiffWordsWithSpace;
use PhpDiffText\LineModel;
use PhpDiffText\Str;
use PhpDiffText\Tokenizer;

/**
 * Seeded property tests (ports of core's properties.test.ts P1, P3, P5, P7, P9, P10). Each
 * checks an invariant from SPEC.md against an independent oracle: the input text, the
 * tokenizer's token counts, an LCS dynamic program, or the line split of each side.
 */
final class PropertiesTest extends TestCase
{
    private const RUNS = 400;

    private const MODES = [
        'chars' => DiffChars::class,
        'words' => DiffWords::class,
        'wordsWithSpace' => DiffWordsWithSpace::class,
        'lines' => DiffLines::class,
        'sentences' => DiffSentences::class,
    ];

    /** Word characters, punctuation, every whitespace kind, CR/LF, case pairs, astral, invalid UTF-8. */
    private const FRAGMENTS = [
        'a', 'b', 'A', 'foo', 'Bar', 'é', "e\u{301}", '😀', '中', 'Σ', 'σ', 'İ',
        ' ', '  ', "\t", "\u{A0}", "\u{3000}", "\u{FEFF}", "\u{2028}", "\n", "\r\n", "\r",
        '.', '!', '?', ',', "'", '<', '>', '&', "\xC3", "\xED\xA0\x80",
    ];

    private const LINES = ['a', 'b', 'c', 'a b', 'x  y', '', ' a', 'A', "\tz", '😀', 'Hello World', 'hello world!'];

    public static function seeds(): iterable
    {
        foreach ([1, 7, 42] as $seed) {
            yield "seed $seed" => [$seed];
        }
    }

    private static function text(int $max = 14): string
    {
        $s = '';
        for ($i = mt_rand(0, $max); $i > 0; $i--) {
            $s .= self::FRAGMENTS[mt_rand(0, count(self::FRAGMENTS) - 1)];
        }
        return $s;
    }

    private static function lineText(): string
    {
        $lines = [];
        for ($i = mt_rand(0, 12); $i > 0; $i--) {
            $lines[] = self::LINES[mt_rand(0, count(self::LINES) - 1)];
        }
        $nl = mt_rand(0, 1) === 1 ? "\r\n" : "\n";
        return implode($nl, $lines) . ($lines !== [] && mt_rand(0, 1) === 1 ? $nl : '');
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

    /** @return list<string> jsdiff's non-empty tokens */
    private static function tokens(string $mode, string $s): array
    {
        $t = match ($mode) {
            'chars' => Tokenizer::chars($s),
            'words' => Tokenizer::words($s),
            'wordsWithSpace' => Tokenizer::wordsWithSpace($s),
            'lines' => Tokenizer::lines($s),
            'sentences' => Tokenizer::sentences($s),
        };
        return array_values(array_filter($t, static fn(string $x): bool => $x !== ''));
    }

    /** Independent oracle: minimal insertions + deletions via the LCS dynamic program. */
    private static function editDistance(array $a, array $b, callable $eq): int
    {
        $prev = array_fill(0, count($b) + 1, 0);
        foreach ($a as $x) {
            $cur = [0];
            foreach ($b as $j => $y) {
                $cur[] = $eq($x, $y) ? $prev[$j] + 1 : max($prev[$j + 1], $cur[$j]);
            }
            $prev = $cur;
        }
        return count($a) + count($b) - 2 * $prev[count($b)];
    }

    #[DataProvider('seeds')]
    public function testP1EveryModeButWordsRebuildsBothInputs(int $seed): void
    {
        mt_srand($seed);
        for ($i = 0; $i < self::RUNS; $i++) {
            [$a, $b] = [self::text(), self::text()];
            foreach (['chars', 'wordsWithSpace', 'lines', 'sentences'] as $mode) {
                $changes = self::MODES[$mode]::diff($a, $b);
                // Invalid UTF-8 is scrubbed to U+FFFD first (SPEC §1), so the sides rebuild the scrubbed text.
                $this->assertSame(Str::utf8($a), self::side($changes, false), "$mode old");
                $this->assertSame(Str::utf8($b), self::side($changes, true), "$mode new");
            }
            // words: whitespace is deduplicated, but all other content of both sides survives.
            $changes = DiffWords::diff($a, $b);
            $noWs = static fn(string $s): string => (string) preg_replace('/[' . Str::WS . ']+/u', '', $s);
            $this->assertSame($noWs(Str::utf8($a)), $noWs(self::side($changes, false)), 'words old');
            $this->assertSame($noWs(Str::utf8($b)), $noWs(self::side($changes, true)), 'words new');
        }
    }

    #[DataProvider('seeds')]
    public function testP3ChangeShapeAndTokenCounts(int $seed): void
    {
        mt_srand($seed);
        for ($i = 0; $i < self::RUNS; $i++) {
            [$a, $b] = [self::text(), self::text()];
            $options = ['ignoreCase' => mt_rand(0, 1) === 1];
            if (mt_rand(0, 2) === 0) {
                $options['maxEditLength'] = mt_rand(0, 6);
            }
            foreach (self::MODES as $mode => $class) {
                $changes = $class::diff($a, $b, $options);
                $oldCount = 0;
                $newCount = 0;
                foreach ($changes as $k => $c) {
                    $this->assertNotSame('', $c->value);
                    $this->assertGreaterThanOrEqual(1, $c->count);
                    $this->assertFalse($c->added && $c->removed);
                    if ($k > 0) {
                        $this->assertFalse($changes[$k - 1]->added === $c->added && $changes[$k - 1]->removed === $c->removed, 'adjacent same kind');
                    }
                    if ($mode === 'chars') {
                        $this->assertSame(mb_strlen($c->value, 'UTF-8'), $c->count);
                    }
                    $oldCount += $c->added ? 0 : $c->count;
                    $newCount += $c->removed ? 0 : $c->count;
                }
                $this->assertSame(count(self::tokens($mode, Str::utf8($a))), $oldCount, "$mode old count");
                $this->assertSame(count(self::tokens($mode, Str::utf8($b))), $newCount, "$mode new count");
                if ($a === $b) {
                    foreach ($changes as $c) {
                        $this->assertFalse($c->added || $c->removed, 'identical input has no changes');
                    }
                }
            }
        }
    }

    #[DataProvider('seeds')]
    public function testP5EditScriptIsMinimal(int $seed): void
    {
        mt_srand($seed);
        for ($i = 0; $i < self::RUNS; $i++) {
            [$a, $b] = [Str::utf8(self::text()), Str::utf8(self::text())];
            $ignoreCase = mt_rand(0, 1) === 1;
            $fold = $ignoreCase ? static fn(string $s): string => Str::lower($s) : static fn(string $s): string => $s;
            foreach (self::MODES as $mode => $class) {
                // SPEC §5 equality: words compare trimmed tokens; the others compare tokens.
                $eq = $mode === 'words'
                    ? static fn(string $x, string $y): bool => Str::trim($fold($x)) === Str::trim($fold($y))
                    : static fn(string $x, string $y): bool => $fold($x) === $fold($y);
                $edits = 0;
                foreach ($class::diff($a, $b, ['ignoreCase' => $ignoreCase]) as $c) {
                    $edits += ($c->added || $c->removed) ? $c->count : 0;
                }
                $this->assertSame(self::editDistance(self::tokens($mode, $a), self::tokens($mode, $b), $eq), $edits, $mode);
            }
        }
    }

    #[DataProvider('seeds')]
    public function testP7HunkInvariants(int $seed): void
    {
        mt_srand($seed);
        for ($i = 0; $i < self::RUNS; $i++) {
            [$a, $b] = [self::lineText(), self::lineText()];
            $options = ['contextLines' => mt_rand(0, 4), 'stripTrailingCr' => mt_rand(0, 1) === 1, 'ignoreCase' => mt_rand(0, 1) === 1];
            $rows = LineModel::buildRows($a, $b, $options);
            $hunks = LineModel::buildHunks($a, $b, $options);
            $this->assertSame($rows, array_merge(...array_map(static fn(array $h): array => $h['rows'], $hunks ?: [['rows' => []]])));
            $changed = array_filter($rows, static fn(array $r): bool => $r['type'] !== 'equal') !== [];
            $oldBefore = 0;
            $newBefore = 0;
            $visible = [];
            foreach ($hunks as $k => $h) {
                $oldLines = count(array_filter($h['rows'], static fn(array $r): bool => isset($r['oldNo'])));
                $newLines = count(array_filter($h['rows'], static fn(array $r): bool => isset($r['newNo'])));
                if ($k > 0) {
                    $this->assertNotSame($hunks[$k - 1]['type'], $h['type']);
                }
                $this->assertSame($oldBefore + 1, $h['oldStart']);
                $this->assertSame($newBefore + 1, $h['newStart']);
                if ($h['type'] === 'collapsed') {
                    $this->assertSame(count($h['rows']), $h['count']);
                    foreach ($h['rows'] as $r) {
                        $this->assertSame('equal', $r['type']);
                    }
                    if ($changed) {
                        $this->assertGreaterThanOrEqual(2, $h['count']);
                    }
                } else {
                    $this->assertSame($oldLines, $h['oldLines']);
                    $this->assertSame($newLines, $h['newLines']);
                }
                foreach ($h['rows'] as $_) {
                    $visible[] = $h['type'] === 'hunk';
                }
                $oldBefore += $oldLines;
                $newBefore += $newLines;
            }
            $ctx = $options['contextLines'];
            foreach ($rows as $k => $r) {
                $near = false;
                for ($j = max(0, $k - $ctx); $j <= min(count($rows) - 1, $k + $ctx); $j++) {
                    $near = $near || $rows[$j]['type'] !== 'equal';
                }
                if ($near) {
                    $this->assertTrue($visible[$k], 'row within context is visible');
                }
            }
            if (!$options['stripTrailingCr']) {
                // SPEC §9.1: rows reproduce each side's lines (P8); equal rows carry the new text,
                // so under ignoreCase the old side matches only up to case.
                $old = array_values(array_map(static fn(array $r): string => $r['text'], array_filter($rows, static fn(array $r): bool => isset($r['oldNo']))));
                $new = array_values(array_map(static fn(array $r): string => $r['text'], array_filter($rows, static fn(array $r): bool => isset($r['newNo']))));
                $fold = $options['ignoreCase'] ? static fn(array $l): array => array_map(Str::lower(...), $l) : static fn(array $l): array => $l;
                $this->assertSame($fold(LineModel::splitLines($a)), $fold($old));
                $this->assertSame(LineModel::splitLines($b), $new);
            }
        }
    }

    #[DataProvider('seeds')]
    public function testP9SplitOrderAndStats(int $seed): void
    {
        mt_srand($seed);
        for ($i = 0; $i < self::RUNS; $i++) {
            [$a, $b] = [self::lineText(), self::lineText()];
            $options = ['contextLines' => mt_rand(0, 4), 'ignoreCase' => mt_rand(0, 1) === 1];
            $split = LineModel::buildSplitRows($a, $b, $options);
            $this->assertSame(DiffStats::fromHunks(LineModel::buildHunks($a, $b, $options)), DiffStats::fromHunks($split));
            $left = [];
            $right = [];
            foreach ($split as $h) {
                foreach ($h['rows'] as $r) {
                    if ($h['type'] === 'collapsed') {
                        $left[] = $r['oldNo'];
                        $right[] = $r['newNo'];
                        continue;
                    }
                    if (isset($r['left'])) {
                        $left[] = $r['left']['lineNo'];
                    }
                    if (isset($r['right'])) {
                        $right[] = $r['right']['lineNo'];
                    }
                }
            }
            $this->assertSame($left === [] ? [] : range(1, count($left)), $left);
            $this->assertSame($right === [] ? [] : range(1, count($right)), $right);
        }
    }

    #[DataProvider('seeds')]
    public function testP10SplitPartsReproduceEachCell(int $seed): void
    {
        mt_srand($seed);
        $join = static fn(array $parts): string => implode('', array_column($parts, 'value'));
        $kept = static fn(array $parts): array => array_column(array_filter($parts, static fn(array $p): bool => !$p['added'] && !$p['removed']), 'count');
        for ($i = 0; $i < self::RUNS; $i++) {
            [$a, $b] = [self::lineText(), self::lineText()];
            $options = ['contextLines' => 100, 'ignoreCase' => mt_rand(0, 1) === 1];
            foreach (LineModel::buildSplitRows($a, $b, $options) as $h) {
                if ($h['type'] !== 'hunk') {
                    continue;
                }
                foreach ($h['rows'] as $r) {
                    $this->assertSame(isset($r['left']['parts']), isset($r['right']['parts']), 'both sides or neither');
                    if (!isset($r['left']['parts'])) {
                        continue;
                    }
                    $this->assertSame($r['left']['text'], $join($r['left']['parts']));
                    $this->assertSame($r['right']['text'], $join($r['right']['parts']));
                    $this->assertNotContains(true, array_column($r['left']['parts'], 'added'));
                    $this->assertNotContains(true, array_column($r['right']['parts'], 'removed'));
                    $this->assertSame(array_values($kept($r['left']['parts'])), array_values($kept($r['right']['parts'])));
                }
            }
            // Arbitrary single-line pairs, including case-folded and invalid-UTF-8 ones.
            $x = str_replace(["\r", "\n"], '', self::text());
            $y = str_replace(["\r", "\n"], '', self::text());
            $changes = LineModel::intraLineDiff($x, $y, $options);
            if ($changes !== null) {
                $parts = LineModel::splitParts($changes, Str::utf8($x));
                $this->assertSame(Str::utf8($x), $join($parts['left']));
                $this->assertSame(Str::utf8($y), $join($parts['right']));
            }
        }
    }
}
