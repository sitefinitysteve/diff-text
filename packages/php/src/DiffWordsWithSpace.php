<?php

declare(strict_types=1);

namespace PhpDiffText;

final class DiffWordsWithSpace extends AbstractDiff
{
    protected function containerClass(): string
    {
        return 'text-diff-words-with-space';
    }

    protected function tokenize(string $text): array
    {
        return Tokenizer::wordsWithSpace($text);
    }
}
