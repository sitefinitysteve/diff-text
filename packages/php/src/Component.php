<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Mutable change object used while a diff is being post-processed.
 * Converted to the immutable {@see Change} before it leaves the library.
 *
 * @internal
 */
final class Component
{
    public function __construct(
        public string $value,
        public bool $added,
        public bool $removed,
        public int $count,
    ) {}

    public function toChange(): Change
    {
        return new Change($this->value, $this->added, $this->removed, $this->count);
    }
}
