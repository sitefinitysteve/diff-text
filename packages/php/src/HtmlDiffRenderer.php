<?php

declare(strict_types=1);

namespace PhpDiffText;

/**
 * Renders the grouped HTML diff (SPEC §12.2, "Rendering"). Port of core's
 * htmlRender.ts.
 *
 *  - Tokens of the NEW document are emitted once, in order (a close tag with
 *    no open element of that name is dropped; elements still open are closed
 *    where their parent closes, or at the end).
 *  - Removed tags are emitted only as a balanced pair from one removed run,
 *    and only where the element may appear; otherwise the marker continues
 *    across them.
 *  - Markers wrap text runs (and `<img>`) only, and are split at every
 *    emitted tag.
 *
 * @internal
 */
final class HtmlDiffRenderer
{
    /** Elements that only accept specific children. */
    private const RESTRICTED_PARENTS = [
        'ul' => ['li' => true], 'ol' => ['li' => true], 'menu' => ['li' => true],
        'table' => ['caption' => true, 'colgroup' => true, 'thead' => true, 'tbody' => true, 'tfoot' => true, 'tr' => true],
        'thead' => ['tr' => true], 'tbody' => ['tr' => true], 'tfoot' => ['tr' => true],
        'tr' => ['td' => true, 'th' => true], 'colgroup' => ['col' => true],
        'dl' => ['dt' => true, 'dd' => true, 'div' => true],
        'select' => ['option' => true, 'optgroup' => true], 'optgroup' => ['option' => true],
        'html' => ['head' => true, 'body' => true],
        'head' => ['title' => true, 'meta' => true, 'link' => true, 'style' => true, 'script' => true, 'base' => true, 'noscript' => true, 'template' => true],
    ];

    /** Elements that must sit in a specific parent. */
    private const REQUIRED_PARENTS = [
        'li' => ['ul' => true, 'ol' => true, 'menu' => true],
        'tr' => ['table' => true, 'thead' => true, 'tbody' => true, 'tfoot' => true],
        'td' => ['tr' => true], 'th' => ['tr' => true],
        'thead' => ['table' => true], 'tbody' => ['table' => true], 'tfoot' => ['table' => true],
        'caption' => ['table' => true], 'colgroup' => ['table' => true],
        'dt' => ['dl' => true], 'dd' => ['dl' => true],
        'option' => ['select' => true, 'optgroup' => true, 'datalist' => true], 'optgroup' => ['select' => true],
    ];

    /** Flow (block) elements: not allowed inside phrasing-only parents. */
    private const BLOCK = [
        'address' => true, 'article' => true, 'aside' => true, 'blockquote' => true, 'details' => true,
        'dialog' => true, 'div' => true, 'dl' => true, 'fieldset' => true, 'figcaption' => true, 'figure' => true,
        'footer' => true, 'form' => true, 'h1' => true, 'h2' => true, 'h3' => true, 'h4' => true, 'h5' => true,
        'h6' => true, 'header' => true, 'hgroup' => true, 'hr' => true, 'main' => true, 'menu' => true,
        'nav' => true, 'ol' => true, 'p' => true, 'pre' => true, 'section' => true, 'table' => true, 'ul' => true,
    ];

    /** Parents that only accept phrasing content. */
    private const PHRASING_PARENTS = [
        'p' => true, 'h1' => true, 'h2' => true, 'h3' => true, 'h4' => true, 'h5' => true, 'h6' => true,
        'pre' => true, 'span' => true, 'a' => true, 'em' => true, 'strong' => true, 'b' => true, 'i' => true,
        'u' => true, 's' => true, 'mark' => true, 'sub' => true, 'sup' => true, 'small' => true, 'big' => true,
        'code' => true, 'abbr' => true, 'cite' => true, 'q' => true, 'kbd' => true, 'samp' => true, 'var' => true,
        'time' => true, 'label' => true, 'button' => true, 'dt' => true, 'legend' => true, 'summary' => true,
        'font' => true, 'tt' => true, 'del' => true, 'ins' => true, 'dfn' => true, 'bdi' => true, 'bdo' => true,
    ];

    /** Removed document-level elements are never emitted. */
    private const NEVER_KEPT = ['html' => true, 'head' => true, 'body' => true];

    /** Elements whose (dropped) tags separate words (BLOCK plus these). */
    private const BREAKING_EXTRA = [
        'li' => true, 'dt' => true, 'dd' => true, 'tr' => true, 'td' => true, 'th' => true,
        'caption' => true, 'thead' => true, 'tbody' => true, 'tfoot' => true, 'br' => true,
    ];

    /** Wrappers that make removed text valid inside a parent that does not accept text. */
    private const WRAPPERS = [
        'ul' => ['li'], 'ol' => ['li'], 'menu' => ['li'], 'dl' => ['dd'], 'tr' => ['td'],
        'table' => ['tr', 'td'], 'thead' => ['tr', 'td'], 'tbody' => ['tr', 'td'], 'tfoot' => ['tr', 'td'],
    ];

    /** @var list<string> open elements in the output */
    private array $stack = [];

    private int $index = 0;

    private string $out = '';

    /**
     * @param list<array{eq:bool, old?:list<array>, new?:list<array>, removed?:list<array>, added?:list<array>}> $items
     */
    public function render(array $items): string
    {
        foreach ($items as $item) {
            if ($item['eq']) {
                foreach ($item['new'] as $t) {
                    if ($t['kind'] === 'text' || $t['kind'] === 'space') {
                        $this->out .= $t['raw'];
                    } else {
                        $this->emitTag($t);
                    }
                }
            } else {
                $this->emitRemoved($item['removed']);
                $this->emitAdded($item['added']);
            }
        }
        while ($this->stack !== []) {
            $this->out .= '</' . array_pop($this->stack) . '>';
        }
        return $this->out;
    }

    /** @param array{kind:string, raw:string, name:string} $t */
    private static function isMarkerContent(array $t): bool
    {
        return $t['kind'] === 'text' || $t['kind'] === 'space' || ($t['kind'] === 'void' && $t['name'] === 'img');
    }

    private function top(): ?string
    {
        return $this->stack === [] ? null : $this->stack[count($this->stack) - 1];
    }

    private function marker(string $cls, string $content): string
    {
        return '<span class="diff-' . $cls . '" data-change-index="' . $this->index++ . '">' . $content . '</span>';
    }

    private function flush(string $cls, string $content): void
    {
        if ($content === '') {
            return;
        }
        $parent = $this->top();
        if ($parent !== null && isset(self::RESTRICTED_PARENTS[$parent])) {
            if (preg_match('/^[\t\n\f\r ]+$/D', $content) === 1) {
                if ($cls === 'added') {
                    $this->out .= $content;
                }
                return;
            }
            $wrap = $cls === 'removed' ? (self::WRAPPERS[$parent] ?? null) : null;
            if ($wrap !== null) {
                $open = '';
                $close = '';
                foreach ($wrap as $w) {
                    $open .= '<' . $w . '>';
                    $close = '</' . $w . '>' . $close;
                }
                $this->out .= $open . $this->marker($cls, $content) . $close;
                return;
            }
        }
        $this->out .= $this->marker($cls, $content);
    }

    /** Emit a tag of the new document. */
    private function emitTag(array $t): void
    {
        if ($t['kind'] === 'open') {
            $this->out .= $t['raw'];
            $this->stack[] = $t['name'];
        } elseif ($t['kind'] === 'close') {
            $at = array_search($t['name'], array_reverse($this->stack, true), true);
            if ($at === false) {
                return; // stray close tag: dropped
            }
            while (count($this->stack) - 1 > $at) {
                $this->out .= '</' . array_pop($this->stack) . '>';
            }
            $this->out .= $t['raw'];
            array_pop($this->stack);
        } else {
            $this->out .= $t['raw']; // void, raw, opaque
        }
    }

    private function allowedHere(string $name): bool
    {
        if (isset(self::NEVER_KEPT[$name])) {
            return false;
        }
        $parent = $this->top();
        if (isset(self::REQUIRED_PARENTS[$name])) {
            return $parent !== null && isset(self::REQUIRED_PARENTS[$name][$parent]);
        }
        if ($parent === null) {
            return true;
        }
        if (isset(self::RESTRICTED_PARENTS[$parent])) {
            return isset(self::RESTRICTED_PARENTS[$parent][$name]);
        }
        if (isset(self::BLOCK[$name])) {
            return !isset(self::PHRASING_PARENTS[$parent]);
        }
        if ($name === 'a' && in_array('a', $this->stack, true)) {
            return false;
        }
        return true;
    }

    /** @param list<array{kind:string, raw:string, name:string}> $tokens */
    private function emitAdded(array $tokens): void
    {
        $buf = '';
        foreach ($tokens as $t) {
            if (self::isMarkerContent($t)) {
                $buf .= $t['raw'];
                continue;
            }
            $this->flush('added', $buf);
            $buf = '';
            $this->emitTag($t);
        }
        $this->flush('added', $buf);
    }

    /** @param list<array{kind:string, raw:string, name:string}> $tokens */
    private function emitRemoved(array $tokens): void
    {
        // Pair open/close tags within the run (a close pairs only with the innermost open).
        $closeOf = [];
        $open = [];
        foreach ($tokens as $i => $t) {
            if ($t['kind'] === 'open') {
                $open[] = $i;
            } elseif ($t['kind'] === 'close' && $open !== [] && $tokens[$open[count($open) - 1]]['name'] === $t['name']) {
                $closeOf[array_pop($open)] = $i;
            }
        }

        $buf = '';
        $separate = false;
        $keptClose = [];
        foreach ($tokens as $i => $t) {
            if (self::isMarkerContent($t)) {
                // A dropped block boundary still separates the words around it.
                if ($separate && preg_match('/[\t\n\f\r ]$/D', $buf) !== 1 && preg_match('/^[\t\n\f\r ]/', $t['raw']) !== 1) {
                    $buf .= ' ';
                }
                $separate = false;
                $buf .= $t['raw'];
                continue;
            }
            if ($t['kind'] === 'open' && isset($closeOf[$i]) && $this->allowedHere($t['name'])) {
                $keptClose[$closeOf[$i]] = true;
                $this->flush('removed', $buf);
                $buf = '';
                $separate = false;
                $this->out .= $t['raw'];
                $this->stack[] = $t['name'];
            } elseif ($t['kind'] === 'close' && isset($keptClose[$i])) {
                $this->flush('removed', $buf);
                $buf = '';
                $separate = false;
                $this->out .= $t['raw'];
                array_pop($this->stack);
            } elseif ($buf !== '' && (isset(self::BLOCK[$t['name']]) || isset(self::BREAKING_EXTRA[$t['name']]))) {
                $separate = true;
            }
        }
        $this->flush('removed', $buf);
    }
}
