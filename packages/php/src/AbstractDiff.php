<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Base class for all text diff renderers.
 */
abstract class AbstractDiff
{
    /** CSS class for the container div. */
    abstract protected function containerClass(): string;

    /** Tokenize text into comparable units. */
    abstract protected function tokenize(string $text): array;

    /**
     * Compute the diff and return Change[] array.
     *
     * @param array<string, mixed> $options
     * @return Change[]
     */
    public static function diff(string $oldText, string $newText, array $options = []): array
    {
        $instance = new static();
        $ignoreCase = $options['ignoreCase'] ?? false;
        $oldTokens = $instance->tokenize($oldText);
        $newTokens = $instance->tokenize($newText);

        return Diff::diffTokens($oldTokens, $newTokens, $ignoreCase);
    }

    /**
     * Render the diff as an HTML string.
     *
     * @param array<string, mixed> $options
     */
    public static function render(string $oldText, string $newText, array $options = []): string
    {
        $instance = new static();
        $changes = static::diff($oldText, $newText, $options);

        $html = '<div class="text-diff ' . $instance->containerClass() . '">';
        foreach ($changes as $change) {
            $escaped = htmlspecialchars($change->value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            if ($change->added) {
                $html .= '<span class="diff-added">' . $escaped . '</span>';
            } elseif ($change->removed) {
                $html .= '<span class="diff-removed">' . $escaped . '</span>';
            } else {
                $html .= '<span>' . $escaped . '</span>';
            }
        }
        $html .= '</div>';

        return $html;
    }
}
