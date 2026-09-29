<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffWords;

final class DiffWordsTest extends TestCase
{
    public function testRendersWithCorrectContainerClass(): void
    {
        $html = DiffWords::render('hello', 'hello');
        $this->assertStringContainsString('text-diff', $html);
        $this->assertStringContainsString('text-diff-words', $html);
    }

    public function testShowsNoDiffSpansForIdenticalText(): void
    {
        $html = DiffWords::render('hello world', 'hello world');
        $this->assertStringNotContainsString('diff-added', $html);
        $this->assertStringNotContainsString('diff-removed', $html);
    }

    public function testHighlightsWordLevelChanges(): void
    {
        $html = DiffWords::render('The quick brown fox', 'The slow brown fox');
        $this->assertStringContainsString('diff-removed', $html);
        $this->assertStringContainsString('diff-added', $html);
        $this->assertStringContainsString('quick', $html);
        $this->assertStringContainsString('slow', $html);
    }

    public function testSupportsIgnoreCaseOption(): void
    {
        $html = DiffWords::render('Hello World', 'hello world', ['ignoreCase' => true]);
        $this->assertStringNotContainsString('diff-added', $html);
        $this->assertStringNotContainsString('diff-removed', $html);
    }
}
