<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Splits text into tokens at various granularities.
 */
final class Tokenizer
{
    /** Split into individual characters (multibyte-safe). */
    public static function chars(string $text): array
    {
        if ($text === '') {
            return [];
        }
        return mb_str_split($text);
    }

    /** Split into words, discarding whitespace between them. */
    public static function words(string $text): array
    {
        if ($text === '') {
            return [];
        }
        // Split on whitespace boundaries, keeping words only
        return preg_split('/\s+/', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    }

    /** Split into words AND whitespace runs, preserving everything. */
    public static function wordsWithSpace(string $text): array
    {
        if ($text === '') {
            return [];
        }
        // Split keeping both words and whitespace as separate tokens
        return preg_split('/(\s+)/', $text, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [];
    }

    /** Split into lines (preserving newline characters on each line). */
    public static function lines(string $text): array
    {
        if ($text === '') {
            return [];
        }
        // Split keeping the newline delimiters attached
        return preg_split('/(?<=\n)/', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    }

    /** Split into sentences (preserving trailing punctuation and whitespace). */
    public static function sentences(string $text): array
    {
        if ($text === '') {
            return [];
        }
        // Split after sentence-ending punctuation followed by whitespace
        return preg_split('/(?<=[.!?])\s+/', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    }
}
