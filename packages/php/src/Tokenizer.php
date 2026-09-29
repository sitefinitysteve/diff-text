<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Splits text into tokens, ported from jsdiff v8's tokenizers so every mode
 * tokenizes exactly like the JavaScript libraries. Positions are code points.
 */
final class Tokenizer
{
    /**
     * jsdiff's "extended word characters": ASCII letters, digits, underscore
     * and most Latin letters with diacritics (see jsdiff lib/diff/word.js).
     */
    public const WORD_CHARS = 'a-zA-Z0-9_\x{AD}\x{C0}-\x{D6}\x{D8}-\x{F6}\x{F8}-\x{2C6}\x{2C8}-\x{2D7}\x{2DE}-\x{2FF}\x{1E00}-\x{1EFF}';

    /** Split into individual code points (jsdiff diffChars). */
    public static function chars(string $text): array
    {
        if ($text === '') {
            return [];
        }
        return mb_str_split(Str::utf8($text), 1, 'UTF-8');
    }

    /**
     * jsdiff diffWords tokens: each word or punctuation mark carries the
     * whitespace around it (leading and trailing), so the text can be rebuilt.
     * A text that is only whitespace yields a single whitespace token.
     *
     * @return list<string>
     */
    public static function words(string $text): array
    {
        if ($text === '') {
            return [];
        }
        $w = self::WORD_CHARS;
        $ws = Str::WS;
        preg_match_all("/[{$w}]+|[{$ws}]+|[^{$w}]/u", Str::utf8($text), $m);
        $parts = $m[0];

        $tokens = [];
        $prevPart = null;
        $prevIsWs = false;
        foreach ($parts as $part) {
            $isWs = Str::hasWs($part);
            if ($isWs) {
                if ($prevPart === null) {
                    $tokens[] = $part;
                } else {
                    $tokens[] = array_pop($tokens) . $part;
                }
            } elseif ($prevPart !== null && $prevIsWs) {
                if ($tokens[count($tokens) - 1] === $prevPart) {
                    $tokens[] = array_pop($tokens) . $part;
                } else {
                    $tokens[] = $prevPart . $part;
                }
            } else {
                $tokens[] = $part;
            }
            $prevPart = $part;
            $prevIsWs = $isWs;
        }
        return $tokens;
    }

    /**
     * jsdiff diffWordsWithSpace tokens: words, single punctuation marks, runs
     * of non-newline whitespace, and each newline (\n or \r\n) on its own.
     *
     * @return list<string>
     */
    public static function wordsWithSpace(string $text): array
    {
        if ($text === '') {
            return [];
        }
        $w = self::WORD_CHARS;
        $ws = Str::WS_NO_NL;
        preg_match_all("/(\\r?\\n)|[{$w}]+|[{$ws}]+|[^{$w}]/u", Str::utf8($text), $m);
        return $m[0];
    }

    /**
     * jsdiff diffLines tokens. Each line keeps its newline unless
     * newlineIsToken is set, in which case newlines are separate tokens.
     *
     * @param array{stripTrailingCr?: bool, newlineIsToken?: bool} $options
     * @return list<string>
     */
    public static function lines(string $text, array $options = []): array
    {
        if ($text === '') {
            return [];
        }
        $text = Str::utf8($text);
        if (Options::flag($options, 'stripTrailingCr')) {
            $text = str_replace("\r\n", "\n", $text);
        }
        $parts = preg_split('/(\n|\r\n)/', $text, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$text];
        if (end($parts) === '') {
            array_pop($parts);
        }
        $newlineIsToken = Options::flag($options, 'newlineIsToken');
        $lines = [];
        foreach ($parts as $i => $part) {
            if (($i % 2) === 1 && !$newlineIsToken) {
                $lines[count($lines) - 1] .= $part;
            } else {
                $lines[] = $part;
            }
        }
        return $lines;
    }

    /**
     * jsdiff diffSentences tokens: a sentence ends at . ! or ? followed by
     * whitespace; the whitespace between sentences is its own token.
     *
     * @return list<string>
     */
    public static function sentences(string $text): array
    {
        if ($text === '') {
            return [];
        }
        $ws = Str::WS;
        $parts = preg_split("/(?<=[.!?])([{$ws}]+|$)/uD", Str::utf8($text), -1, PREG_SPLIT_DELIM_CAPTURE) ?: [];
        return array_values(array_filter($parts, static fn(string $p): bool => $p !== ''));
    }
}
