<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Unified line view with old/new line-number gutters and collapsed runs of
 * unchanged lines (SPEC §9, §13.2).
 *
 * Model options: ignoreCase, ignoreWhitespace, stripTrailingCr, contextLines
 * (default 3), detectMoves, minMoveLines, moveSimilarity (SPEC §19).
 * Render options: anchors, idPrefix (SPEC §18), minimap (SPEC §21; implies anchors).
 */
final class DiffUnified
{
    /**
     * @param array<string, mixed> $options
     * @return list<array<string, mixed>>
     */
    public static function hunks(string $oldText, string $newText, array $options = []): array
    {
        return LineModel::buildHunks($oldText, $newText, $options);
    }

    /** @param array<string, mixed> $options */
    public static function render(string $oldText, string $newText, array $options = []): string
    {
        $hunks = self::hunks($oldText, $newText, $options);
        if (Options::isTrue($options, 'minimap')) {
            $options['anchors'] = true;
            return Minimap::wrap(self::renderHunks($hunks, $options), Minimap::render(Minimap::marksLines($hunks), $options));
        }
        return self::renderHunks($hunks, $options);
    }

    /**
     * @param list<array<string, mixed>> $hunks
     * @param array<string, mixed> $options anchors, idPrefix
     */
    public static function renderHunks(array $hunks, array $options = []): string
    {
        return LineViewRenderer::render(
            'text-diff-unified',
            $hunks,
            static fn(array $row, ?int $changeIndex, bool $first): string => self::row($row, $changeIndex, $first, $options),
            static fn(array $row): array => [$row['type'], $row['move'] ?? null],
        );
    }

    /**
     * @internal
     * @param array<string, mixed> $row
     * @param array<string, mixed> $options
     */
    public static function row(array $row, ?int $changeIndex, bool $firstOfMove = false, array $options = []): string
    {
        $type = $row['type'];
        $moved = LineViewRenderer::isMoved($type);
        $attrs = 'class="diff-row diff-row-' . $type . ($moved ? LineViewRenderer::moveClass($row['move']) : '') . '"';
        if ($changeIndex !== null) {
            $attrs .= LineViewRenderer::anchorAttr($options, $changeIndex);
        }
        if ($type === 'added') {
            $attrs .= ' role="group" aria-label="added line ' . $row['newNo'] . '"';
        } elseif ($type === 'removed') {
            $attrs .= ' role="group" aria-label="removed line ' . $row['oldNo'] . '"';
        } elseif ($type === 'moved-from') {
            $attrs .= ' role="group" aria-label="' . LineViewRenderer::moveLabel($type, $row['oldNo'], $row['counterpart']) . '"';
        } elseif ($type === 'moved-to') {
            $attrs .= ' role="group" aria-label="' . LineViewRenderer::moveLabel($type, $row['newNo'], $row['counterpart']) . '"';
        }
        if ($moved) {
            $attrs .= ' data-move="' . $row['move'] . '"';
        }
        if ($changeIndex !== null) {
            $attrs .= ' data-change-index="' . $changeIndex . '"';
        }
        $link = $moved
            ? LineViewRenderer::moveLink($type, $row['move'], $row['counterpart'], $firstOfMove, Options::idPrefix($options))
            : '';

        return '<div ' . $attrs . '>'
            . '<span class="diff-gutter diff-gutter-old">' . ($row['oldNo'] ?? '') . '</span>'
            . '<span class="diff-gutter diff-gutter-new">' . ($row['newNo'] ?? '') . '</span>'
            . LineViewRenderer::sign($type)
            . '<span class="diff-line">' . Html::escape($row['text']) . '</span>'
            . $link
            . '</div>';
    }
}
