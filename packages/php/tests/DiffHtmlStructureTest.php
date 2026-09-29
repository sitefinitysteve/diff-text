<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffHtml;
use PhpDiffText\DiffText;

/**
 * Tag-aware HTML diff: output must be valid HTML, spans may only wrap text,
 * and tags must never be split or crossed. (Random-document properties live in
 * DiffHtmlPropertiesTest, the shared goldens in DiffHtmlGoldenTest.)
 */
final class DiffHtmlStructureTest extends TestCase
{
    private static function wrapper(string $inner): string
    {
        return '<div class="text-diff text-diff-html">' . $inner . '</div>';
    }

    public static function exactCases(): iterable
    {
        yield 'word inserted inside paragraph' => [
            '<p>Hello world</p>', '<p>Hello big world</p>',
            '<p>Hello <span class="diff-added">big </span>world</p>',
        ];
        yield 'attribute-only change emits the new tag' => [
            '<p class="a">Hello world</p>', '<p class="b">Hello world</p>',
            '<p class="b">Hello world</p>',
        ];
        yield 'href change plus text change' => [
            '<p><a href="/x">old link</a></p>', '<p><a href="/y">new link</a></p>',
            '<p><a href="/y"><span class="diff-removed">old</span><span class="diff-added">new</span> link</a></p>',
        ];
        yield 'change never swallows a closing tag' => [
            '<p>Hello world</p><p>Bye</p>', '<p>Hello there</p><p>Bye</p>',
            '<p>Hello <span class="diff-removed">world</span><span class="diff-added">there</span></p><p>Bye</p>',
        ];
        yield 'quoted > in attribute stays inside the tag' => [
            '<p title="a>b">x y</p>', '<p title="a>b">x z</p>',
            '<p title="a>b">x <span class="diff-removed">y</span><span class="diff-added">z</span></p>',
        ];
        yield 'single-quoted attribute with >' => [
            "<p data-x='1>0'>one</p>", "<p data-x='1>0'>two</p>",
            "<p data-x='1>0'><span class=\"diff-removed\">one</span><span class=\"diff-added\">two</span></p>",
        ];
        yield 'removed paragraph keeps its balanced tags' => [
            '<p>One</p><p>Two</p>', '<p>One</p>',
            '<p>One</p><p><span class="diff-removed">Two</span></p>',
        ];
        yield 'added paragraph' => [
            '<p>One</p>', '<p>One</p><p>Two</p>',
            '<p>One</p><p><span class="diff-added">Two</span></p>',
        ];
        yield 'merged paragraphs follow the new structure' => [
            '<p>one</p><p>two</p>', '<p>one two</p>',
            '<p>one<span class="diff-added"> </span>two</p>',
        ];
        yield 'list item edits' => [
            '<ul><li>a</li><li>b</li></ul>', '<ul><li>a</li><li>c</li><li>d</li></ul>',
            '<ul><li>a</li><li><span class="diff-removed">b</span><span class="diff-added">c</span></li><li><span class="diff-added">d</span></li></ul>',
        ];
        yield 'table cell edit' => [
            '<table><tr><td>1</td><td>2</td></tr></table>', '<table><tr><td>1</td><td>3</td></tr></table>',
            '<table><tr><td>1</td><td><span class="diff-removed">2</span><span class="diff-added">3</span></td></tr></table>',
        ];
        yield 'void elements are atomic' => [
            '<p>a<br>b</p>', '<p>a<br>c<img src="x.png" alt=""></p>',
            '<p>a<br><span class="diff-removed">b</span><span class="diff-added">c<img src="x.png" alt=""></span></p>',
        ];
        yield 'changed img src is a change' => [
            '<p>x <img src="a.png"> y</p>', '<p>x <img src="b.png"> y</p>',
            '<p>x <span class="diff-removed"><img src="a.png"></span><span class="diff-added"><img src="b.png"></span> y</p>',
        ];
        yield 'self-closing and void br are equal' => [
            'a<br>b', 'a<br />b',
            'a<br />b',
        ];
        yield 'entities are atomic and compare decoded' => [
            '<p>Tom &amp; Jerry</p>', '<p>Tom &amp; Jerry &lt;3</p>',
            '<p>Tom &amp; Jerry<span class="diff-added"> &lt;3</span></p>',
        ];
        yield 'entity vs literal character is unchanged' => [
            '<p>&quot;hi&quot;</p>', '<p>"hi"</p>',
            '<p>"hi"</p>',
        ];
        yield 'comments are dropped' => [
            '<p>a<!-- c1 --> b</p>', '<p>a<!-- c2 --> c</p>',
            '<p>a <span class="diff-removed">b</span><span class="diff-added">c</span></p>',
        ];
        yield 'tags inside comments are not parsed' => [
            '<p>x<!-- <div> --></p>', '<p>z<!-- </p><div> --></p>',
            '<p><span class="diff-removed">x</span><span class="diff-added">z</span></p>',
        ];
        yield 'script content is opaque' => [
            '<p>a</p><script>if (a < b) { x = "</p>"; }</script>', '<p>b</p><script>if (a < b) { x = "</p>"; }</script>',
            '<p><span class="diff-removed">a</span><span class="diff-added">b</span></p><script>if (a < b) { x = "</p>"; }</script>',
        ];
        yield 'stray < is text (emitted as &lt;)' => [
            '<p>1 < 2</p>', '<p>1 < 3</p>',
            '<p>1 &lt; <span class="diff-removed">2</span><span class="diff-added">3</span></p>',
        ];
        yield 'tag name change keeps new structure' => [
            '<p>a b</p>', '<div>a b</div>',
            '<div>a b</div>',
        ];
        yield 'plain text' => [
            'Hello world', 'Hello brave new world',
            'Hello <span class="diff-added">brave new </span>world',
        ];
        yield 'both empty' => ['', '', ''];
        yield 'old empty' => ['', '<p>New text</p>', '<p><span class="diff-added">New text</span></p>'];
        yield 'new empty' => ['<p>Old text</p>', '', '<p><span class="diff-removed">Old text</span></p>'];
        yield 'uppercase tags match lowercase' => [
            '<P>Hello</P>', '<p>Hello</p>',
            '<p>Hello</p>',
        ];
    }

    /** Expected strings omit data-change-index; it is checked separately. */
    private static function withoutIndex(string $html): string
    {
        return preg_replace('/ data-change-index="\d+"/', '', $html) ?? $html;
    }

    #[DataProvider('exactCases')]
    public function testExactOutput(string $old, string $new, string $expectedInner): void
    {
        $html = DiffHtml::render($old, $new);
        $this->assertSame(self::wrapper($expectedInner), self::withoutIndex($html));
        HtmlAssert::assertWellFormed($this, $html);
        self::assertIndicesSequential($html);
    }

    private static function assertIndicesSequential(string $html): void
    {
        preg_match_all('/<(?:span|div) class="diff-(?:added|removed)"( data-change-index="(\d+)")?/', $html, $m);
        foreach ($m[1] as $i => $attr) {
            self::assertNotSame('', $attr, "marker without data-change-index in $html");
            self::assertSame((string) $i, $m[2][$i]);
        }
    }

    public function testChangeIndexNumbersMarkersInDocumentOrder(): void
    {
        $this->assertSame(
            self::wrapper('<ul><li>a</li><li><span class="diff-removed" data-change-index="0">b</span><span class="diff-added" data-change-index="1">c</span></li><li><span class="diff-added" data-change-index="2">d</span></li></ul>'),
            DiffHtml::render('<ul><li>a</li><li>b</li></ul>', '<ul><li>a</li><li>c</li><li>d</li></ul>'),
        );
    }

    public function testRegressionNoPartialTagsInSpans(): void
    {
        // The old whitespace tokenizer produced `<a <span class="diff-removed">href=...`.
        $html = DiffHtml::render('<p>See <a href="/one">docs</a></p>', '<p>Read <a href="/two" target="_blank">docs</a></p>');
        $this->assertStringNotContainsString('<a <span', $html);
        $this->assertStringContainsString('<a href="/two" target="_blank">docs</a>', $html);
        HtmlAssert::assertWellFormed($this, $html);
    }

    public function testRegressionSpansDoNotCrossTagBoundaries(): void
    {
        // The old engine emitted `<span class="diff-removed">world</p></span>`.
        $html = DiffHtml::render('<p>Hello world</p><p>Next</p>', '<p>Hello</p><p>Next</p>');
        $this->assertDoesNotMatchRegularExpression('~<span class="diff-(added|removed)">[^<]*</p>~', $html);
        HtmlAssert::assertWellFormed($this, $html);
    }

    public function testFullReplacementUsesDivs(): void
    {
        $old = '<p>It is expressly agreed and understood by the parties that the Husband shall maintain his policy.</p>';
        $new = '<ul><li>Item 1: House.</li><li>Item 2: Car.</li></ul>';
        $html = DiffHtml::render($old, $new, [], 0.3);
        $this->assertSame(self::wrapper('<div class="diff-removed" data-change-index="0">' . $old . '</div><div class="diff-added" data-change-index="1">' . $new . '</div>'), $html);
        HtmlAssert::assertWellFormed($this, $html);
    }

    public function testSimilarityThresholdAcceptedInOptions(): void
    {
        $old = '<p>It is expressly agreed and understood by the parties that the Husband shall maintain his policy.</p>';
        $new = '<ul><li>Item 1: House.</li><li>Item 2: Car.</li></ul>';
        $this->assertSame(DiffHtml::render($old, $new, [], 0.3), DiffHtml::render($old, $new, ['similarityThreshold' => 0.3]));
        $this->assertSame(DiffHtml::render($old, $new, [], 0.3), DiffText::html($old, $new, ['similarityThreshold' => 0.3]));
    }

    public function testPositionalThresholdWinsOverOption(): void
    {
        $html = DiffHtml::render('Hello world', 'Hello worlds', ['similarityThreshold' => 1.0], 0.0);
        $this->assertStringNotContainsString('<div class="diff-removed"', $html);
    }

    public function testFormattingTagsKeptWhenNotIgnored(): void
    {
        $html = DiffHtml::render('<p>Hello <b>big</b> world</p>', '<p>Hello world</p>', ['ignoreFormattingTags' => false]);
        $this->assertSame(self::wrapper('<p>Hello <b><span class="diff-removed">big</span></b><span class="diff-removed"> </span>world</p>'), self::withoutIndex($html));
        HtmlAssert::assertWellFormed($this, $html);
    }

    public function testAddedFormattingShowsTheTextAsReplaced(): void
    {
        // CHANGED (unified engine): text compares together with its formatting, so plain
        // "this bold" is removed and bold "this bold" added (sibling markers, never nested).
        $html = DiffHtml::render('<p>make this bold now</p>', '<p>make <strong>this bold</strong> now</p>', ['ignoreFormattingTags' => false]);
        $this->assertSame(self::wrapper('<p>make <span class="diff-removed">this bold</span><strong><span class="diff-added">this bold</span></strong> now</p>'), self::withoutIndex($html));
    }

    public function testIgnoreCase(): void
    {
        $this->assertSame(self::wrapper('<p>hello WORLD</p>'), DiffHtml::render('<p>Hello world</p>', '<p>hello WORLD</p>', ['ignoreCase' => true]));
    }

    public function testMaxEditLengthFallsBackToWholeReplacementOfTokens(): void
    {
        $html = DiffHtml::render('<p>a b c d</p>', '<p>w x y z</p>', ['maxEditLength' => 1, 'orphanMatchThreshold' => 0]);
        HtmlAssert::assertWellFormed($this, $html);
        $this->assertSame('a b c d', HtmlAssert::markedText($html, 'diff-removed'));
        $this->assertSame('w x y z', HtmlAssert::markedText($html, 'diff-added'));
    }

    public function testUnclosedTagAtEndIsText(): void
    {
        $html = DiffHtml::render('<p>a</p><a href="x', '<p>b</p><a href="x');
        $this->assertStringContainsString('<span class="diff-added" data-change-index="1">b</span>', $html);
    }
}
