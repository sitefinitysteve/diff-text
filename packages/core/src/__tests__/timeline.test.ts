import { describe, expect, it } from 'vitest';
import { buildTimeline, renderTimeline } from '../timeline';

describe('timeline', () => {
  it('diffs consecutive pairs with default labels', () => {
    const t = buildTimeline(['a', 'a b', 'b']);
    expect(t.labels).toStrictEqual(['v1', 'v2', 'v3']);
    expect(t.steps.map((s) => [s.step, s.fromLabel, s.toLabel])).toStrictEqual([
      [1, 'v1', 'v2'],
      [2, 'v2', 'v3'],
    ]);
    expect(t.steps[0]!.stats.unit).toBe('codepoints');
  });

  it('renders radios, labels and panels with the last step checked', () => {
    const html = renderTimeline(buildTimeline(['a', 'b', 'c']), { idPrefix: 'r' });
    expect(html.match(/<input /g)).toHaveLength(2);
    expect(html).toContain('<input class="diff-rev-input" type="radio" name="r-rev" id="r-rev-1">');
    expect(html).toContain('<input class="diff-rev-input" type="radio" name="r-rev" id="r-rev-2" checked>');
    expect(html).toContain('<label class="diff-rev-label" for="r-rev-2">v2 → v3</label>');
  });

  it('prefixes inner ids per step so they never collide', () => {
    const html = renderTimeline(
      buildTimeline(['m\nk1\nk2\n', 'k1\nk2\nm\n', 'm\nk1\nk2\n'], { mode: 'unified', detectMoves: true }),
      { idPrefix: 't' },
    );
    expect(html).toContain('id="t-rev-1-move-0-from"');
    expect(html).toContain('id="t-rev-2-move-0-from"');
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows an empty state for fewer than two versions', () => {
    const empty = '<div class="text-diff-timeline" role="group" aria-label="Revision timeline"><div class="diff-empty">Nothing to compare</div></div>';
    expect(renderTimeline(buildTimeline([]))).toBe(empty);
    expect(renderTimeline(buildTimeline(['only']))).toBe(empty);
  });
});
