<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Text similarity in [0, 1] (SPEC §8), used by DiffHtml's similarityThreshold
 * and the stats badge.
 *
 *   prepare(s): tags → " ", normalize quotes, collapse whitespace runs, trim
 *   similarity = 2 · unchanged_non_ws / (non_ws(old) + non_ws(new)), clamped
 *
 * where "unchanged" comes from a words diff of the prepared texts. Tags are
 * stripped only for HTML input (the default); text views pass $html = false.
 */
final class Similarity
{
    private const WS_RUN = '/[' . Str::WS . ']+/u';

    /**
     * Similarity of old → new in [0, 1] (SPEC §8).
     *
     * With $html (the default, used by DiffHtml's threshold) every `<...>` is treated as a
     * tag and becomes a space; the text views (stats badge, heatmap, moves, timeline) pass
     * false so a plain-text `<` or `>` counts like any other character.
     *
     * Directional: the words diff runs old → new, and where several minimal diffs exist it
     * can keep different words than the reverse diff, so compute($a, $b) and compute($b, $a)
     * can differ.
     */
    public static function compute(string $oldText, string $newText, bool $html = true): float
    {
        $a = self::prepare($oldText, $html);
        $b = self::prepare($newText, $html);

        if ($a === '' && $b === '') {
            return 1.0;
        }
        if ($a === '' || $b === '') {
            return 0.0;
        }

        return self::fromChanges(DiffWords::diff($a, $b), $a, $b);
    }

    /**
     * Similarity of an existing change list against its two (unprepared) texts.
     *
     * @param Change[] $changes
     */
    public static function fromChanges(array $changes, string $old, string $new): float
    {
        $total = self::nonWs($old) + self::nonWs($new);
        if ($total === 0) {
            return 1.0;
        }
        $unchanged = 0;
        foreach ($changes as $change) {
            if (!$change->added && !$change->removed) {
                $unchanged += self::nonWs($change->value);
            }
        }

        return max(0.0, min(1.0, 2 * $unchanged / $total));
    }

    /** SPEC §8 prepare(): tags → " " (HTML input only), normalize quotes, collapse whitespace runs, trim. */
    public static function prepare(string $text, bool $html = true): string
    {
        $text = Str::utf8($text);
        if ($html) {
            $text = preg_replace('/<[^>]*>/', ' ', $text) ?? $text;
        }
        $text = NormalizeHtml::normalizeQuotes($text);
        $text = preg_replace(self::WS_RUN, ' ', $text) ?? $text;

        return Str::trim($text);
    }

    /** Number of code points that are not whitespace (SPEC §1 WS set). */
    public static function nonWhitespaceLength(string $text): int
    {
        return self::nonWs($text);
    }

    private static function nonWs(string $text): int
    {
        return mb_strlen(preg_replace(self::WS_RUN, '', $text) ?? $text, 'UTF-8');
    }
}
