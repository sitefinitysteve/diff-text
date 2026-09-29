<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffLines;

final class DiffLinesTest extends TestCase
{
    public function testRendersWithCorrectContainerClass(): void
    {
        $html = DiffLines::render('hello', 'hello');
        $this->assertStringContainsString('text-diff', $html);
        $this->assertStringContainsString('text-diff-lines', $html);
    }

    public function testShowsNoDiffForIdenticalText(): void
    {
        $html = DiffLines::render("line one\nline two", "line one\nline two");
        $this->assertStringNotContainsString('diff-added', $html);
        $this->assertStringNotContainsString('diff-removed', $html);
    }

    public function testHighlightsEntireChangedLines(): void
    {
        $html = DiffLines::render(
            "line one\nline two\nline three",
            "line one\nline modified\nline three"
        );
        $this->assertStringContainsString('diff-removed', $html);
        $this->assertStringContainsString('diff-added', $html);
        $this->assertStringContainsString('line two', $html);
        $this->assertStringContainsString('line modified', $html);
    }

    public function testDetectsAddedLines(): void
    {
        $html = DiffLines::render(
            "line one\nline two",
            "line one\nline two\nline three"
        );
        $this->assertStringContainsString('diff-added', $html);
    }
}
