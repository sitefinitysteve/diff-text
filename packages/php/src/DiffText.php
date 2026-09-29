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
 *   DiffText::unified($old, $new, ['contextLines' => 3]);
 *   DiffText::split($old, $new);
 *   DiffText::stats($old, $new, ['mode' => 'words']);
 *   DiffText::heatmap($old, $new, ['showRemoved' => true]);
 *   DiffText::timeline([$v1, $v2, $v3], ['mode' => 'words']);
 *   DiffText::playback($old, $new, ['mode' => 'words', 'speed' => 200]);
 *
 * Render options shared by the text modes, unified and split (SPEC §18–21):
 *   anchors (bool), idPrefix (string, default "td"), minimap (bool; implies anchors).
 * Unified and split also take detectMoves, minMoveLines and moveSimilarity (SPEC §19).
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

    /** HTML-aware diff with optional similarity threshold (also accepted as $options['similarityThreshold']). */
    public static function html(
        string $oldText,
        string $newText,
        array $options = [],
        ?float $similarityThreshold = null,
    ): string {
        return DiffHtml::render($oldText, $newText, $options, $similarityThreshold);
    }

    /** Unified line view with line numbers and collapsed unchanged lines. */
    public static function unified(string $oldText, string $newText, array $options = []): string
    {
        return DiffUnified::render($oldText, $newText, $options);
    }

    /** Side-by-side line view with intra-line highlighting. */
    public static function split(string $oldText, string $newText, array $options = []): string
    {
        return DiffSplit::render($oldText, $newText, $options);
    }

    /** Stats badge (added/removed/unchanged plus similarity). $options['mode'] picks the unit. */
    public static function stats(string $oldText, string $newText, array $options = []): string
    {
        return DiffStats::render($oldText, $newText, $options);
    }

    /**
     * Similarity of old → new in [0, 1] (SPEC §8; directional). Tags are stripped unless
     * $html is false; pass false for plain text.
     */
    public static function similarity(string $oldText, string $newText, bool $html = true): float
    {
        return Similarity::compute($oldText, $newText, $html);
    }

    /**
     * Rewrite heatmap: every sentence of the new text shaded by how much it changed (SPEC §20).
     * Options: ignoreCase, showRemoved (default true), legend (default true), anchors, idPrefix.
     *
     * @param array<string, mixed> $options
     */
    public static function heatmap(string $oldText, string $newText, array $options = []): string
    {
        return DiffHeatmap::render($oldText, $newText, $options);
    }

    /**
     * Revision timeline over two or more versions: a CSS-only step switcher (SPEC §22).
     * Options: mode (text mode, "unified" or "split"; default "words"), labels,
     * the mode's diff/line options, idPrefix, anchors.
     *
     * @param list<string> $versions
     * @param array<string, mixed> $options
     */
    public static function timeline(array $versions, array $options = []): string
    {
        return DiffTimeline::render($versions, $options);
    }

    /**
     * Animated playback of a text-mode diff with a CSS-only Replay toggle (SPEC §23).
     * Options: mode (text mode, default "words"), the mode's diff options, speed (ms), idPrefix, anchors.
     *
     * @param array<string, mixed> $options
     */
    public static function playback(string $oldText, string $newText, array $options = []): string
    {
        return DiffPlayback::render($oldText, $newText, $options);
    }
}
