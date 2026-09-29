<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffSentences;

final class DiffSentencesTest extends TestCase
{
    public function testRendersWithCorrectContainerClass(): void
    {
        $html = DiffSentences::render('Hello.', 'Hello.');
        $this->assertStringContainsString('text-diff', $html);
        $this->assertStringContainsString('text-diff-sentences', $html);
    }

    public function testShowsNoDiffForIdenticalText(): void
    {
        $html = DiffSentences::render(
            'First sentence. Second sentence.',
            'First sentence. Second sentence.'
        );
        $this->assertStringNotContainsString('diff-added', $html);
        $this->assertStringNotContainsString('diff-removed', $html);
    }

    public function testHighlightsChangedSentences(): void
    {
        $html = DiffSentences::render(
            'I like cats. Dogs are okay.',
            'I like cats. Birds are great.'
        );
        $this->assertStringContainsString('diff-removed', $html);
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testHandlesBothTextsEmpty(): void
    {
        $html = DiffSentences::render('', '');
        $this->assertStringNotContainsString('diff-added', $html);
        $this->assertStringNotContainsString('diff-removed', $html);
    }
}
