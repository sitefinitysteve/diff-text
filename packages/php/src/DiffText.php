<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Unified entry point for all diff operations.
 *
 * Usage:
 *   DiffText::words($old, $new);
 *   DiffText::chars($old, $new);
 *   DiffText::html($old, $new, similarityThreshold: 0.3);
 */
final class DiffText
{
    /** Character-level diff. */
    public static function chars(string $oldText, string $newText, array $options = []): string
    {
        return DiffChars::render($oldText, $newText, $options);
    }

    /** Word-level diff (ignores whitespace). */
    public static function words(string $oldText, string $newText, array $options = []): string
    {
        return DiffWords::render($oldText, $newText, $options);
    }

    /** Word-level diff (whitespace-aware). */
    public static function wordsWithSpace(string $oldText, string $newText, array $options = []): string
    {
        return DiffWordsWithSpace::render($oldText, $newText, $options);
    }

    /** Line-level diff. */
    public static function lines(string $oldText, string $newText, array $options = []): string
    {
        return DiffLines::render($oldText, $newText, $options);
    }

    /** Sentence-level diff. */
    public static function sentences(string $oldText, string $newText, array $options = []): string
    {
        return DiffSentences::render($oldText, $newText, $options);
    }

    /** HTML-aware diff with optional similarity threshold. */
    public static function html(
        string $oldText,
        string $newText,
        array $options = [],
        ?float $similarityThreshold = null,
    ): string {
        return DiffHtml::render($oldText, $newText, $options, $similarityThreshold);
    }
}
