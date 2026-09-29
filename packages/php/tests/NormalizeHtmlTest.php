<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\NormalizeHtml;

final class NormalizeHtmlTest extends TestCase
{
    // ─── normalizeQuotes ──────────────────────────────────────────────

    public function testConvertsLeftDoubleCurlyQuote(): void
    {
        $this->assertSame('"Hello', NormalizeHtml::normalizeQuotes("\u{201C}Hello"));
    }

    public function testConvertsRightDoubleCurlyQuote(): void
    {
        $this->assertSame('Hello"', NormalizeHtml::normalizeQuotes("Hello\u{201D}"));
    }

    public function testConvertsPairedDoubleCurlyQuotes(): void
    {
        $this->assertSame('"Clinic"', NormalizeHtml::normalizeQuotes("\u{201C}Clinic\u{201D}"));
    }

    public function testConvertsLeftSingleCurlyQuote(): void
    {
        $this->assertSame("'Hello", NormalizeHtml::normalizeQuotes("\u{2018}Hello"));
    }

    public function testConvertsRightSingleCurlyQuote(): void
    {
        $this->assertSame("don't", NormalizeHtml::normalizeQuotes("don\u{2019}t"));
    }

    public function testConvertsPairedSingleCurlyQuotes(): void
    {
        $this->assertSame("'Clinic'", NormalizeHtml::normalizeQuotes("\u{2018}Clinic\u{2019}"));
    }

    public function testConvertsLow9DoubleQuote(): void
    {
        $this->assertSame('"Hello"', NormalizeHtml::normalizeQuotes("\u{201E}Hello\u{201D}"));
    }

    public function testConvertsLow9SingleQuote(): void
    {
        $this->assertSame("'Hello'", NormalizeHtml::normalizeQuotes("\u{201A}Hello\u{2019}"));
    }

    public function testPreservesStraightDoubleQuotes(): void
    {
        $this->assertSame('"Hello"', NormalizeHtml::normalizeQuotes('"Hello"'));
    }

    public function testPreservesStraightSingleQuotes(): void
    {
        $this->assertSame("'Hello'", NormalizeHtml::normalizeQuotes("'Hello'"));
    }

    public function testNormalizesCurlyQuotesInsideHtml(): void
    {
        $this->assertSame(
            '<strong>"Clinic"</strong>',
            NormalizeHtml::normalizeQuotes("<strong>\u{201C}Clinic\u{201D}</strong>")
        );
    }

    public function testDoesNotAlterHtmlAttributeQuotes(): void
    {
        $this->assertSame(
            '<span class="test">"Hello"</span>',
            NormalizeHtml::normalizeQuotes("<span class=\"test\">\u{201C}Hello\u{201D}</span>")
        );
    }

    public function testHandlesMultipleCurlyQuotes(): void
    {
        $this->assertSame(
            '"A" and "B"',
            NormalizeHtml::normalizeQuotes("\u{201C}A\u{201D} and \u{201C}B\u{201D}")
        );
    }

    public function testHandlesMixedCurlyAndStraightQuotes(): void
    {
        $this->assertSame('"A" and "B"', NormalizeHtml::normalizeQuotes("\u{201C}A\u{201D} and \"B\""));
    }

    public function testHandlesMixedSingleAndDoubleCurlyQuotes(): void
    {
        $this->assertSame(
            '"He said \'hello\'"',
            NormalizeHtml::normalizeQuotes("\u{201C}He said \u{2018}hello\u{2019}\u{201D}")
        );
    }

    public function testHandlesEmptyString(): void
    {
        $this->assertSame('', NormalizeHtml::normalizeQuotes(''));
    }

    public function testHandlesTextWithNoQuotes(): void
    {
        $this->assertSame('Hello world', NormalizeHtml::normalizeQuotes('Hello world'));
    }

    public function testHandlesStringOfOnlyCurlyQuotes(): void
    {
        $this->assertSame(
            '""\'\'' ,
            NormalizeHtml::normalizeQuotes("\u{201C}\u{201D}\u{2018}\u{2019}")
        );
    }

    // ─── stripFormattingTags ──────────────────────────────────────────

    public function testStripsStrongTags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<strong>Hello</strong>'));
    }

    public function testStripsEmTags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<em>Hello</em>'));
    }

    public function testStripsBTags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<b>Hello</b>'));
    }

    public function testStripsITags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<i>Hello</i>'));
    }

    public function testStripsUTags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<u>Hello</u>'));
    }

    public function testStripsSTags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<s>Hello</s>'));
    }

    public function testStripsMarkTags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<mark>Hello</mark>'));
    }

    public function testStripsSubTags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<sub>Hello</sub>'));
    }

    public function testStripsSupTags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<sup>Hello</sup>'));
    }

    public function testPreservesPTags(): void
    {
        $this->assertSame('<p>Hello</p>', NormalizeHtml::stripFormattingTags('<p>Hello</p>'));
    }

    public function testPreservesDivTags(): void
    {
        $this->assertSame('<div>Hello</div>', NormalizeHtml::stripFormattingTags('<div>Hello</div>'));
    }

    public function testPreservesSpanTags(): void
    {
        $this->assertSame('<span>Hello</span>', NormalizeHtml::stripFormattingTags('<span>Hello</span>'));
    }

    public function testPreservesBrTags(): void
    {
        $this->assertSame('Hello<br>World', NormalizeHtml::stripFormattingTags('Hello<br>World'));
    }

    public function testPreservesATagsWithAttributes(): void
    {
        $this->assertSame(
            '<a href="#">Hello</a>',
            NormalizeHtml::stripFormattingTags('<a href="#">Hello</a>')
        );
    }

    public function testPreservesUlLiTags(): void
    {
        $this->assertSame(
            '<ul><li>Hello</li></ul>',
            NormalizeHtml::stripFormattingTags('<ul><li>Hello</li></ul>')
        );
    }

    public function testStripsNestedFormattingTags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<strong><em>Hello</em></strong>'));
    }

    public function testStripsFormattingInsidePreservedTags(): void
    {
        $this->assertSame(
            '<p>Hello world</p>',
            NormalizeHtml::stripFormattingTags('<p><strong>Hello</strong> world</p>')
        );
    }

    public function testStripsFormattingTagsWithAttributes(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<strong class="bold">Hello</strong>'));
    }

    public function testStripsCaseInsensitiveTags(): void
    {
        $this->assertSame('Hello', NormalizeHtml::stripFormattingTags('<STRONG>Hello</STRONG>'));
    }

    public function testStripsMultipleFormattingTagsInSequence(): void
    {
        $this->assertSame(
            'A B C',
            NormalizeHtml::stripFormattingTags('<strong>A</strong> <em>B</em> <b>C</b>')
        );
    }

    public function testStripFormattingHandlesEmptyString(): void
    {
        $this->assertSame('', NormalizeHtml::stripFormattingTags(''));
    }

    public function testStripFormattingHandlesTextWithoutTags(): void
    {
        $this->assertSame('Hello world', NormalizeHtml::stripFormattingTags('Hello world'));
    }

    public function testStripFormattingPreservesSelfClosingBr(): void
    {
        $this->assertSame('Hello<br/>World', NormalizeHtml::stripFormattingTags('Hello<br/>World'));
    }
}
