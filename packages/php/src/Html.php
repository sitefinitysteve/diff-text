<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Canonical markup helpers (SPEC §13).
 *
 * @internal
 */
final class Html
{
    /**
     * Escape exactly & < > " ' as &amp; &lt; &gt; &quot; &#39;, after turning
     * every "\r\n" and lone "\r" into "\n" (SPEC §13: HTML parsers do the same,
     * so server output matches the parsed DOM; diffing still uses the original text).
     */
    public static function escape(string $text): string
    {
        return strtr($text, ["\r\n" => "\n", "\r" => "\n", '&' => '&amp;', '<' => '&lt;', '>' => '&gt;', '"' => '&quot;', "'" => '&#39;']);
    }

    /** Percentage for display: floor(s·100 + 0.5), never PHP's round(). */
    public static function percent(float $similarity): int
    {
        return (int) floor($similarity * 100 + 0.5);
    }
}
