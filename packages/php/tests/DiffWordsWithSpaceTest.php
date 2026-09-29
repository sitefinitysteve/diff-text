<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffWordsWithSpace;

final class DiffWordsWithSpaceTest extends TestCase
{
    public function testRendersWithCorrectContainerClass(): void
    {
        $html = DiffWordsWithSpace::render('hello', 'hello');
        $this->assertStringContainsString('text-diff', $html);
        $this->assertStringContainsString('text-diff-words-with-space', $html);
    }

    public function testShowsNoDiffForIdenticalText(): void
    {
        $html = DiffWordsWithSpace::render('hello world', 'hello world');
        $this->assertStringNotContainsString('diff-added', $html);
        $this->assertStringNotContainsString('diff-removed', $html);
    }

    public function testDetectsWhitespaceDifferences(): void
    {
        $html = DiffWordsWithSpace::render('hello    world', 'hello world');
        $this->assertStringContainsString('diff-removed', $html);
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testHandlesBothTextsEmpty(): void
    {
        $html = DiffWordsWithSpace::render('', '');
        $this->assertStringNotContainsString('diff-added', $html);
        $this->assertStringNotContainsString('diff-removed', $html);
    }
}
