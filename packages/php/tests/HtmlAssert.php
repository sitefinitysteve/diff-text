<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;

/**
 * HTML checks shared by the HTML tests: the marker-text extraction and
 * validity walk from SPEC §12.4, plus a libxml parse.
 */
final class HtmlAssert
{
    private const VOID = [
        'area' => true, 'base' => true, 'br' => true, 'col' => true, 'embed' => true, 'hr' => true,
        'img' => true, 'input' => true, 'link' => true, 'meta' => true, 'param' => true,
        'source' => true, 'track' => true, 'wbr' => true,
    ];

    private const WS = '\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

    /**
     * SPEC §12.4 walk. Returns ['error' => ?string, 'added' => string, 'removed' => string, 'nested' => bool].
     * `nested` is true when an element other than <img> appears inside a marker span.
     *
     * @return array{error: ?string, added: string, removed: string, nested: bool}
     */
    public static function walk(string $html): array
    {
        $stack = []; // list of [name, mark]
        $text = ['added' => '', 'removed' => ''];
        $nested = false;
        $len = strlen($html);
        $pos = 0;
        while ($pos < $len) {
            if (substr_compare($html, '<!--', $pos, 4) === 0) {
                $end = strpos($html, '-->', $pos + 4);
                $pos = $end === false ? $len : $end + 3;
                continue;
            }
            if ($html[$pos] === '<' && $pos + 1 < $len && preg_match('~[a-zA-Z/!]~', $html[$pos + 1]) === 1) {
                // find the first '>' not inside quotes
                $i = $pos + 1;
                $quote = null;
                while ($i < $len) {
                    $c = $html[$i];
                    if ($quote !== null) {
                        if ($c === $quote) {
                            $quote = null;
                        }
                    } elseif ($c === '"' || $c === "'") {
                        $quote = $c;
                    } elseif ($c === '>') {
                        break;
                    }
                    $i++;
                }
                if ($i >= $len) {
                    return ['error' => 'unterminated tag', 'added' => '', 'removed' => '', 'nested' => $nested];
                }
                $tag = substr($html, $pos, $i - $pos + 1);
                $pos = $i + 1;
                if ($tag[1] === '!') {
                    continue; // doctype
                }
                preg_match('~^</?([^\s/>]+)~', $tag, $nm);
                $name = strtolower($nm[1]);
                if ($tag[1] === '/') {
                    $top = array_pop($stack);
                    if ($top === null || $top[0] !== $name) {
                        return ['error' => "mismatched </{$name}>", 'added' => '', 'removed' => '', 'nested' => $nested];
                    }
                    continue;
                }
                if ($name !== 'img' && self::insideMarkerSpan($stack)) {
                    $nested = true;
                }
                if (isset(self::VOID[$name]) || str_ends_with($tag, '/>')) {
                    continue;
                }
                $mark = null;
                if (preg_match('~\sclass\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))~i', $tag, $cm) === 1) {
                    $classes = preg_split('/\s+/', trim($cm[2] ?? '') . ($cm[3] ?? '') . ($cm[4] ?? '')) ?: [];
                    if (in_array('diff-added', $classes, true)) {
                        $mark = 'added';
                    } elseif (in_array('diff-removed', $classes, true)) {
                        $mark = 'removed';
                    }
                }
                $stack[] = [$name, $mark];
                if ($name === 'script' || $name === 'style') {
                    // raw text: skip to the closing tag (not part of §12.4, which never sees scripts)
                    if (preg_match('~</' . $name . '[\s>]~i', $html, $sm, PREG_OFFSET_CAPTURE, $pos) === 1) {
                        $pos = $sm[0][1];
                    }
                }
                continue;
            }
            // text up to the next tag start
            $next = $pos + 1;
            while ($next < $len) {
                $n = strpos($html, '<', $next);
                if ($n === false) {
                    $next = $len;
                    break;
                }
                if ($n + 1 < $len && preg_match('~[a-zA-Z/!]~', $html[$n + 1]) === 1) {
                    $next = $n;
                    break;
                }
                $next = $n + 1;
            }
            $chunk = substr($html, $pos, $next - $pos);
            $pos = $next;
            $owner = self::owner($stack);
            if ($owner !== null) {
                $text[$owner] .= self::decode($chunk);
            }
        }
        if ($stack !== []) {
            return ['error' => 'unclosed <' . end($stack)[0] . '>', 'added' => '', 'removed' => '', 'nested' => $nested];
        }
        return ['error' => null, 'added' => self::finish($text['added']), 'removed' => self::finish($text['removed']), 'nested' => $nested];
    }

    /** Marker text for one side (SPEC §12.4). */
    public static function markedText(string $html, string $class): string
    {
        $r = self::walk($html);
        return $class === 'diff-added' ? $r['added'] : $r['removed'];
    }

    public static function assertWellFormed(TestCase $test, string $html): void
    {
        $r = self::walk($html);
        $test->assertNull($r['error'], "Invalid HTML ({$r['error']}): {$html}");
        $test->assertFalse($r['nested'], "An element is nested inside a diff marker: {$html}");

        // libxml's HTML parser must not report structural errors either. Only libxml 2.14+
        // tokenizes HTML5 (older versions end <script> at the first "</" and reject a bare
        // "& "), so on older builds the SPEC §12.4 walk above is the validity check.
        if (LIBXML_VERSION < 21400) {
            return;
        }
        $doc = new \DOMDocument();
        $prev = libxml_use_internal_errors(true);
        libxml_clear_errors();
        $doc->loadHTML('<?xml encoding="UTF-8"><html><body>' . $html . '</body></html>');
        $errors = array_filter(
            libxml_get_errors(),
            static fn(\LibXMLError $e): bool => $e->code !== 801, // 801: tag unknown to libxml (HTML5 elements)
        );
        libxml_clear_errors();
        libxml_use_internal_errors($prev);
        $test->assertSame([], array_values(array_map(static fn(\LibXMLError $e): string => trim($e->message), $errors)), "libxml errors for: {$html}");
    }

    /** @param list<array{0:string,1:?string}> $stack */
    private static function insideMarkerSpan(array $stack): bool
    {
        foreach ($stack as [$name, $mark]) {
            if ($mark !== null && $name === 'span') {
                return true;
            }
        }
        return false;
    }

    /** @param list<array{0:string,1:?string}> $stack */
    private static function owner(array $stack): ?string
    {
        for ($i = count($stack) - 1; $i >= 0; $i--) {
            if ($stack[$i][1] !== null) {
                return $stack[$i][1];
            }
        }
        return null;
    }

    private static function decode(string $s): string
    {
        return preg_replace_callback('~&(amp|lt|gt|quot|apos|nbsp|#[0-9]+|#[xX][0-9a-fA-F]+);~', static function (array $m): string {
            return match ($m[1]) {
                'amp' => '&', 'lt' => '<', 'gt' => '>', 'quot' => '"', 'apos' => "'", 'nbsp' => "\u{A0}",
                default => mb_chr($m[1][1] === 'x' || $m[1][1] === 'X' ? (int) hexdec(substr($m[1], 2)) : (int) substr($m[1], 1), 'UTF-8') ?: '',
            };
        }, $s) ?? $s;
    }

    private static function finish(string $s): string
    {
        $s = str_replace("\u{A0}", ' ', $s);
        $s = preg_replace('/[' . self::WS . ']+/u', ' ', $s) ?? $s;
        return preg_replace('/^[' . self::WS . ']+|[' . self::WS . ']+$/uD', '', $s) ?? $s;
    }
}
