<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Revision timeline (SPEC §22): diffs of each consecutive pair of versions,
 * rendered as a CSS-only step switcher (radio inputs + labels + panels).
 *
 * Options: mode (a text mode, "unified" or "split"; anything else → "words"),
 * labels (labels[i] when it is a string, else "v{i+1}"), the mode's diff or
 * line options, idPrefix (default "td"), anchors.
 *
 * The model is ['mode' => string, 'labels' => list<string>, 'steps' => list<step>],
 * step = ['step', 'fromLabel', 'toLabel', 'stats', 'similarity', 'changes' | 'hunks'].
 */
final class DiffTimeline
{
    /** Arrow between version labels (U+2192). */
    public const ARROW = "\u{2192}";

    public static function mode(mixed $mode): string
    {
        if ($mode === 'unified' || $mode === 'split' || TextMode::isTextMode($mode)) {
            return $mode;
        }
        return 'words';
    }

    /**
     * @param list<string> $versions
     * @param array<string, mixed> $options
     * @return array{mode:string, labels:list<string>, steps:list<array<string, mixed>>}
     */
    public static function build(array $versions, array $options = []): array
    {
        $versions = array_values($versions);
        $mode = self::mode($options['mode'] ?? null);
        $given = is_array($options['labels'] ?? null) ? $options['labels'] : [];
        $labels = [];
        foreach ($versions as $i => $_) {
            $l = $given[$i] ?? null;
            $labels[] = is_string($l) ? $l : 'v' . ($i + 1);
        }
        $steps = [];
        for ($k = 1, $n = count($versions); $k < $n; $k++) {
            $a = (string) $versions[$k - 1];
            $b = (string) $versions[$k];
            $step = [
                'step' => $k,
                'fromLabel' => $labels[$k - 1],
                'toLabel' => $labels[$k],
                'stats' => [],
                'similarity' => Similarity::compute($a, $b, false),
            ];
            if ($mode === 'unified' || $mode === 'split') {
                $hunks = $mode === 'unified' ? LineModel::buildHunks($a, $b, $options) : LineModel::buildSplitRows($a, $b, $options);
                $step['stats'] = DiffStats::fromHunks($hunks);
                $step['hunks'] = $hunks;
            } else {
                $changes = TextMode::diff($mode, $a, $b, $options);
                $step['stats'] = DiffStats::fromChanges($changes);
                $step['changes'] = $changes;
            }
            $steps[] = $step;
        }
        return ['mode' => $mode, 'labels' => $labels, 'steps' => $steps];
    }

    /**
     * @param list<string> $versions
     * @param array<string, mixed> $options
     */
    public static function render(array $versions, array $options = []): string
    {
        return self::renderTimeline(self::build($versions, $options), $options);
    }

    /**
     * Per step an <input type="radio">, its <label> and its panel; the last
     * step is checked. Each panel's diff uses the id prefix "{idPrefix}-rev-K".
     *
     * @param array{mode:string, labels:list<string>, steps:list<array<string, mixed>>} $timeline
     * @param array<string, mixed> $options idPrefix, anchors
     */
    public static function renderTimeline(array $timeline, array $options = []): string
    {
        $raw = Options::idPrefix($options);
        $p = Html::escape($raw);
        $out = '<div class="text-diff-timeline" role="group" aria-label="Revision timeline">';
        if ($timeline['steps'] === []) {
            return $out . '<div class="diff-empty">Nothing to compare</div></div>';
        }
        $last = count($timeline['steps']);
        foreach ($timeline['steps'] as $step) {
            $k = $step['step'];
            $caption = Html::escape($step['fromLabel']) . ' ' . self::ARROW . ' ' . Html::escape($step['toLabel']);
            $inner = ['idPrefix' => $raw . '-rev-' . $k, 'anchors' => Options::isTrue($options, 'anchors')];
            $out .= '<input class="diff-rev-input" type="radio" name="' . $p . '-rev" id="' . $p . '-rev-' . $k . '"' . ($k === $last ? ' checked' : '') . '>'
                . '<label class="diff-rev-label" for="' . $p . '-rev-' . $k . '">' . $caption . '</label>'
                . '<div class="diff-rev-panel" role="group" aria-label="' . $caption . '">'
                . '<div class="diff-rev-caption">' . $caption . '</div>'
                . DiffStats::renderStats($step['stats'], $step['similarity'])
                . self::stepDiff($timeline['mode'], $step, $inner)
                . '</div>';
        }
        return $out . '</div>';
    }

    /**
     * @param array<string, mixed> $step
     * @param array<string, mixed> $inner
     */
    private static function stepDiff(string $mode, array $step, array $inner): string
    {
        if ($mode === 'unified') {
            return DiffUnified::renderHunks($step['hunks'], $inner);
        }
        if ($mode === 'split') {
            return DiffSplit::renderHunks($step['hunks'], $inner);
        }
        return TextMode::render($mode, $step['changes'] ?? [], $inner);
    }
}
