/**
 * Property tests (fast-check, fixed seed). Each property is an invariant stated in SPEC.md
 * and checked against an oracle that does not reuse the code under test: input text,
 * code-point counts, an LCS dynamic program, re-tokenization, or the rendered markup.
 */
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { computeDiff, TEXT_MODES, tokenize, wellFormed } from '../computeDiff';
import { buildHeatmap, heatLevel } from '../heatmap';
import { buildHunks, buildLineRows, buildRows, buildSplitRows, intraLineDiff, splitLines, splitParts } from '../lines';
import { minimapMarksLines, minimapMarksText } from '../minimap';
import { buildMoves, normalizeMoveLine } from '../moves';
import { renderSplit, renderText, renderUnified } from '../render';
import { computeSimilarity } from '../similarity';
import { computeStats, lineStats } from '../stats';
import type { Change, LineRow, TextMode } from '../types';

const RUNS = { numRuns: 1500, seed: 20260929 };

// Fragments chosen to hit every tokenizer rule: word characters, punctuation, each kind of
// whitespace (incl. U+00A0, U+3000, U+FEFF, U+2028), CR/LF, sentence ends, case pairs,
// combining marks, astral code points, HTML-special characters and a lone surrogate.
const FRAGMENTS = [
  'a', 'b', 'A', 'foo', 'Bar', 'é', 'é', '😀', '中', 'Σ', 'σ', 'İ',
  ' ', '  ', '\t', ' ', '　', '﻿', ' ', '\n', '\r\n', '\r',
  '.', '!', '?', ',', "'", '<', '>', '&', '"', '\uD800',
];
const text = fc.array(fc.constantFrom(...FRAGMENTS), { maxLength: 14 }).map((a) => a.join(''));
const mode = fc.constantFrom<TextMode>(...TEXT_MODES);
const lineText = fc
  .array(fc.constantFrom('a', 'b', 'c', 'a b', 'x  y', '', ' a', 'A', '\tz', '😀', 'Hello World', 'hello world!'), { maxLength: 12 })
  .chain((ls) => fc.constantFrom('\n', '\r\n').chain((nl) => fc.boolean().map((trail) => ls.join(nl) + (trail && ls.length ? nl : ''))));

const side = (cs: Change[], s: 'old' | 'new') =>
  cs.filter((c) => (s === 'old' ? !c.added : !c.removed)).map((c) => c.value).join('');
const codePoints = (s: string) => [...s].length;
const noWs = (s: string) => s.replace(/\s/gu, '');
const lower = (s: string) => s.toLowerCase();
/** Case-fold a joined string: toLowerCase is per token in the diff, and the only context-dependent
 * mapping (Final_Sigma) can differ between a token and the joined text, so fold ς to σ as well. */
const fold = (s: string) => s.toLowerCase().replace(/ς/g, 'σ');

/** Independent oracle: minimal insertions + deletions by the classic LCS dynamic program. */
function editDistance(a: string[], b: string[], eq: (x: string, y: string) => boolean): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = eq(a[i - 1]!, b[j - 1]!) ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    prev = cur;
  }
  return a.length + b.length - 2 * prev[b.length]!;
}

/** Token equality exactly as SPEC section 5 states it, per mode. */
function tokenEquality(m: TextMode, ignoreCase: boolean): (x: string, y: string) => boolean {
  const fold = ignoreCase ? lower : (s: string) => s;
  if (m === 'words') return (x, y) => fold(x).trim() === fold(y).trim();
  return (x, y) => x === y || fold(x) === fold(y);
}

describe('text-mode properties', () => {
  it('P1: every mode but words rebuilds both inputs (after the lone-surrogate scrub)', () => {
    fc.assert(
      fc.property(text, text, mode.filter((m) => m !== 'words'), (a, b, m) => {
        const cs = computeDiff(m, a, b);
        return side(cs, 'old') === wellFormed(a) && side(cs, 'new') === wellFormed(b);
      }),
      RUNS,
    );
  });

  it('P1: with ignoreCase the new side is rebuilt exactly and the old side up to case', () => {
    fc.assert(
      fc.property(text, text, mode.filter((m) => m !== 'words'), (a, b, m) => {
        const cs = computeDiff(m, a, b, { ignoreCase: true });
        return side(cs, 'new') === wellFormed(b) && fold(side(cs, 'old')) === fold(wellFormed(a));
      }),
      RUNS,
    );
  });

  it('P2: words mode keeps all non-whitespace content of both sides', () => {
    fc.assert(
      fc.property(text, text, fc.boolean(), (a, b, ignoreCase) => {
        const cs = computeDiff('words', a, b, { ignoreCase });
        const f = ignoreCase ? fold : (s: string) => s;
        return noWs(side(cs, 'new')) === noWs(wellFormed(b)) && f(noWs(side(cs, 'old'))) === f(noWs(wellFormed(a)));
      }),
      RUNS,
    );
  });

  it('P3: change shape; counts add up to the token counts of each side', () => {
    fc.assert(
      fc.property(text, text, mode, fc.boolean(), fc.option(fc.integer({ min: 0, max: 6 })), (a, b, m, ignoreCase, max) => {
        const options = { ignoreCase, ...(max === null ? {} : { maxEditLength: max }) };
        const cs = computeDiff(m, a, b, options);
        for (let i = 0; i < cs.length; i++) {
          const c = cs[i]!;
          if (c.value === '' || c.count < 1 || (c.added && c.removed)) return false;
          if (i > 0 && cs[i - 1]!.added === c.added && cs[i - 1]!.removed === c.removed) return false;
          if (m === 'chars' && c.count !== codePoints(c.value)) return false;
        }
        const oldCount = cs.filter((c) => !c.added).reduce((n, c) => n + c.count, 0);
        const newCount = cs.filter((c) => !c.removed).reduce((n, c) => n + c.count, 0);
        if (oldCount !== tokenize(m, a).length || newCount !== tokenize(m, b).length) return false;
        // Identical inputs never report a change, whatever maxEditLength says.
        return a !== b || cs.every((c) => !c.added && !c.removed);
      }),
      RUNS,
    );
  });

  it('P4: stats count code points of each side', () => {
    fc.assert(
      fc.property(text, text, mode.filter((m) => m !== 'words'), (a, b, m) => {
        const st = computeStats(computeDiff(m, a, b));
        return st.unchanged + st.removed === codePoints(wellFormed(a)) && st.unchanged + st.added === codePoints(wellFormed(b));
      }),
      RUNS,
    );
  });

  it('P5: the edit script is minimal (LCS oracle), in every mode, with and without ignoreCase', () => {
    fc.assert(
      fc.property(text, text, mode, fc.boolean(), (a, b, m, ignoreCase) => {
        const cs = computeDiff(m, a, b, { ignoreCase });
        const edits = cs.filter((c) => c.added || c.removed).reduce((n, c) => n + c.count, 0);
        return edits === editDistance(tokenize(m, a), tokenize(m, b), tokenEquality(m, ignoreCase));
      }),
      { ...RUNS, numRuns: 3000 },
    );
  });

  it('P5: lines mode is minimal under ignoreWhitespace (trimmed equality)', () => {
    fc.assert(
      fc.property(lineText, lineText, (a, b) => {
        const cs = computeDiff('lines', a, b, { ignoreWhitespace: true });
        const edits = cs.filter((c) => c.added || c.removed).reduce((n, c) => n + c.count, 0);
        return edits === editDistance(tokenize('lines', a), tokenize('lines', b), (x, y) => x.trim() === y.trim());
      }),
      RUNS,
    );
  });

  it('P6: similarity is in [0, 1], 1 for identical input, and blind to whitespace layout', () => {
    fc.assert(
      fc.property(text, text, fc.boolean(), (a, b, html) => {
        const s = computeSimilarity(a, b, { html });
        if (!(s >= 0 && s <= 1)) return false;
        if (computeSimilarity(a, a, { html }) !== 1) return false;
        // prepare() collapses and trims whitespace runs, so padding changes nothing.
        return computeSimilarity(` ${a}\n`, `${b}  `, { html }) === s;
      }),
      RUNS,
    );
  });

  it('P11: renderText shows every change value once, in order, with sequential indexes', () => {
    fc.assert(
      fc.property(text, text, mode, (a, b, m) => {
        const cs = computeDiff(m, a, b);
        const html = renderText(m, cs);
        const inner = html
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, '&');
        // escapeHtml emits CR and CRLF as LF within each span (browsers normalize them anyway).
        if (inner !== cs.map((c) => c.value.replace(/\r\n?/g, '\n')).join('')) return false;
        const idx = [...html.matchAll(/data-change-index="(\d+)"/g)].map((x) => Number(x[1]));
        return idx.length === cs.filter((c) => c.added || c.removed).length && idx.every((n, i) => n === i);
      }),
      RUNS,
    );
  });
});

describe('line-model properties', () => {
  const lineOptions = fc.record({
    contextLines: fc.integer({ min: 0, max: 4 }),
    stripTrailingCr: fc.boolean(),
    ignoreCase: fc.boolean(),
  });

  it('P8: rows reproduce splitLines of each side, numbered 1..n', () => {
    fc.assert(
      fc.property(lineText, lineText, (a, b) => {
        const rows = buildRows(a, b);
        const olds = rows.filter((r) => r.oldNo !== undefined);
        const news = rows.filter((r) => r.newNo !== undefined);
        return (
          olds.every((r, i) => r.oldNo === i + 1) &&
          news.every((r, i) => r.newNo === i + 1) &&
          JSON.stringify(olds.map((r) => r.text)) === JSON.stringify(splitLines(a)) &&
          JSON.stringify(news.map((r) => r.text)) === JSON.stringify(splitLines(b))
        );
      }),
      RUNS,
    );
  });

  it('P7: hunks cover every row once, in order, with correct starts, counts and context', () => {
    fc.assert(
      fc.property(lineText, lineText, lineOptions, (a, b, opts) => {
        const rows = buildRows(a, b, opts);
        const hunks = buildHunks(a, b, opts);
        if (JSON.stringify(hunks.flatMap((h) => h.rows)) !== JSON.stringify(rows)) return false;
        const changed = rows.some((r) => r.type !== 'equal');
        let oldBefore = 0;
        let newBefore = 0;
        for (let i = 0; i < hunks.length; i++) {
          const h = hunks[i]!;
          const oldLines = h.rows.filter((r) => r.oldNo !== undefined).length;
          const newLines = h.rows.filter((r) => r.newNo !== undefined).length;
          if (i > 0 && hunks[i - 1]!.type === h.type) return false;
          if (h.oldStart !== oldBefore + 1 || h.newStart !== newBefore + 1) return false;
          if (h.type === 'collapsed') {
            if (h.rows.some((r) => r.type !== 'equal') || h.count !== h.rows.length) return false;
            if (changed && h.count < 2) return false;
          } else if (h.oldLines !== oldLines || h.newLines !== newLines) {
            return false;
          }
          oldBefore += oldLines;
          newBefore += newLines;
        }
        // An equal row within contextLines rows of a change is never hidden.
        const visible = hunks.flatMap((h) => h.rows.map(() => h.type === 'hunk'));
        const ctx = opts.contextLines;
        return rows.every((r, i) => {
          if (r.type !== 'equal') return visible[i];
          const near = rows.slice(Math.max(0, i - ctx), i + ctx + 1).some((x) => x.type !== 'equal');
          return !near || visible[i];
        });
      }),
      RUNS,
    );
  });

  it('P9: split keeps both sides in order and has the same line stats as unified', () => {
    fc.assert(
      fc.property(lineText, lineText, lineOptions, (a, b, opts) => {
        const split = buildSplitRows(a, b, opts);
        const unified = buildHunks(a, b, opts);
        if (JSON.stringify(lineStats(split)) !== JSON.stringify(lineStats(unified))) return false;
        const left = split.flatMap((h) => (h.type === 'collapsed' ? h.rows.map((r) => r.oldNo) : h.rows.map((r) => r.left?.lineNo)));
        const right = split.flatMap((h) => (h.type === 'collapsed' ? h.rows.map((r) => r.newNo) : h.rows.map((r) => r.right?.lineNo)));
        const l = left.filter((x) => x !== undefined);
        const r = right.filter((x) => x !== undefined);
        return l.every((n, i) => n === i + 1) && r.every((n, i) => n === i + 1);
      }),
      RUNS,
    );
  });

  it('P10: split parts reproduce each cell exactly, with matching unchanged runs', () => {
    fc.assert(
      fc.property(lineText, lineText, lineOptions, (a, b, opts) => {
        for (const h of buildSplitRows(a, b, { ...opts, contextLines: 100 })) {
          if (h.type !== 'hunk') continue;
          for (const row of h.rows) {
            const { left, right } = row;
            if (!left?.parts || !right?.parts) {
              if (left?.parts || right?.parts) return false; // both or neither
              continue;
            }
            if (left.parts.map((p) => p.value).join('') !== left.text) return false;
            if (right.parts.map((p) => p.value).join('') !== right.text) return false;
            if (left.parts.some((p) => p.added) || right.parts.some((p) => p.removed)) return false;
            const keptCounts = (ps: Change[]) => ps.filter((p) => !p.added && !p.removed).map((p) => p.count).join(',');
            if (keptCounts(left.parts) !== keptCounts(right.parts)) return false;
          }
        }
        return true;
      }),
      RUNS,
    );
  });

  it('P10: splitParts rebuilds arbitrary line pairs, including case-folded ones', () => {
    fc.assert(
      fc.property(text, text, fc.boolean(), (a0, b0, ignoreCase) => {
        const a = a0.replace(/[\r\n]/g, '');
        const b = b0.replace(/[\r\n]/g, '');
        const changes = intraLineDiff(a, b, { ignoreCase });
        if (!changes) return true;
        const { left, right } = splitParts(changes, wellFormed(a));
        return left.map((p) => p.value).join('') === wellFormed(a) && right.map((p) => p.value).join('') === wellFormed(b);
      }),
      RUNS,
    );
  });

  it('unified and split markup index every changed run once, in order', () => {
    fc.assert(
      fc.property(lineText, lineText, lineOptions, (a, b, opts) => {
        const indexes = (html: string) => [...html.matchAll(/data-change-index="(\d+)"/g)].map((x) => Number(x[1]));
        const u = indexes(renderUnified(buildHunks(a, b, opts)));
        const s = indexes(renderSplit(buildSplitRows(a, b, opts)));
        return u.every((n, i) => n === i) && s.every((n, i) => n === i);
      }),
      RUNS,
    );
  });
});

describe('visualization properties', () => {
  const moveText = fc
    .array(fc.constantFrom('alpha', 'beta', 'gamma', 'delta', '', '  alpha', 'BETA', 'x', 'y'), { maxLength: 12 })
    .map((ls) => ls.join('\n') + '\n');

  it('moves: undoing the moves gives back the plain rows; counterparts point at each other', () => {
    fc.assert(
      fc.property(moveText, moveText, fc.boolean(), fc.constantFrom(1, 2), (a, b, ignoreCase, minMoveLines) => {
        const opts = { ignoreCase, detectMoves: true, minMoveLines };
        const plain = buildRows(a, b, opts);
        const moved = buildLineRows(a, b, opts);
        const undone = moved.map((r): LineRow => {
          if (r.type === 'moved-from') return { type: 'removed', oldNo: r.oldNo, text: r.text };
          if (r.type === 'moved-to') return { type: 'added', newNo: r.newNo, text: r.text };
          return r;
        });
        if (JSON.stringify(undone) !== JSON.stringify(plain)) return false;
        const froms = moved.filter((r) => r.type === 'moved-from');
        const tos = moved.filter((r) => r.type === 'moved-to');
        if (froms.length !== tos.length) return false;
        for (const f of froms) {
          const t = tos.find((x) => x.newNo === f.counterpart);
          if (!t || t.counterpart !== f.oldNo || t.move !== f.move) return false;
          if (normalizeMoveLine(f.text, ignoreCase) !== normalizeMoveLine(t.text, ignoreCase)) return false;
        }
        // Every block has at least minMoveLines lines.
        return buildMoves(plain, opts).every((m) => m.lines >= minMoveLines);
      }),
      RUNS,
    );
  });

  const sentenceText = fc
    .array(fc.constantFrom('One cat sat.', 'One dog sat.', 'Two birds sang!', 'Why?', 'a < b.', 'Hello world.', 'hello world.'), {
      maxLength: 7,
    })
    .chain((ss) => fc.constantFrom(' ', '  ', '\n').map((sep) => ss.join(sep)));

  it('heatmap: the new text is kept verbatim; every old sentence is used once; heat follows similarity', () => {
    fc.assert(
      fc.property(sentenceText, sentenceText, fc.boolean(), (a, b, ignoreCase) => {
        const { segments } = buildHeatmap(a, b, { ignoreCase });
        const shown = segments.filter((s) => s.type !== 'removed').map((s) => s.text).join('');
        if (shown !== b) return false;
        const oldSentences = tokenize('sentences', a).filter((t) => t.trim() !== '');
        const used = segments.flatMap((s) => (s.type === 'removed' ? [s.text] : s.type === 'sentence' && s.old !== undefined ? [s.old] : []));
        if (JSON.stringify([...used].sort()) !== JSON.stringify([...oldSentences].sort())) return false;
        const key = ignoreCase ? lower : (s: string) => s;
        return segments.every((s) => {
          if (s.type !== 'sentence') return true;
          if (s.old === undefined) return s.status === 'added' && s.heat === 4 && s.similarity === 0;
          // Recompute the similarity from scratch (plain text, the case-folded keys).
          const sim = computeSimilarity(key(s.old), key(s.text), { html: false });
          return s.similarity === sim && s.heat === heatLevel(sim);
        });
      }),
      RUNS,
    );
  });

  it('minimap: one mark per data-change-index in the rendered view, inside 0..100%', () => {
    fc.assert(
      fc.property(text, text, mode, lineText, lineText, (a, b, m, la, lb) => {
        const indexes = (html: string) => [...html.matchAll(/data-change-index="(\d+)"/g)].map((x) => Number(x[1]));
        const cs = computeDiff(m, a, b);
        const unified = buildHunks(la, lb);
        const split = buildSplitRows(la, lb);
        const cases = [
          { marks: minimapMarksText(cs), html: renderText(m, cs) },
          { marks: minimapMarksLines(unified), html: renderUnified(unified) },
          { marks: minimapMarksLines(split), html: renderSplit(split) },
        ];
        return cases.every(({ marks, html }) => {
          const idx = indexes(html);
          return (
            marks.length === idx.length &&
            marks.every((mk, i) => mk.index === i && mk.top >= 0 && mk.height >= 0 && mk.top + mk.height <= 10000) &&
            marks.every((mk, i) => i === 0 || mk.top >= marks[i - 1]!.top)
          );
        });
      }),
      RUNS,
    );
  });
});
