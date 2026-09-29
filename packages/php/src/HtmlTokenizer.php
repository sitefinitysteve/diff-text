<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Tokens and equality keys for the tag-aware HTML diff (SPEC §12.2,
 * "Tokens" and "Keys"). Port of core's htmlTokens.ts.
 *
 * Token kinds: open, close, void, raw (a whole script/style/... element),
 * opaque (doctype, CDATA, processing instruction), text, space. Comments
 * are dropped.
 *
 * Text is decoded first (entities from {@see HtmlEntities}, numeric
 * references) and split into words, whitespace runs and single characters
 * (with combining marks, variation selectors, ZWJ sequences and flag pairs
 * kept together). Every token keeps its source spelling for output; a stray
 * `<` in text is output as `&lt;`.
 *
 * @internal
 */
final class HtmlTokenizer
{
    private const OTHER = 0;
    private const WS = 1;
    private const WORD = 2;
    private const EXT = 3;
    private const ZWJ = 4;
    private const RI = 5;

    /** Sorted [first, last, class] ranges (same data as core's htmlTokens.ts). */
    private const RANGES = [
        0x09, 0x0d, self::WS, 0x20, 0x20, self::WS, 0x30, 0x39, self::WORD, 0x41, 0x5a, self::WORD, 0x5f, 0x5f, self::WORD, 0x61, 0x7a, self::WORD,
        0xa0, 0xa0, self::WS, 0xaa, 0xaa, self::WORD, 0xad, 0xad, self::WORD, 0xb5, 0xb5, self::WORD, 0xba, 0xba, self::WORD,
        0xc0, 0xd6, self::WORD, 0xd8, 0xf6, self::WORD, 0xf8, 0x2ff, self::WORD, 0x300, 0x36f, self::EXT,
        0x370, 0x374, self::WORD, 0x376, 0x37d, self::WORD, 0x37f, 0x383, self::WORD, 0x386, 0x386, self::WORD, 0x388, 0x481, self::WORD,
        0x483, 0x489, self::EXT, 0x48a, 0x52f, self::WORD, 0x531, 0x556, self::WORD, 0x561, 0x587, self::WORD, 0x5d0, 0x5ea, self::WORD,
        0x620, 0x64a, self::WORD, 0x660, 0x669, self::WORD, 0x66e, 0x6d3, self::WORD, 0x1680, 0x1680, self::WS, 0x1ab0, 0x1aff, self::EXT,
        0x1dc0, 0x1dff, self::EXT, 0x1e00, 0x1fff, self::WORD, 0x2000, 0x200a, self::WS, 0x200d, 0x200d, self::ZWJ, 0x2028, 0x2029, self::WS,
        0x202f, 0x202f, self::WS, 0x205f, 0x205f, self::WS, 0x20d0, 0x20ff, self::EXT, 0x3000, 0x3000, self::WS, 0xfe00, 0xfe0f, self::EXT,
        0xfe20, 0xfe2f, self::EXT, 0xfeff, 0xfeff, self::WS, 0x1f1e6, 0x1f1ff, self::RI, 0x1f3fb, 0x1f3ff, self::EXT,
        0xe0020, 0xe007f, self::EXT, 0xe0100, 0xe01ef, self::EXT,
    ];

    private const ENTITY = '/\G&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/';

    /**
     * Replace invalid UTF-8 with U+FFFD (the one invalid-input contract; core
     * replaces lone UTF-16 surrogates the same way).
     */
    public static function scrub(string $s): string
    {
        if (mb_check_encoding($s, 'UTF-8')) {
            return $s;
        }
        $prev = mb_substitute_character();
        mb_substitute_character(0xFFFD);
        try {
            return mb_scrub($s, 'UTF-8');
        } finally {
            mb_substitute_character($prev);
        }
    }

    private static function classOf(int $cp): int
    {
        $lo = 0;
        $hi = intdiv(count(self::RANGES), 3) - 1;
        while ($lo <= $hi) {
            $mid = ($lo + $hi) >> 1;
            if ($cp < self::RANGES[$mid * 3]) {
                $hi = $mid - 1;
            } elseif ($cp > self::RANGES[$mid * 3 + 1]) {
                $lo = $mid + 1;
            } else {
                return self::RANGES[$mid * 3 + 2];
            }
        }
        return self::OTHER;
    }

    private static function numericEntity(string $digits, int $radix): string
    {
        $d = ltrim($digits, '0');
        if (strlen($d) > 8) {
            return "\u{FFFD}";
        }
        $v = $d === '' ? 0 : ($radix === 10 ? (int) $d : (int) hexdec($d));
        if ($v === 0 || $v > 0x10FFFF || ($v >= 0xD800 && $v <= 0xDFFF)) {
            return "\u{FFFD}";
        }
        return mb_chr($v, 'UTF-8');
    }

    /**
     * One unit per decoded code point: [raw, codePoint, char].
     *
     * @return list<array{0:string,1:int,2:string}>
     */
    private static function units(string $text): array
    {
        $out = [];
        $len = strlen($text);
        $i = 0;
        while ($i < $len) {
            $c = $text[$i];
            if ($c === '&' && preg_match(self::ENTITY, $text, $m, PREG_UNMATCHED_AS_NULL, $i) === 1) {
                if ($m[1] !== null) {
                    $ch = self::numericEntity($m[1], 10);
                } elseif ($m[2] !== null) {
                    $ch = self::numericEntity($m[2], 16);
                } else {
                    $ch = HtmlEntities::named((string) $m[3]);
                }
                if ($ch !== null) {
                    $out[] = [$m[0], mb_ord($ch, 'UTF-8'), $ch];
                    $i += strlen($m[0]);
                    continue;
                }
            }
            $b = ord($c);
            $n = $b < 0x80 ? 1 : ($b < 0xE0 ? 2 : ($b < 0xF0 ? 3 : 4));
            $ch = substr($text, $i, $n);
            $out[] = [$c === '<' ? '&lt;' : $ch, $n === 1 ? $b : (int) mb_ord($ch, 'UTF-8'), $ch];
            $i += $n;
        }
        return $out;
    }

    /** Decode the entities of a text run exactly as the tokenizer does. */
    public static function decode(string $text): string
    {
        $out = '';
        foreach (self::units($text) as $u) {
            $out .= $u[2];
        }
        return $out;
    }

    /**
     * @return list<array{space:bool, raw:string, decoded:string, len:int}>
     */
    private static function textPieces(string $text): array
    {
        $u = self::units($text);
        $cls = array_map(static fn(array $x): int => self::classOf($x[1]), $u);
        $n = count($u);
        $out = [];
        $i = 0;
        while ($i < $n) {
            $c = $cls[$i];
            if ($c === self::WS) {
                $j = $i + 1;
                while ($j < $n && $cls[$j] === self::WS) {
                    $j++;
                }
            } else {
                if ($c === self::WORD) {
                    $j = $i + 1;
                    while ($j < $n && ($cls[$j] === self::WORD || $cls[$j] === self::EXT)) {
                        $j++;
                    }
                } elseif ($c === self::RI && $i + 1 < $n && $cls[$i + 1] === self::RI) {
                    $j = $i + 2;
                } else {
                    $j = $i + 1;
                }
                while (true) {
                    if ($j < $n && $cls[$j] === self::EXT) {
                        $j++;
                    } elseif ($j + 1 < $n && $cls[$j] === self::ZWJ && $cls[$j + 1] !== self::WS) {
                        $j += 2;
                    } else {
                        break;
                    }
                }
            }
            $raw = '';
            $decoded = '';
            for ($k = $i; $k < $j; $k++) {
                $raw .= $u[$k][0];
                $decoded .= $u[$k][2];
            }
            $out[] = ['space' => $c === self::WS, 'raw' => $raw, 'decoded' => $decoded, 'len' => $j - $i];
            $i = $j;
        }
        return $out;
    }

    private static function collapse(string $s): string
    {
        $s = preg_replace('/[\t\n\f\r ]+/', ' ', $s) ?? $s;
        return preg_replace('/^ | $/', '', $s) ?? $s;
    }

    /** Attributes of a void tag, normalized for comparison (`<img>` == `<img />`). */
    private static function voidAttributes(string $raw, string $name): string
    {
        $s = self::collapse(substr($raw, 1 + strlen($name), -1));
        if (str_ends_with($s, '/')) {
            $s = substr($s, 0, -1);
        }
        return self::collapse($s);
    }

    /**
     * Tokenize (already scrubbed) HTML for the diff.
     *
     * @return list<array{kind:string, raw:string, name:string, key:string, len:int}>
     */
    public static function tokenize(string $html, bool $ignoreCase = false, bool $ignoreFormattingTags = true): array
    {
        $out = [];
        $formatting = [];
        foreach (HtmlLexer::lex($html) as $seg) {
            switch ($seg['kind']) {
                case 'comment':
                    break;
                case 'opaque':
                    $out[] = ['kind' => 'opaque', 'raw' => $seg['raw'], 'name' => '', 'key' => '!' . $seg['raw'], 'len' => 0];
                    break;
                case 'raw':
                    $raw = $seg['closed'] ? $seg['raw'] : $seg['raw'] . '</' . $seg['name'] . '>';
                    $out[] = ['kind' => 'raw', 'raw' => $raw, 'name' => $seg['name'], 'key' => '!' . $raw, 'len' => 0];
                    break;
                case 'open':
                case 'close':
                case 'void':
                    $name = $seg['name'];
                    if (isset(HtmlLexer::FORMATTING_ELEMENTS[$name])) {
                        if ($ignoreFormattingTags) {
                            break;
                        }
                        if ($seg['kind'] === 'open') {
                            $formatting[] = $name;
                        } elseif ($seg['kind'] === 'close') {
                            for ($k = count($formatting) - 1; $k >= 0; $k--) {
                                if ($formatting[$k] === $name) {
                                    array_splice($formatting, $k, 1);
                                    break;
                                }
                            }
                        }
                    }
                    $key = match ($seg['kind']) {
                        'open' => '<' . $name,
                        'close' => '</' . $name,
                        default => '<' . $name . '/' . self::voidAttributes($seg['raw'], $name),
                    };
                    $out[] = ['kind' => $seg['kind'], 'raw' => $seg['raw'], 'name' => $name, 'key' => $key, 'len' => 0];
                    break;
                default: // text
                    $ctx = '';
                    if ($formatting !== []) {
                        $set = array_values(array_unique($formatting));
                        sort($set, SORT_STRING);
                        $ctx = implode(',', $set);
                    }
                    foreach (self::textPieces($seg['raw']) as $piece) {
                        if ($piece['space']) {
                            $out[] = ['kind' => 'space', 'raw' => $piece['raw'], 'name' => '', 'key' => ' ', 'len' => 0];
                        } else {
                            $q = NormalizeHtml::normalizeQuotes($piece['decoded']);
                            $out[] = ['kind' => 'text', 'raw' => $piece['raw'], 'name' => '', 'key' => 't' . $ctx . '>' . ($ignoreCase ? Str::lower($q) : $q), 'len' => $piece['len']];
                        }
                    }
            }
        }
        return $out;
    }
}
