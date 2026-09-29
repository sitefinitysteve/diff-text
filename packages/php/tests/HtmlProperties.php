<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PhpDiffText\HtmlLexer;
use PhpDiffText\HtmlTokenizer;
use PhpDiffText\NormalizeHtml;
use PhpDiffText\Str;

/**
 * Output checks for the HTML diff (port of core's src/__tests__/htmlCheck.ts):
 * structural validity and the text each side of the diff shows.
 */
final class HtmlProperties
{
    private const RESTRICTED = [
        'ul' => ['li'], 'ol' => ['li'], 'menu' => ['li'], 'table' => ['caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr'],
        'thead' => ['tr'], 'tbody' => ['tr'], 'tfoot' => ['tr'], 'tr' => ['td', 'th'], 'colgroup' => ['col'], 'dl' => ['dt', 'dd', 'div'],
    ];

    private const REQUIRED = [
        'li' => ['ul', 'ol', 'menu'], 'tr' => ['table', 'thead', 'tbody', 'tfoot'], 'td' => ['tr'], 'th' => ['tr'],
        'thead' => ['table'], 'tbody' => ['table'], 'tfoot' => ['table'], 'dt' => ['dl'], 'dd' => ['dl'],
    ];

    private const BLOCK = ['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul'];

    private const PHRASING = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'span', 'a', 'em', 'strong', 'b', 'i', 'u', 's', 'mark', 'sub', 'sup', 'small', 'code', 'abbr', 'cite', 'q', 'label', 'button'];

    private static function markerOf(string $raw): ?string
    {
        return preg_match('/^<span class="diff-(added|removed)" data-change-index="\d+">$/', $raw, $m) === 1 ? $m[1] : null;
    }

    /**
     * Problems with the output ([] when valid). $strict adds the content-model rules.
     *
     * @return list<string>
     */
    public static function problems(string $html, bool $strict = true): array
    {
        $problems = [];
        $stack = [];
        $inMarker = static function () use (&$stack): bool {
            foreach ($stack as [, $marker]) {
                if ($marker !== null) {
                    return true;
                }
            }
            return false;
        };
        foreach (HtmlLexer::lex($html) as $seg) {
            $parent = $stack === [] ? null : $stack[count($stack) - 1][0];
            $kind = $seg['kind'];
            $name = $seg['name'];
            if ($kind === 'text') {
                if ($strict && $parent !== null && isset(self::RESTRICTED[$parent]) && preg_match('/^[\t\n\f\r ]*$/D', $seg['raw']) !== 1) {
                    $problems[] = "text in <{$parent}>: {$seg['raw']}";
                }
                if (preg_match('~<[a-zA-Z/!?]~', $seg['raw']) === 1) {
                    $problems[] = "unescaped < in text: {$seg['raw']}";
                }
                continue;
            }
            if ($kind === 'comment') {
                continue;
            }
            if ($kind === 'close') {
                $top = array_pop($stack);
                if ($top === null || $top[0] !== $name) {
                    $problems[] = "mismatched {$seg['raw']}";
                }
                if ($inMarker()) {
                    $problems[] = "{$seg['raw']} inside a marker";
                }
                continue;
            }
            if ($inMarker() && !($kind === 'void' && $name === 'img')) {
                $problems[] = "{$seg['raw']} inside a marker";
            }
            if ($kind !== 'open' && $kind !== 'void') {
                continue;
            }
            if ($strict) {
                if (isset(self::REQUIRED[$name]) && !in_array($parent, self::REQUIRED[$name], true)) {
                    $problems[] = "<{$name}> in <" . ($parent ?? '#root') . '>';
                }
                if ($parent !== null && isset(self::RESTRICTED[$parent]) && !in_array($name, self::RESTRICTED[$parent], true)) {
                    $problems[] = "<{$name}> in <{$parent}>";
                }
                if ($parent !== null && in_array($name, self::BLOCK, true) && in_array($parent, self::PHRASING, true)) {
                    $problems[] = "block <{$name}> in <{$parent}>";
                }
                if ($name === 'a' && in_array('a', array_column($stack, 0), true)) {
                    $problems[] = '<a> inside <a>';
                }
            }
            if ($kind === 'open') {
                $stack[] = [$name, self::markerOf($seg['raw'])];
            }
        }
        if ($stack !== []) {
            $problems[] = 'unclosed ' . implode(',', array_column($stack, 0));
        }
        return $problems;
    }

    /** Visible text, skipping markers of one kind; entities decoded, quotes normalized, whitespace removed. */
    public static function sideText(string $html, ?string $skip, bool $lower = false): string
    {
        $stack = [];
        $out = '';
        foreach (HtmlLexer::lex($html) as $seg) {
            if ($seg['kind'] === 'text') {
                if (!in_array(true, $stack, true)) {
                    $out .= HtmlTokenizer::decode($seg['raw']);
                }
            } elseif ($seg['kind'] === 'open') {
                $stack[] = $skip !== null && self::markerOf($seg['raw']) === $skip;
            } elseif ($seg['kind'] === 'close') {
                array_pop($stack);
            }
        }
        $t = preg_replace('/[' . Str::WS . ']+/u', '', NormalizeHtml::normalizeQuotes($out)) ?? '';
        return $lower ? Str::lower($t) : $t;
    }

    /** The text a document shows, in the form sideText() produces. */
    public static function documentText(string $html, bool $ignoreFormattingTags = true, bool $lower = false): string
    {
        $clean = HtmlTokenizer::scrub($html);
        return self::sideText($ignoreFormattingTags ? NormalizeHtml::stripFormattingTags($clean) : $clean, null, $lower);
    }

    /** @return list<int> data-change-index values in document order */
    public static function changeIndexes(string $html): array
    {
        preg_match_all('/data-change-index="(\d+)"/', $html, $m);
        return array_map('intval', $m[1]);
    }
}
