<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * String helpers that follow JavaScript semantics (`\s`, `trim()`), so the
 * PHP port produces the same tokens as jsdiff.
 *
 * @internal
 */
final class Str
{
    /**
     * The characters matched by JavaScript's `\s` and stripped by `String.prototype.trim()`,
     * as a PCRE character-class body (use with the /u modifier).
     */
    public const WS = '\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

    /** WS without \n and \r (JavaScript's `[^\S\n\r]`). */
    public const WS_NO_NL = '\t\x{0B}\f \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

    /**
     * One well-formed UTF-8 sequence, or (second alternative) a maximal subpart of an
     * ill-formed one: a truncated prefix of a valid sequence, or any other single byte.
     */
    private const UTF8_UNIT = '/[\x00-\x7F]|[\xC2-\xDF][\x80-\xBF]|\xE0[\xA0-\xBF][\x80-\xBF]|[\xE1-\xEC\xEE\xEF][\x80-\xBF]{2}'
        . '|\xED[\x80-\x9F][\x80-\xBF]|\xF0[\x90-\xBF][\x80-\xBF]{2}|[\xF1-\xF3][\x80-\xBF]{3}|\xF4[\x80-\x8F][\x80-\xBF]{2}'
        . '|(\xE0[\xA0-\xBF]|[\xE1-\xEC\xEE\xEF][\x80-\xBF]|\xED[\x80-\x9F]|\xF0[\x90-\xBF][\x80-\xBF]?'
        . '|[\xF1-\xF3][\x80-\xBF]{1,2}|\xF4[\x80-\x8F][\x80-\xBF]?|[\x80-\xFF])/s';

    /**
     * Valid UTF-8 for any input (SPEC §1): each maximal subpart of an ill-formed sequence
     * becomes one U+FFFD, exactly like the WHATWG/TextDecoder decoder and Unicode's
     * recommended practice. Independent of mbstring's substitute character and version.
     */
    public static function utf8(string $s): string
    {
        if (mb_check_encoding($s, 'UTF-8')) {
            return $s;
        }
        return preg_replace_callback(
            self::UTF8_UNIT,
            static fn(array $m): string => isset($m[1]) ? "\u{FFFD}" : $m[0],
            $s,
        );
    }

    /**
     * JavaScript String.prototype.toLowerCase() (locale-independent full mapping), on every
     * supported PHP version: Final_Sigma is applied here (mb_strtolower only does it from
     * PHP 8.3), and letters whose lowercase is newer than the PHP build's Unicode tables are
     * mapped from {@see CaseData::LOWER}. The input must be valid UTF-8.
     */
    public static function lower(string $s): string
    {
        if (str_contains($s, "\u{3A3}")) {
            $s = self::lowerSigmas($s);
        }
        return mb_strtolower(strtr($s, CaseData::LOWER), 'UTF-8');
    }

    /**
     * Replace each capital sigma with final ς or medial σ (Unicode Final_Sigma: preceded by
     * a cased letter and not followed by one, skipping case-ignorable characters both ways).
     */
    private static function lowerSigmas(string $s): string
    {
        $cps = mb_str_split($s, 1, 'UTF-8');
        $n = count($cps);
        $out = $cps;
        foreach ($cps as $i => $c) {
            if ($c !== "\u{3A3}") {
                continue;
            }
            $j = $i - 1;
            while ($j >= 0 && self::isCaseIgnorable($cps[$j])) {
                $j--;
            }
            $k = $i + 1;
            while ($k < $n && self::isCaseIgnorable($cps[$k])) {
                $k++;
            }
            $final = $j >= 0 && self::isCased($cps[$j]) && !($k < $n && self::isCased($cps[$k]));
            $out[$i] = $final ? "\u{3C2}" : "\u{3C3}";
        }
        return implode('', $out);
    }

    private static function isCased(string $cp): bool
    {
        return preg_match('/^[' . CaseData::CASED . ']$/u', $cp) === 1;
    }

    private static function isCaseIgnorable(string $cp): bool
    {
        return preg_match('/^[' . CaseData::CASE_IGNORABLE . ']$/u', $cp) === 1;
    }

    /** JavaScript String.prototype.trim(). */
    public static function trim(string $s): string
    {
        return preg_replace('/^[' . self::WS . ']+|[' . self::WS . ']+$/uD', '', $s) ?? $s;
    }

    public static function hasWs(string $s): bool
    {
        return preg_match('/[' . self::WS . ']/u', $s) === 1;
    }

    public static function leadingWs(string $s): string
    {
        return preg_match('/^[' . self::WS . ']+/u', $s, $m) === 1 ? $m[0] : '';
    }

    public static function trailingWs(string $s): string
    {
        // The lookbehind anchors the match at the start of the final whitespace
        // run, keeping this linear (see jsdiff's note on quadratic regexes). It also
        // matches at offset 0, so a whitespace-only string is returned whole.
        return preg_match('/(?<![' . self::WS . '])[' . self::WS . ']+$/uD', $s, $m) === 1 ? $m[0] : '';
    }

    public static function longestCommonPrefix(string $a, string $b): string
    {
        $ca = mb_str_split($a);
        $cb = mb_str_split($b);
        $out = '';
        for ($i = 0, $n = min(count($ca), count($cb)); $i < $n && $ca[$i] === $cb[$i]; $i++) {
            $out .= $ca[$i];
        }
        return $out;
    }

    public static function longestCommonSuffix(string $a, string $b): string
    {
        $ca = mb_str_split($a);
        $cb = mb_str_split($b);
        $i = count($ca) - 1;
        $j = count($cb) - 1;
        $out = '';
        while ($i >= 0 && $j >= 0 && $ca[$i] === $cb[$j]) {
            $out = $ca[$i] . $out;
            $i--;
            $j--;
        }
        return $out;
    }

    public static function replacePrefix(string $s, string $oldPrefix, string $newPrefix): string
    {
        if (!str_starts_with($s, $oldPrefix)) {
            throw new \LogicException(sprintf('string %s doesn\'t start with prefix %s; this is a bug', json_encode($s), json_encode($oldPrefix)));
        }
        return $newPrefix . substr($s, strlen($oldPrefix));
    }

    public static function replaceSuffix(string $s, string $oldSuffix, string $newSuffix): string
    {
        if ($oldSuffix === '') {
            return $s . $newSuffix;
        }
        if (!str_ends_with($s, $oldSuffix)) {
            throw new \LogicException(sprintf('string %s doesn\'t end with suffix %s; this is a bug', json_encode($s), json_encode($oldSuffix)));
        }
        return substr($s, 0, -strlen($oldSuffix)) . $newSuffix;
    }

    public static function removePrefix(string $s, string $prefix): string
    {
        return self::replacePrefix($s, $prefix, '');
    }

    public static function removeSuffix(string $s, string $suffix): string
    {
        return self::replaceSuffix($s, $suffix, '');
    }

    /** Longest suffix of $a that is also a prefix of $b (returned from $b). */
    public static function maximumOverlap(string $a, string $b): string
    {
        $ca = mb_str_split($a);
        $cb = mb_str_split($b);
        $max = min(count($ca), count($cb));
        for ($len = $max; $len > 0; $len--) {
            if (array_slice($ca, count($ca) - $len) === array_slice($cb, 0, $len)) {
                return implode('', array_slice($cb, 0, $len));
            }
        }
        return '';
    }
}
