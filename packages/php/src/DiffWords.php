<?php

declare(strict_types=1);

namespace PhpDiffText;

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
}
