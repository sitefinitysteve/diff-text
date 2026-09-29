<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffText;

final class DiffTextTest extends TestCase
{
    public function testCharsProducesSameOutputAsDiffChars(): void
    {
        $html = DiffText::chars('cat', 'car');
        $this->assertStringContainsString('text-diff-chars', $html);
        $this->assertStringContainsString('diff-removed', $html);
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testWordsProducesSameOutputAsDiffWords(): void
    {
        $html = DiffText::words('The quick fox', 'The slow fox');
        $this->assertStringContainsString('text-diff-words', $html);
        $this->assertStringContainsString('quick', $html);
        $this->assertStringContainsString('slow', $html);
    }

    public function testWordsWithSpaceDetectsSpacingChanges(): void
    {
        $html = DiffText::wordsWithSpace('hello    world', 'hello world');
        $this->assertStringContainsString('text-diff-words-with-space', $html);
        $this->assertStringContainsString('diff-removed', $html);
    }

    public function testLinesDetectsLineChanges(): void
    {
        $html = DiffText::lines("line one\nline two", "line one\nline changed");
        $this->assertStringContainsString('text-diff-lines', $html);
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testSentencesDetectsSentenceChanges(): void
    {
        $html = DiffText::sentences('I like cats. Dogs are fine.', 'I like cats. Birds are fine.');
        $this->assertStringContainsString('text-diff-sentences', $html);
        $this->assertStringContainsString('diff-removed', $html);
    }

    public function testHtmlRendersWithSimilarityThreshold(): void
    {
        $html = DiffText::html(
            'Hello world',
            'Hello worlds',
            [],
            1.0
        );
        $this->assertStringContainsString('text-diff-html', $html);
        $this->assertStringContainsString('diff-removed', $html);
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testHtmlRendersWithoutThreshold(): void
    {
        $html = DiffText::html('Hello world', 'Hello Vue world');
        $this->assertStringContainsString('text-diff-html', $html);
        $this->assertStringContainsString('diff-added', $html);
    }
}
