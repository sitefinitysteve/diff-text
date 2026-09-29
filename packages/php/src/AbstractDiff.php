<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Base class for all text diff renderers.
 *
 * The pipeline mirrors jsdiff's `Diff` base class: tokenize both inputs,
 * drop empty tokens, run the diff, build values from the token slices, then
 * let the mode post-process the change objects.
 *
 * Supported options (all modes, SPEC §3):
 *  - ignoreCase (bool)       compare tokens case-insensitively
 *  - maxEditLength (int)     past this edit distance, return a whole replacement
 *                            (removed old, then added new)
 */
abstract class AbstractDiff
{
    /** CSS class for the container div. */
    abstract protected function containerClass(): string;

    /** Tokenize text into comparable units. */
    abstract protected function tokenize(string $text): array;

    /**
     * Tokenize with access to the options. Defaults to {@see tokenize()}.
     *
     * @param array<string, mixed> $options
     * @return list<string>
     */
    protected function tokenizeWithOptions(string $text, array $options): array
    {
        return $this->tokenize($text);
    }

    /**
     * Two tokens are equal when their keys are identical (jsdiff's equals()).
     *
     * @param array<string, mixed> $options
     */
    protected function equalityKey(string $token, array $options): string
    {
        return Options::flag($options, 'ignoreCase') ? Str::lower($token) : $token;
    }

    /** Join consecutive tokens back into text (jsdiff's join()). */
    protected function join(array $tokens): string
    {
        return implode('', $tokens);
    }

    /**
     * Adjust change objects after the diff (jsdiff's postProcess()).
     *
     * @param list<Component> $components
     * @param array<string, mixed> $options
     * @return list<Component>
     */
    protected function postProcess(array $components, array $options): array
    {
        return $components;
    }

    /**
     * Compute the diff and return Change[] array. Invalid UTF-8 in either input is
     * replaced with U+FFFD first (one per maximal ill-formed subpart, see Str::utf8()).
     *
     * @param array<string, mixed> $options
     * @return Change[]
     */
    public static function diff(string $oldText, string $newText, array $options = []): array
    {
        // SPEC §1: invalid UTF-8 becomes U+FFFD in every mode, before tokenizing.
        $oldText = Str::utf8($oldText);
        $newText = Str::utf8($newText);
        $instance = new static();
        $oldTokens = array_values(array_filter(
            $instance->tokenizeWithOptions($oldText, $options),
            static fn($t): bool => $t !== '' && $t !== null,
        ));
        $newTokens = array_values(array_filter(
            $instance->tokenizeWithOptions($newText, $options),
            static fn($t): bool => $t !== '' && $t !== null,
        ));

        $components = Diff::components(
            $oldTokens,
            $newTokens,
            fn(string $t): string => $instance->equalityKey($t, $options),
            fn(array $tokens): string => $instance->join($tokens),
            $options,
        );
        $components = $instance->postProcess($components, $options);

        return array_map(static fn(Component $c): Change => $c->toChange(), self::compact($components));
    }

    /**
     * SPEC §7.2: drop empty values and merge neighbours of the same kind.
     *
     * @param list<Component> $components
     * @return list<Component>
     */
    private static function compact(array $components): array
    {
        $out = [];
        foreach ($components as $c) {
            if ($c->value === '') {
                continue;
            }
            $last = count($out) - 1;
            if ($last >= 0 && $out[$last]->added === $c->added && $out[$last]->removed === $c->removed) {
                $out[$last] = new Component($out[$last]->value . $c->value, $c->added, $c->removed, $out[$last]->count + $c->count);
            } else {
                $out[] = $c;
            }
        }
        return $out;
    }

    /**
     * Render the diff as an HTML string (SPEC §13.1).
     *
     * Render options (SPEC §18, §21):
     *  - anchors (bool, default false)  id="{idPrefix}-change-N" on every changed span
     *  - idPrefix (string, default "td")
     *  - minimap (bool, default false)  wrap the view with a change minimap
     *                                   (renderWithMinimap); implies anchors
     *
     * @param array<string, mixed> $options
     */
    public static function render(string $oldText, string $newText, array $options = []): string
    {
        $instance = new static();
        $changes = static::diff($oldText, $newText, $options);
        if (Options::isTrue($options, 'minimap')) {
            $options['anchors'] = true;
            return Minimap::wrap(
                self::renderChanges($changes, $instance->containerClass(), $options),
                Minimap::render(Minimap::marksText($changes), $options),
            );
        }

        return self::renderChanges($changes, $instance->containerClass(), $options);
    }

    /**
     * @param Change[] $changes
     * @param array<string, mixed> $options idPrefix, anchors
     */
    public static function renderChanges(array $changes, string $containerClass, array $options = []): string
    {
        return '<div class="text-diff ' . $containerClass . '">' . self::renderSpans($changes, $options) . '</div>';
    }

    /**
     * The spans of a text-mode view. `$extra(index)` returns attributes
     * appended after data-change-index on changed spans (used by playback).
     *
     * @internal
     * @param Change[] $changes
     * @param array<string, mixed> $options
     * @param (callable(int): string)|null $extra
     */
    public static function renderSpans(array $changes, array $options = [], ?callable $extra = null): string
    {
        $anchors = Options::isTrue($options, 'anchors');
        $prefix = $anchors ? Html::escape(Options::idPrefix($options)) : '';
        $html = '';
        $index = 0;
        foreach ($changes as $change) {
            if ($change->value === '') {
                continue;
            }
            $escaped = Html::escape($change->value);
            if ($change->added || $change->removed) {
                $html .= '<span class="' . ($change->added ? 'diff-added' : 'diff-removed') . '"'
                    . ($anchors ? ' id="' . $prefix . '-change-' . $index . '"' : '')
                    . ' data-change-index="' . $index . '"'
                    . ($extra !== null ? $extra($index) : '')
                    . '>' . $escaped . '</span>';
                $index++;
            } else {
                $html .= '<span>' . $escaped . '</span>';
            }
        }

        return $html;
    }
}
