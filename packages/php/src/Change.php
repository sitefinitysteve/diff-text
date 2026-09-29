<?php

declare(strict_types=1);

namespace PhpDiffText;

final class Change
{
    public function __construct(
        public readonly string $value,
        public readonly bool $added = false,
        public readonly bool $removed = false,
    ) {}
}
