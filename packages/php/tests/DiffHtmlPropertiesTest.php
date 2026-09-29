<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use PhpDiffText\DiffHtml;

/**
 * Property tests for the HTML diff over seeded random documents (the PHP
 * counterpart of the fast-check properties in core's html.test.ts; the
 * generated html fixtures check that both engines agree byte for byte):
 *
 *  - the output is valid: balanced, allowed nesting, markers only hold text
 *    (and <img>), no unescaped `<` in text, and libxml parses it cleanly;
 *  - content is preserved: the text outside removed markers is the new
 *    document's text, the text outside added markers is the old one's;
 *  - change indexes are 0, 1, 2, … in document order.
 */
final class DiffHtmlPropertiesTest extends TestCase
{
    private const OPTION_SETS = [[], ['ignoreFormattingTags' => false], ['ignoreCase' => true], ['orphanMatchThreshold' => 0], ['orphanMatchThreshold' => 0.9]];

    private const WORDS = [
        'alpha', 'beta', 'gamma', 'delta', 'the', 'a', 'fox', 'Fox', '&amp;', '&nbsp;', '&eacute;cole', 'école', '&lt;',
        '1 < 2', 'x&gt;y', '“quoted”', '"quoted"', 'café', '😀', "👨\u{200D}👩\u{200D}👧", '猫', '&#233;', '&#x1F600;',
    ];

    private const INLINE = ['a href="#"', 'a href="/x"', 'span class="k"', 'code', 'strong', 'em', 'b title="a>b"'];

    private const FRAGMENTS = [
        '<p>', '</p>', '<div>', '</div>', '<ul>', '</ul>', '<li>', '</li>', '<table>', '<tr>', '<td>', '</td>', '</tr>', '</table>',
        '<a href="x">', '</a>', '<b>', '</b>', '<br>', '<img src="y">', '<script>', '</script>', '</SCRIPT>', '<style>',
        '<!--', '-->', '<![CDATA[', ']]>', '<!doctype html>', '<?pi?>', '<p title="', '"', "'", '>', '<', '&', '&amp;', '&nbsp;',
        '&#x1F600;', '&bogus;', 'a', 'b', 'word', ' ', "\n", '😀', "\xED\xA0\xBD", "\u{200D}", 'é', "e\u{301}", '“',
    ];

    public static function seeds(): iterable
    {
        foreach (range(1, (int) (getenv('FUZZ_SEEDS') ?: 20)) as $seed) {
            yield "seed $seed" => [$seed];
        }
    }

    #[DataProvider('seeds')]
    public function testValidDocuments(int $seed): void
    {
        mt_srand($seed);
        for ($i = 0; $i < 30; $i++) {
            $old = self::blocks(2);
            $new = mt_rand(0, 5) === 0 ? self::blocks(2) : self::mutate($old);
            $options = self::OPTION_SETS[$i % count(self::OPTION_SETS)];
            $html = $this->assertProperties($old, $new, $options, true);
            if ($i % 5 === 0) {
                HtmlAssert::assertWellFormed($this, '<div class="text-diff text-diff-html">' . $html . '</div>');
            }
        }
    }

    #[DataProvider('seeds')]
    public function testTagSoup(int $seed): void
    {
        mt_srand($seed + 1000);
        for ($i = 0; $i < 60; $i++) {
            $old = self::soup();
            $new = self::soup();
            $this->assertProperties($old, $new, self::OPTION_SETS[$i % count(self::OPTION_SETS)], false);
        }
    }

    /** @param array<string, mixed> $options */
    private function assertProperties(string $old, string $new, array $options, bool $strict): string
    {
        $html = DiffHtml::diff($old, $new, $options)['html'];
        $context = json_encode(['old' => $old, 'new' => $new, 'options' => $options, 'html' => $html], JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $this->assertSame([], HtmlProperties::problems($html, $strict), (string) $context);
        $ignoreFormatting = ($options['ignoreFormattingTags'] ?? true) !== false;
        $lower = ($options['ignoreCase'] ?? false) === true;
        $this->assertSame(HtmlProperties::documentText($new, $ignoreFormatting), HtmlProperties::sideText($html, 'removed'), "new side\n$context");
        $this->assertSame(HtmlProperties::documentText($old, $ignoreFormatting, $lower), HtmlProperties::sideText($html, 'added', $lower), "old side\n$context");
        $indexes = HtmlProperties::changeIndexes($html);
        $this->assertSame($indexes === [] ? [] : range(0, count($indexes) - 1), $indexes, (string) $context);
        return $html;
    }

    private static function pick(array $items): mixed
    {
        return $items[mt_rand(0, count($items) - 1)];
    }

    private static function soup(): string
    {
        $out = '';
        for ($n = mt_rand(0, 25); $n > 0; $n--) {
            $out .= self::pick(self::FRAGMENTS);
        }
        return $out;
    }

    private static function text(): string
    {
        $out = [];
        for ($n = mt_rand(1, 5); $n > 0; $n--) {
            $out[] = self::pick(self::WORDS);
        }
        return implode(self::pick([' ', ' ', ' ', '  ', "\n"]), $out);
    }

    private static function inline(int $depth = 0): string
    {
        $parts = [];
        for ($n = mt_rand(1, 3); $n > 0; $n--) {
            $k = mt_rand(0, 7);
            if ($k === 0 && $depth < 1) {
                $tag = self::pick(self::INLINE);
                $name = explode(' ', $tag)[0];
                $parts[] = "<{$tag}>" . self::inline($depth + 1) . "</{$name}>";
            } elseif ($k === 1) {
                $parts[] = self::pick(['<br>', '<br />', '<img src="i1.png">', '<img src="i2.png" alt="">', '<img src="i1.png"/>']);
            } elseif ($k === 2 && $depth === 0) {
                $parts[] = self::pick(['<!-- note -->', '<!-- <b>x</b> -->']);
            } else {
                $parts[] = self::text();
            }
        }
        return implode(' ', $parts);
    }

    private static function block(int $depth): string
    {
        switch (mt_rand(0, 9)) {
            case 0:
            case 1:
                $items = '';
                for ($k = mt_rand(1, 3); $k > 0; $k--) {
                    $items .= '<li>' . (mt_rand(0, 4) === 0 && $depth > 0 ? self::blocks($depth - 1) : self::inline()) . '</li>';
                }
                $list = self::pick(['ul', 'ol']);
                return "<{$list}>{$items}</{$list}>";
            case 2:
                $rows = '';
                for ($k = mt_rand(1, 2); $k > 0; $k--) {
                    $cells = '';
                    for ($c = mt_rand(1, 2); $c > 0; $c--) {
                        $cells .= '<td>' . self::inline() . '</td>';
                    }
                    $rows .= "<tr>{$cells}</tr>";
                }
                return mt_rand(0, 1) ? "<table>{$rows}</table>" : "<table><tbody>{$rows}</tbody></table>";
            case 3:
                return $depth > 0 ? '<div>' . self::blocks($depth - 1) . '</div>' : '<div>' . self::inline() . '</div>';
            case 4:
                return $depth > 0 ? '<blockquote>' . self::blocks($depth - 1) . '</blockquote>' : '<h2>' . self::inline() . '</h2>';
            case 5:
                return self::pick(['<script>if (a < b) { s = "</div>"; }</script>', '<style>p > b { color: red }</style>', '<SCRIPT>x = "<p>";</SCRIPT>']);
            default:
                return mt_rand(0, 3) === 0 ? '<p class="' . self::pick(['a', 'b']) . '">' . self::inline() . '</p>' : '<p>' . self::inline() . '</p>';
        }
    }

    private static function blocks(int $depth): string
    {
        $out = '';
        for ($n = mt_rand(1, 3); $n > 0; $n--) {
            $out .= self::block($depth);
        }
        return $out;
    }

    private static function mutate(string $doc): string
    {
        for ($e = mt_rand(1, 4); $e > 0; $e--) {
            switch (mt_rand(0, 6)) {
                case 0:
                    $w = self::pick(['alpha', 'beta', 'gamma', 'delta', 'fox', 'the']);
                    $at = strpos($doc, $w);
                    if ($at !== false) {
                        $doc = substr_replace($doc, self::pick(self::WORDS), $at, strlen($w));
                    }
                    break;
                case 1:
                    $doc .= self::block(1);
                    break;
                case 2:
                    $doc = preg_replace_callback(
                        '~<(p|li|td|h2)>(?:(?!</?\1[ >]).)*</\1>~s',
                        static fn(array $m): string => $m[1] === 'p' || $m[1] === 'h2' ? '' : "<{$m[1]}>" . self::inline() . "</{$m[1]}>",
                        $doc,
                        1,
                    ) ?? $doc;
                    break;
                case 3:
                    $doc = str_replace(['href="#"', 'class="a"'], ['href="/new"', 'class="b"'], $doc);
                    break;
                case 4:
                    $doc = self::block(1) . $doc;
                    break;
                case 5:
                    $doc = preg_replace_callback('~<(p|li)>~', static fn(array $m): string => $m[0] . self::text() . ' ', $doc, 1) ?? $doc;
                    break;
                default:
                    $doc = preg_replace('~<li>(?:(?!</?li>).)*</li>~s', '', $doc, 1) ?? $doc;
            }
        }
        return $doc;
    }
}
