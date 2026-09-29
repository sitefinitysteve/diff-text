<?php

declare(strict_types=1);

namespace PhpDiffText;

/** Character (code point) diff, equivalent to jsdiff's diffChars. */
final class DiffChars extends AbstractDiff
{
    protected function containerClass(): string
    {
        return 'text-diff-chars';
    }

    protected function tokenize(string $text): array
    {
        return Tokenizer::chars($text);
    }
}
