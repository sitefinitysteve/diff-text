<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffHtml;

final class DiffHtmlTest extends TestCase
{
    public function testRendersWordLevelDiffWithoutSimilarityThreshold(): void
    {
        $html = DiffHtml::render('Hello world', 'Hello Vue world');
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testRendersFullReplacementWhenSimilarityBelowThreshold(): void
    {
        $html = DiffHtml::render(
            'It is expressly agreed and understood by the parties that the Husband shall maintain his existing life insurance policy.',
            'Item 1: House. Item 2: Car. Item 3: Savings.',
            [],
            0.3
        );
        $this->assertSame(1, substr_count($html, 'diff-removed'));
        $this->assertSame(1, substr_count($html, 'diff-added'));
        $this->assertStringContainsString('expressly agreed', $html);
        $this->assertStringContainsString('Item 1', $html);
    }

    public function testRendersWordLevelDiffWhenSimilarityAboveThreshold(): void
    {
        $html = DiffHtml::render(
            'The quick brown fox jumps over the lazy dog.',
            'The quick brown fox leaps over the lazy dog.',
            [],
            0.3
        );
        $this->assertStringContainsString('diff-added', $html);
        $isFullReplacement = substr_count($html, 'diff-removed') === 1
            && str_contains($html, '<span class="diff-removed">The quick brown fox');
        $this->assertFalse($isFullReplacement);
    }

    public function testOrphanMatchingProducesCleanBlocksWhenThresholdIsNull(): void
    {
        $html = DiffHtml::render(
            'Completely different text here with many words.',
            'XYZ 123 ABC.'
        );
        // Without similarityThreshold, orphan matching still cleans up the output
        // into grouped removed/added blocks (no garbled interleaving)
        $this->assertStringContainsString('diff-removed', $html);
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testThresholdZeroDisablesFullReplacementButOrphanMatchingStillApplies(): void
    {
        $html = DiffHtml::render(
            'Completely different text here.',
            'XYZ 123.',
            [],
            0.0
        );
        // similarityThreshold 0 disables the full-replacement path,
        // but orphan matching still produces clean grouped blocks
        $this->assertStringContainsString('diff-removed', $html);
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testThresholdOneTriggersFullReplacementForNonIdenticalText(): void
    {
        $html = DiffHtml::render(
            'Hello world',
            'Hello worlds',
            [],
            1.0
        );
        $this->assertSame(1, substr_count($html, 'diff-removed'));
        $this->assertSame(1, substr_count($html, 'diff-added'));
        $this->assertStringContainsString('Hello world</span>', $html);
        $this->assertStringContainsString('Hello worlds</span>', $html);
    }

    public function testThresholdOneDoesNotTriggerForIdenticalText(): void
    {
        $html = DiffHtml::render(
            'Hello world',
            'Hello world',
            [],
            1.0
        );
        $this->assertStringNotContainsString('diff-removed', $html);
        $this->assertStringNotContainsString('diff-added', $html);
    }

    public function testIdenticalTextWithThresholdDoesNotTriggerFullReplacement(): void
    {
        $html = DiffHtml::render(
            'Same content here',
            'Same content here',
            [],
            0.3
        );
        $this->assertStringNotContainsString('diff-removed', $html);
        $this->assertStringNotContainsString('diff-added', $html);
    }

    public function testHandlesEmptyOldTextWithoutError(): void
    {
        $html = DiffHtml::render('', 'Some new text', [], 0.3);
        $this->assertNotEmpty($html);
        $this->assertStringNotContainsString('diff-removed', $html);
    }

    public function testHandlesEmptyNewTextWithoutError(): void
    {
        $html = DiffHtml::render('Some old text', '', [], 0.3);
        $this->assertNotEmpty($html);
    }

    public function testHandlesBothTextsEmptyWithThreshold(): void
    {
        $html = DiffHtml::render('', '', [], 0.3);
        $this->assertStringNotContainsString('diff-removed', $html);
        $this->assertStringNotContainsString('diff-added', $html);
    }

    // ─── Bug 4: Real-world garbled interleaving on partial replacement ─

    public function testBug4aRealWorldHtmlSecondSentenceReplacedNoInterleaving(): void
    {
        $html = DiffHtml::render(
            "<p>Each Party acknowledges that at all times during the Term of this Agreement the Surrogate will retain bodily autonomy and the right to obtain a second medical opinion with respect to any proposed test, procedure, treatment, or medication which will be covered by the Intended Parents as an Additional Expense Amounts. Each Party acknowledges that any term of this Agreement where the Surrogate gives her consent with respect to any proposed test, procedure, treatment, or medication will be interpreted by the Parties to mean that the Surrogate intends to give her consent at the relevant time if such consent is fully informed and voluntary.</p>\n",
            "<p>Each Party acknowledges that at all times during the Term of this Agreement the Surrogate will retain bodily autonomy and the right to obtain a second medical opinion with respect to any proposed test, procedure, treatment, or medication which will be covered by the Intended Parents as an Additional Expense Amounts. Test writing new content.</p>\n"
        );
        // New words should NOT appear in removed spans
        $this->assertDoesNotMatchRegularExpression('/diff-removed[^>]*>[^<]*Test/', $html);
        $this->assertDoesNotMatchRegularExpression('/diff-removed[^>]*>[^<]*writing/', $html);
        $this->assertDoesNotMatchRegularExpression('/diff-removed[^>]*>[^<]*content/', $html);
        // Old words should NOT appear in added spans
        $this->assertDoesNotMatchRegularExpression('/diff-added[^>]*>[^<]*interpreted/', $html);
        $this->assertDoesNotMatchRegularExpression('/diff-added[^>]*>[^<]*voluntary/', $html);
    }

    public function testBug4bRealWorldHtmlWithStrongTagsNoGarbledInterleaving(): void
    {
        $html = DiffHtml::render(
            '<p>The Surrogate has offered to act as an altruistic surrogate and to gestate the Embryo created with the Ova and the Sperm until the Birth of the Child. The Surrogate is over the age of TWENTY-ONE (21) years and is in a relationship of permanence with the Spouse. The Surrogate has 3 dependant child or children ("<strong>Surrogate\'s Dependant(s)</strong>").</p>' . "\n",
            "<p>The Surrogate has offered to act as an altruistic surrogate and to gestate the Embryo created with the Ova and the Sperm until the Birth of the Child. Test writing new content.</p>\n"
        );
        // No garbled interleaving
        $this->assertDoesNotMatchRegularExpression('/diff-removed[^>]*>[^<]*Test/', $html);
        $this->assertDoesNotMatchRegularExpression('/diff-removed[^>]*>[^<]*writing/', $html);
        $this->assertDoesNotMatchRegularExpression('/diff-removed[^>]*>[^<]*content/', $html);
        // Old words should NOT appear in added spans
        $this->assertDoesNotMatchRegularExpression('/diff-added[^>]*>[^<]*TWENTY-ONE/', $html);
        $this->assertDoesNotMatchRegularExpression('/diff-added[^>]*>[^<]*permanence/', $html);
        // No nested diff-removed inside diff-added
        $this->assertDoesNotMatchRegularExpression('/diff-added.*diff-removed/s', $html);
    }

    // ─── Bug 1: Curly quotes vs straight quotes ──────────────────────

    public function testBug1aCurlyQuotesInOldStraightInNew(): void
    {
        $html = DiffHtml::render(
            "<strong>\u{201C}Clinic\u{201D}</strong> means a fertility clinic selected by the Intended Parent.",
            '<strong>"Clinic"</strong> means a fertility clinic selected by the Intended Parent and may be changed later.'
        );
        // Quote differences should NOT produce removed spans around "Clinic"
        $this->assertDoesNotMatchRegularExpression(
            '/diff-removed[^>]*>[^<]*Clinic/',
            $html
        );
        // "and may be changed later" should be added
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testBug1bStraightQuotesInOldCurlyInNew(): void
    {
        $html = DiffHtml::render(
            '<strong>"Clinic"</strong> means a fertility clinic selected by the Intended Parent.',
            "<strong>\u{201C}Clinic\u{201D}</strong> means a fertility clinic selected by the Intended Parent and may be changed later."
        );
        // Quote differences should NOT produce removed spans around "Clinic"
        $this->assertDoesNotMatchRegularExpression(
            '/diff-removed[^>]*>[^<]*Clinic/',
            $html
        );
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testBug1cPlainTextCurlyQuotes(): void
    {
        $html = DiffHtml::render(
            "\u{201C}Clinic\u{201D} means selected by Intended Parent.",
            '"Clinic" means selected by Intended Parent and changed.'
        );
        // "Clinic" should NOT appear in a diff-removed span
        if (str_contains($html, 'diff-removed')) {
            $this->assertStringNotContainsString('>Clinic<', $html);
        }
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testBug1dSingleCurlyQuotes(): void
    {
        $html = DiffHtml::render(
            "The \u{2018}Clinic\u{2019} is important.",
            "The 'Clinic' is important and revised."
        );
        // "Clinic" should not be in diff-removed
        $this->assertDoesNotMatchRegularExpression(
            '/diff-removed[^>]*>[^<]*Clinic/',
            $html
        );
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testBug1eIdenticalTextExceptQuotesNoDiff(): void
    {
        $html = DiffHtml::render(
            "\u{201C}Clinic\u{201D} means selected.",
            '"Clinic" means selected.'
        );
        $this->assertStringNotContainsString('diff-removed', $html);
        $this->assertStringNotContainsString('diff-added', $html);
    }

    public function testBug1fMultipleCurlyQuotePairsNoDiff(): void
    {
        $html = DiffHtml::render(
            "\u{201C}Clinic\u{201D} and \u{201C}Doctor\u{201D} are defined terms.",
            '"Clinic" and "Doctor" are defined terms.'
        );
        $this->assertStringNotContainsString('diff-removed', $html);
        $this->assertStringNotContainsString('diff-added', $html);
    }

    public function testBug1gCurlyQuotesWithSimilarityThreshold(): void
    {
        $html = DiffHtml::render(
            "\u{201C}Clinic\u{201D} means a fertility clinic selected by the Intended Parent.",
            '"Clinic" means a fertility clinic selected by the Intended Parent.',
            [],
            0.8
        );
        // Texts are essentially identical — should not trigger full replacement
        $this->assertStringNotContainsString('diff-removed', $html);
        $this->assertStringNotContainsString('diff-added', $html);
    }

    // ─── Bug 2: HTML tag wrapping mismatch ───────────────────────────

    public function testBug2aOldHasStrongNewDoesNot(): void
    {
        $html = DiffHtml::render(
            '<strong>"Clinic"</strong> means a fertility clinic selected by the Intended Parent.',
            '"Clinic" means a fertility clinic selected by the Intended Parent and may be changed later.',
            ['ignoreFormattingTags' => true]
        );
        // "Clinic" should NOT be shown as removed
        $this->assertDoesNotMatchRegularExpression(
            '/diff-removed[^>]*>[^<]*Clinic/',
            $html
        );
        // Should not have nested diff-removed inside diff-added
        $this->assertDoesNotMatchRegularExpression(
            '/diff-added.*diff-removed/s',
            $html
        );
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testBug2bOldHasNoStrongNewHasStrong(): void
    {
        $html = DiffHtml::render(
            '"Clinic" means a fertility clinic selected by the Intended Parent.',
            '<strong>"Clinic"</strong> means a fertility clinic selected by the Intended Parent and may be changed later.',
            ['ignoreFormattingTags' => true]
        );
        $this->assertDoesNotMatchRegularExpression(
            '/diff-removed[^>]*>[^<]*Clinic/',
            $html
        );
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testBug2cBothHaveStrongNoSpuriousDiffs(): void
    {
        $html = DiffHtml::render(
            '<strong>"Clinic"</strong> means a fertility clinic selected by the Intended Parent.',
            '<strong>"Clinic"</strong> means a fertility clinic selected by the Intended Parent and may be changed later.'
        );
        // "Clinic" should NOT be in any diff span (both sides have same <strong> tags)
        $this->assertDoesNotMatchRegularExpression(
            '/diff-removed[^>]*>[^<]*Clinic/',
            $html
        );
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testBug2dOldHasEmNewDoesNot(): void
    {
        $html = DiffHtml::render(
            '<em>Important</em> clause here.',
            'Important clause here and more.',
            ['ignoreFormattingTags' => true]
        );
        $this->assertDoesNotMatchRegularExpression(
            '/diff-removed[^>]*>[^<]*Important/',
            $html
        );
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testBug2eNestedFormattingTagsStripped(): void
    {
        $html = DiffHtml::render(
            '<strong><em>"Clinic"</em></strong> means selected.',
            '"Clinic" means selected and revised.',
            ['ignoreFormattingTags' => true]
        );
        $this->assertDoesNotMatchRegularExpression(
            '/diff-removed[^>]*>[^<]*Clinic/',
            $html
        );
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testBug2fIgnoreFormattingTagsExplicitlyFalse(): void
    {
        $html = DiffHtml::render(
            '<strong>"Clinic"</strong> means selected.',
            '"Clinic" means selected.',
            ['ignoreFormattingTags' => false]
        );
        // With ignoreFormattingTags explicitly false, the tag difference causes the BUG:
        // "Clinic" text appears inside a diff span even though text content is identical
        $hasDiffArtifact = str_contains($html, 'diff-added') || str_contains($html, 'diff-removed');
        $this->assertTrue($hasDiffArtifact);
    }

    public function testBug2gIgnoreFormattingTagsIdenticalTextNoDiffs(): void
    {
        $html = DiffHtml::render(
            '<strong>Hello</strong> world',
            'Hello world',
            ['ignoreFormattingTags' => true]
        );
        $this->assertStringNotContainsString('diff-removed', $html);
        $this->assertStringNotContainsString('diff-added', $html);
    }

    // ─── Combined: Bugs 1 + 2 ────────────────────────────────────────

    public function testCombinedCurlyQuotesAndTagMismatch(): void
    {
        $html = DiffHtml::render(
            "<strong>\u{201C}Clinic\u{201D}</strong> means a fertility clinic selected by the Intended Parent.",
            '"Clinic" means a fertility clinic selected by the Intended Parent and may be changed later.',
            ['ignoreFormattingTags' => true]
        );
        $this->assertDoesNotMatchRegularExpression(
            '/diff-removed[^>]*>[^<]*Clinic/',
            $html
        );
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testCombinedStraightQuotesNoTagsCurlyQuotesWithTags(): void
    {
        $html = DiffHtml::render(
            '"Clinic" means a fertility clinic selected by the Intended Parent.',
            "<strong>\u{201C}Clinic\u{201D}</strong> means a fertility clinic selected by the Intended Parent and may be changed later.",
            ['ignoreFormattingTags' => true]
        );
        $this->assertDoesNotMatchRegularExpression(
            '/diff-removed[^>]*>[^<]*Clinic/',
            $html
        );
        $this->assertStringContainsString('diff-added', $html);
    }

    public function testCombinedIdenticalContentDifferentQuotesAndTagsNoDiff(): void
    {
        $html = DiffHtml::render(
            "<strong>\u{201C}Clinic\u{201D}</strong> means selected.",
            '"Clinic" means selected.',
            ['ignoreFormattingTags' => true]
        );
        $this->assertStringNotContainsString('diff-removed', $html);
        $this->assertStringNotContainsString('diff-added', $html);
    }
}
