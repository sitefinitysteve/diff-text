<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * HTML-aware diff renderer with optional similarity threshold.
 *
 * When similarityThreshold is set and the texts are below that similarity,
 * renders a "full replacement" (entire old text as removed, entire new text as added).
 * Otherwise renders a word-level diff of the HTML content.
 */
final class DiffHtml
{
    /**
     * Render HTML diff output.
     *
     * @param array<string, mixed> $options
     */
    public static function render(
        string $oldText,
        string $newText,
        array $options = [],
        ?float $similarityThreshold = null,
    ): string {
        $isFullReplacement = self::isFullReplacement($oldText, $newText, $similarityThreshold);

        $html = '<div class="text-diff text-diff-html">';

        if ($isFullReplacement) {
            $html .= '<span class="diff-removed">' . $oldText . '</span>';
            $html .= '<span class="diff-added">' . $newText . '</span>';
        } else {
            $html .= self::renderWordDiff($oldText, $newText, $options);
        }

        $html .= '</div>';

        return $html;
    }

    private static function isFullReplacement(string $oldText, string $newText, ?float $similarityThreshold): bool
    {
        if ($similarityThreshold === null) {
            return false;
        }
        if ($oldText === '' || $newText === '') {
            return false;
        }

        $similarity = Similarity::compute($oldText, $newText);

        return $similarity < $similarityThreshold;
    }

    /**
     * Normalize input text: always normalize quotes, optionally strip formatting tags.
     *
     * @param array<string, mixed> $options
     */
    private static function normalizeInput(string $text, array $options): string
    {
        $text = NormalizeHtml::normalizeQuotes($text);

        if ($options['ignoreFormattingTags'] ?? true) {
            $text = NormalizeHtml::stripFormattingTags($text);
        }

        return $text;
    }

    /**
     * Render word-level diff, treating the input as HTML.
     *
     * @param array<string, mixed> $options
     */
    private static function renderWordDiff(string $oldText, string $newText, array $options): string
    {
        $ignoreCase = $options['ignoreCase'] ?? false;

        $normalizedOld = self::normalizeInput($oldText, $options);
        $normalizedNew = self::normalizeInput($newText, $options);

        $oldTokens = Tokenizer::wordsWithSpace($normalizedOld);
        $newTokens = Tokenizer::wordsWithSpace($normalizedNew);

        $changes = Diff::diffTokens($oldTokens, $newTokens, $ignoreCase);
        $changes = self::removeOrphanMatches($changes, $options['orphanMatchThreshold'] ?? 0.3);

        $result = '';
        foreach ($changes as $change) {
            if ($change->added) {
                $result .= '<span class="diff-added">' . $change->value . '</span>';
            } elseif ($change->removed) {
                $result .= '<span class="diff-removed">' . $change->value . '</span>';
            } else {
                $result .= $change->value;
            }
        }

        return $result;
    }

    /**
     * Remove orphan matches from the change list.
     *
     * An orphan match is an unchanged segment (typically whitespace) between
     * removed/added segments, causing garbled word-by-word interleaving.
     * This groups contiguous diff runs (absorbing small orphan unchanged
     * segments), then emits all removed content before all added content.
     *
     * @param Change[] $changes
     * @return Change[]
     */
    private static function removeOrphanMatches(array $changes, float $threshold): array
    {
        if ($threshold <= 0 || count($changes) < 3) {
            return $changes;
        }

        // Collect diff "groups": contiguous runs of changes where unchanged
        // segments between diffs are small enough to be considered orphans.
        $result = [];
        $len = count($changes);
        $i = 0;

        while ($i < $len) {
            $change = $changes[$i];

            // Pass through unchanged segments that aren't between diffs
            if (!$change->added && !$change->removed) {
                // Check if this unchanged segment is an orphan (between diffs)
                if ($i > 0 && $i + 1 < $len && self::isOrphan($changes, $i, $threshold)) {
                    // Start collecting a diff group: backtrack to include
                    // the preceding diff segments already in $result
                    $removedBuf = '';
                    $addedBuf = '';

                    // Pull back preceding diff segments from result
                    while (count($result) > 0) {
                        $last = $result[count($result) - 1];
                        if ($last->added || $last->removed) {
                            array_pop($result);
                            if ($last->removed) {
                                $removedBuf = $last->value . $removedBuf;
                            }
                            if ($last->added) {
                                $addedBuf = $last->value . $addedBuf;
                            }
                        } else {
                            break;
                        }
                    }

                    // Add the orphan unchanged content to both buffers
                    $removedBuf .= $change->value;
                    $addedBuf .= $change->value;
                    $i++;

                    // Continue absorbing diffs and orphan unchanged segments
                    while ($i < $len) {
                        $c = $changes[$i];
                        if ($c->removed) {
                            $removedBuf .= $c->value;
                            $i++;
                        } elseif ($c->added) {
                            $addedBuf .= $c->value;
                            $i++;
                        } elseif (!$c->added && !$c->removed && $i + 1 < $len && self::isOrphan($changes, $i, $threshold)) {
                            // Another orphan — absorb it
                            $removedBuf .= $c->value;
                            $addedBuf .= $c->value;
                            $i++;
                        } else {
                            break;
                        }
                    }

                    // Emit the grouped diff: all removed first, then all added
                    if ($removedBuf !== '') {
                        $result[] = new Change($removedBuf, removed: true);
                    }
                    if ($addedBuf !== '') {
                        $result[] = new Change($addedBuf, added: true);
                    }
                } else {
                    $result[] = $change;
                    $i++;
                }
            } else {
                $result[] = $change;
                $i++;
            }
        }

        return $result;
    }

    /**
     * Check if an unchanged segment at position $i is an orphan.
     *
     * @param Change[] $changes
     */
    private static function isOrphan(array $changes, int $i, float $threshold): bool
    {
        $change = $changes[$i];
        $unchangedLen = mb_strlen(trim($change->value));

        // Look backward for diff
        $hasDiffBefore = $i > 0 && ($changes[$i - 1]->added || $changes[$i - 1]->removed);
        // Look forward for diff
        $hasDiffAfter = ($i + 1 < count($changes)) && ($changes[$i + 1]->added || $changes[$i + 1]->removed);

        if (!$hasDiffBefore || !$hasDiffAfter) {
            return false;
        }

        // Calculate ratio of unchanged content to surrounding diffs
        $surroundingLen = 0;
        for ($b = $i - 1; $b >= 0; $b--) {
            if ($changes[$b]->added || $changes[$b]->removed) {
                $surroundingLen += mb_strlen($changes[$b]->value);
            } else {
                break;
            }
        }
        for ($f = $i + 1; $f < count($changes); $f++) {
            if ($changes[$f]->added || $changes[$f]->removed) {
                $surroundingLen += mb_strlen($changes[$f]->value);
            } else {
                break;
            }
        }

        $ratio = $surroundingLen > 0 ? $unchangedLen / $surroundingLen : 0;

        return $ratio < $threshold;
    }
}
