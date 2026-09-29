<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * One run of the diff result, mirroring jsdiff's change objects.
 *
 * `count` is the number of tokens (characters, words, lines, …) the run spans.
 */
final class Change
{
    public function __construct(
        public readonly string $value,
        public readonly bool $added = false,
        public readonly bool $removed = false,
        public readonly int $count = 0,
    ) {}
}
