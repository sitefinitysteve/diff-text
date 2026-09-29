<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\Similarity;

final class SimilarityTest extends TestCase
{
    public function testReturnsOneForIdenticalTexts(): void
    {
        $this->assertSame(1.0, Similarity::compute('hello world', 'hello world'));
    }

    public function testReturnsOneForBothEmptyStrings(): void
    {
        $this->assertSame(1.0, Similarity::compute('', ''));
    }

    public function testReturnsZeroWhenOldTextIsEmpty(): void
    {
        $this->assertSame(0.0, Similarity::compute('', 'hello'));
    }

    public function testReturnsZeroWhenNewTextIsEmpty(): void
    {
        $this->assertSame(0.0, Similarity::compute('hello', ''));
    }

    public function testReturnsLowSimilarityForCompletelyDifferentTexts(): void
    {
        $similarity = Similarity::compute(
            'alpha beta gamma delta',
            'xylophone zebra quantum'
        );
        $this->assertLessThan(0.1, $similarity);
    }

    public function testReturnsHighSimilarityForMinorWordChanges(): void
    {
        $similarity = Similarity::compute(
            'The quick brown fox jumps over the lazy dog',
            'The quick brown fox leaps over the lazy dog'
        );
        $this->assertGreaterThan(0.8, $similarity);
    }

    public function testReturnsLowSimilarityForCompleteContentReplacement(): void
    {
        $similarity = Similarity::compute(
            'It is expressly agreed and understood by the parties that the Husband shall maintain his existing life insurance policy in the amount of $500,000 with the Wife named as the irrevocable beneficiary thereof.',
            "Item 1: House\nItem 2: Car\nItem 3: Savings Account"
        );
        $this->assertLessThan(0.3, $similarity);
    }

    public function testStripsHtmlTagsBeforeComparing(): void
    {
        $similarity = Similarity::compute(
            '<p>Hello <strong>world</strong></p>',
            '<div>Hello <em>world</em></div>'
        );
        $this->assertSame(1.0, $similarity);
    }

    public function testStripsHtmlButComparesTextContentDifferences(): void
    {
        $similarity = Similarity::compute(
            '<p>Hello world</p>',
            '<p>Goodbye world</p>'
        );
        $this->assertGreaterThan(0.3, $similarity);
        $this->assertLessThan(1.0, $similarity);
    }

    public function testReturnsOneForWhitespaceOnlyStringsAfterTrimming(): void
    {
        $this->assertSame(1.0, Similarity::compute('   ', '   '));
    }

    public function testReturnsZeroForEmptyHtmlTagsVsRealContent(): void
    {
        $this->assertSame(0.0, Similarity::compute('<p></p>', 'hello'));
    }

    public function testReturnsZeroForWhitespaceOnlyHtmlVsRealContent(): void
    {
        $this->assertSame(0.0, Similarity::compute('<p>  </p>', 'hello'));
    }

    public function testHandlesAngleBracketsInPlainTextGracefully(): void
    {
        $similarity = Similarity::compute('hello < world > test', 'hello test');
        $this->assertGreaterThan(0.8, $similarity);
    }

    // ─── Quote normalization in similarity ────────────────────────────

    public function testTreatsCurlyDoubleQuotesAsIdenticalToStraight(): void
    {
        $similarity = Similarity::compute(
            "\u{201C}Clinic\u{201D} means selected.",
            '"Clinic" means selected.'
        );
        $this->assertSame(1.0, $similarity);
    }

    public function testTreatsCurlySingleQuotesAsIdenticalToStraight(): void
    {
        $similarity = Similarity::compute(
            "don\u{2019}t stop",
            "don't stop"
        );
        $this->assertSame(1.0, $similarity);
    }

    public function testDoesNotPenalizeSimilarityForQuoteStyleDifferences(): void
    {
        $similarity = Similarity::compute(
            "\u{201C}Clinic\u{201D} means a fertility clinic selected by the Intended Parent.",
            '"Clinic" means a fertility clinic selected by the Intended Parent.'
        );
        $this->assertSame(1.0, $similarity);
    }
}
