<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Side-by-side line view with intra-line word highlighting on paired rows
 * (SPEC §10, §13.3).
 *
 * Model options: ignoreCase, ignoreWhitespace, stripTrailingCr, contextLines
 * (default 3), detectMoves, minMoveLines, moveSimilarity (SPEC §19).
 * Render options: anchors, idPrefix (SPEC §18), minimap (SPEC §21; implies anchors).
 */
final class DiffSplit
{
    /**
     * @param array<string, mixed> $options
     * @return list<array<string, mixed>>
     */
    public static function hunks(string $oldText, string $newText, array $options = []): array
    {
        return LineModel::buildSplitRows($oldText, $newText, $options);
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
            'text-diff-split',
            $hunks,
            static fn(array $row, ?int $changeIndex, bool $first): string => self::row($row, $changeIndex, $first, $options),
            static fn(array $row): array => [$row['type'], self::moveOf($row)],
        );
    }

    /** @param array<string, mixed> $row */
    private static function moveOf(array $row): ?int
    {
        return match ($row['type']) {
            'moved-from' => $row['left']['move'],
            'moved-to' => $row['right']['move'],
            default => null,
        };
    }

    /**
     * @internal
     * @param array<string, mixed> $row
     * @param array<string, mixed> $options
     */
    public static function row(array $row, ?int $changeIndex, bool $firstOfMove = false, array $options = []): string
    {
        $move = self::moveOf($row);
        $attrs = 'class="diff-row diff-row-' . $row['type'] . ($move !== null ? LineViewRenderer::moveClass($move) : '') . '"';
        if ($changeIndex !== null) {
            $attrs .= LineViewRenderer::anchorAttr($options, $changeIndex);
        }
        if ($move !== null) {
            $attrs .= ' data-move="' . $move . '"';
        }
        if ($changeIndex !== null) {
            $attrs .= ' data-change-index="' . $changeIndex . '"';
        }

        return '<div ' . $attrs . '>'
            . self::cell('old', $row['left'] ?? null, $firstOfMove, $options)
            . self::cell('new', $row['right'] ?? null, $firstOfMove, $options)
            . '</div>';
    }

    /**
     * @param array<string, mixed>|null $cell
     * @param array<string, mixed> $options
     */
    private static function cell(string $side, ?array $cell, bool $firstOfMove, array $options): string
    {
        if ($cell === null) {
            return '<div class="diff-cell diff-cell-' . $side . ' diff-cell-empty"></div>';
        }
        $type = $cell['type'];
        $moved = LineViewRenderer::isMoved($type);
        $attrs = 'class="diff-cell diff-cell-' . $side;
        if ($moved) {
            $attrs .= ' diff-cell-' . $type . '" role="group" aria-label="' . LineViewRenderer::moveLabel($type, $cell['lineNo'], $cell['counterpart']) . '"';
        } elseif ($type !== 'equal') {
            $attrs .= ' diff-cell-' . $type . '" role="group" aria-label="' . $type . ' line ' . $cell['lineNo'] . '"';
        } else {
            $attrs .= '"';
        }
        $body = isset($cell['parts']) ? self::parts($cell['parts']) : Html::escape($cell['text']);
        $link = $moved
            ? LineViewRenderer::moveLink($type, $cell['move'], $cell['counterpart'], $firstOfMove, Options::idPrefix($options))
            : '';

        return '<div ' . $attrs . '>'
            . '<span class="diff-gutter">' . $cell['lineNo'] . '</span>'
            . LineViewRenderer::sign($type)
            . '<span class="diff-line">' . $body . '</span>'
            . $link
            . '</div>';
    }

    /** @param list<array{value:string, added:bool, removed:bool}> $parts */
    private static function parts(array $parts): string
    {
        $out = '';
        foreach ($parts as $p) {
            if ($p['value'] === '') {
                continue;
            }
            $text = Html::escape($p['value']);
            if ($p['added']) {
                $out .= '<span class="diff-added">' . $text . '</span>';
            } elseif ($p['removed']) {
                $out .= '<span class="diff-removed">' . $text . '</span>';
            } else {
                $out .= '<span>' . $text . '</span>';
            }
        }
        return $out;
    }
}
