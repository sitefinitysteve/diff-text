<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Word diff, equivalent to jsdiff v8's diffWords.
 *
 * Tokens carry their surrounding whitespace and compare with that whitespace
 * trimmed, so changes in spacing alone are not reported. After diffing, the
 * whitespace duplicated between adjacent change objects is tidied up exactly
 * as jsdiff does, so rendering the changes in order reproduces the text.
 *
 * Passing ['ignoreWhitespace' => false] switches to {@see DiffWordsWithSpace},
 * matching jsdiff's (undocumented) behaviour.
 */
final class DiffWords extends AbstractDiff
{
    protected function containerClass(): string
    {
        return 'text-diff-words';
    }

    protected function tokenize(string $text): array
    {
        return Tokenizer::words($text);
    }

    public static function diff(string $oldText, string $newText, array $options = []): array
    {
        if (array_key_exists('ignoreWhitespace', $options) && $options['ignoreWhitespace'] !== null && !$options['ignoreWhitespace']) {
            return DiffWordsWithSpace::diff($oldText, $newText, $options);
        }
        return parent::diff($oldText, $newText, $options);
    }

    protected function equalityKey(string $token, array $options): string
    {
        if (Options::flag($options, 'ignoreCase')) {
            $token = Str::lower($token);
        }
        return Str::trim($token);
    }

    protected function join(array $tokens): string
    {
        $out = '';
        foreach ($tokens as $i => $token) {
            if ($i === 0) {
                $out .= $token;
            } else {
                $out .= preg_replace('/^[' . Str::WS . ']+/u', '', $token) ?? $token;
            }
        }
        return $out;
    }

    protected function postProcess(array $components, array $options): array
    {
        $lastKeep = null;
        $insertion = null;
        $deletion = null;
        foreach ($components as $change) {
            if ($change->added) {
                $insertion = $change;
            } elseif ($change->removed) {
                $deletion = $change;
            } else {
                if ($insertion !== null || $deletion !== null) {
                    self::dedupeWhitespace($lastKeep, $deletion, $insertion, $change);
                }
                $lastKeep = $change;
                $insertion = null;
                $deletion = null;
            }
        }
        if ($insertion !== null || $deletion !== null) {
            self::dedupeWhitespace($lastKeep, $deletion, $insertion, null);
        }
        return $components;
    }

    /** Port of jsdiff's dedupeWhitespaceInChangeObjects(). */
    private static function dedupeWhitespace(?Component $startKeep, ?Component $deletion, ?Component $insertion, ?Component $endKeep): void
    {
        if ($deletion !== null && $insertion !== null) {
            $oldWsPrefix = Str::leadingWs($deletion->value);
            $oldWsSuffix = Str::trailingWs($deletion->value);
            $newWsPrefix = Str::leadingWs($insertion->value);
            $newWsSuffix = Str::trailingWs($insertion->value);

            if ($startKeep !== null) {
                $commonWsPrefix = Str::longestCommonPrefix($oldWsPrefix, $newWsPrefix);
                $startKeep->value = Str::replaceSuffix($startKeep->value, $newWsPrefix, $commonWsPrefix);
                $deletion->value = Str::removePrefix($deletion->value, $commonWsPrefix);
                $insertion->value = Str::removePrefix($insertion->value, $commonWsPrefix);
            }
            if ($endKeep !== null) {
                $commonWsSuffix = Str::longestCommonSuffix($oldWsSuffix, $newWsSuffix);
                $endKeep->value = Str::replacePrefix($endKeep->value, $newWsSuffix, $commonWsSuffix);
                $deletion->value = Str::removeSuffix($deletion->value, $commonWsSuffix);
                $insertion->value = Str::removeSuffix($insertion->value, $commonWsSuffix);
            }
        } elseif ($insertion !== null) {
            if ($startKeep !== null) {
                $ws = Str::leadingWs($insertion->value);
                $insertion->value = substr($insertion->value, strlen($ws));
            }
            if ($endKeep !== null) {
                $ws = Str::leadingWs($endKeep->value);
                $endKeep->value = substr($endKeep->value, strlen($ws));
            }
        } elseif ($startKeep !== null && $endKeep !== null && $deletion !== null) {
            $newWsFull = Str::leadingWs($endKeep->value);
            $delWsStart = Str::leadingWs($deletion->value);
            $delWsEnd = Str::trailingWs($deletion->value);

            $newWsStart = Str::longestCommonPrefix($newWsFull, $delWsStart);
            $deletion->value = Str::removePrefix($deletion->value, $newWsStart);

            $newWsEnd = Str::longestCommonSuffix(Str::removePrefix($newWsFull, $newWsStart), $delWsEnd);
            $deletion->value = Str::removeSuffix($deletion->value, $newWsEnd);
            $endKeep->value = Str::replacePrefix($endKeep->value, $newWsFull, $newWsEnd);

            $startKeep->value = Str::replaceSuffix(
                $startKeep->value,
                $newWsFull,
                substr($newWsFull, 0, strlen($newWsFull) - strlen($newWsEnd)),
            );
        } elseif ($endKeep !== null && $deletion !== null) {
            $endKeepWsPrefix = Str::leadingWs($endKeep->value);
            $deletionWsSuffix = Str::trailingWs($deletion->value);
            $overlap = Str::maximumOverlap($deletionWsSuffix, $endKeepWsPrefix);
            $deletion->value = Str::removeSuffix($deletion->value, $overlap);
        } elseif ($startKeep !== null && $deletion !== null) {
            $startKeepWsSuffix = Str::trailingWs($startKeep->value);
            $deletionWsPrefix = Str::leadingWs($deletion->value);
            $overlap = Str::maximumOverlap($startKeepWsSuffix, $deletionWsPrefix);
            $deletion->value = Str::removePrefix($deletion->value, $overlap);
        }
    }
}
