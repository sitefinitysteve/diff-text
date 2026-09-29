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
     * Strip inline formatting tags while preserving block-level and other HTML.
     *
     * Removes: <strong>, <em>, <b>, <i>, <u>, <s>, <mark>, <sub>, <sup>
     * (opening, closing, and with attributes)
     */
    public static function stripFormattingTags(string $text): string
    {
        return preg_replace('/<\/?(strong|em|b|i|u|s|mark|sub|sup)(\s[^>]*)?>/i', '', $text) ?? $text;
    }
}
