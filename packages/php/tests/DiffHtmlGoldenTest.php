<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffHtml;

/**
 * Golden outputs for the tag-aware HTML diff (SPEC §12), the same table as
 * core's src/__tests__/html.test.ts (see the comments there for why each
 * expected output is right). Expected strings use a shorthand: `«+text»` is an
 * added marker and `«-text»` a removed marker, numbered 0, 1, 2, … in order.
 */
final class DiffHtmlGoldenTest extends TestCase
{
    public static function markup(string $short): string
    {
        $n = 0;
        $html = preg_replace_callback(
            '/«([+-])/u',
            static function (array $m) use (&$n): string {
                return '<span class="diff-' . ($m[1] === '+' ? 'added' : 'removed') . '" data-change-index="' . $n++ . '">';
            },
            $short,
        ) ?? $short;
        return str_replace('»', '</span>', $html);
    }

    public static function goldens(): iterable
    {
        // script, style and other raw text elements (1)
        yield "content after a script is kept" => ["<p>alpha</p>", "<p>alpha</p><script>var s = \"</div>\";</script><p>beta</p>", "<p>alpha</p><script>var s = \"</div>\";</script><p>«+beta»</p>", []];
        yield "uppercase end tag" => ["<script>var s = \"</div>\";</SCRIPT><p>tail one</p>", "<script>var s = \"</div>\";</script><p>tail two</p>", "<script>var s = \"</div>\";</script><p>tail «-one»«+two»</p>", []];
        yield "changed style body" => ["<p>x</p><style>p { color: red }</style><p>after</p>", "<p>x</p><style>p { color: blue }</style><p>after 2</p>", "<p>x</p><style>p { color: blue }</style><p>after«+ 2»</p>", []];
        yield "style with a > selector" => ["<style>p > b { }</style><p>a</p>", "<style>p > b { }</style><p>b</p>", "<style>p > b { }</style><p>«-a»«+b»</p>", []];
        yield "unterminated script" => ["<p>a</p>", "<p>a</p><script>if (x) <p>", "<p>a</p><script>if (x) <p></script>", []];
        yield "textarea content is raw" => ["<textarea></p></textarea><p>a</p>", "<textarea></p></textarea><p>b</p>", "<textarea></p></textarea><p>«-a»«+b»</p>", []];
        // valid output (2) and removed structure (10)
        yield "added paragraph after a table" => ["<table><tr><td></td></tr></table>", "<table><tr><td>one</td></tr></table><p>one<br>one</p>", "<table><tr><td>«+one»</td></tr></table><p>«+one»<br>«+one»</p>", []];
        yield "removed list item" => ["<ul><li>a</li><li>b</li></ul>", "<ul><li>a</li></ul>", "<ul><li>a</li><li>«-b»</li></ul>", []];
        yield "removed table row" => ["<table><tr><td>a</td></tr><tr><td>b</td></tr></table>", "<table><tr><td>a</td></tr></table>", "<table><tr><td>a</td></tr><tr><td>«-b»</td></tr></table>", []];
        yield "removed div with a paragraph" => ["<div><p>a</p></div><p>b</p>", "<p>b</p>", "<div><p>«-a»</p></div><p>b</p>", []];
        yield "link inside a link" => ["<p>see <a href=\"/y\">docs</a> now</p>", "<p><a href=\"/x\">see now</a></p>", "<p><a href=\"/x\">see «-docs »now</a></p>", []];
        yield "nested same-name elements" => ["<div><div>a</div><div>b</div></div>", "<div><div>a</div></div>", "<div><div>a</div><div>«-b»</div></div>", []];
        yield "removed wrapper" => ["<div><div>a</div></div>", "<div>a</div>", "<div>a</div>", []];
        yield "merged list items" => ["<ul><li>a</li><li>b</li></ul>", "<ul><li>a b</li></ul>", "<ul><li>a«+ »b</li></ul>", []];
        yield "dropped boundary separates words" => ["<p>x</p><p>a</p><p>b</p><p>y</p>", "<p>x</p><p>y</p>", "<p>x</p><p>«-a»</p><p>«-b»</p><p>y</p>", []];
        yield "stray close tag in the new document is dropped" => ["<p>a</p>", "<p>a</p></div><p>b</p>", "<p>a</p><p>«+b»</p>", []];
        yield "unclosed element in the new document is closed" => ["<div>a</div>", "<div>a<p>b</div>", "<div>a<p>«+b»</p></div>", []];
        yield "unclosed element at the end is closed" => ["", "<div><p>x", "<div><p>«+x»</p></div>", []];
        // entities compare by decoded value (4)
        yield "named, numeric and nbsp" => ["<p>&eacute;cole &amp; co&nbsp;x &#233;t&#xE9; &#x1F600;</p>", "<p>école & co\u{A0}x été 😀</p>", "<p>école & co\u{A0}x été 😀</p>", []];
        yield "new spelling kept" => ["<p>école</p>", "<p>&eacute;cole</p>", "<p>&eacute;cole</p>", []];
        yield "stray < equals &lt;" => ["<p>a &lt; b</p>", "<p>a < b</p>", "<p>a &lt; b</p>", []];
        yield "&quot; equals \"" => ["<p>&quot;hi&quot;</p>", "<p>\"hi\"</p>", "<p>\"hi\"</p>", []];
        yield "curly quotes equal straight ones" => ["<p>“Hello”</p>", "<p>\"Hello\"</p>", "<p>\"Hello\"</p>", []];
        yield "unknown entity is literal" => ["<p>&check;</p>", "<p>✓</p>", "<p>«-&check;»«+✓»</p>", []];
        yield "invalid code points decode to U+FFFD" => ["<p>&#0;&#xD800;&#x110000;</p>", "<p>\u{FFFD}\u{FFFD}\u{FFFD}</p>", "<p>\u{FFFD}\u{FFFD}\u{FFFD}</p>", []];
        yield "entity inside a changed word" => ["<p>&eacute;t&eacute;</p>", "<p>&eacute;tait</p>", "<p>«-&eacute;t&eacute;»«+&eacute;tait»</p>", []];
        // unbalanced attribute quotes (5)
        yield "added" => ["<p>one</p>", "<p>one</p><p title=\"x>two</p>", "<p>one</p>«+&lt;p title=\"x>two»", []];
        yield "removed" => ["<p>one</p><p title=\"x>two</p>", "<p>one</p>", "<p>one</p>«-&lt;p title=\"x>two»", []];
        yield "unterminated tag at the end" => ["<p>a</p><a href=\"x", "<p>b</p><a href=\"x", "<p>«-a»«+b»</p>&lt;a href=\"x", []];
        yield "quoted > does not end a tag" => ["<p title=\"a>b\">x y</p>", "<p title=\"a>b\">x z</p>", "<p title=\"a>b\">x «-y»«+z»</p>", []];
        // orphan grouping (6)
        yield "below the threshold" => ["ab XY cde", "fg XY hij", "«-ab XY cde»«+fg XY hij»", []];
        yield "exactly the threshold" => ["ab XYZ cde", "fg XYZ hij", "«-ab»«+fg» XYZ «-cde»«+hij»", []];
        yield "just above the exact ratio" => ["ab XYZ cde", "fg XYZ hij", "«-ab XYZ cde»«+fg XYZ hij»", ['orphanMatchThreshold' => 0.30000000000000004]];
        yield "run containing a tag" => ["<p>alpha <a href=\"#\">beta</a> gamma</p>", "<p>one <a href=\"#\">beta</a> two</p>", "<p>«-alpha»«+one» <a href=\"#\">beta</a> «-gamma»«+two»</p>", ['orphanMatchThreshold' => 0.9]];
        yield "chains merge" => ["alpha beta gamma delta", "one beta two three", "«-alpha beta gamma delta»«+one beta two three»", []];
        yield "threshold 0 disables grouping" => ["alpha beta gamma delta", "one beta two three", "«-alpha»«+one» beta «-gamma»«+two» «-delta»«+three»", ['orphanMatchThreshold' => 0]];
        yield "threshold 0.9" => ["the quick brown fox jumps", "the slow brown dog jumps", "the «-quick brown fox»«+slow brown dog» jumps", ['orphanMatchThreshold' => 0.9]];
        yield "non-numeric threshold uses the default" => ["ab XY cde", "fg XY hij", "«-ab XY cde»«+fg XY hij»", ['orphanMatchThreshold' => NAN]];
        // surrogate pairs and emoji are never split (7), invalid input (12)
        yield "emoji" => ["<p>x😀y</p>", "<p>x😁y</p>", "<p>x«-😀»«+😁»y</p>", []];
        yield "ZWJ family" => ["I 👨\u{200D}👩\u{200D}👧 x", "I 👨\u{200D}👩\u{200D}👦 x", "I «-👨\u{200D}👩\u{200D}👧»«+👨\u{200D}👩\u{200D}👦» x", []];
        yield "flag (regional indicator pair)" => ["<p>🇨🇦 flag</p>", "<p>🇫🇷 flag</p>", "<p>«-🇨🇦»«+🇫🇷» flag</p>", []];
        yield "combining mark stays with its letter" => ["<p>e\u{301}cole</p>", "<p>ecole</p>", "<p>«-e\u{301}cole»«+ecole»</p>", []];
        yield "emoji with variation selector" => ["I ❤\u{FE0F} it", "I ❤ it", "I «-❤\u{FE0F}»«+❤» it", []];
        yield "invalid UTF-8 becomes U+FFFD" => ["caf\xE9e", "caf\u{FFFD}e", "caf\u{FFFD}e", []];
        // ignoreCase and ignoreFormattingTags: false (8)
        yield "ignoreCase shows the new spelling" => ["<p>Hello World</p>", "<p>hello world</p>", "<p>hello world</p>", ['ignoreCase' => true]];
        yield "ignoreCase with a real change" => ["<p>Hello World</p>", "<p>hello there WORLD</p>", "<p>hello «+there »WORLD</p>", ['ignoreCase' => true]];
        yield "formatting removed" => ["<p>Hello <b>World</b></p>", "<p>Hello World</p>", "<p>Hello <b>«-World»</b>«+World»</p>", ['ignoreFormattingTags' => false]];
        yield "formatting added" => ["<p>make this bold now</p>", "<p>make <strong>this bold</strong> now</p>", "<p>make «-this bold»<strong>«+this bold»</strong> now</p>", ['ignoreFormattingTags' => false]];
        yield "formatting order does not matter" => ["<p><b><i>x</i></b> y</p>", "<p><i><b>x</b></i> y</p>", "<p><i><b>x</b></i> y</p>", ['ignoreFormattingTags' => false]];
        yield "formatting ignored by default" => ["<p>Hello <strong class=\"x\">world</strong></p>", "<p>Hello world</p>", "<p>Hello world</p>", []];
        // token identity (11)
        yield "doctype is opaque" => ["<!DOCTYPE html><p>a</p>", "<!doctype html><p>b</p>", "<!doctype html><p>«-a»«+b»</p>", []];
        yield "CDATA is opaque" => ["<p><![CDATA[x<y]]>a</p>", "<p><![CDATA[x<y]]>b</p>", "<p><![CDATA[x<y]]>«-a»«+b»</p>", []];
        yield "processing instruction is opaque" => ["<?xml version=\"1.0\"?><p>a</p>", "<?xml version=\"1.0\"?><p>a</p>", "<?xml version=\"1.0\"?><p>a</p>", []];
        yield "uppercase tags equal lowercase ones" => ["<P CLASS=\"x\">Hello</P>", "<p class=\"y\">Hello</p>", "<p class=\"y\">Hello</p>", []];
        yield "<img> equals <img />" => ["<p>a<img src=\"x.png\">b</p>", "<p>a<img src=\"x.png\" />b</p>", "<p>a<img src=\"x.png\" />b</p>", []];
        yield "changed img src is a change" => ["<p>x <img src=\"a.png\"> y</p>", "<p>x <img src=\"b.png\"> y</p>", "<p>x «-<img src=\"a.png\">»«+<img src=\"b.png\">» y</p>", []];
        yield "whitespace runs are equal" => ["<p>a b</p>", "<p>a \n  b</p>", "<p>a \n  b</p>", []];
        yield "attribute-only change" => ["<p class=\"a\">Hello world</p>", "<p class=\"b\">Hello world</p>", "<p class=\"b\">Hello world</p>", []];
        yield "comments are dropped" => ["<p>a<!-- c1 --> b</p>", "<p>a<!-- <p> --> c</p>", "<p>a «-b»«+c»</p>", []];
        yield "tag name change keeps the new structure" => ["<p>a b</p>", "<div>a b</div>", "<div>a b</div>", []];
        yield "both empty" => ["", "", "", []];
        yield "old empty" => ["", "<p>New text</p>", "<p>«+New text»</p>", []];
        yield "new empty" => ["<p>Old text</p>", "", "<p>«-Old text»</p>", []];
    }

    /** @param array<string, mixed> $options */
    #[DataProvider('goldens')]
    public function testGolden(string $old, string $new, string $expected, array $options): void
    {
        $html = DiffHtml::diff($old, $new, $options)['html'];
        $this->assertSame(self::markup($expected), $html);
        $this->assertSame([], HtmlProperties::problems($html, false), $html);
        $this->assertSame('<div class="text-diff text-diff-html">' . $html . '</div>', DiffHtml::render($old, $new, $options));
    }

    public function testFullReplacementUsesTheRawInputs(): void
    {
        $this->assertSame(
            [
                'html' => '<div class="diff-removed" data-change-index="0"><p>The quick brown fox</p></div><div class="diff-added" data-change-index="1"><ul><li>Lorem ipsum</li></ul></div>',
                'fullReplacement' => true,
                'similarity' => 0.0,
            ],
            DiffHtml::diff('<p>The quick brown fox</p>', '<ul><li>Lorem ipsum</li></ul>', ['similarityThreshold' => 0.5]),
        );
    }

    public function testMaxEditLengthFallsBackToOneReplacementOfAllTokens(): void
    {
        $options = ['maxEditLength' => 1, 'orphanMatchThreshold' => 0];
        $this->assertSame(self::markup('<p>«-a b c d»</p><p>«+w b y d»</p>'), DiffHtml::diff('<p>a b c d</p>', '<p>w b y d</p>', $options)['html']);
        $options['maxEditLength'] = 4;
        $this->assertSame(self::markup('<p>«-a»«+w» b «-c»«+y» d</p>'), DiffHtml::diff('<p>a b c d</p>', '<p>w b y d</p>', $options)['html']);
    }

    public function testNoSimilarityKeyWithoutAThreshold(): void
    {
        $this->assertSame(['html' => self::markup('«-a»«+b»'), 'fullReplacement' => false], DiffHtml::diff('a', 'b'));
    }

    public function testInvalidUtf8InAFullReplacementIsScrubbed(): void
    {
        $this->assertSame(
            '<div class="diff-removed" data-change-index="0">caf' . "\u{FFFD}" . '</div><div class="diff-added" data-change-index="1">xyz</div>',
            DiffHtml::diff("caf\xE9", 'xyz', ['similarityThreshold' => 0.5])['html'],
        );
    }
}
