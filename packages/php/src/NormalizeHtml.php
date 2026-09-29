<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * HTML normalization utilities for cleaner diffs.
 */
final class NormalizeHtml
{
    /**
     * Normalize curly/smart quotes to their straight equivalents.
     *
     * Handles:
     *  - U+201C U+201D U+201E (double) → "
     *  - U+2018 U+2019 U+201A (single) → '
     */
    public static function normalizeQuotes(string $text): string
    {
        $text = preg_replace('/[\x{201C}\x{201D}\x{201E}]/u', '"', $text) ?? $text;
        $text = preg_replace('/[\x{2018}\x{2019}\x{201A}]/u', "'", $text) ?? $text;

        return $text;
    }

    /**
     * Strip inline formatting tags while preserving everything else byte for byte (SPEC §12.1).
     *
     * Removes opening, closing and self-closing <strong>, <em>, <b>, <i>, <u>, <s>, <mark>,
     * <sub>, <sup> tags (any attributes, any case) as recognised by {@see HtmlLexer}: a `>`
     * inside a quoted attribute value does not end the tag, and comments, CDATA and raw text
     * elements (script, style, ...) are left untouched.
     */
    public static function stripFormattingTags(string $text): string
    {
        $out = '';
        foreach (HtmlLexer::lex($text) as $seg) {
            if (in_array($seg['kind'], ['open', 'close', 'void'], true) && isset(HtmlLexer::FORMATTING_ELEMENTS[$seg['name']])) {
                continue;
            }
            $out .= $seg['raw'];
        }
        return $out;
    }
}
