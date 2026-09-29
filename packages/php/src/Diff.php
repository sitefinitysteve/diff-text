<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Token-level diff entry point.
 *
 * Tokens are interned to integer ids (the equality key, e.g. the lowercased
 * token for ignoreCase, is computed once per token), diffed with
 * {@see Myers}, and turned into change objects from token indices.
 */
final class Diff
{
    /**
     * Compute the diff between two arrays of tokens.
     *
     * @param string[] $oldTokens
     * @param string[] $newTokens
     * @param array{maxEditLength?: int|null} $options
     * @return Change[]
     */
    public static function diffTokens(array $oldTokens, array $newTokens, bool $ignoreCase = false, array $options = []): array
    {
        $key = $ignoreCase ? static fn(string $t): string => Str::lower($t) : null;
        $components = self::components(array_values($oldTokens), array_values($newTokens), $key, null, $options);

        return array_map(static fn(Component $c): Change => $c->toChange(), $components);
    }

    /**
     * Intern both token lists into integer ids.
     *
     * @param list<string> $oldTokens
     * @param list<string> $newTokens
     * @param (callable(string): string)|null $key
     * @return array{0: list<int>, 1: list<int>}
     */
    public static function intern(array $oldTokens, array $newTokens, ?callable $key = null): array
    {
        $ids = [];
        $a = [];
        $b = [];
        if ($key === null) {
            foreach ($oldTokens as $t) {
                $a[] = $ids[$t] ??= count($ids);
            }
            foreach ($newTokens as $t) {
                $b[] = $ids[$t] ??= count($ids);
            }
        } else {
            foreach ($oldTokens as $t) {
                $a[] = $ids[$key($t)] ??= count($ids);
            }
            foreach ($newTokens as $t) {
                $b[] = $ids[$key($t)] ??= count($ids);
            }
        }
        return [$a, $b];
    }

    /**
     * Run the diff and return raw [type, count] operations. When
     * maxEditLength is exceeded, a whole replacement is returned (SPEC §7.1).
     *
     * @param list<int> $a
     * @param list<int> $b
     * @param array<string, mixed> $options
     * @return list<array{0:int,1:int}>
     */
    public static function ops(array $a, array $b, array $options = []): array
    {
        $ops = Myers::diff($a, $b, Options::maxEditLength($options));
        if ($ops === null) {
            $ops = [];
            if ($a !== []) {
                $ops[] = [Myers::DELETE, count($a)];
            }
            if ($b !== []) {
                $ops[] = [Myers::INSERT, count($b)];
            }
        }
        return $ops;
    }

    /**
     * @internal Build jsdiff-style components: unchanged values come from the new tokens.
     *
     * @param list<string> $oldTokens
     * @param list<string> $newTokens
     * @param (callable(string): string)|null $key
     * @param (callable(list<string>): string)|null $join
     * @param array<string, mixed> $options
     * @return list<Component>
     */
    public static function components(array $oldTokens, array $newTokens, ?callable $key, ?callable $join, array $options = []): array
    {
        [$a, $b] = self::intern($oldTokens, $newTokens, $key);
        $join ??= static fn(array $tokens): string => implode('', $tokens);

        $components = [];
        $oldPos = 0;
        $newPos = 0;
        foreach (self::ops($a, $b, $options) as [$type, $count]) {
            if ($type === Myers::DELETE) {
                $components[] = new Component($join(array_slice($oldTokens, $oldPos, $count)), false, true, $count);
                $oldPos += $count;
            } else {
                $value = $join(array_slice($newTokens, $newPos, $count));
                $components[] = new Component($value, $type === Myers::INSERT, false, $count);
                $newPos += $count;
                if ($type === Myers::EQUAL) {
                    $oldPos += $count;
                }
            }
        }
        return $components;
    }
}
