<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Option helpers following SPEC §3 (JavaScript truthiness for booleans,
 * floored non-negative integers for maxEditLength).
 *
 * @internal
 */
final class Options
{
    /** @param array<string, mixed> $options */
    public static function flag(array $options, string $name): bool
    {
        $v = $options[$name] ?? null;
        if ($v === null || $v === false || $v === '' || $v === 0) {
            return false;
        }
        if (is_float($v)) {
            return $v !== 0.0 && !is_nan($v);
        }
        return true;
    }

    /** @param array<string, mixed> $options */
    public static function maxEditLength(array $options): ?int
    {
        $v = $options['maxEditLength'] ?? null;
        if (!is_int($v) && !is_float($v)) {
            return null;
        }
        if (is_float($v) && (is_nan($v) || is_infinite($v))) {
            return null;
        }
        if ($v < 0) {
            return null;
        }
        // Saturating: a float beyond the int range would warn and wrap on a plain (int) cast.
        return self::floorInt($v);
    }

    /** Default prefix for every emitted id (SPEC §18). */
    public const DEFAULT_ID_PREFIX = 'td';

    /**
     * Strict boolean option (core's `=== true`), used by the visualization
     * options: anchors, detectMoves, minimap.
     *
     * @param array<string, mixed> $options
     */
    public static function isTrue(array $options, string $name): bool
    {
        return ($options[$name] ?? null) === true;
    }

    /**
     * Boolean option that defaults to on: only a literal false turns it off
     * (core's `!== false`), used by showRemoved and legend.
     *
     * @param array<string, mixed> $options
     */
    public static function notFalse(array $options, string $name): bool
    {
        return ($options[$name] ?? null) !== false;
    }

    /**
     * The raw (unescaped) id prefix: idPrefix when it is a non-empty string, else "td" (SPEC §18).
     *
     * @param array<string, mixed> $options
     */
    public static function idPrefix(array $options): string
    {
        $p = $options['idPrefix'] ?? null;
        return is_string($p) && $p !== '' ? $p : self::DEFAULT_ID_PREFIX;
    }

    /** True for an int or a float that is not NaN (JavaScript `typeof x === 'number'` minus NaN). */
    public static function isNumber(mixed $v): bool
    {
        return is_int($v) || (is_float($v) && !is_nan($v));
    }

    /**
     * floor() of a number as an int, saturating infinities.
     */
    public static function floorInt(int|float $v): int
    {
        if (is_int($v)) {
            return $v;
        }
        if ($v >= (float) PHP_INT_MAX) {
            return PHP_INT_MAX;
        }
        if ($v <= (float) PHP_INT_MIN) {
            return PHP_INT_MIN;
        }
        return (int) floor($v);
    }
}
