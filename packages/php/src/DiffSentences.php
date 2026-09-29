<?php

declare(strict_types=1);

namespace PhpDiffText;

/** Sentence diff, equivalent to jsdiff's diffSentences. */
final class DiffSentences extends AbstractDiff
{
    protected function containerClass(): string
    {
        return 'text-diff-sentences';
    }

    protected function tokenize(string $text): array
    {
        return Tokenizer::sentences($text);
    }
}
