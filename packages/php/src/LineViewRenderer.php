<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Shared markup for the unified and split views (SPEC §13.2–13.3).
 *
 * @internal
 */
final class LineViewRenderer
{
    public const EMPTY_STATE = '<div class="diff-empty">No changes</div>';

    public static function collapsedRow(int $count): string
    {
        $label = $count === 1 ? '1 unchanged line' : $count . ' unchanged lines';

        return '<div class="diff-row diff-row-collapsed">' . $label . '</div>';
    }

    public static function sign(string $type): string
    {
        $s = $type === 'added' || $type === 'moved-to' ? '+' : ($type === 'removed' || $type === 'moved-from' ? "\u{2212}" : ' ');

        return '<span class="diff-sign" aria-hidden="true">' . $s . '</span>';
    }

    public static function isMoved(string $type): bool
    {
        return $type === 'moved-from' || $type === 'moved-to';
    }

    /** "line 4 moved to line 9" / "line 9 moved from line 4". */
    public static function moveLabel(string $type, int $lineNo, int $counterpart): string
    {
        return $type === 'moved-from'
            ? 'line ' . $lineNo . ' moved to line ' . $counterpart
            : 'line ' . $lineNo . ' moved from line ' . $counterpart;
    }

    /** ` diff-move-{M mod 6}`. */
    public static function moveClass(int $move): string
    {
        return ' diff-move-' . ($move % Moves::COLORS);
    }

    /**
     * The counterpart link of a moved row; only the first row of a block
     * carries the block's id (SPEC §19.3). $prefix is the raw id prefix.
     */
    public static function moveLink(string $type, int $move, int $counterpart, bool $first, string $prefix): string
    {
        $p = Html::escape($prefix);
        $self = $type === 'moved-from' ? 'from' : 'to';
        $other = $type === 'moved-from' ? 'to' : 'from';
        $id = $first ? ' id="' . $p . '-move-' . $move . '-' . $self . '"' : '';

        return '<a class="diff-move-link"' . $id . ' href="#' . $p . '-move-' . $move . '-' . $other . '">moved ' . $other . ' line ' . $counterpart . '</a>';
    }

    /**
     * ` id="{prefix}-change-{index}"` when anchors are on, else "".
     *
     * @param array<string, mixed> $options
     */
    public static function anchorAttr(array $options, int $index): string
    {
        if (!Options::isTrue($options, 'anchors')) {
            return '';
        }
        return ' id="' . Html::escape(Options::idPrefix($options)) . '-change-' . $index . '"';
    }

    /** @param list<array<string, mixed>> $hunks */
    public static function hasChanges(array $hunks): bool
    {
        foreach ($hunks as $h) {
            if ($h['type'] !== 'hunk') {
                continue;
            }
            foreach ($h['rows'] as $row) {
                if ($row['type'] !== 'equal') {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Render hunks with a row renderer; data-change-index goes on the first
     * row of each contiguous run of changed rows. $moveOf returns a row's
     * [type, move id or null]; a moved row starts a block ($first) unless the
     * previous rendered row in the same hunk has the same type and move id.
     *
     * @param list<array<string, mixed>> $hunks
     * @param callable(array<string, mixed>, ?int, bool): string $renderRow
     * @param callable(array<string, mixed>): array{0:string, 1:?int} $moveOf
     */
    public static function render(string $containerClass, array $hunks, callable $renderRow, callable $moveOf): string
    {
        $out = '<div class="text-diff ' . $containerClass . '">';
        if (!self::hasChanges($hunks)) {
            return $out . self::EMPTY_STATE . '</div>';
        }
        $index = 0;
        $inRun = false;
        $prev = null;
        foreach ($hunks as $h) {
            if ($h['type'] === 'collapsed') {
                $out .= self::collapsedRow($h['count']);
                $inRun = false;
                $prev = null;
                continue;
            }
            foreach ($h['rows'] as $row) {
                $cur = $moveOf($row);
                $first = self::isMoved($cur[0]) && !($prev !== null && $prev[0] === $cur[0] && $prev[1] === $cur[1]);
                if ($row['type'] === 'equal') {
                    $inRun = false;
                    $out .= $renderRow($row, null, false);
                } else {
                    $out .= $renderRow($row, $inRun ? null : $index++, $first);
                    $inRun = true;
                }
                $prev = $cur;
            }
        }
        return $out . '</div>';
    }
}
