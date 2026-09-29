<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Text similarity computation using Dice coefficient.
 * Formula: 2 * unchanged_chars / (old_length + new_length)
 */
final class Similarity
{
    /**
     * Compute similarity score (0-1) between two texts.
     * HTML tags are stripped and quotes are normalized before comparison.
     */
    public static function compute(string $oldText, string $newText): float
    {
        $cleanOld = NormalizeHtml::normalizeQuotes(trim(preg_replace('/<[^>]*>/', ' ', $oldText) ?? ''));
        $cleanNew = NormalizeHtml::normalizeQuotes(trim(preg_replace('/<[^>]*>/', ' ', $newText) ?? ''));

        if ($cleanOld === '' && $cleanNew === '') {
            return 1.0;
        }
        if ($cleanOld === '' || $cleanNew === '') {
            return 0.0;
        }

        $changes = DiffWordsWithSpace::diff($cleanOld, $cleanNew);

        $unchangedLength = 0;
        foreach ($changes as $change) {
            if (!$change->added && !$change->removed) {
                $unchangedLength += mb_strlen($change->value);
            }
        }

        return (2 * $unchangedLength) / (mb_strlen($cleanOld) + mb_strlen($cleanNew));
    }
}
