<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Line diff, equivalent to jsdiff's diffLines.
 *
 * Options: ignoreCase, ignoreWhitespace, newlineIsToken, stripTrailingCr, maxEditLength.
 */
final class DiffLines extends AbstractDiff
{
    protected function containerClass(): string
    {
        return 'text-diff-lines';
    }

    protected function tokenize(string $text): array
    {
        return Tokenizer::lines($text);
    }

    protected function tokenizeWithOptions(string $text, array $options): array
    {
        return Tokenizer::lines($text, $options);
    }

    protected function equalityKey(string $token, array $options): string
    {
        if (Options::flag($options, 'ignoreWhitespace')) {
            if (!Options::flag($options, 'newlineIsToken') || !str_contains($token, "\n")) {
                $token = Str::trim($token);
            }
        }
        return parent::equalityKey($token, $options);
    }
}
