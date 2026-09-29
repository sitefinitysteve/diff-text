<?php

declare(strict_types=1);

namespace PhpDiffText;

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
}
