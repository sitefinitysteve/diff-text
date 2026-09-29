import { describe, expect, it } from 'vitest';
import { computeDiff } from '../computeDiff';
import { diffHtml } from '../html';
import { buildHunks, buildSplitRows } from '../lines';
import { collapsedLabel, escapeHtml, renderHtmlDiff, renderSplit, renderStats, renderText, renderUnified } from '../render';
import { computeStats } from '../stats';

describe('render', () => {
  it('escapes the five characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('renders text modes with change indexes', () => {
    expect(renderText('chars', computeDiff('chars', 'cat', 'cut'))).toBe(
      '<div class="text-diff text-diff-chars"><span>c</span><span class="diff-removed" data-change-index="0">a</span>' +
        '<span class="diff-added" data-change-index="1">u</span><span>t</span></div>',
    );
    expect(renderText('wordsWithSpace', [])).toBe('<div class="text-diff text-diff-words-with-space"></div>');
  });

  it('pluralizes the collapsed label', () => {
    expect(collapsedLabel(1)).toBe('1 unchanged line');
    expect(collapsedLabel(2)).toBe('2 unchanged lines');
  });

  it('renders the empty state for unified and split', () => {
    expect(renderUnified(buildHunks('a\n', 'a\n'))).toBe(
      '<div class="text-diff text-diff-unified"><div class="diff-empty">No changes</div></div>',
    );
    expect(renderSplit(buildSplitRows('', ''))).toBe(
      '<div class="text-diff text-diff-split"><div class="diff-empty">No changes</div></div>',
    );
  });

  it('indexes the first row of each changed run', () => {
    const html = renderUnified(buildHunks('a\nb\nc\nd\n', 'a\nB\nc\nD\nE\n'));
    expect(html.match(/data-change-index="\d+"/g)).toStrictEqual(['data-change-index="0"', 'data-change-index="1"']);
  });

  it('renders stats with units and similarity', () => {
    const html = renderStats(computeStats(computeDiff('chars', 'a', 'ab')), 0.665);
    expect(html).toBe(
      '<div class="text-diff-stats" data-unit="codepoints">' +
        '<span class="diff-stat diff-stat-added"><span aria-hidden="true">+1</span><span class="diff-sr">1 character added</span></span>' +
        '<span class="diff-stat diff-stat-removed"><span aria-hidden="true">−0</span><span class="diff-sr">0 characters removed</span></span>' +
        '<span class="diff-stat diff-stat-unchanged"><span aria-hidden="true">=1</span><span class="diff-sr">1 character unchanged</span></span>' +
        '<span class="diff-stat diff-stat-similarity">67% similar</span></div>',
    );
  });
});

describe('diffHtml', () => {
  it('shows attribute-only changes as the new tag without highlight', () => {
    const r = diffHtml('<p class="a">Hello</p>', '<p class="b">Hello</p>');
    expect(r).toEqual({ html: '<p class="b">Hello</p>', fullReplacement: false });
  });

  it('numbers markers in document order', () => {
    const r = diffHtml('<p>one two</p>', '<p>one three</p><p>four</p>');
    const idx = [...r.html.matchAll(/data-change-index="(\d+)"/g)].map((m) => Number(m[1]));
    expect(idx).toEqual(idx.map((_, i) => i));
    expect(idx.length).toBeGreaterThan(1);
  });

  it('renders full replacement as block wrappers below the threshold', () => {
    const r = diffHtml('<p>The quick brown fox</p>', '<ul><li>Lorem ipsum</li></ul>', { similarityThreshold: 0.5 });
    expect(r.fullReplacement).toBe(true);
    expect(renderHtmlDiff(r)).toBe(
      '<div class="text-diff text-diff-html"><div class="diff-removed" data-change-index="0"><p>The quick brown fox</p></div>' +
        '<div class="diff-added" data-change-index="1"><ul><li>Lorem ipsum</li></ul></div></div>',
    );
  });

  it('never fully replaces when one side is empty or threshold is unset', () => {
    expect(diffHtml('', '<p>x</p>', { similarityThreshold: 0.9 }).fullReplacement).toBe(false);
    expect(diffHtml('abc', 'xyz').fullReplacement).toBe(false);
  });

  it('strips formatting tags by default', () => {
    expect(diffHtml('<p>Hello <strong>world</strong></p>', '<p>Hello world</p>').html).toBe('<p>Hello world</p>');
  });
});
