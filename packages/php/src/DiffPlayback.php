<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Animated playback (SPEC §23): the text-mode view with a CSS animation delay
 * per change and a CSS-only "Replay" toggle. No JavaScript.
 *
 * Options: mode (text mode, default "words"), the mode's diff options,
 * speed (milliseconds between changes; floored, ignored unless >= 1),
 * idPrefix (default "td"), anchors.
 */
final class DiffPlayback
{
    /**
     * speed → integer milliseconds, or null when absent/invalid (not a finite
     * number, or < 1 after flooring).
     */
    public static function step(mixed $speed): ?int
    {
        if (!is_int($speed) && !is_float($speed)) {
            return null;
        }
        if (is_float($speed) && !is_finite($speed)) {
            return null;
        }
        $ms = Options::floorInt($speed);
        return $ms >= 1 ? $ms : null;
    }

    /** @param array<string, mixed> $options */
    public static function render(string $oldText, string $newText, array $options = []): string
    {
        $mode = $options['mode'] ?? 'words';
        $changes = TextMode::diff($mode, $oldText, $newText, $options);

        return self::renderChanges($mode, $changes, $options);
    }

    /**
     * @param Change[] $changes
     * @param array<string, mixed> $options speed, idPrefix, anchors
     */
    public static function renderChanges(string $mode, array $changes, array $options = []): string
    {
        TextMode::diffClass($mode);
        $p = Html::escape(Options::idPrefix($options));
        $step = self::step($options['speed'] ?? null);
        $style = $step === null ? '' : ' style="--text-diff-playback-step:' . $step . 'ms"';

        return '<div class="text-diff-playback-wrap">'
            . '<input class="diff-replay-input" type="checkbox" id="' . $p . '-replay">'
            . '<label class="diff-replay" for="' . $p . '-replay">Replay</label>'
            . '<div class="text-diff ' . TextMode::CONTAINER_CLASSES[$mode] . ' text-diff-playback"' . $style . '>'
            . AbstractDiff::renderSpans($changes, $options, static fn(int $i): string => ' style="--td-i:' . $i . '"')
            . '</div></div>';
    }
}
