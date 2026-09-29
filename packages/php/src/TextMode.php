<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * The five text modes (SPEC §3, §13.1): mode name → diff class and container class.
 *
 * @internal
 */
final class TextMode
{
    /** @var array<string, class-string<AbstractDiff>> */
    public const CLASSES = [
        'chars' => DiffChars::class,
        'words' => DiffWords::class,
        'wordsWithSpace' => DiffWordsWithSpace::class,
        'lines' => DiffLines::class,
        'sentences' => DiffSentences::class,
    ];

    public const CONTAINER_CLASSES = [
        'chars' => 'text-diff-chars',
        'words' => 'text-diff-words',
        'wordsWithSpace' => 'text-diff-words-with-space',
        'lines' => 'text-diff-lines',
        'sentences' => 'text-diff-sentences',
    ];

    public static function isTextMode(mixed $mode): bool
    {
        return is_string($mode) && isset(self::CLASSES[$mode]);
    }

    /**
     * @return class-string<AbstractDiff>
     * @throws \InvalidArgumentException for an unknown mode
     */
    public static function diffClass(mixed $mode): string
    {
        if (!self::isTextMode($mode)) {
            throw new \InvalidArgumentException('Unknown text mode: ' . (is_scalar($mode) ? (string) $mode : get_debug_type($mode)));
        }
        return self::CLASSES[$mode];
    }

    /**
     * @param array<string, mixed> $options
     * @return Change[]
     */
    public static function diff(string $mode, string $oldText, string $newText, array $options = []): array
    {
        return self::diffClass($mode)::diff($oldText, $newText, $options);
    }

    /**
     * Text-mode markup (SPEC §13.1) for an existing change list.
     *
     * @param Change[] $changes
     * @param array<string, mixed> $options idPrefix, anchors
     */
    public static function render(string $mode, array $changes, array $options = []): string
    {
        self::diffClass($mode);
        return AbstractDiff::renderChanges($changes, self::CONTAINER_CLASSES[$mode], $options);
    }
}
