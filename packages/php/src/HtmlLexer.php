<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * HTML lexer for the tag-aware HTML diff (SPEC §12.2, "Lexing"): splits a
 * document into segments without changing a byte (concatenating every
 * segment's `raw` gives the input back). Port of core's htmlLexer.ts; all
 * delimiters are ASCII, so byte offsets here and UTF-16 offsets there cut the
 * same characters.
 *
 * Segment kinds: text, comment, opaque (doctype, CDATA, processing
 * instruction), open, close, void (void element or `/>`), raw (a whole raw
 * text element: script, style, textarea, title, xmp, iframe, noembed, noframes).
 *
 * @internal
 */
final class HtmlLexer
{
    public const VOID_ELEMENTS = [
        'area' => true, 'base' => true, 'br' => true, 'col' => true, 'embed' => true,
        'hr' => true, 'img' => true, 'input' => true, 'link' => true, 'meta' => true,
        'param' => true, 'source' => true, 'track' => true, 'wbr' => true,
    ];

    public const RAW_TEXT_ELEMENTS = [
        'script' => true, 'style' => true, 'textarea' => true, 'title' => true,
        'xmp' => true, 'iframe' => true, 'noembed' => true, 'noframes' => true,
    ];

    public const FORMATTING_ELEMENTS = [
        'strong' => true, 'em' => true, 'b' => true, 'i' => true, 'u' => true,
        's' => true, 'mark' => true, 'sub' => true, 'sup' => true,
    ];

    /** Characters that end a tag name. */
    private const NAME_END = "\t\n\f\r />\"'";

    /** Characters allowed right after `</name` for the end tag of a raw text element. */
    private const END_TAG_FOLLOW = "\t\n\f\r />";

    /** ASCII-only lowercase (keeps byte offsets). */
    public static function asciiLower(string $s): string
    {
        return strtr($s, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz');
    }

    private static function isAsciiLetter(string $s, int $i): bool
    {
        if ($i >= strlen($s)) {
            return false;
        }
        $c = $s[$i];
        return ($c >= 'a' && $c <= 'z') || ($c >= 'A' && $c <= 'Z');
    }

    /**
     * @return array{0:int,1:int}|null [end (past `>`), nameEnd], or null when unterminated
     */
    private static function tagEnd(string $s, int $nameStart): ?array
    {
        $n = strlen($s);
        $i = $nameStart + 1;
        while ($i < $n && !str_contains(self::NAME_END, $s[$i])) {
            $i++;
        }
        $nameEnd = $i;
        while ($i < $n) {
            $c = $s[$i];
            if ($c === '>') {
                return [$i + 1, $nameEnd];
            }
            if ($c === '"' || $c === "'") {
                $j = strpos($s, $c, $i + 1);
                if ($j === false) {
                    return null;
                }
                $i = $j + 1;
            } else {
                $i++;
            }
        }
        return null;
    }

    /** @return array{0:int,1:bool} [end, closed] of a raw text element whose start tag ends at $from */
    private static function rawEnd(string $lower, string $name, int $from): array
    {
        $needle = '</' . $name;
        $k = strpos($lower, $needle, $from);
        while ($k !== false) {
            $f = $k + strlen($needle);
            if ($f < strlen($lower) && str_contains(self::END_TAG_FOLLOW, $lower[$f])) {
                $gt = strpos($lower, '>', $f);
                if ($gt !== false) {
                    return [$gt + 1, true];
                }
                break;
            }
            $k = strpos($lower, $needle, $k + 1);
        }
        return [strlen($lower), false];
    }

    /**
     * @return list<array{kind:string, raw:string, name:string, closed:bool}>
     */
    public static function lex(string $s): array
    {
        $out = [];
        $lower = self::asciiLower($s);
        $n = strlen($s);
        $textStart = 0;
        $p = 0;
        $push = static function (string $kind, int $end, string $name = '', bool $closed = true) use (&$out, &$p, &$textStart, $s): void {
            if ($p > $textStart) {
                $out[] = ['kind' => 'text', 'raw' => substr($s, $textStart, $p - $textStart), 'name' => '', 'closed' => true];
            }
            $out[] = ['kind' => $kind, 'raw' => substr($s, $p, $end - $p), 'name' => $name, 'closed' => $closed];
            $p = $end;
            $textStart = $end;
        };

        while ($p < $n) {
            $lt = strpos($s, '<', $p);
            if ($lt === false) {
                break;
            }
            $p = $lt;
            $c1 = $s[$p + 1] ?? '';
            if (substr_compare($s, '<!--', $p, 4) === 0) {
                $e = strpos($s, '-->', $p + 4);
                $push('comment', $e === false ? $n : $e + 3);
                continue;
            }
            if (substr_compare($s, '<![CDATA[', $p, 9) === 0) {
                $e = strpos($s, ']]>', $p + 9);
                if ($e !== false) {
                    $push('opaque', $e + 3);
                    continue;
                }
            } elseif (($c1 === '!' && self::isAsciiLetter($s, $p + 2)) || $c1 === '?') {
                $e = strpos($s, '>', $p + 2);
                if ($e !== false) {
                    $push('opaque', $e + 1);
                    continue;
                }
            } elseif ($c1 === '/' && self::isAsciiLetter($s, $p + 2)) {
                $t = self::tagEnd($s, $p + 2);
                if ($t !== null) {
                    $push('close', $t[0], substr($lower, $p + 2, $t[1] - $p - 2));
                    continue;
                }
            } elseif (self::isAsciiLetter($s, $p + 1)) {
                $t = self::tagEnd($s, $p + 1);
                if ($t !== null) {
                    $name = substr($lower, $p + 1, $t[1] - $p - 1);
                    if (isset(self::VOID_ELEMENTS[$name]) || substr_compare($s, '/>', $t[0] - 2, 2) === 0) {
                        $push('void', $t[0], $name);
                    } elseif (isset(self::RAW_TEXT_ELEMENTS[$name])) {
                        [$end, $closed] = self::rawEnd($lower, $name, $t[0]);
                        $push('raw', $end, $name, $closed);
                    } else {
                        $push('open', $t[0], $name);
                    }
                    continue;
                }
            }
            $p++; // not a construct: the `<` is text
        }
        if ($n > $textStart) {
            $out[] = ['kind' => 'text', 'raw' => substr($s, $textStart), 'name' => '', 'closed' => true];
        }
        return $out;
    }
}
