<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffChars;

final class DiffCharsTest extends TestCase
{
    public function testRendersWithCorrectContainerClass(): void
    {
        $html = DiffChars::render('hello', 'hello');
        $this->assertStringContainsString('text-diff', $html);
        $this->assertStringContainsString('text-diff-chars', $html);
    }

    public function testShowsNoDiffSpansForIdenticalText(): void
    {
        $html = DiffChars::render('hello', 'hello');
        $this->assertStringNotContainsString('diff-added', $html);
        $this->assertStringNotContainsString('diff-removed', $html);
        $this->assertStringContainsString('hello', $html);
    }

    public function testHighlightsSingleCharacterChanges(): void
    {
        $html = DiffChars::render('cat', 'car');
        $this->assertStringContainsString('diff-removed', $html);
        $this->assertStringContainsString('diff-added', $html);
        $this->assertStringContainsString('ca', $html);
    }

    public function testHandlesEmptyOldText(): void
    {
        $html = DiffChars::render('', 'new text');
        $this->assertSame(1, substr_count($html, 'diff-added'));
        $this->assertStringContainsString('new text', $html);
    }

    public function testHandlesEmptyNewText(): void
    {
        $html = DiffChars::render('old text', '');
        $this->assertSame(1, substr_count($html, 'diff-removed'));
        $this->assertStringContainsString('old text', $html);
    }
}
