<?php

declare(strict_types=1);

/*
 * Diff engine benchmark: the new Myers engine vs the pre-1.6 O(m·n) LCS engine.
 *
 *   php benchmarks/bench.php                 # full table (both engines)
 *   php benchmarks/bench.php --engine=new    # only the new engine
 *   php benchmarks/bench.php --timeout=30    # per-case time limit in seconds (default 60)
 *   php benchmarks/bench.php --sizes=1000,10000
 *
 * Each case runs in its own PHP process (memory_limit=512M) so an
 * out-of-memory or a timeout in one case doesn't stop the run. Both engines
 * get the same token arrays; timings cover the diff only, not tokenizing.
 * Edits: small = 0.5% of tokens, large = 20%, unrelated = independent random
 * text, capped = unrelated with maxEditLength 1000 (whole-replacement fallback).
 */

require __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/LegacyDiff.php';

use PhpDiffText\Benchmarks\LegacyDiff;
use PhpDiffText\Diff;

const MEMORY_LIMIT = '512M';

/** @return list<string> */
function makeTokens(string $unit, int $n, int $seed): array
{
    mt_srand($seed);
    $out = [];
    if ($unit === 'chars') {
        $alphabet = str_split('abcdefghijklmnopqrstuvwxyz     .,');
        for ($i = 0; $i < $n; $i++) {
            $out[] = $alphabet[mt_rand(0, count($alphabet) - 1)];
        }
        return $out;
    }
    // words: ~500-word vocabulary with a Zipf-ish skew, like prose
    for ($i = 0; $i < $n; $i++) {
        $out[] = 'w' . (int) floor(500 ** (mt_rand() / mt_getrandmax()));
    }
    return $out;
}

/** @param list<string> $tokens @return list<string> */
function edit(array $tokens, int $edits, string $unit, int $seed): array
{
    mt_srand($seed);
    $pool = makeTokens($unit, 64, $seed + 1);
    for ($e = 0; $e < $edits; $e++) {
        $p = mt_rand(0, max(0, count($tokens) - 1));
        switch (mt_rand(0, 2)) {
            case 0:
                array_splice($tokens, $p, 1);
                break;
            case 1:
                array_splice($tokens, $p, 0, [$pool[mt_rand(0, 63)]]);
                break;
            default:
                $tokens[$p] = $pool[mt_rand(0, 63)];
        }
    }
    return $tokens;
}

/** @return array{0: list<string>, 1: list<string>} */
function scenario(string $unit, int $n, string $kind): array
{
    $old = makeTokens($unit, $n, 1000 + $n);
    return match ($kind) {
        'small' => [$old, edit($old, max(5, intdiv($n, 200)), $unit, 7)],       // 0.5% edits
        'large' => [$old, edit($old, intdiv($n, 5), $unit, 8)],                // 20% edits
        'unrelated', 'capped' => [$old, makeTokens($unit, $n, 5000 + $n)],     // independent text
    };
}

function runCase(string $engine, string $unit, int $n, string $kind): void
{
    [$a, $b] = scenario($unit, $n, $kind);
    gc_collect_cycles();
    $base = memory_get_usage();
    if (function_exists('memory_reset_peak_usage')) {
        memory_reset_peak_usage(); // PHP 8.2+
    }
    $t = hrtime(true);
    $options = $kind === 'capped' ? ['maxEditLength' => 1000] : [];
    $changes = $engine === 'old' ? LegacyDiff::diffTokens($a, $b) : Diff::diffTokens($a, $b, false, $options);
    $ms = (hrtime(true) - $t) / 1e6;
    $peak = memory_get_peak_usage() - $base;
    echo json_encode(['ms' => $ms, 'mb' => $peak / 1048576, 'changes' => count($changes)]), "\n";
}

// ─── child process mode ─────────────────────────────────────────────
if (($argv[1] ?? '') === '--case') {
    runCase($argv[2], $argv[3], (int) $argv[4], $argv[5]);
    exit(0);
}

// ─── driver ─────────────────────────────────────────────────────────
$opts = getopt('', ['engine::', 'timeout::', 'sizes::']);
$engines = isset($opts['engine']) ? [$opts['engine']] : ['old', 'new'];
$timeout = (float) ($opts['timeout'] ?? 60);
$sizes = isset($opts['sizes']) ? array_map('intval', explode(',', $opts['sizes'])) : [1000, 10000, 100000];

function spawn(string $engine, string $unit, int $n, string $kind, float $timeout): string
{
    $cmd = [PHP_BINARY, '-d', 'memory_limit=' . MEMORY_LIMIT, __FILE__, '--case', $engine, $unit, (string) $n, $kind];
    $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $out = '';
    $err = '';
    $start = microtime(true);
    while (true) {
        $out .= stream_get_contents($pipes[1]);
        $err .= stream_get_contents($pipes[2]);
        $status = proc_get_status($proc);
        if (!$status['running']) {
            break;
        }
        if (microtime(true) - $start > $timeout) {
            proc_terminate($proc, 9);
            proc_close($proc);
            return sprintf('timeout >%ds', (int) $timeout);
        }
        usleep(20000);
    }
    $out .= stream_get_contents($pipes[1]);
    $err .= stream_get_contents($pipes[2]) . $out;
    proc_close($proc);
    $line = trim((string) strtok($out, "\n"));
    $r = json_decode($line, true);
    if (!is_array($r)) {
        return str_contains($err, 'Allowed memory size') ? 'OOM (' . MEMORY_LIMIT . ')' : 'error';
    }
    return sprintf('%s ms / %s MB', number_format($r['ms'], $r['ms'] < 10 ? 2 : 0), number_format($r['mb'], 1));
}

printf("PHP %s, memory_limit %s per case, timeout %ds\n\n", PHP_VERSION, MEMORY_LIMIT, (int) $timeout);
$header = '| unit | tokens | edits | ' . implode(' | ', array_map(static fn($e) => $e === 'old' ? 'old (1.5.x LCS)' : 'new (Myers)', $engines)) . ' |';
echo $header, "\n", preg_replace('/[^|]/', '-', $header), "\n";
foreach (['chars', 'words'] as $unit) {
    foreach ($sizes as $n) {
        foreach (['small', 'large', 'unrelated', 'capped'] as $kind) {
            $cells = [];
            foreach ($engines as $engine) {
                if ($kind === 'capped' && $engine === 'old') {
                    $cells[] = 'n/a';
                    continue;
                }
                // The old engine allocates an (m+1)·(n+1) table: skip sizes that cannot fit.
                if ($engine === 'old' && $n > 10000) {
                    $cells[] = 'skipped (needs ~' . number_format($n * $n * 19 / 1e9) . ' GB)';
                    continue;
                }
                $cells[] = spawn($engine, $unit, $n, $kind, $timeout);
            }
            printf("| %s | %s | %s | %s |\n", $unit, number_format($n), $kind === 'capped' ? 'unrelated, maxEditLength 1000' : $kind, implode(' | ', $cells));
        }
    }
}
